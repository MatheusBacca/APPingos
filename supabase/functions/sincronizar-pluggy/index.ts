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
 *   - o banco, pelo `pg_cron` diário, com uma chave secreta do projeto — a nova
 *     (`sb_secret_…`, no header `apikey`) ou a `service_role` legada (Bearer),
 *     ver `../_shared/chaves-supabase.ts` (`acordar_sincronizacao_pluggy`,
 *     20261112110100_open_finance_cron.sql);
 *   - a Pluggy, pelo webhook opcional: header `x-appingos-webhook` com o segredo
 *     `PLUGGY_WEBHOOK_SECRET`. Responde 202 na hora e processa depois — a Pluggy
 *     exige 2xx em até 10 s;
 *   - a própria pessoa, pelo botão da caixa de entrada: o JWT da sessão no
 *     Bearer (`supabase.functions.invoke`). Só dispara a SINCRONIZAÇÃO INICIAL —
 *     as conexões DELA que nunca sincronizaram (`sincronizado_em` nulo). Depois
 *     disso o ritmo é o do cron, e o botão some: o MeuPluggy só atualiza uma vez
 *     por dia, e um "sincronizar agora" à vontade só gastaria a cota da Pluggy.
 *
 * A ANON KEY não serve: ela é um JWT válido e pública por definição. Por isso
 * `verify_jwt = false` no config.toml e a checagem feita aqui dentro, como no
 * carteiro dos e-mails.
 *
 * Segredos (Project Settings > Edge Functions > Secrets):
 *   PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET   os mesmos do NUXT_PLUGGY_* do app
 *   PLUGGY_WEBHOOK_SECRET                    opcional; sem ele, webhook recusado
 * `SUPABASE_URL`, `SUPABASE_SECRET_KEYS` e (legada) `SUPABASE_SERVICE_ROLE_KEY`
 * são injetados pela plataforma.
 *
 * NADA AQUI FOI EXECUTADO CONTRA A PLUGGY DE VERDADE: o código segue a
 * documentação v2 e as regras testadas no vitest. Validar com o trial (fase 2).
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'
import { chamadaDeServico, chaveParaOBanco, tokenBearer } from '../_shared/chaves-supabase.ts'
import {
  ErroPluggy,
  autenticarPluggy,
  buscarItem,
  listarContas,
  listarEmprestimos,
  listarFaturas,
  listarInvestimentos,
  listarMovimentosDoInvestimento,
  listarTransacoes,
  type ContaPluggy,
  type FaturaPluggy,
} from '../_shared/pluggy-api.ts'
import {
  amostraDeTransacoes,
  camposDaConexao,
  camposDaConta,
  comprasParaLancar,
  contaParaAtualizar,
  contextoDasContas,
  dataLocal,
  emprestimoParaLinha,
  faturaParaLinha,
  finaisDosCartoes,
  investimentoParaLinha,
  itemPodeSerDe,
  janelaDeSincronizacao,
  linhasDaConta,
  movimentoParaLinha,
  tipoDaConta,
  vencimentosDasFaturas,
  type TransacaoNormalizada,
} from '../_shared/importacao-bancaria.ts'
import { COR_CATEGORIA_BASE, agruparPorRegra, categoriaBaseDoNome } from '../_shared/estabelecimentos.ts'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void }

/**
 * A versão do que a coleta grava. Subiu quando a transação ganhou colunas
 * (final do cartão, MCC...): a conexão abaixo dela relê a janela inicial inteira
 * uma vez, e o upsert preenche as colunas novas no que já tinha entrado.
 */
const VERSAO_COLETA = 1

interface Conexao {
  id: string
  user_id: string
  item_id: string
  sincronizado_em: string | null
  versao_coleta: number
}

/** Um cartão por final, como a sincronização o conhece. */
interface CartaoDoFinal {
  id: string
  final: string
  destino: 'herdar' | 'casal' | 'pessoal' | 'perguntar'
}

/** Eventos do webhook que pedem para reler um item. */
const EVENTOS_DE_ITEM = new Set([
  'item/created',
  'item/updated',
  'item/login_succeeded',
  'transactions/created',
  'transactions/updated',
])

/*
  O botão da caixa de entrada chama do navegador, e o `functions.invoke` manda
  `authorization`, `apikey` e `x-client-info` — o que dispara o preflight. Origem
  aberta não abre nada: sem a sessão de alguém no Bearer, a chamada é recusada
  igual (e o cron e a Pluggy nem passam por CORS).
*/
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = Deno.env.get('SUPABASE_URL')!
  const lerAmbiente = (nome: string) => Deno.env.get(nome)
  const serviceKey = chaveParaOBanco(lerAmbiente)
  const segredoWebhook = Deno.env.get('PLUGGY_WEBHOOK_SECRET')

  if (!serviceKey) {
    return json({ erro: 'o projeto não expôs nenhuma chave secreta para a função' }, 500)
  }

  const peloBanco = chamadaDeServico(req.headers, lerAmbiente)
  const pelaPluggy = !!segredoWebhook && req.headers.get('x-appingos-webhook') === segredoWebhook

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  /*
    Nem o banco nem a Pluggy: só pode ser alguém logado. O `getUser` confere a
    assinatura e a validade da sessão no Auth — a anon key, que também é JWT,
    não tem usuário e cai aqui.
  */
  let usuario: string | null = null
  if (!peloBanco && !pelaPluggy) {
    const token = tokenBearer(req.headers)
    const { data } = token ? await supabase.auth.getUser(token) : { data: { user: null } }
    usuario = data.user?.id ?? null
    if (!usuario) {
      // 401 encerra as tentativas da Pluggy — é o que se quer para quem não sabe o segredo.
      return json({ erro: 'não autorizado' }, 401)
    }
  }

  const clientId = Deno.env.get('PLUGGY_CLIENT_ID')
  const clientSecret = Deno.env.get('PLUGGY_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    return json({ erro: 'faltam PLUGGY_CLIENT_ID ou PLUGGY_CLIENT_SECRET' }, 500)
  }

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

  const resultado = await sincronizarTudo(supabase, clientId, clientSecret, usuario)
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
    .select('id, user_id, item_id, sincronizado_em, versao_coleta')
    .eq('item_id', corpo.itemId)
    .maybeSingle()

  // Item que ninguém cadastrou no app: a Pluggy avisa de toda a Application.
  if (!conexao) return

  const apiKey = await autenticarPluggy(clientId, clientSecret)
  await sincronizarConexao(supabase, apiKey, conexao as Conexao)
}

/**
 * Todas as conexões (o cron) ou, com `usuario`, só as iniciais daquela pessoa
 * (o botão da caixa de entrada).
 */
async function sincronizarTudo(
  supabase: SupabaseClient,
  clientId: string,
  clientSecret: string,
  usuario: string | null = null,
) {
  let consulta = supabase
    .from('conexao_bancaria')
    .select('id, user_id, item_id, sincronizado_em, versao_coleta')
    .neq('status', 'DELETED')
  if (usuario) consulta = consulta.eq('user_id', usuario).is('sincronizado_em', null)

  const { data: conexoes, error } = await consulta

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

/**
 * O limite, o ciclo da fatura atual e as faturas fechadas de cada cartão.
 *
 * O crédito vai num `update` por conta, e só com os campos que vieram
 * (`creditoParaAtualizar`): campo que o banco parou de mandar mantém o último
 * valor. As faturas, num upsert por (conta, fatura) — rodar de novo é inócuo.
 *
 * É bônus, como a própria fatura em `listarFaturas`: uma falha aqui vai para o
 * log e não impede o extrato de entrar.
 */
async function gravarCreditoEFaturas(
  supabase: SupabaseClient,
  userId: string,
  contaDoApp: Map<string, { id: string }>,
  contasPluggy: ContaPluggy[],
  faturasPorCartao: Array<{ cartao: ContaPluggy, faturas: FaturaPluggy[] }>,
) {
  const agora = new Date().toISOString()

  // Saldo, conta corrente e perfil do cartão: de TODAS as contas, não só dos cartões.
  for (const contaPluggy of contasPluggy) {
    const conta = contaDoApp.get(contaPluggy.id)
    if (!conta) continue
    const campos = contaParaAtualizar(contaPluggy, agora)
    if (Object.keys(campos).length) {
      const { error } = await supabase.from('conta_bancaria').update(campos).eq('id', conta.id)
      if (error) console.error(`saldo/limite da conta ${conta.id} não gravado:`, error.message)
    }
  }

  for (const { cartao, faturas } of faturasPorCartao) {
    const conta = contaDoApp.get(cartao.id)
    if (!conta) continue

    const linhas = faturas.flatMap((f) => {
      const linha = faturaParaLinha(f, conta.id, userId)
      return linha ? [{ ...linha, atualizada_em: agora }] : []
    })
    if (linhas.length) {
      const { error } = await supabase
        .from('fatura_cartao')
        .upsert(linhas, { onConflict: 'conta_id,pluggy_bill_id' })
      if (error) console.error(`faturas do cartão ${conta.id} não gravadas:`, error.message)
    }
  }
}

/**
 * A última resposta crua da Pluggy de um recurso, para estudo (`amostra_pluggy`).
 * Nunca derruba a sincronização: é diagnóstico.
 */
async function guardarAmostra(supabase: SupabaseClient, conexao: Conexao, recurso: string, dados: unknown) {
  const { error } = await supabase.from('amostra_pluggy').upsert({
    conexao_id: conexao.id,
    user_id: conexao.user_id,
    recurso,
    dados: dados ?? null,
    coletada_em: new Date().toISOString(),
  }, { onConflict: 'conexao_id,recurso' })
  if (error) console.error(`amostra ${recurso} não guardada:`, error.message)
}

/**
 * Cria os cartões por final que ainda não existem e devolve todos os da conta,
 * com o destino que a pessoa escolheu. `visto_em` marca o último dia em que o
 * final apareceu — a tela pode esconder cartão que sumiu há meses.
 */
async function registrarCartoes(
  supabase: SupabaseClient,
  userId: string,
  contaId: string,
  finais: string[],
): Promise<CartaoDoFinal[]> {
  if (finais.length) {
    const { error } = await supabase.from('cartao_bancario').upsert(
      finais.map(final => ({ user_id: userId, conta_id: contaId, final, visto_em: new Date().toISOString() })),
      { onConflict: 'conta_id,final', ignoreDuplicates: false },
    )
    if (error) console.error(`cartões da conta ${contaId} não registrados:`, error.message)
  }
  const { data, error } = await supabase
    .from('cartao_bancario')
    .select('id, final, destino')
    .eq('conta_id', contaId)
  if (error) {
    console.error(`cartões da conta ${contaId} não lidos:`, error.message)
    return []
  }
  return (data ?? []) as CartaoDoFinal[]
}

/**
 * Investimentos (com os movimentos) e empréstimos do item. Bônus como a fatura:
 * banco que não compartilhou devolve lista vazia, e uma falha aqui vai para o
 * log sem impedir o extrato.
 */
async function gravarInvestimentosEEmprestimos(
  supabase: SupabaseClient,
  apiKey: string,
  conexao: Conexao,
  amostra: (recurso: string, dados: unknown) => Promise<void>,
) {
  const agora = new Date().toISOString()
  try {
    const investimentos = await listarInvestimentos(apiKey, conexao.item_id)
    await amostra('investimentos', investimentos)
    if (investimentos.length) {
      const { data: gravados, error } = await supabase
        .from('investimento')
        .upsert(
          investimentos.map(i => ({ ...investimentoParaLinha(i), user_id: conexao.user_id, conexao_id: conexao.id, atualizado_em: agora })),
          { onConflict: 'pluggy_investment_id' },
        )
        .select('id, pluggy_investment_id')
      if (error) throw new Error(error.message)

      const idDoApp = new Map((gravados ?? []).map(g => [g.pluggy_investment_id as string, g.id as string]))
      for (const inv of investimentos) {
        const investimentoId = idDoApp.get(inv.id)
        if (!investimentoId) continue
        const movimentos = await listarMovimentosDoInvestimento(apiKey, inv.id)
        if (movimentos.length) await amostra(`movimentos:${inv.id}`, movimentos.slice(0, 20))
        const linhas = movimentos.flatMap((m) => {
          const linha = movimentoParaLinha(m)
          return linha ? [{ ...linha, user_id: conexao.user_id, investimento_id: investimentoId }] : []
        })
        if (!linhas.length) continue
        const { error: erroMov } = await supabase
          .from('investimento_movimento')
          .upsert(linhas, { onConflict: 'investimento_id,pluggy_id' })
        if (erroMov) console.error(`movimentos do investimento ${investimentoId} não gravados:`, erroMov.message)
      }
    }
  }
  catch (e) {
    console.error('investimentos não gravados:', e instanceof Error ? e.message : e)
  }

  try {
    const emprestimos = await listarEmprestimos(apiKey, conexao.item_id)
    await amostra('emprestimos', emprestimos)
    if (emprestimos.length) {
      const { error } = await supabase.from('emprestimo').upsert(
        emprestimos.map(e => ({ ...emprestimoParaLinha(e), user_id: conexao.user_id, conexao_id: conexao.id, atualizado_em: agora })),
        { onConflict: 'pluggy_loan_id' },
      )
      if (error) throw new Error(error.message)
    }
  }
  catch (e) {
    console.error('empréstimos não gravados:', e instanceof Error ? e.message : e)
  }
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
      .select('id, pluggy_account_id, destino')
    if (erroContas) throw new Error(erroContas.message)

    const contaDoApp = new Map((contas ?? []).map(c => [
      c.pluggy_account_id as string,
      { id: c.id as string, destino: c.destino as string },
    ]))

    const cartoes = contasPluggy.filter(c => tipoDaConta(c) === 'cartao')
    const faturasPorCartao = await Promise.all(
      cartoes.map(async c => ({ cartao: c, faturas: await listarFaturas(apiKey, c.id) })),
    )
    const faturas = faturasPorCartao.flatMap(f => f.faturas)
    const contexto = contextoDasContas(contasPluggy, vencimentosDasFaturas(faturas))

    await gravarCreditoEFaturas(supabase, conexao.user_id, contaDoApp, contasPluggy, faturasPorCartao)

    const amostra = (recurso: string, dados: unknown) =>
      guardarAmostra(supabase, conexao, recurso, dados)
    await amostra('item', item)
    await amostra('contas', contasPluggy)
    for (const { cartao, faturas: doCartao } of faturasPorCartao) {
      await amostra(`faturas:${cartao.id}`, doCartao.slice(0, 6))
    }

    const hoje = dataLocal(new Date().toISOString())
    // Abaixo da versão da coleta, relê a janela inicial para preencher as colunas novas.
    const releitura = (conexao.versao_coleta ?? 0) < VERSAO_COLETA
    const { de, ate } = janelaDeSincronizacao(releitura ? null : conexao.sincronizado_em, hoje)

    /*
      As regras com "Classificar sozinha" ligado (regra_classificacao.automatica).
      Valem só para conta em 'perguntar' — a designada já tem destino — e a RPC
      confere de novo tudo o que importa (pessoal, automática, desde quando).
    */
    const { data: regrasAutomaticas, error: erroRegras } = await supabase
      .from('regra_classificacao')
      .select('id, chave, categoria_nome')
      .eq('user_id', conexao.user_id)
      .eq('automatica', true)
    if (erroRegras) console.error('regras automáticas não lidas:', erroRegras.message)

    let total = 0
    for (const contaPluggy of contasPluggy) {
      const conta = contaDoApp.get(contaPluggy.id)
      if (!conta) continue

      const transacoes = await listarTransacoes(apiKey, contaPluggy.id, de, ate)
      await amostra(`transacoes:${contaPluggy.id}`, amostraDeTransacoes(transacoes))
      const linhas = linhasDaConta(transacoes, { pluggyId: contaPluggy.id, tipo: tipoDaConta(contaPluggy) }, contexto)

      const { data, error } = await supabase.rpc('ingerir_transacoes', {
        p_conta: conta.id,
        p_desde: de,
        p_linhas: linhas,
      })
      if (error) throw new Error(error.message)
      total += Number(data ?? 0)

      /*
        Os cartões por final (o físico, o virtual, os adicionais). Cada um pode ter
        destino próprio; `herdar` segue a conta.
      */
      const cartoes = tipoDaConta(contaPluggy) === 'cartao'
        ? await registrarCartoes(supabase, conexao.user_id, conta.id, finaisDosCartoes(contaPluggy, linhas))
        : []
      const destinoDoCartao = new Map(cartoes.map(c => [c.final, c]))
      const destinoDaLinha = (l: TransacaoNormalizada) => {
        const c = l.cartao_final ? destinoDoCartao.get(l.cartao_final) : undefined
        return c && c.destino !== 'herdar' ? c.destino : conta.destino
      }

      /*
        O cartão designado (decisão nº 3 de 12/11/2026): as compras entram
        sozinhas no espaço do casal (50/50) ou no pessoal. O resto fica na caixa
        de entrada. A RPC decide o que é elegível; aqui vai só o plano. A da
        conta pula as transações de cartão com destino próprio; a de cada
        cartão, só as dele.
      */
      if (conta.destino === 'casal' || conta.destino === 'pessoal') {
        const { error: erroLancar } = await supabase.rpc('lancar_compras_do_cartao', {
          p_conta: conta.id,
          p_compras: comprasParaLancar(linhas.filter(l => destinoDaLinha(l) === conta.destino)),
        })
        if (erroLancar) throw new Error(erroLancar.message)
      }
      for (const cartao of cartoes) {
        if (cartao.destino !== 'casal' && cartao.destino !== 'pessoal') continue
        const doCartao = linhas.filter(l => l.cartao_final === cartao.final)
        if (!doCartao.length) continue
        const { error: erroCartao } = await supabase.rpc('lancar_compras_do_cartao', {
          p_conta: conta.id,
          p_compras: comprasParaLancar(doCartao),
          p_cartao: cartao.id,
        })
        if (erroCartao) throw new Error(erroCartao.message)
      }

      // As regras automáticas valem para o que fica em "perguntar".
      const aPerguntar = linhas.filter(l => destinoDaLinha(l) === 'perguntar')
      if (aPerguntar.length && regrasAutomaticas?.length) {
        const grupos = agruparPorRegra(aPerguntar, regrasAutomaticas)
        for (const [regraId, doGrupo] of grupos) {
          const regra = regrasAutomaticas.find(r => r.id === regraId)!
          const base = categoriaBaseDoNome(regra.categoria_nome)
          const { error: erroRegra } = await supabase.rpc('lancar_compras_por_regra', {
            p_conta: conta.id,
            p_regra: regraId,
            p_compras: comprasParaLancar(doGrupo),
            p_cor: base ? COR_CATEGORIA_BASE[base] : 'cinza',
          })
          // Como o crédito e as faturas: falhar aqui deixa a transação na caixa, não perde nada.
          if (erroRegra) console.error(`regra ${regraId} não aplicada:`, erroRegra.message)
        }
      }
    }

    /*
      A sincronização inicial só conta como feita com o item já atualizado. Logo
      depois de conectar a Pluggy ainda está coletando (`UPDATING`) e pode ter
      devolvido parte dos 90 dias; marcar `sincronizado_em` agora faria a próxima
      voltar só 10 dias e perder o resto. Sem a marca, o cron relê a janela
      inteira — o upsert por `provider_id` torna a repetição inócua.
    */
    const inicialIncompleta = (!conexao.sincronizado_em || releitura) && item.status !== 'UPDATED'

    await gravarInvestimentosEEmprestimos(supabase, apiKey, conexao, amostra)

    await supabase
      .from('conexao_bancaria')
      .update({
        ...camposDaConexao(item),
        ...(inicialIncompleta ? {} : { sincronizado_em: new Date().toISOString(), versao_coleta: VERSAO_COLETA }),
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
