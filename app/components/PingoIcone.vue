<script setup lang="ts">
/**
 * O pingo — o glifo da marca, sozinho.
 *
 * Saiu de dentro do `AppLogo` quando a timeline de `/novidades` precisou do
 * mesmo desenho em outro tamanho e sem a caixa nem o texto ao lado. Duas cópias
 * do `<path>` seria o caminho curto e o errado: o dia em que a gota mudar de
 * curva, ela muda nos dois lugares ou o app passa a ter duas marcas.
 *
 * `fill="currentColor"` de propósito: quem usa decide a cor pelo texto, e é isso
 * que faz o mesmo componente servir no quadrado primário do logo e no ponto
 * apagado de uma versão antiga da timeline.
 */
defineProps<{ class?: string }>()
</script>

<template>
  <svg viewBox="0 0 24 24" :class="$props.class" fill="currentColor" aria-hidden="true">
    <path d="M12 2.5c3.6 4.3 6.5 8 6.5 11.4A6.5 6.5 0 0 1 5.5 13.9C5.5 10.5 8.4 6.8 12 2.5Z" />
  </svg>
</template>
