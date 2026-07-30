import { detalhar } from '~~/server/utils/tmdb'

export default defineEventHandler(async (event) => {
  const tipo = getRouterParam(event, 'tipo')
  const id = getRouterParam(event, 'id')

  if (tipo !== 'filme' && tipo !== 'serie') {
    throw createError({ statusCode: 400, statusMessage: 'Tipo deve ser filme ou serie' })
  }

  if (!id || !/^\d+$/.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'ID inválido' })
  }

  return detalhar(event, tipo, id)
})
