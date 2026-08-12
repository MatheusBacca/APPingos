<script setup lang="ts">
/**
 * A raiz do módulo não tem tela própria — ela manda para Interesses.
 *
 * Objetivos entrou no ar por Interesses: Metas, que dá nome ao módulo, ainda não
 * existe. Sem este redirecionamento, clicar em "Objetivos" na sidebar cairia numa
 * página vazia com uma aba ao lado — o módulo pareceria quebrado justamente por
 * ter ganhado conteúdo.
 *
 * É `definePageMeta({ redirect })`, e não uma cópia da lista aqui, para haver uma
 * tela só a manter. Sai no dia em que Metas nascer e a raiz tiver o que mostrar.
 */
definePageMeta({ redirect: '/objetivos/interesses' })
</script>

<template>
  <div />
</template>
