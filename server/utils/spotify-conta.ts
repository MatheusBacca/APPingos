/**
 * A conta do Spotify de cada pessoa — o que a busca do catálogo não precisa.
 *
 * A fase 1 fala com o Spotify como APLICATIVO (client credentials) e por isso
 * funciona sem ninguém conectar nada. Playlists e player são dados de uma
 * conta, então exigem o outro fluxo: a pessoa autoriza, o Spotify devolve um
 * refresh token, e é ele que o servidor troca por um access token cada vez que
 * precisa perguntar algo em nome dela.
 *
 * Nada aqui pode vazar para o navegador: o refresh token não expira sozinho, e
 * quem o tem (junto do client secret) fala com o Spotify como se fosse a pessoa
 * até ela revogar à mão.
 */
import type { Buffer } from 'node:buffer'
import type { H3Event } from 'h3'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'
import { chaveDeCifra, cifrar, decifrar } from '~~/server/utils/cifra'
import { credenciaisSpotify, erroSpotify, pedirTokenSpotify } from '~~/server/utils/spotify'

/**
 * Só leitura de playlist, e nada além disso.
 *
 * `playlist-read-private` cobre as playlists da pessoa que não são públicas;
 * `playlist-read-collaborative` cobre as colaborativas, que não vêm na
 * primeira nem sendo dela. Não pedimos `playlist-modify-*`: a v1 mostra o que
 * já existe no Spotify e não escreve nada lá (ver o plano). Pedir escopo de
 * escrita "para depois" seria pedir à pessoa uma permissão que o app não usa.
 */
export const ESCOPOS_SPOTIFY = 'playlist-read-private playlist-read-collaborative'

interface RespostaToken {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope?: string
}

// ---- Quem está pedindo ------------------------------------------------------

/**
 * O id de quem fez a requisição, ou 401.
 *
 * PEGADINHA: neste @nuxtjs/supabase, `serverSupabaseUser` devolve os CLAIMS do
 * JWT, não um objeto `User` — o id vem em `sub`, e `user.id` é `undefined`. O
 * tipo declarado diz `User`, então o TypeScript não avisa: um `user.id` aqui
 * compila e grava `null` no banco em silêncio. O `?? id` cobre a hipótese de
 * uma versão futura passar a devolver o objeto de verdade.
 */
export async function usuarioDaRequisicao(event: H3Event): Promise<string> {
  const claims = await serverSupabaseUser(event) as unknown as
    { sub?: string, id?: string } | null

  const id = claims?.sub ?? claims?.id
  if (!id) throw erroSpotify(401, 'Faça login para conectar o Spotify.')

  return id
}

/**
 * Para onde o Spotify devolve a pessoa depois de autorizar.
 *
 * Derivado da requisição, e não de uma variável de ambiente, porque este valor
 * precisa bater EXATAMENTE com o que está cadastrado no dashboard do Spotify —
 * e lá já é preciso cadastrar as duas (localhost e produção) de qualquer jeito.
 * Uma variável a mais só criaria a chance de o .env dizer uma coisa e o
 * navegador estar em outra.
 */
export function redirecionamentoSpotify(event: H3Event): string {
  return `${getRequestURL(event).origin}/api/spotify/auth/callback`
}

/**
 * O Spotify não aceita `localhost` — em loopback, só o IP explícito.
 *
 * A regra dele é: redirect URI tem que ser https, e a exceção é o endereço de
 * loopback escrito como número (`127.0.0.1` ou `[::1]`). O nome `localhost` é
 * recusado mesmo apontando para o mesmo lugar.
 *
 * Isso importa porque o `redirect_uri` é montado a partir da origem da
 * requisição: abrir o app em `http://localhost:3000` manda um endereço que o
 * Spotify recusa, e o erro aparece só depois do salto, numa página dele que diz
 * "redirect_uri: Not matching configuration" e não tem caminho de volta.
 * Barrar antes troca essa tela por uma frase que diz o que fazer.
 */
export function ehLoopbackPorNome(event: H3Event): boolean {
  return getRequestURL(event).hostname === 'localhost'
}

// ---- A chave que cifra o refresh token --------------------------------------

function chaveDoServidor(event: H3Event): Buffer {
  const { spotifyTokenSecret } = useRuntimeConfig(event)

  if (!spotifyTokenSecret) {
    throw erroSpotify(503, 'NUXT_SPOTIFY_TOKEN_SECRET não configurado no .env')
  }

  return chaveDeCifra(spotifyTokenSecret)
}

// ---- A conexão --------------------------------------------------------------

/** Guarda (ou substitui) a conexão da pessoa que fez a requisição. */
export async function guardarConexao(
  event: H3Event,
  dados: { refresh: string, escopos: string, spotifyUserId: string | null },
): Promise<void> {
  const userId = await usuarioDaRequisicao(event)
  const supabase = await serverSupabaseClient<Database>(event)

  const { error } = await supabase
    .from('integracao_spotify')
    .upsert({
      user_id: userId,
      refresh_cifrado: cifrar(chaveDoServidor(event), dados.refresh),
      escopos: dados.escopos,
      spotify_user_id: dados.spotifyUserId,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (error) throw erroSpotify(500, `Não deu para guardar a conexão: ${error.message}`)
}

/**
 * Um access token válido para a pessoa da requisição.
 *
 * Sem cache: o access token vale ~1h, mas na Vercel cada instância vive pouco e
 * guardar por usuário em memória renderia acerto raro em troca de um mapa que
 * cresce sozinho. Uma sincronização de playlists faz um refresh e pronto.
 */
export async function acessoDoUsuario(event: H3Event): Promise<string> {
  const supabase = await serverSupabaseClient<Database>(event)

  // A RLS já limita à própria linha — o `select` sem filtro devolve só a sua.
  const { data, error } = await supabase
    .from('integracao_spotify')
    .select('refresh_cifrado')
    .maybeSingle()

  if (error) throw erroSpotify(500, `Não deu para ler a conexão: ${error.message}`)
  if (!data) throw erroSpotify(409, 'Conecte a sua conta do Spotify primeiro.')

  const chave = chaveDoServidor(event)

  let refresh: string
  try {
    refresh = decifrar(chave, data.refresh_cifrado)
  }
  catch {
    // Acontece se NUXT_SPOTIFY_TOKEN_SECRET mudou depois de alguém conectar: o
    // que está guardado deixa de abrir. Reconectar reescreve a linha com a
    // chave nova, e é a única saída — por isso a mensagem manda fazer isso em
    // vez de falar em criptografia.
    throw erroSpotify(409, 'A conexão com o Spotify expirou — conecte de novo.')
  }

  // Fora do try pelo mesmo motivo de sempre: o 503 de segredo ausente não pode
  // virar "autorização revogada".
  credenciaisSpotify(event)

  let resposta: RespostaToken
  try {
    resposta = await pedirTokenSpotify<RespostaToken>(event, {
      grant_type: 'refresh_token',
      refresh_token: refresh,
    })
  }
  catch {
    throw erroSpotify(409, 'O Spotify recusou a conexão — conecte a sua conta de novo.')
  }

  /*
   * O Spotify PODE devolver um refresh token novo e aposentar o antigo. Não é
   * garantido que venha, e é justamente por isso que precisa ser tratado: no
   * dia em que vier e for ignorado, a conexão continua funcionando até o token
   * velho ser revogado, e aí quebra sem nada ter mudado no código.
   */
  if (resposta.refresh_token && resposta.refresh_token !== refresh) {
    const { error: erroUpdate } = await supabase
      .from('integracao_spotify')
      .update({
        refresh_cifrado: cifrar(chave, resposta.refresh_token),
        atualizado_em: new Date().toISOString(),
      })
      .eq('user_id', await usuarioDaRequisicao(event))

    // Falhar aqui não invalida o access token que já temos em mãos: a
    // sincronização segue, e o refresh velho tenta de novo na próxima.
    if (erroUpdate) console.warn('[spotify] não deu para guardar o refresh token novo:', erroUpdate.message)
  }

  return resposta.access_token
}
