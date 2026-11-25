<script setup lang="ts">
/**
 * O cabeçalho de uma tela de Orçamentos aberta a partir do painel.
 *
 * Cada tela do módulo (Chico Moedas, Planejamento, Cartões, Contas, Caixa de
 * entrada, Regras, o guia do Open Finance) é uma tela própria, e não uma aba:
 * chega-se a ela por um cartão do painel (`/orcamentos`) e sai-se dela pelo
 * "Orçamentos" do alto. Já foram abas (`OrcamentosAbas`) e seções do Open
 * Finance (`OpenFinanceSecoes`); com o painel fazendo a navegação, o menu
 * repetia o que os cartões já ofereciam e tomava a primeira dobra da tela.
 *
 * As ações são da tela (Nova compra, Conectar banco), por isso vêm da página.
 */
withDefaults(defineProps<{
  titulo: string
  subtitulo: string
  /** Para onde o "voltar" leva quem chegou direto pelo link. */
  voltarPara?: string
  rotuloDoVoltar?: string
}>(), {
  voltarPara: '/orcamentos',
  rotuloDoVoltar: 'Orçamentos',
})
</script>

<template>
  <header class="space-y-2">
    <BotaoVoltar :para="voltarPara" :rotulo="rotuloDoVoltar" />
    <div class="flex flex-wrap items-end gap-x-4 gap-y-2">
      <div class="min-w-0 flex-1">
        <h1 class="text-2xl font-semibold tracking-tight">{{ titulo }}</h1>
        <p class="text-sm text-muted-foreground">{{ subtitulo }}</p>
      </div>
      <div v-if="$slots.acoes" class="flex flex-wrap gap-2">
        <slot name="acoes" />
      </div>
    </div>
  </header>
</template>
