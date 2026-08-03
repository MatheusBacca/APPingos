<script setup lang="ts">
import { ImageIcon } from '@lucide/vue'

const props = defineProps<{
  titulo: string
  ano?: number | null
  capaUrl?: string | null
  legenda?: string | null
}>()
</script>

<template>
  <div class="group">
    <div class="relative aspect-[2/3] overflow-hidden rounded-lg border bg-muted">
      <img
        v-if="props.capaUrl"
        :src="props.capaUrl"
        :alt="`Pôster de ${props.titulo}`"
        loading="lazy"
        class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      >
      <div v-else class="grid size-full place-items-center text-muted-foreground">
        <ImageIcon class="size-6" />
      </div>

      <slot name="overlay" />

      <div v-if="$slots.rodape" class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 pt-6">
        <slot name="rodape" />
      </div>
    </div>

    <p class="mt-2 line-clamp-2 text-sm font-medium leading-snug">
      {{ props.titulo }}
    </p>
    <p v-if="props.ano || props.legenda" class="text-xs text-muted-foreground">
      {{ [props.ano, props.legenda].filter(Boolean).join(' · ') }}
    </p>
  </div>
</template>
