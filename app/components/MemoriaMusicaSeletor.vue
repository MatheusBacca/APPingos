<script setup lang="ts">
/**
 * A trilha da viagem: as playlists que já estão no espaço, ou uma faixa buscada
 * no Spotify.
 *
 * As playlists não custam nada: `capa_url`, nome e total de faixas já estão no
 * banco desde a sincronização (ver 20260815172135_spotify_integracao.sql), então
 * a lista aparece sem uma única chamada ao Spotify. As favoritas do espaço sobem
 * para o topo — são "Nossas músicas", e é de lá que a trilha de uma viagem sai
 * quase sempre.
 *
 * O que é gravado é SNAPSHOT: título, capa e link ficam na linha de
 * `memoria_item`, e `playlist_id` é `on delete set null`. Tirar a playlist do
 * módulo Músicas não pode furar um PDF já impresso.
 */
import { useQuery } from '@tanstack/vue-query'
import { refDebounced } from '@vueuse/core'
import { MusicIcon, SearchIcon, StarIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { mensagemDeErro } from '@/lib/utils'
import { FORMATO_ROTULO, creditos } from '@/lib/musica'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ResultadoBuscaMusica } from '~~/server/utils/spotify'
import type { PlaylistSpotify } from '~/composables/useSpotify'
import type { ItemAnexavel } from '~/composables/useMemoria'
import { useFavoritasDoEspaco, usePlaylistsSpotify } from '~/composables/useSpotify'

const aberto = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{ escolher: [itens: ItemAnexavel[]] }>()

const { data: playlists, isPending } = usePlaylistsSpotify()
const { data: favoritas } = useFavoritasDoEspaco()

/** As favoritas do espaço primeiro; o resto em ordem alfabética, como vem. */
const ordenadas = computed(() => {
  const marcadas = new Set(favoritas.value ?? [])
  const lista = playlists.value ?? []

  return [
    ...lista.filter(p => marcadas.has(p.id)),
    ...lista.filter(p => !marcadas.has(p.id)),
  ]
})

function ehFavorita(id: string): boolean {
  return (favoritas.value ?? []).includes(id)
}

function legendaDaPlaylist(p: PlaylistSpotify): string {
  return p.total_faixas === 1 ? '1 música' : `${p.total_faixas} músicas`
}

function anexarPlaylist(p: PlaylistSpotify) {
  emit('escolher', [{
    tipo: 'playlist',
    foto_id: null,
    caminho: null,
    playlist_id: p.id,
    spotify_id: p.spotify_id,
    titulo: p.nome,
    subtitulo: legendaDaPlaylist(p),
    capa_url: p.capa_url,
    url_spotify: p.url_spotify,
    legenda: null,
  }])
  aberto.value = false
}

// ---- Busca no Spotify -------------------------------------------------------

const termo = ref('')
const termoDebounced = refDebounced(termo, 350)

const busca = useQuery({
  queryKey: computed(() => ['spotify', 'busca', termoDebounced.value]),
  enabled: computed(() => aberto.value && termoDebounced.value.trim().length >= 2),
  queryFn: () => $fetch<ResultadoBuscaMusica[]>('/api/spotify/busca', {
    query: { q: termoDebounced.value.trim() },
  }),
})

const buscando = computed(() => termoDebounced.value.trim().length >= 2)

function anexarFaixa(r: ResultadoBuscaMusica) {
  emit('escolher', [{
    tipo: 'musica',
    foto_id: null,
    caminho: null,
    playlist_id: null,
    spotify_id: r.fonte_id,
    titulo: r.titulo,
    subtitulo: [creditos(r.artistas), r.ano ? String(r.ano) : null].filter(Boolean).join(' · '),
    capa_url: r.capa_url,
    url_spotify: r.url_spotify,
    legenda: null,
  }])
  aberto.value = false
}

watch(aberto, (estaAberto) => {
  if (!estaAberto) termo.value = ''
})
</script>

<template>
  <Dialog v-model:open="aberto">
    <DialogContent class="max-h-[85dvh] gap-3 overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>A trilha desta parte</DialogTitle>
        <DialogDescription>
          Uma playlist do espaço, ou a música que não sai da cabeça desde a viagem.
        </DialogDescription>
      </DialogHeader>

      <div class="relative">
        <SearchIcon class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="termo" placeholder="Buscar uma faixa ou um álbum…" class="pl-9" />
      </div>

      <!-- Busca: só aparece quando há termo, e substitui a lista de playlists. -->
      <template v-if="buscando">
        <p v-if="busca.isPending.value" class="py-6 text-center text-sm text-muted-foreground">
          Buscando no Spotify…
        </p>

        <p v-else-if="busca.isError.value" class="py-6 text-center text-sm text-destructive">
          {{ mensagemDeErro(busca.error.value, 'A busca do Spotify não respondeu.') }}
        </p>

        <p v-else-if="!busca.data.value?.length" class="py-6 text-center text-sm text-muted-foreground">
          Nada com esse nome.
        </p>

        <ul v-else class="space-y-1">
          <li v-for="r in busca.data.value" :key="`${r.formato}:${r.fonte_id}`">
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent"
              @click="anexarFaixa(r)"
            >
              <img v-if="r.capa_url" :src="r.capa_url" alt="" class="size-11 rounded object-cover">
              <span v-else class="grid size-11 place-items-center rounded bg-muted text-muted-foreground">
                <MusicIcon class="size-4" />
              </span>

              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ r.titulo }}</span>
                <span class="block truncate text-xs text-muted-foreground">
                  {{ FORMATO_ROTULO[r.formato] }} · {{ creditos(r.artistas) }}
                </span>
              </span>
            </button>
          </li>
        </ul>
      </template>

      <template v-else>
        <p v-if="isPending" class="py-6 text-center text-sm text-muted-foreground">
          Carregando as playlists…
        </p>

        <div v-else-if="!ordenadas.length" class="rounded-lg border border-dashed px-4 py-8 text-center">
          <MusicIcon class="mx-auto size-6 text-muted-foreground" />
          <p class="mt-2 text-sm font-medium">Nenhuma playlist no espaço ainda.</p>
          <p class="mt-1 text-sm text-muted-foreground">
            Traga as suas em Músicas — ou busque uma faixa aqui em cima.
          </p>
        </div>

        <ul v-else class="space-y-1">
          <li v-for="p in ordenadas" :key="p.id">
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent"
              @click="anexarPlaylist(p)"
            >
              <img v-if="p.capa_url" :src="p.capa_url" alt="" class="size-11 rounded object-cover">
              <span v-else class="grid size-11 place-items-center rounded bg-muted text-muted-foreground">
                <MusicIcon class="size-4" />
              </span>

              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-1.5">
                  <StarIcon v-if="ehFavorita(p.id)" class="size-3.5 shrink-0 fill-amber-400 text-amber-500" />
                  <span class="truncate text-sm font-medium">{{ p.nome }}</span>
                </span>
                <span class="block truncate text-xs text-muted-foreground">
                  {{ legendaDaPlaylist(p) }}
                </span>
              </span>
            </button>
          </li>
        </ul>
      </template>

      <DialogFooter>
        <Button variant="ghost" @click="aberto = false">Fechar</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
