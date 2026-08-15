import { detalharMusica } from '~~/server/utils/spotify'

/**
 * Ids do Spotify são base62 de 22 caracteres. Validar aqui evita mandar lixo
 * (ou um caminho com barra) para dentro da URL da API.
 */
const ID_VALIDO = /^[A-Za-z0-9]{22}$/

export default defineEventHandler(async (event) => {
  const formato = getRouterParam(event, 'formato')
  const id = getRouterParam(event, 'id')

  if (formato !== 'faixa' && formato !== 'album') {
    throw createError({ statusCode: 400, statusMessage: 'Formato deve ser faixa ou album' })
  }

  if (!id || !ID_VALIDO.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'ID inválido' })
  }

  return detalharMusica(event, formato, id)
})
