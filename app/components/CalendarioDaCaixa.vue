<script setup lang="ts">
/**
 * O mês da caixa de entrada num calendário — a paginação e o filtro por dia.
 *
 * Cada dia mostra QUANTAS compras chegaram nele e esperam destino. Tocar num dia
 * recorta a lista para ele; tocar de novo (ou em "Mês inteiro") desfaz. Dia sem
 * nada não é botão: um filtro que só pode devolver a lista vazia é um clique
 * que engana.
 *
 * Embaixo, os outros meses que ainda têm algo parado. Foi um mês escondido que
 * motivou a paginação: com tudo numa lista só (e um teto de 300 linhas), agosto
 * sumia sem aviso. Com a página por mês, o que ficou para trás precisa estar a
 * um toque, e não só a quem lembrar de voltar mês a mês.
 *
 * Mesmo desenho de grade do `CalendarioMes` de Filmes, mas sem os marcadores de
 * filme: lá a pergunta é "o que a gente viu", aqui é "quanto falta".
 */
import { ChevronLeftIcon, ChevronRightIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { formatarDia, formatarMes, hojeIso, mesAbreviado, paraIso, partesDaData, primeiroDoMes, somarMeses } from '@/lib/datas'

const props = defineProps<{
  /** Primeiro dia do mês visível, em YYYY-MM-DD. */
  mes: string
  /** Quantas compras em cada dia do mês visível. */
  contagens: Map<string, number>
  /** Os meses com algo esperando — o atalho para os outros. */
  meses: Array<{ mes: string, quantidade: number }>
  diaSelecionado: string | null
}>()

const emit = defineEmits<{
  'update:mes': [string]
  'update:diaSelecionado': [string | null]
}>()

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const hoje = hojeIso()

const celulas = computed(() => {
  const { ano, mes } = partesDaData(props.mes)
  const primeiroDiaSemana = new Date(ano, mes - 1, 1).getDay()
  const diasNoMes = new Date(ano, mes, 0).getDate()

  const lista: Array<{ iso: string, dia: number, quantidade: number } | null> = []
  for (let i = 0; i < primeiroDiaSemana; i++) lista.push(null)
  for (let d = 1; d <= diasNoMes; d++) {
    const iso = paraIso(ano, mes, d)
    lista.push({ iso, dia: d, quantidade: props.contagens.get(iso) ?? 0 })
  }
  return lista
})

const totalDoMes = computed(() => [...props.contagens.values()].reduce((s, n) => s + n, 0))

/** Os outros meses com pendência, na ordem do tempo — o atual fica de fora. */
const outrosMeses = computed(() =>
  props.meses.filter(m => m.mes !== props.mes).sort((a, b) => a.mes.localeCompare(b.mes)),
)

function irPara(mes: string) {
  emit('update:mes', mes)
  emit('update:diaSelecionado', null)
}

function selecionar(iso: string) {
  emit('update:diaSelecionado', props.diaSelecionado === iso ? null : iso)
}

const ehMesCorrente = computed(() => props.mes === primeiroDoMes(hoje))

function rotuloDoDia(c: { iso: string, quantidade: number }): string {
  const dia = formatarDia(c.iso)
  if (!c.quantidade) return `${dia}: nada esperando`
  const compras = c.quantidade === 1 ? '1 compra esperando destino' : `${c.quantidade} compras esperando destino`
  return props.diaSelecionado === c.iso ? `${dia}: ${compras}. Toque para ver o mês inteiro.` : `${dia}: ${compras}`
}
</script>

<template>
  <div class="rounded-xl border bg-card p-3">
    <div class="mb-1 flex items-center justify-between">
      <Button variant="ghost" size="icon" aria-label="Mês anterior" @click="irPara(somarMeses(mes, -1))">
        <ChevronLeftIcon class="size-4" />
      </Button>
      <div class="text-center">
        <p class="text-sm font-medium">{{ formatarMes(mes) }}</p>
        <p class="text-xs text-muted-foreground">
          {{ totalDoMes === 0 ? 'nada esperando' : totalDoMes === 1 ? '1 esperando' : `${totalDoMes} esperando` }}
        </p>
      </div>
      <Button variant="ghost" size="icon" aria-label="Próximo mês" @click="irPara(somarMeses(mes, 1))">
        <ChevronRightIcon class="size-4" />
      </Button>
    </div>

    <div class="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
      <span v-for="(d, i) in DIAS_SEMANA" :key="i" class="py-1">{{ d }}</span>
    </div>

    <div class="grid grid-cols-7 gap-1">
      <div v-for="(celula, i) in celulas" :key="i">
        <button
          v-if="celula && celula.quantidade"
          type="button"
          class="flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-lg text-xs font-medium transition-colors"
          :class="[
            celula.iso === diaSelecionado
              ? 'bg-primary text-primary-foreground'
              : 'bg-primary/10 text-foreground hover:bg-primary/20',
            celula.iso === hoje && celula.iso !== diaSelecionado ? 'ring-1 ring-primary/50' : '',
          ]"
          :aria-label="rotuloDoDia(celula)"
          :aria-pressed="celula.iso === diaSelecionado"
          @click="selecionar(celula.iso)"
        >
          <span class="leading-none">{{ celula.dia }}</span>
          <span
            class="min-w-4 rounded-full px-1 text-[10px] font-semibold leading-4 tabular-nums"
            :class="celula.iso === diaSelecionado ? 'bg-primary-foreground/20' : 'bg-primary text-primary-foreground'"
            aria-hidden="true"
          >{{ celula.quantidade }}</span>
        </button>
        <span
          v-else-if="celula"
          class="flex aspect-square w-full items-center justify-center rounded-lg text-xs text-muted-foreground/60"
          :class="celula.iso === hoje ? 'ring-1 ring-primary/40' : ''"
          :aria-label="rotuloDoDia(celula)"
        >{{ celula.dia }}</span>
      </div>
    </div>

    <div class="mt-2 flex min-h-6 items-center justify-between gap-2 text-xs">
      <button
        v-if="diaSelecionado"
        type="button"
        class="font-medium text-primary hover:underline"
        @click="emit('update:diaSelecionado', null)"
      >
        Mês inteiro
      </button>
      <button
        v-else-if="!ehMesCorrente"
        type="button"
        class="font-medium text-primary hover:underline"
        @click="irPara(primeiroDoMes(hoje))"
      >
        Voltar para hoje
      </button>
      <span v-else class="text-muted-foreground">Toque num dia para filtrar.</span>
    </div>

    <div v-if="outrosMeses.length" class="mt-2 border-t pt-2">
      <p class="mb-1.5 text-xs text-muted-foreground">Também esperando</p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="m in outrosMeses"
          :key="m.mes"
          type="button"
          class="rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          :aria-label="`${formatarMes(m.mes)}: ${m.quantidade} esperando`"
          @click="irPara(m.mes)"
        >
          {{ mesAbreviado(m.mes) }} <span class="tabular-nums text-foreground">{{ m.quantidade }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
