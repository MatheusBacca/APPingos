/**
 * APPingos — o carteiro das notificações.
 *
 * Drena `notificacao_email_fila`, renderiza cada linha com o MESMO módulo que a
 * tela usa (`../_shared/notificacoes.ts`) e entrega pelo SMTP do Gmail.
 *
 * A função é acordada por `net.http_post` a partir de um gatilho no banco, e
 * também a cada 5 minutos pelo pg_cron. As duas chamadas fazem exatamente a
 * mesma coisa, e é assim que tem que ser: ela não recebe "qual e-mail mandar"
 * como parâmetro — ela olha a fila. Isso é o que torna o disparo repetível sem
 * risco de e-mail duplicado, e o que faz a fila voltar a andar sozinha depois de
 * qualquer queda.
 *
 * POR QUE GMAIL, E NÃO UM PROVEDOR DE ENVIO. A primeira versão usava Resend, e
 * ele é melhor — mas o plano gratuito só entrega para terceiros com um domínio
 * verificado, e sem domínio o e-mail chega só na caixa de quem é dono da conta.
 * Num app de casal isso é a metade que importa ficando de fora. O Gmail com
 * senha de app custa zero, não precisa de domínio, e quem entrega é um servidor
 * do próprio Google — então a mensagem cai na caixa de entrada, não no spam.
 * O limite (~500/dia) é ordens de grandeza acima do que dois usuários geram.
 *
 * A troca é barata nos dois sentidos, e de propósito: o provedor está confinado
 * a este arquivo. O motor, a fila, as preferências e a caixa in-app não sabem
 * quem entrega. Voltar para um provedor com domínio é mexer só aqui.
 *
 * Segredos (Project Settings > Edge Functions > Secrets):
 *   GMAIL_USUARIO       a conta que envia, ex. `appingos.avisos@gmail.com`
 *   GMAIL_SENHA_DE_APP  senha de app de 16 letras (NÃO a senha da conta)
 *   APP_URL             'https://appingos.vercel.app' — a raiz dos links
 *   NOME_REMETENTE      opcional; o nome exibido, padrão "APPingos"
 * `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetados pela plataforma.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'
import { emailDaNotificacao, type Notificacao } from '../_shared/notificacoes.ts'

/** Teto por acordada. O cron a cada 5 min drena o resto se a fila estourar. */
const LOTE = 20

const MAX_TENTATIVAS = 5

interface LinhaDaFila {
  id: string
  notificacao_id: string
  user_id: string
  destinatario: string
  tentativas: number
  notificacao: Notificacao | null
}

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

  const usuario = Deno.env.get('GMAIL_USUARIO')
  const senha = Deno.env.get('GMAIL_SENHA_DE_APP')
  const appUrl = Deno.env.get('APP_URL')

  if (!usuario || !senha || !appUrl) {
    // Erro de configuração, não de dado: a fila fica intacta e volta a andar
    // quando os segredos existirem. Não incrementa tentativa de ninguém.
    return new Response(
      JSON.stringify({ erro: 'faltam GMAIL_USUARIO, GMAIL_SENHA_DE_APP ou APP_URL' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  /*
    O remetente é sempre a conta autenticada, e não um endereço configurável: o
    Gmail reescreve o `From` para a conta que fez login (ou recusa, se for um
    alias não cadastrado). Deixar isso como segredo livre criaria a pegadinha de
    configurar um endereço e receber outro, sem erro nenhum. Só o nome exibido
    é escolha.
  */
  const remetente = `${Deno.env.get('NOME_REMETENTE') ?? 'APPingos'} <${usuario}>`

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

  /*
    Uma conexão para o lote inteiro. Além de mais rápido, é o que o Gmail
    prefere: abrir e fechar sessão SMTP a cada mensagem é justamente o padrão que
    ele trata como suspeito. Porta 465 com TLS desde o primeiro byte (implícito),
    e não 587 com STARTTLS — menos ida e volta, e nada trafega em claro.
  */
  const cliente = new SMTPClient({
    connection: {
      hostname: 'smtp.gmail.com',
      port: 465,
      tls: true,
      auth: { username: usuario, password: senha },
    },
  })

  let enviados = 0
  let falhas = 0
  let problemaDeConexao: string | null = null

  try {
    for (const linha of fila) {
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

        await cliente.send({
          from: remetente,
          to: linha.destinatario,
          subject: assunto,
          content: texto,
          html,
          /*
            O cabeçalho que põe "Cancelar inscrição" ao lado do remetente no
            Gmail. Ele vale deliverability: é o caminho de saída que o cliente de
            e-mail oferece ANTES do botão de spam.
          */
          headers: { 'List-Unsubscribe': `<${urlDescadastro}>` },
        })

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
        const motivo = String(e instanceof Error ? e.message : e)

        /*
          Senha de app errada, 2FA desligado, Gmail inacessível: isso não é
          problema DESTA mensagem, é da configuração. Marcar como erro aqui
          queimaria as cinco tentativas da fila inteira num defeito que trocar um
          segredo resolve — e os avisos ficariam parados para sempre depois de
          arrumado, porque `tentativas < 5` já não os alcançaria. Então aborta o
          lote e não encosta na fila: ela sai inteira no próximo ciclo do cron.
        */
        if (/535|5\.7\.8|invalid login|username and password|connection|timed out|refused|handshake/i.test(motivo)) {
          problemaDeConexao = motivo
          break
        }

        falhas++
        await supabase
          .from('notificacao_email_fila')
          .update({
            estado: 'erro',
            tentativas: linha.tentativas + 1,
            erro: motivo.slice(0, 500),
          })
          .eq('id', linha.id)
      }
    }
  }
  finally {
    // Sem isto a conexão fica pendurada até o Gmail derrubá-la por tempo, e o
    // isolate da função não encerra.
    await cliente.close().catch(() => {})
  }

  if (problemaDeConexao) {
    return new Response(
      JSON.stringify({ enviados, falhas, erro: `SMTP: ${problemaDeConexao}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }

  return new Response(JSON.stringify({ enviados, falhas }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
