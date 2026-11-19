<script setup lang="ts">
/**
 * As seções da aba Open Finance de Orçamentos.
 *
 * Caixa de entrada, Contas e o guia eram três abas do módulo; agora são uma aba
 * só, e isto é o seletor de dentro dela. Cada seção continua sendo uma página
 * (`app/pages/orcamentos/open-finance/`), então o link de cada uma segue
 * funcionando e o voltar do navegador anda entre elas.
 */
const SECOES = [
  // A visão de cima: fatura aberta, limite e o peso de cada cartão.
  { to: '/orcamentos/open-finance', rotulo: 'Cartões' },
  // O uso de todo dia: o extrato esperando destino.
  { to: '/orcamentos/open-finance/caixa', rotulo: 'Caixa de entrada' },
  { to: '/orcamentos/open-finance/contas', rotulo: 'Contas' },
  // O que o app aprendeu de cada estabelecimento (auto-tag).
  { to: '/orcamentos/open-finance/regras', rotulo: 'Regras' },
  // A apresentação da integração e o guia para ligá-la (GuiaPluggy.vue).
  { to: '/orcamentos/open-finance/como-funciona', rotulo: 'Como funciona' },
]

const route = useRoute()
</script>

<template>
  <!--
    Uma linha só, que rola de lado no celular — como as abas de Orçamentos logo
    acima. Quebrando em duas linhas, as cinco seções ocupavam metade da primeira
    tela antes de aparecer qualquer compra.
  -->
  <nav
    aria-label="Seções do Open Finance"
    class="-mx-4 flex gap-1.5 overflow-x-auto px-4 text-sm [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden"
  >
    <NuxtLink
      v-for="secao in SECOES"
      :key="secao.to"
      :to="secao.to"
      class="shrink-0 whitespace-nowrap rounded-full border px-3 py-1 font-medium"
      :class="route.path === secao.to
        ? 'border-primary/40 bg-primary/10 text-primary'
        : 'text-muted-foreground hover:text-foreground'"
      :aria-current="route.path === secao.to ? 'page' : undefined"
    >
      {{ secao.rotulo }}
    </NuxtLink>
  </nav>
</template>
