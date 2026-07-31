import type { H3Event } from 'h3'

const BASE = 'https://api.themoviedb.org/3'
const IMG = 'https://image.tmdb.org/t/p'

export type TipoMidia = 'filme' | 'serie'

/** Formato que o client consome — já traduzido, sem vazar o shape do TMDB. */
export interface ResultadoBusca {
  tipo: TipoMidia
  fonte: 'tmdb'
  fonte_id: string
  titulo: string
  titulo_original: string | null
  ano: number | null
  capa_url: string | null
  sinopse: string | null
  nota_tmdb: number | null
}

export interface DetalheMidia extends ResultadoBusca {
  generos: string[]
  duracao_min: number | null
  temporadas: number | null
  episodios: number | null
}

interface TmdbItem {
  id: number
  media_type?: string
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  release_date?: string
  first_air_date?: string
  poster_path?: string | null
  overview?: string
  vote_average?: number
  genres?: Array<{ name: string }>
  runtime?: number
  episode_run_time?: number[]
  number_of_seasons?: number
  number_of_episodes?: number
}

function chave(event: H3Event): string {
  const { tmdbApiKey } = useRuntimeConfig(event)
  if (!tmdbApiKey) {
    throw createError({
      statusCode: 503,
      statusMessage: 'NUXT_TMDB_API_KEY não configurada no .env',
    })
  }
  return tmdbApiKey
}

async function tmdb<T>(event: H3Event, caminho: string, params: Record<string, string> = {}): Promise<T> {
  try {
    // Autenticação por Bearer com o Read Access Token (v4), e não `?api_key=`
    // (v3): é o método que o TMDB recomenda hoje e mantém o segredo fora da URL,
    // logo fora de logs e de qualquer histórico de proxy.
    // O cast existe porque o $fetch do Nitro embrulha o retorno em
    // TypedInternalResponse, que não colapsa para T num genérico.
    return await $fetch<T>(`${BASE}${caminho}`, {
      query: { language: 'pt-BR', ...params },
      headers: {
        Authorization: `Bearer ${chave(event)}`,
        accept: 'application/json',
      },
    }) as T
  }
  catch (e: unknown) {
    const status = (e as { status?: number }).status ?? 502
    throw createError({
      statusCode: status === 401 ? 502 : status,
      statusMessage: status === 401
        ? 'Token do TMDB rejeitado — confira NUXT_TMDB_API_KEY'
        : 'Falha ao consultar o TMDB',
    })
  }
}

function anoDe(item: TmdbItem): number | null {
  const data = item.release_date || item.first_air_date
  const ano = data ? Number.parseInt(data.slice(0, 4), 10) : Number.NaN
  return Number.isFinite(ano) ? ano : null
}

export function normalizar(item: TmdbItem, tipo: TipoMidia): ResultadoBusca {
  return {
    tipo,
    fonte: 'tmdb',
    fonte_id: String(item.id),
    titulo: item.title || item.name || 'Sem título',
    titulo_original: item.original_title || item.original_name || null,
    ano: anoDe(item),
    // w342 é o menor tamanho que ainda fica nítido num grid de pôsteres retina.
    capa_url: item.poster_path ? `${IMG}/w342${item.poster_path}` : null,
    sinopse: item.overview?.trim() || null,
    nota_tmdb: typeof item.vote_average === 'number' ? Number(item.vote_average.toFixed(1)) : null,
  }
}

export async function buscar(event: H3Event, termo: string): Promise<ResultadoBusca[]> {
  const data = await tmdb<{ results: TmdbItem[] }>(event, '/search/multi', {
    query: termo,
    include_adult: 'false',
  })

  return (data.results ?? [])
    .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
    .map(item => normalizar(item, item.media_type === 'tv' ? 'serie' : 'filme'))
}

export async function detalhar(event: H3Event, tipo: TipoMidia, id: string): Promise<DetalheMidia> {
  const item = await tmdb<TmdbItem>(event, `/${tipo === 'serie' ? 'tv' : 'movie'}/${id}`)

  return {
    ...normalizar(item, tipo),
    generos: (item.genres ?? []).map(g => g.name),
    duracao_min: item.runtime ?? item.episode_run_time?.[0] ?? null,
    temporadas: item.number_of_seasons ?? null,
    episodios: item.number_of_episodes ?? null,
  }
}
