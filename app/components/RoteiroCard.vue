<script setup lang="ts">
import { BookHeartIcon, CalendarIcon, LockIcon, MapPinIcon, SparklesIcon } from '@lucide/vue'
import { formatarDiaCurto } from '@/lib/datas'
import type { RoteiroNaLista } from '~/composables/useRoteiros'
import { MODOS_TRANSPORTE } from '~/types/viagem'

const props = defineProps<{
  roteiro: RoteiroNaLista
  novo?: boolean
  /**
   * A viagem já tem memória fechada.
   *
   * Vem de fora porque a lista consulta as memórias do espaço de uma vez
   * (`useMemoriasDoEspaco`) — trinta cards perguntando um por um seria o mesmo
   * erro que a assinatura em lote de fotos evita.
   */
  comMemoria?: boolean
}>()

const modo = computed(() =>
  MODOS_TRANSPORTE.find(m => m.valor === props.roteiro.modo_transporte),
)

/** "12 de set" quando só há início; "12 de set → 15 de set" com os dois. */
const periodo = computed(() => {
  const { data_inicio: inicio, data_fim: fim } = props.roteiro
  if (!inicio) return null
  return fim ? `${formatarDiaCurto(inicio)} → ${formatarDiaCurto(fim)}` : formatarDiaCurto(inicio)
})
</script>

<template>
  <NuxtLink
    :to="`/viagens/${roteiro.id}`"
    class="block rounded-lg border bg-card p-4 transition-colors hover:border-primary/60"
  >
    <div class="flex items-start justify-between gap-2">
      <h2 class="min-w-0 flex-1 truncate font-medium">{{ roteiro.nome }}</h2>

      <span class="flex shrink-0 gap-1">
        <span
          v-if="roteiro.visibilidade === 'segredo'"
          class="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
        >
          <LockIcon class="size-3" />
          Segredo
        </span>
        <span
          v-else-if="novo"
          class="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary"
        >
          <SparklesIcon class="size-3" />
          Novo
        </span>

        <!--
          O selo da memória fechada. Discreto de propósito: ele não pede nada,
          só conta que aquela viagem virou documento.
        -->
        <span
          v-if="comMemoria"
          class="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
          title="Esta viagem tem memória fechada"
        >
          <BookHeartIcon class="size-3" />
          Memória
        </span>
      </span>
    </div>

    <p v-if="roteiro.descricao" class="mt-1 line-clamp-2 text-sm text-muted-foreground">
      {{ roteiro.descricao }}
    </p>

    <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span class="flex items-center gap-1">
        <MapPinIcon class="size-3.5" />
        {{ roteiro.paradas.length }}
        {{ roteiro.paradas.length === 1 ? 'parada' : 'paradas' }}
      </span>

      <span v-if="periodo" class="flex items-center gap-1">
        <CalendarIcon class="size-3.5" />
        {{ periodo }}
      </span>

      <span v-if="modo">{{ modo.rotulo }}</span>
    </div>
  </NuxtLink>
</template>
