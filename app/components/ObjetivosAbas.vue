<script setup lang="ts">
import { useFaixaRolavel } from '~/composables/useFaixaRolavel'
/**
 * Cabeçalho e abas do módulo de Objetivos.
 *
 * Mesmo padrão de `FilmesAbas.vue`: cada aba é uma função
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

/*
 * No celular as abas não cabem numa linha. Em vez de quebrar em duas (o que
 * empurrava a tela para baixo e misturava as abas com as ações), a faixa rola de
 * lado, com a aba ativa no meio e um esmaecido na borda que esconde abas.
 */
const faixa = ref<HTMLElement | null>(null)
const { mascara } = useFaixaRolavel(faixa)
</script>

<template>
  <header class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Objetivos</h1>
      <p class="mt-1 text-sm text-muted-foreground">{{ subtitulo }}</p>
    </div>

    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <nav
        ref="faixa"
        :style="mascara"
        aria-label="Seções de Objetivos"
        class="flex min-w-0 max-w-full gap-1 overflow-x-auto rounded-lg border bg-card p-1 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <NuxtLink
          v-for="aba in ABAS"
          :key="aba.to"
          :to="aba.to"
          class="shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 font-medium"
          :class="route.path === aba.to ? 'text-primary' : 'text-muted-foreground hover:text-foreground'"
          :aria-current="route.path === aba.to ? 'page' : undefined"
        >
          {{ aba.rotulo }}
        </NuxtLink>
      </nav>

      <!-- As ações são da função, não do módulo — por isso vêm da página. -->
      <slot name="acoes" />
    </div>
  </header>
</template>
