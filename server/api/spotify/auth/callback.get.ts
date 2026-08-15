/**
 * Passo 2 do "Conectar Spotify": a volta.
 *
 * Esta rota é aberta pelo NAVEGADOR, não por `$fetch` — é o Spotify
 * redirecionando a pessoa de volta. Por isso ela nunca responde JSON: em
 * qualquer desfecho ela devolve a pessoa para `/espacos` com o resultado na
 * query, e é a tela que traduz aquilo em mensagem.
 */
import { chamarSpotify, credenciaisSpotify, pedirTokenSpotify } from '~~/server/utils/spotify'
import { guardarConexao, redirecionamentoSpotify, usuarioDaRequisicao } from '~~/server/utils/spotify-conta'
import { COOKIE_ESTADO, COOKIE_VERIFICADOR, limparCookiesDoFluxo } from '~~/server/utils/spotify-oauth'

interface RespostaToken {
  access_token: string
  refresh_token?: string
  scope?: string
}

const DESTINO = '/espacos'

function voltar(event: Parameters<typeof sendRedirect>[0], resultado: string) {
  limparCookiesDoFluxo(event)
  return sendRedirect(event, `${DESTINO}?spotify=${resultado}`)
}

export default defineEventHandler(async (event) => {
  const { code, state, error } = getQuery(event)

  // A pessoa clicou em "Cancelar" na tela do Spotify. Não é falha do app.
  if (error) return voltar(event, 'cancelado')

  const estadoGuardado = getCookie(event, COOKIE_ESTADO)
  const verificador = getCookie(event, COOKIE_VERIFICADOR)

  /*
   * `state` diferente do cookie = esta volta não pertence a este navegador.
   * Também cai aqui quem demorou mais de dez minutos autorizando (o cookie
   * venceu) — os dois casos pedem a mesma coisa: começar de novo.
   */
  if (!estadoGuardado || !verificador || typeof state !== 'string' || state !== estadoGuardado) {
    return voltar(event, 'estado-invalido')
  }

  if (typeof code !== 'string' || !code) return voltar(event, 'sem-codigo')

  try {
    // Sem sessão não há em nome de quem guardar — e aqui isso é possível: a
    // pessoa pode ter deslogado noutra aba enquanto autorizava no Spotify.
    await usuarioDaRequisicao(event)
    credenciaisSpotify(event)

    const token = await pedirTokenSpotify<RespostaToken>(event, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirecionamentoSpotify(event),
      code_verifier: verificador,
    })

    if (!token.refresh_token) return voltar(event, 'sem-refresh')

    /*
     * Quem é esta conta no Spotify. Só para a tela poder dizer "conectado como
     * fulano" — se falhar, a conexão continua boa, então o erro é engolido de
     * propósito em vez de derrubar o fluxo inteiro por um rótulo.
     */
    let spotifyUserId: string | null = null
    try {
      const eu = await chamarSpotify<{ id?: string }>('/me', token.access_token)
      spotifyUserId = eu.id ?? null
    }
    catch {
      spotifyUserId = null
    }

    await guardarConexao(event, {
      refresh: token.refresh_token,
      escopos: token.scope ?? '',
      spotifyUserId,
    })

    return voltar(event, 'conectado')
  }
  catch {
    return voltar(event, 'falhou')
  }
})
