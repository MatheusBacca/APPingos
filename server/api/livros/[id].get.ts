import { sinopseDaObra } from '~~/server/utils/livros'

/**
 * A sinopse de uma obra, pedida na hora de pôr o livro na estante.
 *
 * Rota própria e não parte da busca: ver o comentário de `sinopseDaObra`.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) return { sinopse: null }

  return { sinopse: await sinopseDaObra(id) }
})
