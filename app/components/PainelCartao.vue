<script setup lang="ts">
/**
 * Um cartão do painel de Orçamentos: um atalho para a tela que detalha o número.
 *
 * O cartão inteiro é clicável, mas o `<a>` é só o título — o resto da área vem
 * de um `::after` esticado sobre o cartão. É o jeito de o cartão poder ter um
 * botão próprio (o "+" de Nova compra) sem pôr um botão dentro de um link, o que
 * o HTML não permite e o leitor de tela anuncia como uma coisa só. Quem precisa
 * ficar clicável por cima do link usa a classe `relative z-10`.
 */
import { ArrowRightIcon } from '@lucide/vue'
import type { Component } from 'vue'

defineProps<{
  titulo: string
  para: string
  icone: Component
  /** Cor do ícone, como classe do Tailwind. */
  tom?: string
  /** O texto do atalho; some no celular, onde o cartão inteiro já é o alvo. */
  rotuloDoAtalho?: string
  /** Cartão estreito (os quatro números do topo): só a seta, para o título caber. */
  compacto?: boolean
}>()
</script>

<template>
  <section class="group relative flex flex-col rounded-lg border bg-card p-4 transition-colors hover:border-primary/40">
    <header class="flex items-center gap-2">
      <component :is="icone" class="size-4 shrink-0" :class="tom ?? 'text-primary'" aria-hidden="true" />
      <h2 class="min-w-0 flex-1 truncate text-sm font-medium">
        <NuxtLink
          :to="para"
          class="outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {{ titulo }}
        </NuxtLink>
      </h2>
      <slot name="acao" />
      <span class="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors group-hover:text-primary sm:inline-flex" aria-hidden="true">
        <span v-if="!compacto" class="whitespace-nowrap">{{ rotuloDoAtalho ?? 'Ver detalhes' }}</span>
        <ArrowRightIcon class="size-3.5" />
      </span>
    </header>

    <div class="mt-3 flex min-h-0 flex-1 flex-col">
      <slot />
    </div>
  </section>
</template>
