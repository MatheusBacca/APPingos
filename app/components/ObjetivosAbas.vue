<script setup lang="ts">
/**
 * Cabeçalho e abas do módulo de Objetivos.
 *
 * Mesmo padrão de `OrcamentosAbas.vue` e `FilmesAbas.vue`: cada aba é uma função
 * do módulo com a sua própria página em `app/pages/objetivos/`, e acrescentar uma
 * é uma entrada em `ABAS` mais o arquivo.
 *
 * **Metas** — o que dá nome ao módulo — nasceu depois de Interesses e passou a ser
 * a raiz (`/objetivos`). Até então ela aparecia aqui desabilitada, para o módulo
 * não parecer ser só Interesses; quando chegou, saiu da lista de "em breve" e o
 * `redirect` de `app/pages/objetivos/index.vue` saiu junto. Vem primeiro porque é a
 * pergunta do módulo ("para onde estamos indo"); Interesses é a porta de entrada
 * de muitas metas ("transformar em meta").
 */
defineProps<{ subtitulo: string }>()

const ABAS = [
  { to: '/objetivos', rotulo: 'Metas' },
  { to: '/objetivos/interesses', rotulo: 'Interesses' },
]

const route = useRoute()
</script>

<template>
  <header class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Objetivos</h1>
      <p class="mt-1 text-sm text-muted-foreground">{{ subtitulo }}</p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <nav class="flex gap-1 rounded-lg border bg-card p-1 text-sm">
        <NuxtLink
          v-for="aba in ABAS"
          :key="aba.to"
          :to="aba.to"
          class="rounded-md px-3 py-1.5 font-medium"
          :class="route.path === aba.to ? 'text-primary' : 'text-muted-foreground hover:text-foreground'"
        >
          {{ aba.rotulo }}
        </NuxtLink>
      </nav>

      <!-- As ações são da função, não do módulo — por isso vêm da página. -->
      <slot name="acoes" />
    </div>
  </header>
</template>
