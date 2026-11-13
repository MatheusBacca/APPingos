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
 * A segunda, **Planejamento**, é a pergunta de antes do gasto: quanto o mês tem
 * (salário, contribuição ao casal) e quanto ainda sobra dele.
 */
defineProps<{ subtitulo: string }>()

const ABAS = [
  { to: '/orcamentos', rotulo: 'Chico Moedas' },
  { to: '/orcamentos/planejamento', rotulo: 'Planejamento' },
  // O extrato esperando destino, e os bancos de quem está logado (Open
  // Finance). As duas são só da própria pessoa.
  { to: '/orcamentos/caixa', rotulo: 'Caixa de entrada' },
  { to: '/orcamentos/contas', rotulo: 'Contas' },
  // A apresentação da integração e o guia para ligá-la (GuiaPluggy.vue).
  { to: '/orcamentos/open-finance', rotulo: 'Open Finance' },
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
      <nav class="flex flex-wrap gap-1 rounded-lg border bg-card p-1 text-sm">
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
