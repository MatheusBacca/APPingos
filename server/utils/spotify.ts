import type { H3Event } from 'h3'

const BASE = 'https://api.spotify.com/v1'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'

/**
 * O mercado decide o catálogo e o que está disponível para tocar. Fixo em BR
 * porque o app é de duas pessoas no Brasil — sem isto a busca devolve edições
 * regionais que ninguém consegue abrir daqui.
 */
const MERCADO = 'BR'

/**
 * Faixa e álbum são os dois formatos que viram item de catálogo.
 *
 * Os dois entram como `tipo: 'musica'` em `media_item` — o motor de catálogo
 * não precisa saber a diferença para guardar nota e status. Quem distingue é
 * `metadados.formato`, e é ele que a tela usa para escrever "Faixa" ou "Álbum"
 * embaixo da capa.
 *
 * Artista de propósito não está aqui: "dar 8 para o Radiohead" não é o que o
 * motor faz bem (não há o que marcar como ouvido), e artista já vive como
 * metadado da faixa. Se um dia virar uma entidade própria, o lugar dela é
 * Interesses, não o catálogo.
 */
export type FormatoMusica = 'faixa' | 'album'

/** Formato que o client consome — já traduzido, sem vazar o shape do Spotify. */
export interface ResultadoBuscaMusica {
  tipo: 'musica'
  formato: FormatoMusica
  fonte: 'spotify'
  fonte_id: string
  titulo: string
  /** Todos os creditados, na ordem em que o Spotify devolve. */
  artistas: string[]
  album: string | null
  ano: number | null
  capa_url: string | null
  duracao_ms: number | null
  /** Link para abrir no app do Spotify — a única ação que o APPingos não faz. */
  url_spotify: string | null
}

export interface DetalheMusica extends ResultadoBuscaMusica {
  /** Só em álbum: as faixas, na ordem do disco. */
  faixas: Array<{ fonte_id: string, titulo: string, duracao_ms: number | null }>
  /** Só em álbum, e nem sempre presente — o Spotify não preenche para todo disco. */
  generos: string[]
  total_faixas: number | null
}

interface SpotifyImagem { url: string, width?: number, height?: number }
interface SpotifyArtista { name: string }

interface SpotifyAlbum {
  id: string
  name: string
  images?: SpotifyImagem[]
  release_date?: string
  artists?: SpotifyArtista[]
  total_tracks?: number
  genres?: string[]
  tracks?: { items?: SpotifyFaixa[] }
  external_urls?: { spotify?: string }
}

interface SpotifyFaixa {
  id: string
  name: string
  artists?: SpotifyArtista[]
  album?: SpotifyAlbum
  duration_ms?: number
  external_urls?: { spotify?: string }
}

interface SpotifyBusca {
  tracks?: { items?: Array<SpotifyFaixa | null> }
  albums?: { items?: Array<SpotifyAlbum | null> }
}

interface RespostaToken {
  access_token: string
  expires_in: number
}

/**
 * O mesmo texto nos dois lugares, de propósito.
 *
 * `statusMessage` vai na linha de status do HTTP, que é latin-1: "não" chega
 * como "no" do outro lado. `message` vai no corpo JSON, que é UTF-8 e chega
 * inteiro — é dele que `mensagemDeErro` lê (ver app/lib/utils.ts). Mandar os
 * dois mantém a rota legível tanto para o app quanto para quem estiver olhando
 * o tráfego cru.
 */
export function erroSpotify(statusCode: number, texto: string) {
  return createError({ statusCode, statusMessage: texto, message: texto })
}

// ---- Token de aplicativo ----------------------------------------------------

/**
 * Client Credentials, e não o fluxo de usuário: buscar no catálogo público não
 * depende de ninguém ter conectado a própria conta. É o que faz o módulo de
 * Músicas funcionar no dia 1, para os dois, sem passar por OAuth nenhum.
 *
 * O token dura ~1h e a diferença para o TMDB está aqui: lá a chave é estática e
 * vai direto no header; aqui ela precisa ser trocada por um token antes de cada
 * uso. Pedir um token novo a cada busca seria dobrar a latência de toda tecla
 * digitada, então ele fica em memória até perto de expirar.
 *
 * Em memória do processo, e não no banco: o Nitro na Vercel derruba e recria a
 * função a todo momento, e um token perdido custa uma requisição a mais — nada
 * que justifique uma tabela e a RLS que viria junto. No pior caso, cada
 * instância nova pega o seu.
 */
let tokenEmCache: { valor: string, expiraEm: number } | null = null

/** Margem para o token não expirar no voo entre o nosso servidor e o Spotify. */
const FOLGA_MS = 60_000

export function credenciaisSpotify(event: H3Event): { id: string, secret: string } {
  const { spotifyClientId, spotifyClientSecret } = useRuntimeConfig(event)

  if (!spotifyClientId || !spotifyClientSecret) {
    throw erroSpotify(503, 'NUXT_SPOTIFY_CLIENT_ID / NUXT_SPOTIFY_CLIENT_SECRET não configurados no .env')
  }

  return { id: spotifyClientId, secret: spotifyClientSecret }
}

/**
 * Uma ida ao endpoint de token do Spotify, seja qual for o `grant_type`.
 *
 * Os três fluxos do módulo passam por aqui: `client_credentials` (busca do
 * catálogo), `authorization_code` (a hora em que a pessoa conecta a conta) e
 * `refresh_token` (toda vez depois disso). O que muda entre eles é só o corpo.
 */
export async function pedirTokenSpotify<T>(
  event: H3Event,
  corpo: Record<string, string>,
): Promise<T> {
  const { id, secret } = credenciaisSpotify(event)

  return await $fetch<T>(TOKEN_URL, {
    method: 'POST',
    headers: {
      // Basic com id:secret é o que o Spotify espera; mandar os dois no corpo
      // também funciona, mas deixa o secret no log de qualquer proxy que
      // registre payload.
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(corpo).toString(),
  }) as T
}

/**
 * Uma chamada à API com um token já pronto — o de aplicativo ou o de uma pessoa.
 *
 * Concentra a tradução dos erros do Spotify para erros nossos, para as duas
 * origens de token contarem a mesma história quando algo falha. `market` fica
 * de fora: ele vale para o catálogo público, e as rotas de conta (playlists,
 * player) trazem o mercado da própria conta.
 */
export async function chamarSpotify<T>(
  caminho: string,
  acesso: string,
  params: Record<string, string> = {},
  aoReceber401?: () => void,
): Promise<T> {
  try {
    return await $fetch<T>(caminho.startsWith('http') ? caminho : `${BASE}${caminho}`, {
      query: params,
      headers: {
        Authorization: `Bearer ${acesso}`,
        accept: 'application/json',
      },
    }) as T
  }
  catch (e: unknown) {
    const status = (e as { status?: number }).status ?? 502

    if (status === 401) aoReceber401?.()

    if (status === 429) {
      throw erroSpotify(429, 'O Spotify pediu uma pausa — tente de novo em alguns segundos.')
    }

    throw erroSpotify(status === 401 ? 502 : status, 'Falha ao consultar o Spotify')
  }
}

/** Exportado só para o teste conseguir partir de um estado limpo. */
export function limparTokenEmCache(): void {
  tokenEmCache = null
}

async function token(event: H3Event): Promise<string> {
  if (tokenEmCache && tokenEmCache.expiraEm > Date.now() + FOLGA_MS) {
    return tokenEmCache.valor
  }

  // Fora do try: `pedirTokenSpotify` começa conferindo o .env, e esse 503 seria
  // pego pelo catch abaixo e viraria "credencial rejeitada" — mandando procurar
  // no dashboard do Spotify um problema que está no .env.
  credenciaisSpotify(event)

  try {
    const resposta = await pedirTokenSpotify<RespostaToken>(event, { grant_type: 'client_credentials' })

    tokenEmCache = {
      valor: resposta.access_token,
      expiraEm: Date.now() + resposta.expires_in * 1000,
    }
    return resposta.access_token
  }
  catch {
    // Sem repassar o status do Spotify: aqui um 400/401 quer dizer sempre a
    // mesma coisa (credencial errada), e "400" na tela não ajudaria ninguém.
    throw erroSpotify(502, 'Credenciais do Spotify rejeitadas — confira NUXT_SPOTIFY_CLIENT_ID e NUXT_SPOTIFY_CLIENT_SECRET')
  }
}

async function spotify<T>(event: H3Event, caminho: string, params: Record<string, string> = {}): Promise<T> {
  // Fora do try pelo mesmo motivo do tmdb.ts: o 503 de "não configurado" e o
  // 502 de "credencial rejeitada" viram mensagens úteis só se não forem
  // reembrulhados no catch genérico abaixo.
  const acesso = await token(event)

  // 401 aqui é token vencido antes da folga (relógio fora de sincronia, ou o
  // Spotify revogou). Descartar o cache faz a próxima tentativa pedir um novo
  // em vez de repetir o token morto até alguém reiniciar o servidor.
  return chamarSpotify<T>(caminho, acesso, { market: MERCADO, ...params }, limparTokenEmCache)
}

// ---- Normalização -----------------------------------------------------------

function anoDe(lancamento: string | undefined): number | null {
  // `release_date` vem como YYYY, YYYY-MM ou YYYY-MM-DD conforme a precisão que
  // a gravadora informou — os quatro primeiros dígitos servem nos três casos.
  const ano = lancamento ? Number.parseInt(lancamento.slice(0, 4), 10) : Number.NaN
  return Number.isFinite(ano) ? ano : null
}

/**
 * A maior capa abaixo de 640px, ou a menor disponível.
 *
 * O Spotify devolve as imagens em ordem decrescente, mas isso não está no
 * contrato da API — depender da ordem é o tipo de coisa que quebra em silêncio,
 * com a capa gigante de 640px num grid de miniaturas.
 */
function capaDe(imagens: SpotifyImagem[] | undefined): string | null {
  if (!imagens?.length) return null

  const ordenadas = [...imagens].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
  const cabe = ordenadas.find(img => (img.width ?? 0) <= 640)
  return (cabe ?? ordenadas[ordenadas.length - 1])?.url ?? null
}

function nomesDe(artistas: SpotifyArtista[] | undefined): string[] {
  return (artistas ?? []).map(a => a.name).filter(Boolean)
}

export function normalizarFaixa(faixa: SpotifyFaixa): ResultadoBuscaMusica {
  return {
    tipo: 'musica',
    formato: 'faixa',
    fonte: 'spotify',
    fonte_id: faixa.id,
    titulo: faixa.name || 'Sem título',
    artistas: nomesDe(faixa.artists),
    album: faixa.album?.name ?? null,
    ano: anoDe(faixa.album?.release_date),
    capa_url: capaDe(faixa.album?.images),
    duracao_ms: faixa.duration_ms ?? null,
    url_spotify: faixa.external_urls?.spotify ?? null,
  }
}

export function normalizarAlbum(album: SpotifyAlbum): ResultadoBuscaMusica {
  return {
    tipo: 'musica',
    formato: 'album',
    fonte: 'spotify',
    fonte_id: album.id,
    titulo: album.name || 'Sem título',
    artistas: nomesDe(album.artists),
    // O álbum é o próprio álbum — repetir o nome aqui faria a tela escrever
    // "Kid A · Kid A" na legenda.
    album: null,
    ano: anoDe(album.release_date),
    capa_url: capaDe(album.images),
    // Duração de álbum exigiria somar as faixas, que a busca não traz.
    duracao_ms: null,
    url_spotify: album.external_urls?.spotify ?? null,
  }
}

/** Rótulo de artistas pronto para a tela — "Fulano, Sicrano". */
export function creditos(artistas: string[]): string {
  return artistas.join(', ')
}

// ---- Consultas --------------------------------------------------------------

/**
 * Uma faixa, um álbum, uma faixa…
 *
 * Intercalar em vez de concatenar porque o Spotify devolve as duas listas
 * separadas e cada uma por relevância própria: emendar uma na outra empurraria
 * todo álbum para depois de vinte faixas, e quem busca "Kid A" quer o disco.
 * A lista mais longa continua sozinha depois que a outra acaba.
 */
export function intercalar(
  faixas: ResultadoBuscaMusica[],
  albuns: ResultadoBuscaMusica[],
): ResultadoBuscaMusica[] {
  const juntos: ResultadoBuscaMusica[] = []
  for (let i = 0; i < Math.max(faixas.length, albuns.length); i++) {
    const faixa = faixas[i]
    const album = albuns[i]
    if (faixa) juntos.push(faixa)
    if (album) juntos.push(album)
  }
  return juntos
}

/*
 * `buscarMusicas`/`detalharMusica`, e não `buscar`/`detalhar` como no tmdb.ts:
 * o Nitro auto-importa tudo que está em `server/utils/`, e dois arquivos
 * exportando `buscar` fazem um deles ser silenciosamente ignorado. As rotas
 * daqui importam à mão e não cairiam nessa, mas a próxima que esquecer o import
 * chamaria o TMDB achando que está falando com o Spotify.
 */

/** Busca faixas e álbuns no mesmo termo. */
export async function buscarMusicas(event: H3Event, termo: string): Promise<ResultadoBuscaMusica[]> {
  const data = await spotify<SpotifyBusca>(event, '/search', {
    q: termo,
    type: 'track,album',
    limit: '10',
  })

  return intercalar(
    (data.tracks?.items ?? []).filter((f): f is SpotifyFaixa => !!f?.id).map(normalizarFaixa),
    (data.albums?.items ?? []).filter((a): a is SpotifyAlbum => !!a?.id).map(normalizarAlbum),
  )
}

export async function detalharMusica(
  event: H3Event,
  formato: FormatoMusica,
  id: string,
): Promise<DetalheMusica> {
  if (formato === 'faixa') {
    const faixa = await spotify<SpotifyFaixa>(event, `/tracks/${id}`)
    return {
      ...normalizarFaixa(faixa),
      faixas: [],
      generos: [],
      total_faixas: null,
    }
  }

  const album = await spotify<SpotifyAlbum>(event, `/albums/${id}`)
  return {
    ...normalizarAlbum(album),
    faixas: (album.tracks?.items ?? [])
      .filter((f): f is SpotifyFaixa => !!f?.id)
      .map(f => ({
        fonte_id: f.id,
        titulo: f.name || 'Sem título',
        duracao_ms: f.duration_ms ?? null,
      })),
    generos: album.genres ?? [],
    total_faixas: album.total_tracks ?? null,
  }
}
