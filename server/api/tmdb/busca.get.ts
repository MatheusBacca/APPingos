import { buscar } from '~~/server/utils/tmdb'

export default defineEventHandler(async (event) => {
  const { q } = getQuery(event)
  const termo = typeof q === 'string' ? q.trim() : ''

  if (termo.length < 2) return []

  return buscar(event, termo)
})
