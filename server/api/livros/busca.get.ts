import { buscarLivros } from '~~/server/utils/livros'

export default defineEventHandler(async (event) => {
  const { q } = getQuery(event)
  const termo = typeof q === 'string' ? q.trim() : ''

  // Dois caracteres é o mesmo piso da busca do TMDB: abaixo disso o resultado é
  // ruído, e cada tecla digitada viraria uma ida à API.
  if (termo.length < 2) return []

  return buscarLivros(event, termo)
})
