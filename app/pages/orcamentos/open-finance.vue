<script setup lang="ts">
/**
 * Open Finance — a apresentação da integração com a Pluggy e o guia para ligá-la.
 * O conteúdo inteiro é `GuiaPluggy.vue`; a página só o põe no módulo.
 */
useHead({ title: 'Open Finance · APPingos' })
</script>

<template>
  <div class="space-y-6">
    <OrcamentosAbas subtitulo="Os seus bancos no APPingos: como funciona e como conectar." />
    <GuiaPluggy />
  </div>
</template>
