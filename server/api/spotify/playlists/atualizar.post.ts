import { atualizarPlaylistsSalvas } from '~~/server/utils/spotify-playlists'

/**
 * Recarrega nome, capa e contagem das playlists que já estão no espaço.
 *
 * Diferente de `salvar`: aqui não há escolha a fazer, só dado a envelhecer —
 * a pessoa acrescenta música pelo Spotify e o card daqui fica para trás.
 */
export default defineEventHandler(async (event) => {
  const total = await atualizarPlaylistsSalvas(event)
  return { total }
})
