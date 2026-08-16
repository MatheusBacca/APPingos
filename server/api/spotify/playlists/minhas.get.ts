import { listarPlaylistsDoSpotify } from '~~/server/utils/spotify-playlists'

/**
 * Lista as playlists da conta conectada SEM gravar nada.
 *
 * É o primeiro dos dois passos: quem escolhe o que entra no espaço é a pessoa,
 * na tela. Uma conta comum tem mais de cem playlists, quase todas seguidas e
 * não criadas por ela.
 */
export default defineEventHandler(async (event) => {
  const playlists = await listarPlaylistsDoSpotify(event)
  return { playlists }
})
