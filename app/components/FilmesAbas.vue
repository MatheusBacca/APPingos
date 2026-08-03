<script setup lang="ts">
// As três telas do módulo dividem o mesmo cabeçalho. Ficar repetindo a <nav> em
// cada página era o caminho curto para uma delas ficar para trás numa mudança.
const ABAS = [
  { to: '/filmes', rotulo: 'Agenda' },
  { to: '/filmes/buscar', rotulo: 'Buscar' },
  { to: '/filmes/lista', rotulo: 'Nossa lista' },
]

defineProps<{ subtitulo: string }>()

const route = useRoute()
</script>

<template>
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Filmes &amp; Séries</h1>
      <p class="mt-1 text-sm text-muted-foreground">{{ subtitulo }}</p>
    </div>

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
  </header>
</template>
