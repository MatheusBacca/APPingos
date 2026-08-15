<script setup lang="ts">
import { ExternalLinkIcon, MusicIcon, Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { FORMATO_ROTULO, duracaoDe, formatoDe, legendaDe, urlSpotifyDe } from '@/lib/musica'
import { avaliacaoDe } from '@/lib/recortes'
import type { Membro } from '~/composables/useMembros'
import type { ItemDoEspaco, StatusItem } from '~/types/catalogo'
import { STATUS_ROTULO_MUSICA } from '~/types/catalogo'

const props = defineProps<{
  item: ItemDoEspaco
  membros: Membro[]
  euId: string | null
  salvando: boolean
}>()

const emit = defineEmits<{
  status: [StatusItem]
  nota: [number | null]
  remover: []
}>()

const metadados = computed(() => props.item.media.metadados)
const minha = computed(() => avaliacaoDe(props.item, props.euId))

/**
 * As notas de quem não sou eu.
 *
 * Só entra quem realmente avaliou: uma linha em `rating` sem nota é "quero
 * ouvir" registrado, não um zero — mostrar cinco estrelas vazias no nome da
 * outra pessoa contaria uma coisa que ela não disse.
 */
const dosOutros = computed(() =>
  props.item.avaliacoes
    .filter(av => av.user_id !== props.euId && av.nota != null)
    .map(av => ({
      userId: av.user_id,
      nota: av.nota,
      quem: props.membros.find(m => m.user_id === av.user_id)?.exibicao ?? 'Alguém',
    })),
)
</script>

<template>
  <div class="flex gap-3 rounded-lg border bg-card p-3">
    <div class="size-16 shrink-0 overflow-hidden rounded-md border bg-muted">
      <img
        v-if="item.media.capa_url"
        :src="item.media.capa_url"
        :alt="`Capa de ${item.media.titulo}`"
        loading="lazy"
        class="size-full object-cover"
      >
      <div v-else class="grid size-full place-items-center text-muted-foreground">
        <MusicIcon class="size-5" />
      </div>
    </div>

    <div class="min-w-0 flex-1 space-y-2">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="truncate text-sm font-medium leading-snug">{{ item.media.titulo }}</p>
          <p class="truncate text-xs text-muted-foreground">{{ legendaDe(item.media) }}</p>
          <p class="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {{ FORMATO_ROTULO[formatoDe(metadados)] }}
            <template v-if="duracaoDe(metadados)"> · {{ duracaoDe(metadados) }}</template>
          </p>
        </div>

        <div class="flex shrink-0 items-center gap-0.5">
          <a
            v-if="urlSpotifyDe(metadados)"
            :href="urlSpotifyDe(metadados)!"
            target="_blank"
            rel="noopener noreferrer"
            class="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            :aria-label="`Abrir ${item.media.titulo} no Spotify`"
          >
            <ExternalLinkIcon class="size-4" />
          </a>

          <Button
            variant="ghost"
            size="icon"
            class="size-8 text-muted-foreground hover:text-destructive"
            :disabled="salvando"
            :aria-label="`Tirar ${item.media.titulo} da lista`"
            @click="emit('remover')"
          >
            <Trash2Icon class="size-4" />
          </Button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusSelect
          :status="minha?.status ?? 'quero'"
          :rotulos="STATUS_ROTULO_MUSICA"
          @update:status="emit('status', $event)"
        />
        <NotaEstrelas
          :nota="minha?.nota ?? null"
          tamanho="sm"
          @update:nota="emit('nota', $event)"
        />
      </div>

      <p
        v-for="outra in dosOutros"
        :key="outra.userId"
        class="flex items-center gap-2 text-xs text-muted-foreground"
      >
        {{ outra.quem }}
        <NotaEstrelas :nota="outra.nota" tamanho="sm" somente-leitura />
      </p>
    </div>
  </div>
</template>
