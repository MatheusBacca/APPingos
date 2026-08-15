import { sincronizarFaixas } from '~~/server/utils/spotify-playlists'

/** O id é o da NOSSA tabela (uuid), não o do Spotify. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id || !UUID.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'ID inválido' })
  }

  const total = await sincronizarFaixas(event, id)
  return { total }
})
