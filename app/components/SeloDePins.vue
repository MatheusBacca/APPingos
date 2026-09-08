<script setup lang="ts">
/**
 * Quantos Pins uma pessoa tem, como selo.
 *
 * Recebe o ID e busca o saldo SOZINHO, em vez de receber o número pronto. Parece
 * o contrário do que se faz, e é de propósito: o selo aparece em lista (um por
 * membro do espaço), e passar o número pronto obrigaria cada tela que mostra
 * gente a carregar o placar, achar a linha certa e decidir o que fazer enquanto
 * não chegou — três coisas que nada têm a ver com o assunto daquela tela. O
 * TanStack Query resolve a duplicação: dez selos na mesma tela compartilham a
 * mesma consulta em cache, e sai uma requisição só.
 *
 * SILÊNCIO ENQUANTO NÃO SABE. Carregando ou com erro, o componente não desenha
 * nada — nunca um "0". A diferença importa: zero é uma afirmação ("esta pessoa
 * não conquistou nada"), e mostrá-la antes de o dado chegar seria dizer isso de
 * todo mundo por um instante a cada carregamento. Quem realmente não tem Pins
 * não aparece em `pin_saldo` (não há linha para agrupar), e aí o zero é
 * verdadeiro e sai escrito.
 *
 * SOBRE OS DOIS GLIFOS, que é uma regra e não um descuido: o pingo aparece onde
 * há uma QUANTIDADE de Pins (este selo, o placar, a vitrine) — é a moeda. O
 * `SparklesIcon` é o ícone do MÓDULO, na navegação e no cartão do painel, onde o
 * assunto é a seção e não um valor. Usar a gota na navegação a deixaria idêntica
 * ao logo do app duas linhas acima.
 */
import { useSaldoDePins } from '~/composables/usePins'

const props = withDefaults(defineProps<{
  /** De quem é o saldo. */
  de: string
  tamanho?: 'sm' | 'md'
}>(), { tamanho: 'sm' })

const { data: saldos, isPending, isError } = useSaldoDePins()

const pontos = computed<number | null>(() => {
  if (isPending.value || isError.value || !saldos.value) return null
  return saldos.value.find(s => s.user_id === props.de)?.pontos ?? 0
})

const CLASSES = {
  sm: 'gap-0.5 px-1.5 py-0.5 text-[11px]',
  md: 'gap-1 px-2 py-1 text-xs',
} as const

const ICONE = { sm: 'size-2.5', md: 'size-3' } as const
</script>

<template>
  <span
    v-if="pontos !== null"
    class="inline-flex shrink-0 items-center rounded-full bg-primary/10 font-medium tabular-nums text-primary"
    :class="CLASSES[props.tamanho]"
    :title="`${pontos} ${pontos === 1 ? 'Pin' : 'Pins'}`"
  >
    <PingoIcone :class="ICONE[props.tamanho]" />
    {{ pontos }}
    <!--
      A unidade só existe no ícone, que leitor de tela nenhum lê. Sem isto o
      número sai sozinho — "340" no meio de uma lista de nomes não quer dizer
      nada para quem não vê a gota.
    -->
    <span class="sr-only">{{ pontos === 1 ? 'Pin' : 'Pins' }}</span>
  </span>
</template>
