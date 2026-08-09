<script setup lang="ts">
import { LockIcon } from '@lucide/vue'
import { formatarDiaCurto } from '@/lib/datas'

/**
 * "Tem alguma coisa sendo preparada para você" — e nada mais que isso.
 *
 * As barras borradas não escondem texto nenhum: não há texto. O nome, a
 * descrição e as paradas do roteiro secreto nunca saem do banco — quem cuida
 * disso é a policy de RLS, e a RPC que alimenta este card devolve três colunas
 * (id, quem, quando) de propósito.
 *
 * É a diferença entre borrar e não enviar. Se o nome chegasse aqui para ser
 * coberto por um `blur-sm`, o devtools entregaria a surpresa em dois cliques —
 * e um card cujo trabalho é guardar segredo não pode depender de ninguém não
 * olhar. O borrão é metáfora, não fechadura.
 */
defineProps<{
  /** Quem está preparando. Nulo quando o nome do membro ainda não carregou. */
  quem: string | null
  /** ISO do momento em que o segredo passou a existir. */
  desde: string
}>()
</script>

<template>
  <div
    class="relative overflow-hidden rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-4"
    aria-label="Roteiro secreto de outra pessoa"
  >
    <!-- Placeholders, não conteúdo coberto: não há o que cobrir. -->
    <div class="space-y-2 blur-sm select-none" aria-hidden="true">
      <div class="h-4 w-2/3 rounded bg-foreground/20" />
      <div class="h-3 w-full rounded bg-foreground/10" />
      <div class="h-3 w-1/2 rounded bg-foreground/10" />
      <div class="mt-3 flex gap-2">
        <div class="h-3 w-16 rounded bg-foreground/10" />
        <div class="h-3 w-24 rounded bg-foreground/10" />
      </div>
    </div>

    <div class="absolute inset-0 grid place-items-center px-4 text-center">
      <div>
        <span class="mx-auto grid size-9 place-items-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400">
          <LockIcon class="size-4" />
        </span>
        <p class="mt-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
          ⚠️ Alerta de spoiler!!!
        </p>
        <p class="mt-0.5 text-xs text-muted-foreground">
          {{ quem ? `${quem} está montando algo` : 'Alguém está montando algo' }}
          · {{ formatarDiaCurto(desde.slice(0, 10)) }}
        </p>
      </div>
    </div>
  </div>
</template>
