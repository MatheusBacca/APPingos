/**
 * APPingos — o carteiro das notificações.
 *
 * Drena `notificacao_email_fila`, renderiza cada linha com o MESMO módulo que a
 * tela usa (`../_shared/notificacoes.ts`) e entrega pelo Resend.
 *
 * A função é acordada por `net.http_post` a partir de um gatilho no banco, e
 * também a cada 5 minutos pelo pg_cron. As duas chamadas fazem exatamente a
 * mesma coisa, e é assim que tem que ser: ela não recebe "qual e-mail mandar"
 * como parâmetro — ela olha a fila. Isso é o que torna o disparo repetível sem
 * risco de e-mail duplicado, e o que faz a fila voltar a andar sozinha depois de
 * qualquer queda.
 *
 * Segredos (Project Settings > Edge Functions > Secrets):
 *   RESEND_API_KEY     chave da API do Resend
 *   EMAIL_REMETENTE    'APPingos <avisos@seu-dominio.com>'
 *   APP_URL            'https://appingos.vercel.app' — a raiz dos links
 * `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetados pela plataforma.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'
import { emailDaNotificacao, type Notificacao } from '../_shared/notificacoes.ts'

/** Teto por acordada. O cron a cada 5 min drena o resto se a fila estourar. */
const LOTE = 20

/** O plano grátis do Resend aceita 2 req/s. Uma pausa curta cabe folgada nisso. */
const PAUSA_MS = 600

const MAX_TENTATIVAS = 5

interface LinhaDaFila {
  id: string
  notificacao_id: string
  user_id: string
  destinatario: string
  tentativas: number
  notificacao: Notificacao | null
}

const espere = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  /*
    `verify_jwt` sozinho não basta: a ANON KEY é um JWT válido e é pública por
    definição, então qualquer pessoa com o app aberto passaria por ele. Quem pode
    acordar o carteiro é quem tem a service role — o banco, e mais ninguém.
  */
  const autorizacao = req.headers.get('Authorization') ?? ''
  if (autorizacao !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ erro: 'não autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')
  const remetente = Deno.env.get('EMAIL_REMETENTE')
  const appUrl = Deno.env.get('APP_URL')

  if (!resendKey || !remetente || !appUrl) {
    // Erro de configuração, não de dado: a fila fica intacta e volta a andar
    // quando os segredos existirem. Não incrementa tentativa de ninguém.
    return new Response(
      JSON.stringify({ erro: 'faltam RESEND_API_KEY, EMAIL_REMETENTE ou APP_URL' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: fila, error } = await supabase
    .from('notificacao_email_fila')
    .select('id, notificacao_id, user_id, destinatario, tentativas, notificacao:notificacao(*)')
    .neq('estado', 'enviado')
    .lt('tentativas', MAX_TENTATIVAS)
    .order('criado_em', { ascending: true })
    .limit(LOTE)
    .returns<LinhaDaFila[]>()

  if (error) {
    return new Response(JSON.stringify({ erro: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!fila?.length) {
    return new Response(JSON.stringify({ enviados: 0, falhas: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /*
    Os tokens de descadastro numa consulta só, e não um select por e-mail: o lote
    inteiro costuma ser das mesmas duas pessoas.
  */
  const { data: assinaturas } = await supabase
    .from('notificacao_email')
    .select('user_id, token')
    .in('user_id', [...new Set(fila.map(l => l.user_id))])

  const tokenPorUsuario = new Map((assinaturas ?? []).map(a => [a.user_id, a.token]))

  let enviados = 0
  let falhas = 0

  for (const [indice, linha] of fila.entries()) {
    if (indice > 0) await espere(PAUSA_MS)

    try {
      if (!linha.notificacao) {
        // A notificação sumiu entre o enfileiramento e agora (faxina, espaço
        // excluído). Não há o que mandar, e insistir só empataria a fila.
        throw new Error('notificação não encontrada')
      }

      const token = tokenPorUsuario.get(linha.user_id)
      const urlDescadastro = `${appUrl.replace(/\/$/, '')}/descadastrar?token=${token ?? ''}`
      const { assunto, html, texto } = emailDaNotificacao(linha.notificacao, {
        appUrl,
        urlDescadastro,
      })

      const resposta = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: remetente,
          to: [linha.destinatario],
          subject: assunto,
          html,
          text: texto,
          /*
            O cabeçalho que põe "Cancelar inscrição" ao lado do remetente no
            Gmail. Ele vale deliverability: é o caminho de saída que o cliente de
            e-mail oferece ANTES do botão de spam.
          */
          headers: { 'List-Unsubscribe': `<${urlDescadastro}>` },
        }),
      })

      if (!resposta.ok) {
        throw new Error(`Resend ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`)
      }

      await supabase
        .from('notificacao_email_fila')
        .update({
          estado: 'enviado',
          enviado_em: new Date().toISOString(),
          tentativas: linha.tentativas + 1,
          erro: null,
        })
        .eq('id', linha.id)

      enviados++
    }
    catch (e) {
      falhas++
      await supabase
        .from('notificacao_email_fila')
        .update({
          estado: 'erro',
          tentativas: linha.tentativas + 1,
          erro: String(e instanceof Error ? e.message : e).slice(0, 500),
        })
        .eq('id', linha.id)
    }
  }

  return new Response(JSON.stringify({ enviados, falhas }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
