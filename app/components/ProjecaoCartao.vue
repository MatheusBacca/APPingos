<script setup lang="ts">
/**
 * Uma projeção do mês: o que havia para gastar, o que já saiu, o que sobra.
 *
 * A mesma forma serve ao "meu mês" e ao "mês do casal" — muda só o que compõe o
 * planejado (salário − contribuição, ou o valor central) e de qual gaveta vêm os
 * gastos. Por isso o cartão recebe as linhas prontas e não sabe de qual gaveta
 * elas vieram.
 *
 * Planejado e realizado ficam em dois blocos, e nunca numa coluna só somando
 * tudo: são perguntas diferentes ("quanto o mês tinha" e "quanto já foi"), e a
 * sobra é a única conta que junta as duas.
 */
import { formatarDinheiro, formatarPercentual } from '@/lib/dinheiro'
import type { Projecao } from '~/types/planejamento'

export interface LinhaDaProjecao {
  rotulo: string
  valor: number
  /** 'entra' soma, 'sai' subtrai — o sinal é desenhado, o valor vem sempre positivo. */
  sentido: 'entra' | 'sai'
  detalhe?: string
}

const props = defineProps<{
  titulo: string
  subtitulo: string
  projecao: Projecao
  /** O que compõe o planejado, de cima para baixo. */
  linhas: LinhaDaProjecao[]
  rotuloPlanejado: string
  rotuloGastos: string
  rotuloAportes: string
}>()

const estourou = computed(() => props.projecao.sobra < 0)

/*
 * A barra mostra o uso até 100% e para ali — passar disso é dito pela cor e pelo
 * número da sobra. Uma barra que cresce para fora do cartão não informa mais nada.
 */
const larguraDaBarra = computed(() => `${Math.min(props.projecao.uso, 1) * 100}%`)

const sinal = (l: LinhaDaProjecao) => (l.sentido === 'entra' ? '+' : '−')
</script>

<template>
  <section class="space-y-4 rounded-lg border bg-card p-4">
    <div>
      <h2 class="text-sm font-medium">{{ titulo }}</h2>
      <p class="mt-0.5 text-xs text-muted-foreground">{{ subtitulo }}</p>
    </div>

    <dl class="space-y-1.5 text-sm">
      <div v-for="linha in linhas" :key="linha.rotulo" class="flex items-baseline gap-2">
        <dt class="min-w-0 flex-1">
          {{ linha.rotulo }}
          <span v-if="linha.detalhe" class="block text-xs text-muted-foreground">{{ linha.detalhe }}</span>
        </dt>
        <dd class="tabular-nums" :class="linha.sentido === 'sai' ? 'text-muted-foreground' : ''">
          {{ sinal(linha) }} {{ formatarDinheiro(linha.valor) }}
        </dd>
      </div>

      <div class="flex items-baseline gap-2 border-t pt-1.5 font-medium">
        <dt class="flex-1">{{ rotuloPlanejado }}</dt>
        <dd class="tabular-nums">{{ formatarDinheiro(projecao.planejado) }}</dd>
      </div>
    </dl>

    <dl class="space-y-1.5 text-sm">
      <div class="flex items-baseline gap-2">
        <dt class="flex-1">{{ rotuloGastos }}</dt>
        <dd class="tabular-nums text-muted-foreground">− {{ formatarDinheiro(projecao.gastos) }}</dd>
      </div>
      <div class="flex items-baseline gap-2">
        <dt class="flex-1">{{ rotuloAportes }}</dt>
        <dd class="tabular-nums text-muted-foreground">
          {{ projecao.aportes < 0 ? '+' : '−' }} {{ formatarDinheiro(Math.abs(projecao.aportes)) }}
        </dd>
      </div>

      <div class="flex items-baseline gap-2 border-t pt-1.5 text-base font-semibold">
        <dt class="flex-1">{{ estourou ? 'Passou do plano' : 'Sobra' }}</dt>
        <dd class="tabular-nums" :class="estourou ? 'text-destructive' : ''">
          {{ formatarDinheiro(projecao.sobra) }}
        </dd>
      </div>
    </dl>

    <div>
      <div class="h-2 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full transition-[width]"
          :class="estourou ? 'bg-destructive' : 'bg-primary'"
          :style="{ width: larguraDaBarra }"
        />
      </div>
      <p class="mt-1 text-xs text-muted-foreground">
        <template v-if="projecao.planejado > 0">
          {{ formatarDinheiro(projecao.realizado) }} de {{ formatarDinheiro(projecao.planejado) }}
          — {{ formatarPercentual(projecao.uso) }} do planejado.
        </template>
        <template v-else-if="projecao.realizado > 0">
          {{ formatarDinheiro(projecao.realizado) }} saíram sem nada planejado para cobrir.
        </template>
        <template v-else>Nada planejado e nada gasto ainda.</template>
      </p>
    </div>

    <slot />
  </section>
</template>
