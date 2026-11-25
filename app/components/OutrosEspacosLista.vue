<script setup lang="ts">
/**
 * "Outros espaços" no painel de Orçamentos — o divisor e uma linha por espaço:
 * a pilha dos seus cartões que caem nele, o nome do espaço e a SUA parte nele
 * no mês (tudo no pessoal; o rateio num compartilhado).
 *
 * É a mesma lista em "Gastos do mês" e em "Em que foi", e por isso um componente
 * só: as duas respondem "quanto os outros espaços tiram do meu mês", e duas
 * versões do desenho divergiriam no primeiro ajuste.
 */
import { formatarDinheiro } from '@/lib/dinheiro'
import { Skeleton } from '@/components/ui/skeleton'
import type { CartaoNaPilha } from '~/components/PilhaDeCartoes.vue'

export interface LinhaDeOutroEspaco {
  spaceId: string
  nome: string
  pessoal: boolean
  valor: number
  cartoes: CartaoNaPilha[]
}

/*
 * `carregando`: enquanto as compras dos outros espaços não chegam, a parte de
 * cada um seria R$ 0,00 — um número falso. A lista espera em vez de mostrar.
 */
defineProps<{ titulo: string, linhas: LinhaDeOutroEspaco[], carregando?: boolean }>()
</script>

<template>
  <div v-if="linhas.length">
    <div class="mb-2 mt-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground" role="separator">
      <span>{{ titulo }}</span>
      <span class="h-px flex-1 bg-border" />
    </div>
    <div v-if="carregando" class="space-y-2">
      <Skeleton v-for="l in linhas" :key="l.spaceId" class="h-5 w-full" />
    </div>
    <ul v-else class="space-y-2">
      <li v-for="l in linhas" :key="l.spaceId" class="flex items-center gap-2.5 text-sm">
        <PilhaDeCartoes :cartoes="l.cartoes" />
        <span class="min-w-0 flex-1 truncate">
          {{ l.nome }}
          <span class="text-xs text-muted-foreground">{{ l.pessoal ? 'tudo seu' : 'sua parte' }}</span>
        </span>
        <span class="tabular-nums" :class="l.valor ? '' : 'text-muted-foreground'">{{ formatarDinheiro(l.valor) }}</span>
      </li>
    </ul>
  </div>
</template>
