import { sincronizarPlaylists } from '~~/server/utils/spotify-playlists'

export default defineEventHandler(async (event) => {
  const total = await sincronizarPlaylists(event)
  return { total }
})
