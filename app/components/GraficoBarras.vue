<script setup lang="ts">
/**
 * Barras para série temporal — o "componente só" que a arquitetura previa para
 * a primitiva de série temporal (orçamento, treinos, objetivos).
 *
 * Decisões de leitura, e o porquê:
 *
 * - **Uma medida por gráfico, um eixo.** Nada de segundo eixo y: a escala entre
 *   duas medidas é arbitrária e inventa correlação que não existe nos dados.
 * - **Um matiz só.** Passado, mês corrente e futuro são estados ordenados no
 *   tempo, não identidades diferentes — então variam em intensidade do mesmo
 *   matiz, e não em cores distintas. Cor por identidade seria mentira aqui.
 * - **Rótulo direto só no que importa** (o mês corrente). Número em cima de toda
 *   barra vira ruído e ninguém lê; o resto sai no eixo e no tooltip.
 * - **O tooltip nunca é o único caminho para o valor** — o botão "tabela" mostra
 *   os mesmos números em texto, que é a versão legível por leitor de tela.
 */
import { TableIcon, BarChart3Icon, TrendingUpIcon, TrendingDownIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { formatarPercentual } from '@/lib/dinheiro'

export interface Barra {
  chave: string
  /** Rótulo curto do eixo. */
  rotulo: string
  /** Rótulo completo, para o tooltip e a tabela. */
  rotuloLongo: string
  valor: number
  tom: 'passado' | 'atual' | 'futuro'
  /** Segunda linha do tooltip — a sua parte, por exemplo. */
  detalhe?: string
  /**
   * Variação fracionária ante o período anterior (0,25 = +25%), só para a
   * tabela. `null`/ausente quando não há período anterior com que comparar —
   * dividir por um total zero não vira "infinito%" na tela, vira nada.
   */
  variacao?: number | null
}

const props = withDefaults(defineProps<{
  barras: Barra[]
  formatar: (valor: number) => string
  /** Mantém o render anterior esmaecido em vez de piscar esqueleto. */
  atualizando?: boolean
  vazio?: string
  /**
   * Linhas da tabela, se diferente do gráfico. O gráfico de "por mês" mostra
   * uma janela deslizante (passado + projeção futura) de propósito — é o que
   * entrega a projeção da fase 5 —, mas a tabela pode precisar de um recorte
   * mais estrito (só o ano corrente, por exemplo) sem tirar essa janela do
   * gráfico de barras. Ausente = usa as mesmas `barras`.
   */
  barrasTabela?: Barra[]
}>(), {
  atualizando: false,
  vazio: 'Sem dados no período.',
  barrasTabela: undefined,
})

const linhasTabela = computed(() => props.barrasTabela ?? props.barras)

const emit = defineEmits<{ selecionar: [chave: string] }>()

const mostrandoTabela = ref(false)
const emFoco = ref<string | null>(null)

const maximo = computed(() => Math.max(...props.barras.map(b => b.valor), 0))

/** Altura em % do plot. Piso de 2% para uma barra de valor zero ainda existir. */
function altura(valor: number): string {
  if (maximo.value <= 0) return '2%'
  return `${Math.max((valor / maximo.value) * 100, 2)}%`
}

const CLASSE_TOM: Record<Barra['tom'], string> = {
  passado: 'bg-primary/35',
  atual: 'bg-primary',
  futuro: 'bg-primary/15',
}

const tonsPresentes = computed(() => {
  const vistos = new Set(props.barras.map(b => b.tom))
  return (['passado', 'atual', 'futuro'] as const).filter(t => vistos.has(t))
})

const ROTULO_TOM: Record<Barra['tom'], string> = {
  passado: 'Fechado',
  atual: 'Mês corrente',
  futuro: 'Já comprometido',
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-end">
      <Button
        variant="ghost"
        size="sm"
        class="gap-1.5 text-xs"
        @click="mostrandoTabela = !mostrandoTabela"
      >
        <component :is="mostrandoTabela ? BarChart3Icon : TableIcon" class="size-3.5" />
        {{ mostrandoTabela ? 'Ver gráfico' : 'Ver tabela' }}
      </Button>
    </div>

    <p v-if="mostrandoTabela ? !linhasTabela.length : !barras.length" class="py-8 text-center text-sm text-muted-foreground">
      {{ vazio }}
    </p>

    <!-- Tabela: o mesmo dado em texto, para leitor de tela e para conferência -->
    <table v-else-if="mostrandoTabela" class="w-full text-sm">
      <thead>
        <tr class="border-b text-left text-xs text-muted-foreground">
          <th scope="col" class="py-1.5 font-medium">Período</th>
          <th scope="col" class="py-1.5 text-right font-medium">Valor</th>
          <th scope="col" class="py-1.5 text-right font-medium">Ante o anterior</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="barra in linhasTabela" :key="barra.chave" class="border-b border-dashed last:border-0">
          <td class="py-1.5">
            {{ barra.rotuloLongo }}
            <span v-if="barra.tom !== 'passado'" class="ml-1 text-xs text-muted-foreground">
              ({{ ROTULO_TOM[barra.tom] }})
            </span>
          </td>
          <td class="py-1.5 text-right tabular-nums">{{ formatar(barra.valor) }}</td>
          <td class="py-1.5 text-right tabular-nums">
            <!--
              Vermelho = gastou mais que o período anterior; verde = gastou
              menos. É o oposto da convenção de "ganho financeiro", de propósito
              — aqui a métrica é gasto, não saldo, e gasto maior é a notícia ruim.
            -->
            <span
              v-if="barra.variacao != null"
              class="inline-flex items-center justify-end gap-1"
              :class="barra.variacao > 0
                ? 'text-destructive'
                : barra.variacao < 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-muted-foreground'"
            >
              <TrendingUpIcon v-if="barra.variacao > 0" class="size-3.5" />
              <TrendingDownIcon v-else-if="barra.variacao < 0" class="size-3.5" />
              {{ barra.variacao > 0 ? '+' : '' }}{{ formatarPercentual(barra.variacao) }}
            </span>
            <span v-else class="text-muted-foreground">—</span>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-else class="transition-opacity" :class="atualizando ? 'opacity-50' : ''">
      <!-- O container cresce com o eixo: altura fixa só no plot, nunca no todo -->
      <div class="relative flex h-40 items-end gap-0.5">
        <button
          v-for="barra in barras"
          :key="barra.chave"
          type="button"
          class="group relative flex h-full flex-1 cursor-pointer flex-col justify-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :aria-label="`${barra.rotuloLongo}: ${formatar(barra.valor)}`"
          @mouseenter="emFoco = barra.chave"
          @mouseleave="emFoco = null"
          @focus="emFoco = barra.chave"
          @blur="emFoco = null"
          @click="emit('selecionar', barra.chave)"
        >
          <!-- Rótulo direto só no mês corrente; o resto fica no eixo e no tooltip -->
          <span
            v-if="barra.tom === 'atual' && barra.valor > 0"
            class="mb-1 text-center text-[10px] font-medium tabular-nums text-muted-foreground"
          >
            {{ formatar(barra.valor) }}
          </span>

          <span
            class="w-full rounded-t transition-[height]"
            :class="CLASSE_TOM[barra.tom]"
            :style="{ height: altura(barra.valor) }"
          />

          <span
            v-if="emFoco === barra.chave"
            class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs shadow-md"
          >
            <span class="font-medium">{{ barra.rotuloLongo }}</span>
            <span class="ml-2 tabular-nums">{{ formatar(barra.valor) }}</span>
            <span v-if="barra.detalhe" class="block text-muted-foreground">{{ barra.detalhe }}</span>
          </span>
        </button>
      </div>

      <!-- Régua fina, um tom acima da superfície -->
      <div class="mt-1 h-px bg-border" />

      <div class="mt-1 flex gap-0.5">
        <span
          v-for="barra in barras"
          :key="barra.chave"
          class="flex-1 text-center text-[10px] tabular-nums"
          :class="barra.tom === 'atual' ? 'font-medium text-foreground' : 'text-muted-foreground'"
        >
          {{ barra.rotulo }}
        </span>
      </div>

      <div v-if="tonsPresentes.length > 1" class="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        <span v-for="tom in tonsPresentes" :key="tom" class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span class="size-2.5 rounded-sm" :class="CLASSE_TOM[tom]" />
          {{ ROTULO_TOM[tom] }}
        </span>
      </div>
    </div>
  </div>
</template>
