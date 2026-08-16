/**
 * Passo 1 do "Conectar Spotify": manda a pessoa autorizar.
 *
 * Não reaproveita o login do Supabase com Spotify (que o config.toml lista como
 * provedor): login é sobre identidade, isto é sobre AUTORIZAÇÃO de acesso às
 * playlists. Fluxos separados deixam alguém entrar com e-mail e senha e ainda
 * assim conectar o Spotify depois — e desconectar o Spotify sem perder a conta.
 */
import { createHash, randomBytes } from 'node:crypto'
import { ESCOPOS_SPOTIFY, ehLoopbackPorNome, redirecionamentoSpotify, usuarioDaRequisicao } from '~~/server/utils/spotify-conta'
import { credenciaisSpotify } from '~~/server/utils/spotify'
import { COOKIE_ESTADO, COOKIE_VERIFICADOR, opcoesDoCookie } from '~~/server/utils/spotify-oauth'

export default defineEventHandler(async (event) => {
  // Antes de qualquer redirecionamento: sem sessão não há em nome de quem
  // guardar a conexão, e descobrir isso depois de a pessoa autorizar no Spotify
  // seria fazê-la percorrer o fluxo inteiro para receber um erro no fim.
  await usuarioDaRequisicao(event)

  /*
   * Sem as chaves no .env, volta para Espaços com um recado — e não com a tela
   * de erro do Nuxt.
   *
   * Esta rota é aberta por navegação do navegador, então um `throw` aqui tira a
   * pessoa do app e a deixa numa página de erro crua, sem caminho de volta. O
   * callback já devolve todo desfecho para `/espacos`; este é o único ponto do
   * fluxo que destoava.
   */
  let id: string
  try {
    id = credenciaisSpotify(event).id
  }
  catch {
    return sendRedirect(event, '/espacos?spotify=nao-configurado')
  }

  // Aberto em `localhost`? O Spotify recusaria o redirect_uri lá na frente, numa
  // tela dele sem volta. Melhor parar aqui e dizer o endereço certo.
  if (ehLoopbackPorNome(event)) {
    return sendRedirect(event, '/espacos?spotify=use-loopback')
  }

  /*
   * PKCE mesmo com client secret.
   *
   * O secret sozinho já autenticaria o app na troca do code, então o PKCE aqui
   * não é obrigatório — ele fecha o buraco de alguém interceptar o `code` no
   * redirecionamento e trocá-lo por conta própria. Custa dois campos e um
   * cookie, e é o que o Spotify recomenda hoje.
   */
  const verificador = randomBytes(64).toString('base64url')
  const desafio = createHash('sha256').update(verificador).digest('base64url')

  // `state` é contra CSRF: quem volta do Spotify tem que provar que foi este
  // navegador que começou o fluxo.
  const estado = randomBytes(16).toString('base64url')

  const opcoes = opcoesDoCookie(event)
  setCookie(event, COOKIE_VERIFICADOR, verificador, opcoes)
  setCookie(event, COOKIE_ESTADO, estado, opcoes)

  const url = new URL('https://accounts.spotify.com/authorize')
  url.search = new URLSearchParams({
    client_id: id,
    response_type: 'code',
    redirect_uri: redirecionamentoSpotify(event),
    scope: ESCOPOS_SPOTIFY,
    state: estado,
    code_challenge_method: 'S256',
    code_challenge: desafio,
  }).toString()

  return sendRedirect(event, url.toString())
})
