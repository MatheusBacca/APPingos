<script setup lang="ts">
import type { RecorteDeDia } from '~/types/viagem'
import { diasDoRoteiro, rotuloCurtoDoDia, rotuloDoDia } from '~/types/viagem'

/**
 * O que o mapa está desenhando: o roteiro completo, ou um dia só.
 *
 * Um roteiro de quatro dias desenhado inteiro é uma teia — o traço do sábado
 * atravessa o do domingo, e a pergunta que se faz olhando o mapa ("o sábado dá
 * pé?") não tem resposta ali. Recortar por dia é o que devolve o mapa à escala
 * em que ele decide alguma coisa.
 *
 * Filtra o MAPA, e não a lista: a lista é o roteiro, e esconder metade dela
 * faria a numeração e o "Salvando…" falarem de um roteiro que não está na tela.
 * A barra fica logo abaixo do mapa, encostada no que ela muda.
 *
 * Some quando não há o que escolher. Num roteiro sem dias, ou com um dia só,
 * "Completo" e "Dia 1" desenham o mesmo mapa — dois botões que fazem a mesma
 * coisa é pior que nenhum.
 */
const props = defineProps<{
  paradas: { dia: number | null }[]
  /** Para dizer a data real de cada dia no `title` do botão. */
  dataInicio: string | null
}>()

const recorte = defineModel<RecorteDeDia>({ required: true })

const dias = computed(() => diasDoRoteiro(props.paradas))
const vale = computed(() => dias.value.length > 1)

/** Quantas paradas cada dia tem — o número ao lado do rótulo. */
const quantas = computed(() => {
  const conta = new Map<number | null, number>()
  for (const p of props.paradas) conta.set(p.dia, (conta.get(p.dia) ?? 0) + 1)
  return conta
})

/*
 * O recorte volta para "Completo" quando o dia escolhido deixa de existir.
 *
 * Acontece de verdade: com o Dia 3 no mapa, apagar (ou desmarcar o dia de) a
 * última parada dele deixaria o botão marcado apontando para um dia vazio, e o
 * mapa cairia no estado de "nenhuma parada" sem nada na tela explicando por quê.
 */
watch(dias, (lista) => {
  if (recorte.value !== 'tudo' && !lista.includes(recorte.value)) recorte.value = 'tudo'
})
</script>

<template>
  <div v-if="vale" class="flex flex-wrap gap-1.5">
    <button
      type="button"
      class="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
      :class="recorte === 'tudo'
        ? 'border-primary bg-primary/10 text-primary'
        : 'text-muted-foreground hover:bg-muted'"
      :aria-pressed="recorte === 'tudo'"
      @click="recorte = 'tudo'"
    >
      Completo
    </button>

    <button
      v-for="dia in dias"
      :key="String(dia)"
      type="button"
      class="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
      :class="recorte === dia
        ? 'border-primary bg-primary/10 text-primary'
        : 'text-muted-foreground hover:bg-muted'"
      :aria-pressed="recorte === dia"
      :title="rotuloDoDia(dia, dataInicio)"
      @click="recorte = dia"
    >
      {{ rotuloCurtoDoDia(dia) }}
      <span class="text-muted-foreground/70">· {{ quantas.get(dia) }}</span>
    </button>
  </div>
</template>
