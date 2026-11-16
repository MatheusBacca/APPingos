/**
 * A Pluggy do lado do Nuxt — só o que precisa de alguém logado.
 *
 * Fase 3 de docs/notion-plano-open-finance.md. Aqui moram duas coisas: gerar o
 * connect token (o widget da Pluggy abre com ele) e registrar a conexão que o
 * widget devolve. A sincronização das transações NÃO passa pelo Nuxt: ela roda
 * na Edge Function `sincronizar-pluggy`, que tem o `service_role` que o app não
 * tem nem deve ter (invariante 7 do plano).
 *
 * O que nunca sai do servidor: `NUXT_PLUGGY_CLIENT_ID`, `NUXT_PLUGGY_CLIENT_SECRET`
 * e a `apiKey` que eles geram (invariante 6). Ao navegador chega só o connect
 * token, que vale 30 minutos e só abre o widget em nome de quem pediu.
 */
import type { H3Event } from 'h3'
import { serverSupabaseUser } from '#supabase/server'
import { ErroPluggy, autenticarPluggy } from '~~/supabase/functions/_shared/pluggy-api'

/** Mesmo texto no status e no corpo — o porquê está em `erroSpotify`. */
export function erroPluggy(statusCode: number, texto: string) {
  return createError({ statusCode, statusMessage: texto, message: texto })
}

export function credenciaisPluggy(event: H3Event): { id: string, secret: string } {
  const { pluggyClientId, pluggyClientSecret } = useRuntimeConfig(event)

  if (!pluggyClientId || !pluggyClientSecret) {
    console.error('[pluggy] faltam NUXT_PLUGGY_CLIENT_ID e NUXT_PLUGGY_CLIENT_SECRET no ambiente')
    throw erroPluggy(503, 'O Open Finance ainda não foi ativado neste app. Avise quem administra o APPingos.')
  }

  return { id: pluggyClientId, secret: pluggyClientSecret }
}

/**
 * A `apiKey` vale 2 horas. Fica em memória do processo até perto disso — o
 * mesmo raciocínio do token de aplicativo do Spotify: o Nitro na Vercel recria
 * a função a toda hora, e uma chave perdida custa só uma requisição a mais.
 */
const VALIDADE_MS = 2 * 60 * 60 * 1000
const FOLGA_MS = 5 * 60 * 1000

let chaveEmCache: { valor: string, expiraEm: number } | null = null

export async function apiKeyPluggy(event: H3Event): Promise<string> {
  if (chaveEmCache && chaveEmCache.expiraEm > Date.now()) return chaveEmCache.valor

  const { id, secret } = credenciaisPluggy(event)
  try {
    const valor = await autenticarPluggy(id, secret)
    chaveEmCache = { valor, expiraEm: Date.now() + VALIDADE_MS - FOLGA_MS }
    return valor
  }
  catch (e) {
    throw traduzirErroPluggy(e, 'autenticacao')
  }
}

/** Esquece a chave — para quando a Pluggy responde 401 antes de ela vencer. */
export function esquecerApiKeyPluggy() {
  chaveEmCache = null
}

/**
 * O que a pessoa lê quando a Pluggy recusa — em português de gente, sem nome de
 * variável de ambiente, rota ou mensagem em inglês. O detalhe técnico vai para o
 * log do servidor (`traduzirErroPluggy`), que é onde quem administra vai procurar.
 *
 * Na `autenticacao` (trocar client id + secret pela apiKey) qualquer 4xx é chave
 * errada ou ausente: a Pluggy responde 400 para um client id que nem é UUID, e
 * 401/403 para um par que não confere — para quem usa o app, é o mesmo problema.
 */
export function mensagemDoErroPluggy(status: number, contexto: 'autenticacao' | 'conexao' = 'conexao'): string {
  if (contexto === 'autenticacao' && status >= 400 && status < 500 && status !== 429) {
    return 'A ligação do APPingos com a Pluggy está com as chaves erradas. Avise quem administra o app.'
  }
  if (status === 401 || status === 403) {
    return 'A ligação do APPingos com a Pluggy está com as chaves erradas. Avise quem administra o app.'
  }
  if (status === 404) return 'A Pluggy não encontrou esta conexão. Confira o id ou conecte de novo.'
  if (status === 429) return 'A Pluggy pediu uma pausa — tente de novo em alguns segundos.'
  if (status >= 500) return 'A Pluggy não respondeu agora. Tente de novo em alguns minutos.'
  return 'A Pluggy não aceitou o pedido. Tente de novo; se continuar, avise quem administra o app.'
}

/**
 * Erro da Pluggy em erro nosso. A mensagem de `ErroPluggy` (já sem query nem id)
 * fica só no log; a pessoa recebe `mensagemDoErroPluggy`.
 */
export function traduzirErroPluggy(e: unknown, contexto: 'autenticacao' | 'conexao' = 'conexao') {
  if (e instanceof ErroPluggy) {
    console.error(`[pluggy] ${e.message}`)
    if (e.status === 401 || e.status === 403 || contexto === 'autenticacao') esquecerApiKeyPluggy()
    const status = e.status === 404 || e.status === 429 ? e.status : 502
    return erroPluggy(status, mensagemDoErroPluggy(e.status, contexto))
  }
  console.error('[pluggy] falha ao falar com a Pluggy:', e)
  return erroPluggy(502, 'Não deu para falar com a Pluggy agora. Confira a internet e tente de novo.')
}

/**
 * O id de quem fez a requisição, ou 401.
 *
 * Mesma pegadinha de `usuarioDaRequisicao` (spotify-conta.ts): neste
 * @nuxtjs/supabase, `serverSupabaseUser` devolve os CLAIMS do JWT, e o id vem
 * em `sub`. Repetido aqui, e não importado, porque a mensagem de lá fala do
 * Spotify.
 */
export async function usuarioDaPluggy(event: H3Event): Promise<string> {
  const claims = await serverSupabaseUser(event) as unknown as
    { sub?: string, id?: string } | null

  const id = claims?.sub ?? claims?.id
  if (!id) throw erroPluggy(401, 'Faça login para conectar o banco.')

  return id
}

/** Mora em `_shared/` porque a sincronização (Deno) aplica a mesma regra. */
export { itemPodeSerDe } from '~~/supabase/functions/_shared/importacao-bancaria'
