import { useQuery } from '@tanstack/vue-query'
import { refDebounced } from '@vueuse/core'
import type { Ref } from 'vue'
import type { LugarSugerido } from '~~/server/utils/places'

/**
 * Os dois freios que mantêm a conta do Google em zero.
 *
 * Cada tecla que passa daqui é uma requisição de uma cota mensal — diferente do
 * TMDB, onde buscar é de graça. 300 ms é o intervalo em que uma pessoa
 * digitando "Jardim Botânico" gera uma chamada e não catorze; 3 caracteres é o
 * mínimo que descreve algum lugar. O servidor repete o corte de 3 em
 * `server/api/lugares/busca.get.ts`: aqui é economia, lá é a garantia.
 */
const ESPERA_MS = 300
const MIN_CARACTERES = 3

/**
 * Sugestões de lugar para um termo que a pessoa está digitando.
 *
 * Não usa `useSpaceQuery` de propósito: o resultado do Google não pertence a
 * espaço nenhum. Entrar na chave de cache por espaço faria a mesma busca ser
 * refeita ao trocar de espaço, gastando cota para receber a mesma resposta.
 */
export function useBuscaDeLugares(termo: Ref<string>) {
  const termoDebounced = refDebounced(termo, ESPERA_MS)
  const alvo = computed(() => termoDebounced.value.trim())
  const ativa = computed(() => alvo.value.length >= MIN_CARACTERES)

  const busca = useQuery({
    queryKey: computed(() => ['lugares', 'busca', alvo.value]),
    enabled: ativa,
    queryFn: () => $fetch<LugarSugerido[]>('/api/lugares/busca', {
      query: { q: alvo.value },
    }),
    // Um lugar não muda de nome em cinco minutos, e é normal digitar o mesmo
    // termo duas vezes ao montar um roteiro. Servir do cache é cota poupada.
    staleTime: 5 * 60 * 1000,
  })

  return { busca, alvo, ativa }
}
