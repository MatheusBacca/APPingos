<script setup lang="ts">
import { ChevronLeftIcon, ChevronRightIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { formatarMes, hojeIso, paraIso, partesDaData } from '@/lib/datas'
import type { MarcadorDia } from '~/types/catalogo'

const props = defineProps<{
  /** Primeiro dia do mês visível, em YYYY-MM-DD. */
  mes: string
  marcadores: MarcadorDia[]
  diaSelecionado: string | null
}>()

const emit = defineEmits<{
  'update:mes': [string]
  'update:diaSelecionado': [string | null]
}>()

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

const referencia = computed(() => partesDaData(props.mes))
const nomeDoMes = computed(() => formatarMes(props.mes))

/** Grade do mês: dias, precedidos dos vazios até cair no dia da semana certo. */
const celulas = computed(() => {
  const { ano, mes } = referencia.value
  const primeiroDiaSemana = new Date(ano, mes - 1, 1).getDay()
  const diasNoMes = new Date(ano, mes, 0).getDate()

  const lista: Array<{ iso: string, dia: number } | null> = []
  for (let i = 0; i < primeiroDiaSemana; i++) lista.push(null)
  for (let d = 1; d <= diasNoMes; d++) lista.push({ iso: paraIso(ano, mes, d), dia: d })
  return lista
})

const porDia = computed(() => {
  const mapa = new Map<string, MarcadorDia[]>()
  for (const m of props.marcadores) {
    if (!mapa.has(m.data)) mapa.set(m.data, [])
    mapa.get(m.data)!.push(m)
  }
  return mapa
})

const hoje = hojeIso()

function mudarMes(delta: number) {
  const { ano, mes } = referencia.value
  const d = new Date(ano, mes - 1 + delta, 1)
  emit('update:mes', paraIso(d.getFullYear(), d.getMonth() + 1, 1))
  emit('update:diaSelecionado', null)
}

function selecionar(iso: string) {
  emit('update:diaSelecionado', props.diaSelecionado === iso ? null : iso)
}

function resumoDoDia(iso: string): string {
  const itens = porDia.value.get(iso) ?? []
  if (!itens.length) return `Dia ${partesDaData(iso).dia}`
  return `Dia ${partesDaData(iso).dia}: ${itens.map(i => i.titulo).join(', ')}`
}
</script>

<template>
  <div class="rounded-lg border bg-card p-3">
    <div class="mb-2 flex items-center justify-between">
      <Button variant="ghost" size="icon" aria-label="Mês anterior" @click="mudarMes(-1)">
        <ChevronLeftIcon class="size-4" />
      </Button>
      <span class="text-sm font-medium">{{ nomeDoMes }}</span>
      <Button variant="ghost" size="icon" aria-label="Próximo mês" @click="mudarMes(1)">
        <ChevronRightIcon class="size-4" />
      </Button>
    </div>

    <div class="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
      <span v-for="(d, i) in DIAS_SEMANA" :key="i" class="py-1">{{ d }}</span>
    </div>

    <div class="grid grid-cols-7 gap-1">
      <div v-for="(celula, i) in celulas" :key="i">
        <button
          v-if="celula"
          type="button"
          class="flex aspect-square w-full flex-col items-center justify-start rounded-md p-1 text-xs transition-colors hover:bg-muted"
          :class="[
            celula.iso === diaSelecionado ? 'bg-primary text-primary-foreground hover:bg-primary' : '',
            celula.iso === hoje && celula.iso !== diaSelecionado ? 'ring-1 ring-primary/40' : '',
          ]"
          :aria-label="resumoDoDia(celula.iso)"
          :aria-pressed="celula.iso === diaSelecionado"
          @click="selecionar(celula.iso)"
        >
          <span>{{ celula.dia }}</span>

          <span class="mt-0.5 flex flex-wrap justify-center gap-0.5">
            <span
              v-for="(m, j) in (porDia.get(celula.iso) ?? []).slice(0, 3)"
              :key="j"
              class="size-1.5 rounded-full"
              :class="m.tom === 'visto' ? 'bg-emerald-500' : 'bg-sky-500'"
            />
          </span>
        </button>
      </div>
    </div>

    <div class="mt-2 flex justify-center gap-4 text-xs text-muted-foreground">
      <span class="flex items-center gap-1"><span class="size-1.5 rounded-full bg-sky-500" /> Quero ver</span>
      <span class="flex items-center gap-1"><span class="size-1.5 rounded-full bg-emerald-500" /> Assistido</span>
    </div>
  </div>
</template>
