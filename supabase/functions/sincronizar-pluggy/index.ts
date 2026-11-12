/**
 * APPingos — a sincronização do extrato com a Pluggy.
 *
 * Fase 4 de docs/notion-plano-open-finance.md. Lê, de cada conexão cadastrada
 * em `conexao_bancaria`, as contas e as transações novas, normaliza com as
 * regras de `../_shared/importacao-bancaria.ts` e grava em `transacao_bancaria`
 * pela RPC `ingerir_transacoes` (upsert por `provider_id`: rodar duas vezes é
 * inócuo).
 *
 * POR QUE AQUI, E NÃO NO NUXT. O webhook da Pluggy chega sem o JWT de ninguém,
 * e o cron também. Gravar o extrato pelo Nuxt exigiria `service_role` no app —
 * e o projeto escolheu de propósito autenticar como usuário para a RLS valer.
 * Aqui o `service_role` já vive (é como `enviar-emails` escreve).
 *
 * QUEM PODE ACORDAR:
 *   - o banco, pelo `pg_cron` diário: `Authorization: Bearer <service_role>`
 *     (`acordar_sincronizacao_pluggy`, 20261112110100_open_finance_cron.sql);
 *   - a Pluggy, pelo webhook opcional: header `x-appingos-webhook` com o segredo
 *     `PLUGGY_WEBHOOK_SECRET`. Responde 202 na hora e processa depois — a Pluggy
 *     exige 2xx em até 10 s.
 *
 * A ANON KEY não serve: ela é um JWT válido e pública por definição. Por isso
 * `verify_jwt = false` no config.toml e a checagem feita aqui dentro, como no
 * carteiro dos e-mails.
 *
 * Segredos (Project Settings > Edge Functions > Secrets):
 *   PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET   os mesmos do NUXT_PLUGGY_* do app
 *   PLUGGY_WEBHOOK_SECRET                    opcional; sem ele, webhook recusado
 * `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetados pela plataforma.
 *
 * NADA AQUI FOI EXECUTADO CONTRA A PLUGGY DE VERDADE: o código segue a
 * documentação v2 e as regras testadas no vitest. Validar com o trial (fase 2).
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'
import {
  ErroPluggy,
  autenticarPluggy,
  buscarItem,
  listarContas,
  listarFaturas,
  listarTransacoes,
} from '../_shared/pluggy-api.ts'
import {
  camposDaConexao,
  camposDaConta,
  contextoDasContas,
  dataLocal,
  itemPodeSerDe,
  janelaDeSincronizacao,
  linhasDaConta,
  tipoDaConta,
  vencimentosDasFaturas,
} from '../_shared/importacao-bancaria.ts'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void }

interface Conexao {
  id: string
  user_id: string
  item_id: string
  sincronizado_em: string | null
}

/** Eventos do webhook que pedem para reler um item. */
const EVENTOS_DE_ITEM = new Set([
  'item/created',
  'item/updated',
  'item/login_succeeded',
  'transactions/created',
  'transactions/updated',
])

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const segredoWebhook = Deno.env.get('PLUGGY_WEBHOOK_SECRET')

  const peloBanco = (req.headers.get('Authorization') ?? '') === `Bearer ${serviceKey}`
  const pelaPluggy = !!segredoWebhook && req.headers.get('x-appingos-webhook') === segredoWebhook

  if (!peloBanco && !pelaPluggy) {
    // 401 encerra as tentativas da Pluggy — é o que se quer para quem não sabe o segredo.
    return json({ erro: 'não autorizado' }, 401)
  }

  const clientId = Deno.env.get('PLUGGY_CLIENT_ID')
  const clientSecret = Deno.env.get('PLUGGY_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    return json({ erro: 'faltam PLUGGY_CLIENT_ID ou PLUGGY_CLIENT_SECRET' }, 500)
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
  const corpo = await req.json().catch(() => ({})) as {
    event?: string
    itemId?: string
    transactionIds?: string[]
  }

  if (pelaPluggy) {
    const trabalho = tratarWebhook(supabase, clientId, clientSecret, corpo)
      .catch(e => console.error('webhook da Pluggy falhou:', e))
    EdgeRuntime.waitUntil(trabalho)
    return json({ recebido: true }, 202)
  }

  const resultado = await sincronizarTudo(supabase, clientId, clientSecret)
  return json(resultado)
})

async function tratarWebhook(
  supabase: SupabaseClient,
  clientId: string,
  clientSecret: string,
  corpo: { event?: string, itemId?: string, transactionIds?: string[] },
) {
  if (corpo.event === 'transactions/deleted' && corpo.transactionIds?.length) {
    // A compra que já nasceu da transação fica: ela é do espaço, não do extrato.
    await supabase.from('transacao_bancaria').delete().in('pluggy_id', corpo.transactionIds)
    return
  }

  if (corpo.event === 'item/deleted' && corpo.itemId) {
    await supabase.from('conexao_bancaria').update({ status: 'DELETED' }).eq('item_id', corpo.itemId)
    return
  }

  if (!corpo.itemId || !EVENTOS_DE_ITEM.has(corpo.event ?? '')) return

  const { data: conexao } = await supabase
    .from('conexao_bancaria')
    .select('id, user_id, item_id, sincronizado_em')
    .eq('item_id', corpo.itemId)
    .maybeSingle()

  // Item que ninguém cadastrou no app: a Pluggy avisa de toda a Application.
  if (!conexao) return

  const apiKey = await autenticarPluggy(clientId, clientSecret)
  await sincronizarConexao(supabase, apiKey, conexao as Conexao)
}

async function sincronizarTudo(supabase: SupabaseClient, clientId: string, clientSecret: string) {
  const { data: conexoes, error } = await supabase
    .from('conexao_bancaria')
    .select('id, user_id, item_id, sincronizado_em')
    .neq('status', 'DELETED')

  if (error) return { erro: error.message }
  if (!conexoes?.length) return { conexoes: 0 }

  const apiKey = await autenticarPluggy(clientId, clientSecret)

  /*
    Uma de cada vez, e não em paralelo: são duas pessoas com poucos bancos, e a
    Pluggy limita requisições por minuto. A falha de uma conexão fica registrada
    nela e não impede as outras.
  */
  const resultado: Record<string, number | string> = {}
  for (const conexao of conexoes as Conexao[]) {
    try {
      resultado[conexao.id] = await sincronizarConexao(supabase, apiKey, conexao)
    }
    catch (e) {
      resultado[conexao.id] = e instanceof Error ? e.message : String(e)
    }
  }
  return { conexoes: conexoes.length, resultado }
}

/** Relê um item: status, contas e transações da janela. Devolve quantas transações gravou. */
async function sincronizarConexao(supabase: SupabaseClient, apiKey: string, conexao: Conexao): Promise<number> {
  const registrarErro = (motivo: string) =>
    supabase.from('conexao_bancaria').update({ erro_sincronizacao: motivo }).eq('id', conexao.id)

  try {
    const item = await buscarItem(apiKey, conexao.item_id)

    /*
      O dono declarado do item precisa ser quem o cadastrou. É a defesa contra
      gravar, direto pela API, o item_id de outra pessoa para ler o extrato dela
      (ver o comentário de `conexao_bancaria` na migration).
    */
    if (!itemPodeSerDe(item, conexao.user_id)) {
      await registrarErro('Esta conexão pertence a outra pessoa na Pluggy.')
      return 0
    }

    const contasPluggy = await listarContas(apiKey, conexao.item_id)

    const { data: contas, error: erroContas } = await supabase
      .from('conta_bancaria')
      .upsert(
        contasPluggy.map(c => ({ ...camposDaConta(c), conexao_id: conexao.id, user_id: conexao.user_id })),
        { onConflict: 'pluggy_account_id' },
      )
      .select('id, pluggy_account_id')
    if (erroContas) throw new Error(erroContas.message)

    const idDaConta = new Map((contas ?? []).map(c => [c.pluggy_account_id as string, c.id as string]))

    const faturas = (await Promise.all(
      contasPluggy.filter(c => tipoDaConta(c) === 'cartao').map(c => listarFaturas(apiKey, c.id)),
    )).flat()
    const contexto = contextoDasContas(contasPluggy, vencimentosDasFaturas(faturas))

    const hoje = dataLocal(new Date().toISOString())
    const { de, ate } = janelaDeSincronizacao(conexao.sincronizado_em, hoje)

    let total = 0
    for (const contaPluggy of contasPluggy) {
      const contaId = idDaConta.get(contaPluggy.id)
      if (!contaId) continue

      const transacoes = await listarTransacoes(apiKey, contaPluggy.id, de, ate)
      const linhas = linhasDaConta(transacoes, { pluggyId: contaPluggy.id, tipo: tipoDaConta(contaPluggy) }, contexto)

      const { data, error } = await supabase.rpc('ingerir_transacoes', {
        p_conta: contaId,
        p_desde: de,
        p_linhas: linhas,
      })
      if (error) throw new Error(error.message)
      total += Number(data ?? 0)
    }

    await supabase
      .from('conexao_bancaria')
      .update({
        ...camposDaConexao(item),
        sincronizado_em: new Date().toISOString(),
        erro_sincronizacao: null,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', conexao.id)

    return total
  }
  catch (e) {
    if (e instanceof ErroPluggy && e.status === 404) {
      // O item sumiu da Pluggy (revogado no MeuPluggy, apagado no dashboard).
      await supabase
        .from('conexao_bancaria')
        .update({ status: 'DELETED', erro_sincronizacao: 'A conexão não existe mais na Pluggy.' })
        .eq('id', conexao.id)
      return 0
    }
    await registrarErro(e instanceof Error ? e.message : String(e))
    throw e
  }
}
