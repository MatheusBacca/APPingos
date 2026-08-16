<script setup lang="ts">
/**
 * Uma playlist como card quadrado.
 *
 * Quadrado porque capa de playlist é 1:1 — o mesmo motivo que fez a busca de
 * músicas sair das seis colunas de Filmes: cartaz é 2:3, disco não.
 *
 * O card inteiro leva ao Spotify. Ver as faixas é um botão à parte, e abre em
 * diálogo em vez de expandir no lugar: numa grade, expandir um card empurraria
 * a linha inteira e desalinharia tudo o que vem depois.
 */
import { ListMusicIcon, MusicIcon, Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { PlaylistSpotify } from '~/composables/useSpotify'

const props = defineProps<{
  playlist: PlaylistSpotify
  /** Só o dono tira do espaço e recarrega as faixas. */
  souDono: boolean
  removendo: boolean
}>()

const emit = defineEmits<{ faixas: [], remover: [] }>()

const legenda = computed(() => {
  const n = props.playlist.total_faixas
  return n === 1 ? '1 música' : `${n} músicas`
})
</script>

<template>
  <div class="group relative">
    <component
      :is="playlist.url_spotify ? 'a' : 'div'"
      :href="playlist.url_spotify ?? undefined"
      target="_blank"
      rel="noopener noreferrer"
      class="block"
      :aria-label="playlist.url_spotify ? `Abrir ${playlist.nome} no Spotify` : undefined"
    >
      <div class="relative aspect-square overflow-hidden rounded-lg border bg-muted">
        <img
          v-if="playlist.capa_url"
          :src="playlist.capa_url"
          :alt="`Capa de ${playlist.nome}`"
          loading="lazy"
          class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        >
        <div v-else class="grid size-full place-items-center text-muted-foreground">
          <MusicIcon class="size-6" />
        </div>
      </div>

      <p class="mt-2 line-clamp-2 text-sm font-medium leading-snug">{{ playlist.nome }}</p>
      <p class="text-xs text-muted-foreground">
        {{ legenda }}
        <template v-if="playlist.colaborativa"> · colaborativa</template>
      </p>
    </component>

    <!--
      Fora do link, e sempre visível: no celular não existe hover, e um controle
      que só aparece ao passar o mouse simplesmente não existe lá.
    -->
    <div class="absolute right-1 top-1 flex gap-1">
      <button
        type="button"
        class="grid size-7 place-items-center rounded-md bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
        :aria-label="`Ver as faixas de ${playlist.nome}`"
        @click.stop.prevent="emit('faixas')"
      >
        <ListMusicIcon class="size-3.5" />
      </button>

      <Button
        v-if="souDono"
        variant="ghost"
        size="icon"
        class="size-7 rounded-md bg-black/50 text-white backdrop-blur-sm hover:bg-destructive hover:text-destructive-foreground"
        :disabled="removendo"
        :aria-label="`Tirar ${playlist.nome} do espaço`"
        @click.stop.prevent="emit('remover')"
      >
        <Trash2Icon class="size-3.5" />
      </Button>
    </div>
  </div>
</template>
