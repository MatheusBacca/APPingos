/**
 * O snapshot das playlists: buscar no Spotify e gravar no nosso banco.
 *
 * Em duas etapas de propósito, e não numa só (ver `faixas_sincronizadas_em` na
 * migration): a LISTA de playlists é barata e vem inteira; as FAIXAS de cada
 * uma custam uma chamada por página de 100 e só interessam quando alguém abre
 * aquela playlist.
 */
import type { H3Event } from 'h3'
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'
import { chamarSpotify, erroSpotify } from '~~/server/utils/spotify'
import { acessoDoUsuario, usuarioDaRequisicao } from '~~/server/utils/spotify-conta'

/**
 * Teto de páginas por consulta paginada.
 *
 * O Spotify pagina de 50 (playlists) e de 100 (faixas). Sem um teto, uma conta
 * com um número absurdo de itens faria a rota rodar até o timeout da Vercel —
 * e um `while (proximo)` que depende de dado externo para terminar é o tipo de
 * laço que só se descobre em produção. 20 páginas cobrem 1000 playlists ou
 * 2000 faixas, muito além do caso real.
 */
const MAX_PAGINAS = 20

interface Imagem { url: string, width?: number }

interface PlaylistBruta {
  id: string
  name?: string
  description?: string | null
  images?: Imagem[] | null
  tracks?: { total?: number } | null
  public?: boolean | null
  collaborative?: boolean
  external_urls?: { spotify?: string }
}

interface FaixaBruta {
  track?: {
    id?: string | null
    name?: string
    artists?: Array<{ name?: string }>
    album?: { name?: string }
    duration_ms?: number
    external_urls?: { spotify?: string }
  } | null
}

interface Pagina<T> {
  items?: Array<T | null>
  next?: string | null
}

/** A menor capa acima de 160px, ou a maior que houver — miniatura de lista. */
function capaDe(imagens: Imagem[] | null | undefined): string | null {
  if (!imagens?.length) return null

  const ordenadas = [...imagens].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
  const cabe = ordenadas.find(img => (img.width ?? 0) >= 160)
  return (cabe ?? ordenadas[ordenadas.length - 1])?.url ?? null
}

/** Percorre uma coleção paginada do Spotify até o fim (ou até o teto). */
async function todasAsPaginas<T>(
  caminho: string,
  acesso: string,
  porPagina: number,
): Promise<T[]> {
  const itens: T[] = []
  let proximo: string | null = `${caminho}${caminho.includes('?') ? '&' : '?'}limit=${porPagina}`

  for (let pagina = 0; pagina < MAX_PAGINAS && proximo; pagina++) {
    const dados: Pagina<T> = await chamarSpotify<Pagina<T>>(proximo, acesso)
    itens.push(...(dados.items ?? []).filter((i): i is T => i !== null))
    // `next` já vem como URL absoluta e com o offset certo — remontar o offset
    // à mão seria repetir uma conta que a API já fez.
    proximo = dados.next ?? null
  }

  return itens
}

// ---- A lista de playlists ---------------------------------------------------

export async function sincronizarPlaylists(event: H3Event): Promise<number> {
  const userId = await usuarioDaRequisicao(event)
  const acesso = await acessoDoUsuario(event)
  const supabase = await serverSupabaseClient<Database>(event)

  const brutas = await todasAsPaginas<PlaylistBruta>('/me/playlists', acesso, 50)
  const validas = brutas.filter(p => !!p?.id)

  const agora = new Date().toISOString()

  if (validas.length) {
    const { error } = await supabase
      .from('playlist_spotify')
      .upsert(
        validas.map(p => ({
          user_id: userId,
          spotify_id: p.id,
          nome: p.name?.trim() || 'Sem nome',
          descricao: p.description?.trim() || null,
          capa_url: capaDe(p.images),
          total_faixas: p.tracks?.total ?? 0,
          publica: p.public ?? false,
          colaborativa: p.collaborative ?? false,
          url_spotify: p.external_urls?.spotify ?? null,
          sincronizado_em: agora,
        })),
        { onConflict: 'user_id,spotify_id' },
      )

    if (error) throw erroSpotify(500, `Não deu para guardar as playlists: ${error.message}`)
  }

  /*
   * O que sumiu do Spotify sai daqui também.
   *
   * Sem isto, uma playlist apagada lá continuaria na tela para sempre — o
   * upsert só sabe do que veio. O filtro por `user_id` é redundante com a RLS
   * e está aqui de propósito: um `delete` que depende só da policy para não
   * apagar demais é um `delete` a uma migration de distância de apagar tudo.
   */
  const idsVivos = validas.map(p => p.id)
  const remocao = supabase.from('playlist_spotify').delete().eq('user_id', userId)
  const { error: erroRemocao } = idsVivos.length
    ? await remocao.not('spotify_id', 'in', `(${idsVivos.map(id => `"${id}"`).join(',')})`)
    : await remocao

  if (erroRemocao) throw erroSpotify(500, `Não deu para limpar as playlists: ${erroRemocao.message}`)

  return validas.length
}

// ---- As faixas de uma playlist ----------------------------------------------

export async function sincronizarFaixas(event: H3Event, playlistId: string): Promise<number> {
  const userId = await usuarioDaRequisicao(event)
  const supabase = await serverSupabaseClient<Database>(event)

  // A RLS permitiria LER a playlist do par; escrever faixas nela, não. Conferir
  // o dono aqui transforma um erro de policy no meio do processo numa recusa
  // clara antes de gastar chamada à API do Spotify.
  const { data: playlist, error: erroBusca } = await supabase
    .from('playlist_spotify')
    .select('id, spotify_id, user_id')
    .eq('id', playlistId)
    .maybeSingle()

  if (erroBusca) throw erroSpotify(500, `Não deu para achar a playlist: ${erroBusca.message}`)
  if (!playlist) throw erroSpotify(404, 'Playlist não encontrada.')
  if (playlist.user_id !== userId) {
    throw erroSpotify(403, 'Só quem é dono da playlist pode atualizá-la.')
  }

  const acesso = await acessoDoUsuario(event)
  const brutas = await todasAsPaginas<FaixaBruta>(
    `/playlists/${playlist.spotify_id}/tracks`,
    acesso,
    100,
  )

  /*
   * `posicao` é o índice na lista original, contado ANTES de descartar as
   * faixas mortas — é o número que a pessoa vê no app do Spotify. Faixa
   * removida do catálogo vira `track: null`, e episódio de podcast vem sem
   * `id`; os dois saem, e a numeração continua a mesma.
   */
  const faixas = brutas
    .map((item, indice) => ({ item, indice }))
    .filter(({ item }) => !!item.track?.id)
    .map(({ item, indice }) => ({
      playlist_id: playlist.id,
      posicao: indice,
      spotify_track_id: item.track!.id!,
      titulo: item.track!.name?.trim() || 'Sem título',
      artistas: (item.track!.artists ?? []).map(a => a.name).filter(Boolean).join(', '),
      album: item.track!.album?.name ?? null,
      duracao_ms: item.track!.duration_ms ?? null,
      url_spotify: item.track!.external_urls?.spotify ?? null,
    }))

  /*
   * Apaga e reinsere, em vez de upsert.
   *
   * A chave é (playlist_id, posicao): reordenar a playlist no Spotify muda o
   * que cada posição significa, e um upsert deixaria para trás as posições do
   * fim que sumiram. Trocar a lista inteira é a operação que de fato
   * aconteceu.
   */
  const { error: erroLimpeza } = await supabase
    .from('playlist_faixa')
    .delete()
    .eq('playlist_id', playlist.id)

  if (erroLimpeza) throw erroSpotify(500, `Não deu para limpar as faixas: ${erroLimpeza.message}`)

  if (faixas.length) {
    const { error } = await supabase.from('playlist_faixa').insert(faixas)
    if (error) throw erroSpotify(500, `Não deu para guardar as faixas: ${error.message}`)
  }

  const { error: erroCarimbo } = await supabase
    .from('playlist_spotify')
    .update({ faixas_sincronizadas_em: new Date().toISOString() })
    .eq('id', playlist.id)

  if (erroCarimbo) throw erroSpotify(500, `Não deu para carimbar a playlist: ${erroCarimbo.message}`)

  return faixas.length
}
