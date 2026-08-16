import { buscarMusicas } from '~~/server/utils/spotify'

export default defineEventHandler(async (event) => {
  const { q } = getQuery(event)
  const termo = typeof q === 'string' ? q.trim() : ''

  if (termo.length < 2) return []

  return buscarMusicas(event, termo)
})
