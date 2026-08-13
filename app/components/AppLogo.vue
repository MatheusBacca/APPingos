<script setup lang="ts">
withDefaults(defineProps<{ comTexto?: boolean }>(), { comTexto: true })
</script>

<template>
  <span class="flex items-center gap-2">
    <span
      class="grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"
      aria-hidden="true"
    >
      <PingoIcone class="size-4" />
    </span>
    <span v-if="comTexto" class="text-lg font-semibold tracking-tight">
      AP<span class="text-primary">Pingos</span>
    </span>
  </span>
</template>
