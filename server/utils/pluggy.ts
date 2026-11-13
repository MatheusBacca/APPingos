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
    throw erroPluggy(503, 'A Pluggy ainda não foi configurada neste ambiente (faltam NUXT_PLUGGY_CLIENT_ID e NUXT_PLUGGY_CLIENT_SECRET).')
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
    throw traduzirErroPluggy(e)
  }
}

/** Esquece a chave — para quando a Pluggy responde 401 antes de ela vencer. */
export function esquecerApiKeyPluggy() {
  chaveEmCache = null
}

/**
 * Erro da Pluggy em erro nosso, sem levar adiante nada que não seja o status e
 * o recurso (a mensagem de `ErroPluggy` já foi montada sem query nem id).
 */
export function traduzirErroPluggy(e: unknown) {
  if (e instanceof ErroPluggy) {
    if (e.status === 401 || e.status === 403) {
      esquecerApiKeyPluggy()
      return erroPluggy(502, 'A Pluggy recusou as credenciais do app. Confira NUXT_PLUGGY_CLIENT_ID/SECRET.')
    }
    if (e.status === 404) return erroPluggy(404, 'A Pluggy não encontrou esta conexão.')
    if (e.status === 429) return erroPluggy(429, 'A Pluggy pediu uma pausa — tente de novo em alguns segundos.')
    return erroPluggy(502, e.message)
  }
  return erroPluggy(502, 'Falha ao falar com a Pluggy.')
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
