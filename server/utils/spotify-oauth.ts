/**
 * Os dois cookies que atravessam o fluxo de autorização do Spotify.
 *
 * Eles existem porque `iniciar` e `callback` são duas requisições diferentes,
 * com o site do Spotify no meio: o verificador do PKCE e o `state` precisam
 * sobreviver a essa ida sem passar pela URL, onde ficariam no histórico do
 * navegador e no log de qualquer proxy.
 */
import type { H3Event } from 'h3'

export const COOKIE_VERIFICADOR = 'spotify_pkce'
export const COOKIE_ESTADO = 'spotify_state'

/** Dez minutos: o tempo de autorizar numa tela, não o de uma sessão. */
const VIDA_SEGUNDOS = 600

export function opcoesDoCookie(event: H3Event) {
  return {
    httpOnly: true,
    /*
     * `lax`, e não `strict`: o callback chega como navegação de topo vinda do
     * accounts.spotify.com, e `strict` não manda cookie nenhum num salto entre
     * sites — o fluxo falharia sempre, e falharia dizendo "estado inválido".
     */
    sameSite: 'lax' as const,
    // Em https quando estamos em https; no `nuxt dev` (http://localhost) um
    // cookie `secure` simplesmente não seria guardado.
    secure: getRequestURL(event).protocol === 'https:',
    path: '/api/spotify/auth',
    maxAge: VIDA_SEGUNDOS,
  }
}

/** Apaga os dois — o fluxo acabou, com sucesso ou não. */
export function limparCookiesDoFluxo(event: H3Event): void {
  const opcoes = opcoesDoCookie(event)
  deleteCookie(event, COOKIE_VERIFICADOR, opcoes)
  deleteCookie(event, COOKIE_ESTADO, opcoes)
}
