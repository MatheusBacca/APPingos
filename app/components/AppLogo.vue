<script setup lang="ts">
withDefaults(defineProps<{ comTexto?: boolean }>(), { comTexto: true })
</script>

<template>
  <span class="flex items-center gap-2">
    <span
      class="grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"
      aria-hidden="true"
    >
      <!-- pingo -->
      <svg viewBox="0 0 24 24" class="size-4" fill="currentColor">
        <path d="M12 2.5c3.6 4.3 6.5 8 6.5 11.4A6.5 6.5 0 0 1 5.5 13.9C5.5 10.5 8.4 6.8 12 2.5Z" />
      </svg>
    </span>
    <span v-if="comTexto" class="text-lg font-semibold tracking-tight">
      AP<span class="text-primary">Pingos</span>
    </span>
  </span>
</template>
