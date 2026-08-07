<script setup lang="ts">
/**
 * Cabeçalho e abas do módulo de Orçamentos.
 *
 * As abas são funções diferentes do módulo, não recortes da mesma tela — cada
 * uma tem a sua página em `app/pages/orcamentos/`. É o mesmo padrão do módulo de
 * Filmes (ver `FilmesAbas.vue`): acrescentar uma função é uma entrada em `ABAS`
 * mais a página correspondente, e a navegação inteira acompanha.
 *
 * A primeira, **Chico Moedas**, é a função que o módulo já tinha: as compras do
 * mês, o parcelamento e o rateio entre quem divide o espaço.
 *
 * A barra aparece mesmo com uma aba só. Ela não está ali para escolher entre
 * duas coisas — está para dizer que *esta* tela é uma função com nome, e que o
 * lugar de uma segunda é ao lado dela.
 */
defineProps<{ subtitulo: string }>()

const ABAS = [
  { to: '/orcamentos', rotulo: 'Chico Moedas' },
]

const route = useRoute()
</script>

<template>
  <header class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Orçamentos</h1>
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
