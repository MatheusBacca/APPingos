<script setup lang="ts">
/**
 * Onde o dinheiro do mês foi parar, por categoria.
 *
 * Decisões de leitura, e o porquê:
 *
 * - **Barras horizontais, não verticais.** O eixo aqui é categórico, e não
 *   temporal: os nomes têm comprimentos diferentes e não estão em ordem
 *   nenhuma no mundo. Na horizontal o rótulo cabe inteiro, sem rotacionar
 *   texto, e a ordem passa a ser a única que importa — a do peso.
 * - **Cor por identidade, e aqui isso é verdade.** É o oposto do gráfico de
 *   série temporal, que usa um matiz só: lá os estados são ordenados no tempo,
 *   aqui cada categoria é uma identidade sem ordem natural. A cor é a mesma que
 *   a pessoa escolheu para o selo da categoria, então o gráfico e a lista de
 *   compras falam a mesma língua.
 * - **O comprimento da barra É a porcentagem.** Escalar pela maior categoria
 *   deixaria a maior sempre no fim da régua, e uma barra cheia ao lado de um
 *   "38%" é uma contradição na mesma linha. Assim, o desenho e o número dizem a
 *   mesma coisa, e as barras somam a largura toda.
 * - **Clicar abre a fatia.** O gráfico responde "quanto"; "em quê" é a pergunta
 *   seguinte, e ela tem uma resposta longa demais para caber aqui.
 */
import { CLASSE_BARRA, CLASSE_BARRA_SEM_CATEGORIA } from '~/types/orcamento'
import type { FatiaCategoria } from '~/types/orcamento'
import { formatarDinheiro, formatarPercentual } from '@/lib/dinheiro'
import { formatarDia, hojeIso, somarDias } from '@/lib/datas'

const props = withDefaults(defineProps<{
  fatias: FatiaCategoria[]
  /** Mantém o render anterior esmaecido em vez de piscar esqueleto. */
  atualizando?: boolean
  vazio?: string
}>(), {
  atualizando: false,
  vazio: 'Sem compras no período.',
})

const emit = defineEmits<{ selecionar: [chave: string] }>()

/** Piso de 1,5% para uma categoria de peso quase nulo ainda ter o que clicar. */
function largura(fatia: FatiaCategoria): string {
  return `${Math.max(fatia.fracao * 100, 1.5)}%`
}

function preenchimento(fatia: FatiaCategoria): string {
  return fatia.cor ? CLASSE_BARRA[fatia.cor] : CLASSE_BARRA_SEM_CATEGORIA
}

function quantidade(fatia: FatiaCategoria): string {
  return fatia.compras.length === 1 ? '1 compra' : `${fatia.compras.length} compras`
}

/**
 * A data da compra mais recente da categoria. É o que diz se a categoria ainda
 * está "viva" no mês — o Delivery de ontem e o Cinema de três semanas atrás têm
 * pesos parecidos e histórias diferentes. Hora não: o extrato do banco chega
 * com o dia, e uma hora inventada seria pior que nenhuma.
 */
function ultima(fatia: FatiaCategoria): string {
  const data = fatia.compras.reduce((m, c) => (c.data_compra > m ? c.data_compra : m), '')
  if (!data) return ''
  const hoje = hojeIso()
  if (data === hoje) return 'hoje'
  if (data === somarDias(hoje, -1)) return 'ontem'
  return formatarDia(data)
}

const total = computed(() => props.fatias.reduce((t, f) => t + f.total, 0))
</script>

<template>
  <div>
    <p v-if="!fatias.length" class="rounded-lg border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
      {{ vazio }}
    </p>

    <div v-else class="space-y-1 transition-opacity" :class="atualizando ? 'opacity-50' : ''">
      <button
        v-for="fatia in fatias"
        :key="fatia.chave"
        type="button"
        class="block w-full rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
        :aria-label="`${fatia.nome}: ${quantidade(fatia)}, ${formatarDinheiro(fatia.total)}, ${formatarPercentual(fatia.fracao)} do período. Ver as compras.`"
        @click="emit('selecionar', fatia.chave)"
      >
        <div class="flex items-center gap-3">
          <IconeDaCompra :categoria="fatia.cor ? fatia.nome : null" :cor="fatia.cor" />

          <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-2">
              <span class="truncate font-medium">{{ fatia.nome }}</span>

              <!--
                O valor é o número que a pessoa lê primeiro; a porcentagem fica
                ao lado, em tom secundário, e a barra embaixo repete o peso.
              -->
              <span class="ml-auto shrink-0 text-sm font-semibold tabular-nums">
                {{ formatarDinheiro(fatia.total) }}
              </span>
              <span class="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {{ formatarPercentual(fatia.fracao) }}
              </span>
            </div>

            <p class="mt-0.5 text-xs text-muted-foreground">
              {{ quantidade(fatia) }}<template v-if="ultima(fatia)"> · última {{ ultima(fatia) }}</template>
            </p>

            <div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                class="h-full rounded-full transition-[width]"
                :class="preenchimento(fatia)"
                :style="{ width: largura(fatia) }"
              />
            </div>
          </div>
        </div>
      </button>

      <!--
        A régua embaixo fecha a conta: as barras são frações de um total, e o
        total precisa estar escrito em algum lugar para elas quererem dizer algo.
      -->
      <p class="border-t pt-2 text-right text-xs text-muted-foreground">
        Total do período: <span class="font-medium tabular-nums text-foreground">{{ formatarDinheiro(total) }}</span>
      </p>
    </div>
  </div>
</template>
