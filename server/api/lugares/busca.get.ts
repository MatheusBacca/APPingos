import { buscarLugares } from '~~/server/utils/places'

/**
 * Três caracteres, e não dois como no TMDB.
 *
 * Cada tecla aqui custa uma requisição de uma cota mensal, enquanto no TMDB não
 * custa nada. "Sã" ou "Jo" não descrevem lugar nenhum e gastariam a cota para
 * devolver ruído — o corte é o par barato do debounce que existe no client.
 */
const MIN_CARACTERES = 3

export default defineEventHandler(async (event) => {
  const { q } = getQuery(event)
  const termo = typeof q === 'string' ? q.trim() : ''

  if (termo.length < MIN_CARACTERES) return []

  return buscarLugares(event, termo)
})
