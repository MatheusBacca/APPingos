<script setup lang="ts">
import { ImageIcon } from '@lucide/vue'

/**
 * `proporcao` porque cartaz de filme é 2:3 e capa de disco é quadrada —
 * forçar a capa do álbum no formato retrato a cortaria pelas beiradas.
 */
const props = withDefaults(defineProps<{
  titulo: string
  ano?: number | null
  capaUrl?: string | null
  legenda?: string | null
  proporcao?: 'cartaz' | 'quadrada'
}>(), {
  proporcao: 'cartaz',
})
</script>

<template>
  <div class="group">
    <div
      class="relative overflow-hidden rounded-lg border bg-muted"
      :class="props.proporcao === 'quadrada' ? 'aspect-square' : 'aspect-[2/3]'"
    >
      <img
        v-if="props.capaUrl"
        :src="props.capaUrl"
        :alt="`Capa de ${props.titulo}`"
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
