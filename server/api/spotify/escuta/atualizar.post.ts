import { atualizarEscutaDoEspaco } from '~~/server/utils/spotify-escuta'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Chamada pelo app de quem está com a tela aberta, de tempos em tempos.
 *
 * Não existe cron por trás disto de propósito: sem ninguém olhando, não há o
 * que atualizar, e o Spotify não precisa ser consultado.
 */
export default defineEventHandler(async (event) => {
  const corpo = await readBody<{ space?: unknown }>(event)
  const space = typeof corpo?.space === 'string' ? corpo.space : ''

  if (!UUID.test(space)) {
    throw createError({ statusCode: 400, statusMessage: 'Espaço inválido' })
  }

  const total = await atualizarEscutaDoEspaco(event, space)
  return { total }
})
