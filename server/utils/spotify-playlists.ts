/**
 * As playlists: buscar no Spotify, e gravar só o que for escolhido.
 *
 * O desenho mudou depois da primeira sincronização real: uma conta comum tem
 * mais de cem playlists, quase todas seguidas e não criadas pela pessoa.
 * Despejar tudo no espaço enche a tela do par com playlist que ninguém pediu.
 * Então são dois passos separados — LISTAR não escreve nada no banco, e SALVAR
 * grava só os ids que vieram marcados.
 *
 * As faixas são um terceiro passo, por playlist, quando alguém abre.
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
 * e um laço que depende de dado externo para terminar é o tipo de coisa que só
 * se descobre em produção. 20 páginas cobrem 1000 playlists ou 2000 faixas.
 */
const MAX_PAGINAS = 20

interface Imagem { url: string, width?: number }

/*
 * ATENÇÃO ao par `items`/`tracks`, que custou uma investigação inteira.
 *
 * A API do Spotify renomeou o conteúdo de uma playlist de `tracks` para
 * `items`, e o endpoint de `/playlists/{id}/tracks` para `/playlists/{id}/items`.
 * O nome velho não foi só depreciado: `/tracks` responde **403 Forbidden** com
 * o corpo dizendo apenas "Forbidden", que é o erro mais enganoso possível —
 * parece falta de escopo ou playlist restrita, e não é nenhum dos dois.
 *
 * Os dois sintomas que apareceram juntos, e que agora se explicam:
 *   - toda playlist mostrava "0 faixa(s)", porque `tracks.total` não existe
 *     mais (o número está em `items.total`);
 *   - abrir qualquer playlist falhava, mesmo as criadas pelo próprio dono.
 *
 * Os campos antigos ficam como alternativa porque a API pode servir as duas
 * formas durante a transição — e porque custa um `??`.
 */
interface Contagem { total?: number }

interface PlaylistBruta {
  id: string
  name?: string
  description?: string | null
  images?: Imagem[] | null
  items?: Contagem | null
  tracks?: Contagem | null
  public?: boolean | null
  collaborative?: boolean
  owner?: { display_name?: string | null, id?: string } | null
  external_urls?: { spotify?: string }
}

interface FaixaDetalhe {
  id?: string | null
  name?: string
  artists?: Array<{ name?: string }>
  album?: { name?: string }
  duration_ms?: number
  external_urls?: { spotify?: string }
}

interface FaixaBruta {
  /** O nome novo. */
  item?: FaixaDetalhe | null
  /** O nome antigo, mantido como alternativa. */
  track?: FaixaDetalhe | null
}

interface Pagina<T> {
  items?: Array<T | null>
  next?: string | null
}

/** O que a tela de escolha recebe — nada disso está no banco ainda. */
export interface PlaylistDoSpotify {
  spotify_id: string
  nome: string
  descricao: string | null
  capa_url: string | null
  total_faixas: number
  publica: boolean
  colaborativa: boolean
  url_spotify: string | null
  /** Quem criou. Com 100+ playlists, separa "minhas" das que só sigo. */
  dono: string | null
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

/**
 * Traduz e deduplica o que veio do Spotify.
 *
 * A deduplicação não é zelo preventivo: `/me/playlists` pagina por offset, e
 * uma playlist criada ou apagada entre uma página e outra reaparece. Um lote de
 * upsert com a mesma chave duas vezes faz o Postgres recusar o lote INTEIRO
 * ("ON CONFLICT DO UPDATE command cannot affect row a second time") — foi
 * exatamente o que derrubou a primeira sincronização real.
 *
 * Fica a PRIMEIRA ocorrência: as páginas vêm na ordem do Spotify, e a repetida
 * é a que foi empurrada pelo deslocamento.
 *
 * Pura e exportada para ser testável — ver test/spotify-playlists.test.ts.
 */
export function normalizarPlaylists(brutas: PlaylistBruta[]): PlaylistDoSpotify[] {
  const porId = new Map<string, PlaylistDoSpotify>()

  for (const p of brutas) {
    if (!p?.id || porId.has(p.id)) continue

    porId.set(p.id, {
      spotify_id: p.id,
      nome: p.name?.trim() || 'Sem nome',
      descricao: p.description?.trim() || null,
      capa_url: capaDe(p.images),
      total_faixas: p.items?.total ?? p.tracks?.total ?? 0,
      publica: p.public ?? false,
      colaborativa: p.collaborative ?? false,
      url_spotify: p.external_urls?.spotify ?? null,
      dono: p.owner?.display_name?.trim() || null,
    })
  }

  return [...porId.values()]
}

/** As linhas do banco, a partir do que já foi normalizado. */
export function linhasDePlaylist(
  playlists: PlaylistDoSpotify[],
  userId: string,
  agora: string,
) {
  return playlists.map(p => ({
    user_id: userId,
    spotify_id: p.spotify_id,
    nome: p.nome,
    descricao: p.descricao,
    capa_url: p.capa_url,
    total_faixas: p.total_faixas,
    publica: p.publica,
    colaborativa: p.colaborativa,
    url_spotify: p.url_spotify,
    sincronizado_em: agora,
  }))
}

// ---- Passo 1: listar, sem gravar --------------------------------------------

export async function listarPlaylistsDoSpotify(event: H3Event): Promise<PlaylistDoSpotify[]> {
  const acesso = await acessoDoUsuario(event)
  const brutas = await todasAsPaginas<PlaylistBruta>('/me/playlists', acesso, 50)
  return normalizarPlaylists(brutas)
}

// ---- Passo 2: salvar só o que foi escolhido ---------------------------------

/**
 * Deixa no espaço exatamente as playlists escolhidas.
 *
 * Rebusca a lista no Spotify em vez de confiar nos objetos que o navegador
 * mandaria: o corpo de uma requisição é entrada do usuário, e aqui ela viraria
 * nome, capa e URL exibidos para a outra pessoa do espaço. O id é o único dado
 * que o client precisa mandar, e ele é conferido contra o que a API devolve.
 *
 * SUBSTITUI em vez de acrescentar, e isso é o que a tela promete: o diálogo
 * lista a conta inteira e já traz marcadas as que estão no espaço. Se salvar só
 * acrescentasse, desmarcar não faria nada — a pessoa tiraria o visto, clicaria
 * em salvar, e a playlist continuaria lá, sem aviso nenhum.
 *
 * Devolve quantas ficaram.
 */
export async function salvarPlaylists(event: H3Event, ids: string[]): Promise<number> {
  const userId = await usuarioDaRequisicao(event)
  const supabase = await serverSupabaseClient<Database>(event)

  const escolhidos = new Set(ids)
  const todas = await listarPlaylistsDoSpotify(event)
  const linhas = linhasDePlaylist(
    todas.filter(p => escolhidos.has(p.spotify_id)),
    userId,
    new Date().toISOString(),
  )

  if (linhas.length) {
    const { error } = await supabase
      .from('playlist_spotify')
      .upsert(linhas, { onConflict: 'user_id,spotify_id' })

    if (error) throw erroSpotify(500, `Não deu para guardar as playlists: ${error.message}`)
  }

  /*
   * Sai o que não foi marcado.
   *
   * O `delete` é sobre as SUAS linhas (a RLS já garantiria, e o `eq` está aqui
   * porque um delete que depende só da policy é um delete a uma migration de
   * distância de apagar demais). Quem some daqui é quem não está na seleção —
   * inclusive o que já não existe mais na conta do Spotify, que não apareceu na
   * lista e portanto não pôde ser marcado.
   */
  const ficam = linhas.map(l => l.spotify_id)
  const remocao = supabase.from('playlist_spotify').delete().eq('user_id', userId)
  const { error: erroRemocao } = ficam.length
    ? await remocao.not('spotify_id', 'in', `(${ficam.map(id => `"${id}"`).join(',')})`)
    : await remocao

  if (erroRemocao) throw erroSpotify(500, `Não deu para tirar as desmarcadas: ${erroRemocao.message}`)

  return linhas.length
}

// ---- Recarregar o que já está salvo -----------------------------------------

/**
 * Atualiza nome, capa e contagem das playlists que já estão no espaço.
 *
 * A contagem de faixas é o dado que mais envelhece: a pessoa acrescenta música
 * na playlist pelo Spotify e o card daqui continua dizendo o número de quando
 * foi salva. Uma ida à API resolve todas de uma vez, porque `/me/playlists`
 * devolve `tracks.total` de cada uma.
 *
 * O que sumiu do Spotify sai do espaço aqui — e só aqui. Diferente de "não foi
 * escolhido", "não existe mais" não é uma preferência a preservar.
 */
export async function atualizarPlaylistsSalvas(event: H3Event): Promise<number> {
  const userId = await usuarioDaRequisicao(event)
  const supabase = await serverSupabaseClient<Database>(event)

  const { data: salvas, error: erroLeitura } = await supabase
    .from('playlist_spotify')
    .select('spotify_id')
    .eq('user_id', userId)

  if (erroLeitura) throw erroSpotify(500, `Não deu para ler as playlists: ${erroLeitura.message}`)
  if (!salvas?.length) return 0

  const salvasIds = new Set(salvas.map(s => s.spotify_id))
  const todas = await listarPlaylistsDoSpotify(event)
  const aindaExistem = todas.filter(p => salvasIds.has(p.spotify_id))

  if (aindaExistem.length) {
    const { error } = await supabase
      .from('playlist_spotify')
      .upsert(
        linhasDePlaylist(aindaExistem, userId, new Date().toISOString()),
        { onConflict: 'user_id,spotify_id' },
      )

    if (error) throw erroSpotify(500, `Não deu para atualizar as playlists: ${error.message}`)
  }

  const vivos = aindaExistem.map(p => p.spotify_id)
  const remocao = supabase.from('playlist_spotify').delete().eq('user_id', userId)
  const { error: erroRemocao } = vivos.length
    ? await remocao.not('spotify_id', 'in', `(${vivos.map(id => `"${id}"`).join(',')})`)
    : await remocao

  if (erroRemocao) throw erroSpotify(500, `Não deu para limpar as playlists: ${erroRemocao.message}`)

  return aindaExistem.length
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
    .select('id, spotify_id, user_id, nome')
    .eq('id', playlistId)
    .maybeSingle()

  if (erroBusca) throw erroSpotify(500, `Não deu para achar a playlist: ${erroBusca.message}`)
  if (!playlist) throw erroSpotify(404, 'Playlist não encontrada.')
  if (playlist.user_id !== userId) {
    throw erroSpotify(403, 'Só quem é dono da playlist pode atualizá-la.')
  }

  const acesso = await acessoDoUsuario(event)

  // `/items`, e não `/tracks` — ver o comentário grande no topo do arquivo.
  const brutas = await todasAsPaginas<FaixaBruta>(
    `/playlists/${playlist.spotify_id}/items`,
    acesso,
    100,
  )

  /*
   * `posicao` é o índice na lista original, contado ANTES de descartar as
   * faixas mortas — é o número que a pessoa vê no app do Spotify. Faixa
   * removida do catálogo vem sem conteúdo, e episódio de podcast vem sem `id`;
   * os dois saem, e a numeração dos que ficam continua a mesma.
   */
  const faixas = brutas
    .map((bruta, indice) => ({ faixa: bruta.item ?? bruta.track, indice }))
    .filter((x): x is { faixa: FaixaDetalhe, indice: number } => !!x.faixa?.id)
    .map(({ faixa, indice }) => ({
      playlist_id: playlist.id,
      posicao: indice,
      spotify_track_id: faixa.id!,
      titulo: faixa.name?.trim() || 'Sem título',
      artistas: (faixa.artists ?? []).map(a => a.name).filter(Boolean).join(', '),
      album: faixa.album?.name ?? null,
      duracao_ms: faixa.duration_ms ?? null,
      url_spotify: faixa.external_urls?.spotify ?? null,
    }))

  /*
   * Apaga e reinsere, em vez de upsert.
   *
   * A chave é (playlist_id, posicao): reordenar a playlist no Spotify muda o
   * que cada posição significa, e um upsert deixaria para trás as posições do
   * fim que sumiram. Trocar a lista inteira é a operação que de fato aconteceu.
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
    .update({
      faixas_sincronizadas_em: new Date().toISOString(),
      // A contagem do card passa a ser a que acabamos de contar: `tracks.total`
      // do Spotify inclui episódio de podcast e faixa morta, que não entram aqui.
      total_faixas: faixas.length,
    })
    .eq('id', playlist.id)

  if (erroCarimbo) throw erroSpotify(500, `Não deu para carimbar a playlist: ${erroCarimbo.message}`)

  return faixas.length
}
