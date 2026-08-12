<script setup lang="ts">
/**
 * Cabeçalho e abas do módulo de Objetivos.
 *
 * Mesmo padrão de `OrcamentosAbas.vue` e `FilmesAbas.vue`: cada aba é uma função
 * do módulo com a sua própria página em `app/pages/objetivos/`, e acrescentar uma
 * é uma entrada em `ABAS` mais o arquivo.
 *
 * A diferença é a segunda aba. **Metas** — o que dá nome ao módulo — ainda não
 * existe, e ela aparece aqui desabilitada em vez de ser omitida. Omitir faria o
 * módulo parecer ser só Interesses; mostrar como está diz a verdade, que é
 * "Interesses primeiro, metas depois", e deixa o lugar da segunda função visível.
 * Quando Metas nascer, ela troca de lista e o `redirect` de
 * `app/pages/objetivos/index.vue` sai junto.
 */
defineProps<{ subtitulo: string }>()

const ABAS = [
  { to: '/objetivos/interesses', rotulo: 'Interesses' },
]

const EM_BREVE = ['Metas']

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

        <span
          v-for="rotulo in EM_BREVE"
          :key="rotulo"
          class="cursor-not-allowed rounded-md px-3 py-1.5 font-medium text-muted-foreground/50"
          title="Ainda não construímos esta aba."
        >
          {{ rotulo }}
          <span class="sr-only">(em breve)</span>
        </span>
      </nav>

      <!-- As ações são da função, não do módulo — por isso vêm da página. -->
      <slot name="acoes" />
    </div>
  </header>
</template>
