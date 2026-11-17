<script setup lang="ts">
import { useFaixaRolavel } from '~/composables/useFaixaRolavel'
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
 *
 * A terceira, **Open Finance**, é o banco de quem está logado: a caixa de
 * entrada do extrato, as contas conectadas e o guia da integração. As três eram
 * abas soltas; viraram seções de uma aba só (`OpenFinanceSecoes.vue`), porque
 * só fazem sentido juntas e são só da própria pessoa.
 */
defineProps<{ subtitulo: string }>()

const ABAS = [
  { to: '/orcamentos', rotulo: 'Chico Moedas' },
  { to: '/orcamentos/planejamento', rotulo: 'Planejamento' },
  { to: '/orcamentos/open-finance', rotulo: 'Open Finance', comSecoes: true },
]

const route = useRoute()

/** A aba com seções fica acesa em qualquer uma delas. */
const ativa = (aba: { to: string, comSecoes?: boolean }) =>
  aba.comSecoes ? route.path === aba.to || route.path.startsWith(`${aba.to}/`) : route.path === aba.to

/*
 * No celular as abas não cabem numa linha. Em vez de quebrar em duas (o que
 * empurrava a tela para baixo e misturava as abas com as ações), a faixa rola de
 * lado, com a aba ativa no meio e um esmaecido na borda que esconde abas.
 */
const faixa = ref<HTMLElement | null>(null)
const { mascara } = useFaixaRolavel(faixa)
</script>

<template>
  <!--
    As abas ficam ao lado do nome do módulo, e a ação da página (Nova compra,
    Conectar banco) logo abaixo delas. No celular tudo empilha: nome, descrição,
    abas e ação.
  -->
  <header class="flex flex-col gap-2 sm:grid sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-x-5 sm:gap-y-2">
    <h1 class="text-2xl font-semibold tracking-tight sm:col-start-1 sm:row-start-1">Orçamentos</h1>

    <p class="text-sm text-muted-foreground sm:col-span-2 sm:row-start-3">{{ subtitulo }}</p>

    <nav
      ref="faixa"
      :style="mascara"
      aria-label="Seções de Orçamentos"
      class="flex min-w-0 max-w-full gap-1 justify-self-start overflow-x-auto rounded-lg border bg-card p-1 text-sm [scrollbar-width:none] sm:col-start-2 sm:row-start-1 [&::-webkit-scrollbar]:hidden"
    >
      <NuxtLink
        v-for="aba in ABAS"
        :key="aba.to"
        :to="aba.to"
        class="shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 font-medium"
        :class="ativa(aba) ? 'text-primary' : 'text-muted-foreground hover:text-foreground'"
        :aria-current="ativa(aba) ? 'page' : undefined"
      >
        {{ aba.rotulo }}
      </NuxtLink>
    </nav>

    <!-- As ações são da função, não do módulo — por isso vêm da página. -->
    <div v-if="$slots.acoes" class="flex flex-wrap gap-2 sm:col-start-2 sm:row-start-2">
      <slot name="acoes" />
    </div>
  </header>
</template>
