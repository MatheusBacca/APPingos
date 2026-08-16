import { salvarPlaylists } from '~~/server/utils/spotify-playlists'

/** Ids do Spotify são base62 — o mesmo formato dos ids de faixa e álbum. */
const ID_SPOTIFY = /^[A-Za-z0-9]{1,64}$/

export default defineEventHandler(async (event) => {
  const corpo = await readBody<{ ids?: unknown }>(event)
  const brutos = Array.isArray(corpo?.ids) ? corpo.ids : []

  const ids = brutos.filter((id): id is string =>
    typeof id === 'string' && ID_SPOTIFY.test(id),
  )

  /*
   * Lista vazia é válida: significa "nenhuma no espaço", e é como se tira todas
   * de uma vez. Recusar com 400 deixaria sem saída quem tem cem playlists
   * salvas de uma vez e quer começar do zero.
   */
  const total = await salvarPlaylists(event, ids)
  return { total }
})
