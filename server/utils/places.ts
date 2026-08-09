import type { H3Event } from 'h3'

const AUTOCOMPLETE = 'https://places.googleapis.com/v1/places:autocomplete'

/**
 * O field mask é o que decide o preço da chamada.
 *
 * Pedindo só `placeId` + `structuredFormat`, o Autocomplete fica no SKU
 * *Essentials*, com 10.000 requisições/mês gratuitas. Acrescentar um campo aqui
 * pode empurrar a mesma chamada para um SKU pago sem que nada no código pareça
 * diferente — é a linha mais cara do arquivo.
 */
const CAMPOS = [
  'suggestions.placePrediction.placeId',
  'suggestions.placePrediction.structuredFormat',
].join(',')

/** Formato que o client consome — já traduzido, sem vazar o shape do Google. */
export interface LugarSugerido {
  placeId: string
  nome: string
  endereco: string | null
}

interface Sugestao {
  placePrediction?: {
    placeId?: string
    structuredFormat?: {
      mainText?: { text?: string }
      secondaryText?: { text?: string }
    }
  }
}

function chave(event: H3Event): string {
  const { googlePlacesApiKey } = useRuntimeConfig(event)
  if (!googlePlacesApiKey) {
    throw createError({
      statusCode: 503,
      statusMessage: 'NUXT_GOOGLE_PLACES_API_KEY não configurada no .env',
    })
  }
  return googlePlacesApiKey
}

/**
 * Sugestões de lugar para o termo digitado.
 *
 * **Sem nenhuma chamada a Place Details**, de propósito: o `structuredFormat` do
 * autocomplete já traz nome e endereço, e `place_id:` basta para o mapa e para o
 * link. Details é a chamada paga do módulo — a ausência dela é o que mantém o
 * custo em zero, então ela não deve aparecer aqui por conveniência.
 */
export async function buscarLugares(event: H3Event, termo: string): Promise<LugarSugerido[]> {
  let data: { suggestions?: Sugestao[] }

  try {
    data = await $fetch<{ suggestions?: Sugestao[] }>(AUTOCOMPLETE, {
      method: 'POST',
      headers: {
        'X-Goog-Api-Key': chave(event),
        'X-Goog-FieldMask': CAMPOS,
      },
      // `regionCode` enviesa o resultado para o Brasil sem impedir buscar fora:
      // "Santiago" devolve o bairro de Curitiba antes da capital do Chile, que é
      // o que duas pessoas planejando um fim de semana querem ver primeiro.
      body: { input: termo, languageCode: 'pt-BR', regionCode: 'BR' },
    })
  }
  catch (e: unknown) {
    const status = (e as { status?: number }).status ?? 502
    // Um 401/403 do Google é problema NOSSO de configuração — devolver o status
    // cru faria o client tratar como sessão expirada e mandar a pessoa relogar.
    // 429 também vira 502: a cota estourada não é culpa de quem está digitando.
    throw createError({
      statusCode: 502,
      statusMessage: status === 401 || status === 403
        ? 'Chave do Google rejeitada — confira NUXT_GOOGLE_PLACES_API_KEY e as restrições dela'
        : status === 429
          ? 'Cota de buscas do Google esgotada por hoje'
          : 'Falha ao consultar o Google Places',
    })
  }

  return (data.suggestions ?? [])
    .map(s => s.placePrediction)
    .filter((p): p is NonNullable<Sugestao['placePrediction']> => !!p?.placeId)
    .map(p => ({
      placeId: p.placeId!,
      nome: p.structuredFormat?.mainText?.text?.trim() || 'Lugar sem nome',
      endereco: p.structuredFormat?.secondaryText?.text?.trim() || null,
    }))
}
