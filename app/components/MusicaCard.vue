<script setup lang="ts">
/**
 * Uma música (faixa ou álbum) do catálogo, como card quadrado.
 *
 * O card leva ao Spotify — não há botão de link dedicado. Os controles de nota
 * e status ficam ABAIXO da área clicável, e não dentro dela: são da pessoa, e
 * um clique neles não pode abrir outra aba.
 */
import { ExternalLinkIcon, MusicIcon, Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { FORMATO_ROTULO, creditos, artistasDe, duracaoDe, formatoDe, urlSpotifyDe } from '@/lib/musica'
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
const url = computed(() => urlSpotifyDe(metadados.value))

/** Duração para faixa; para álbum, o que identifica é o artista. */
const legenda = computed(() => {
  const tempo = duracaoDe(metadados.value)
  const artistas = creditos(artistasDe(metadados.value))
  return [FORMATO_ROTULO[formatoDe(metadados.value)], tempo || artistas].filter(Boolean).join(' · ')
})

/**
 * As notas de quem não sou eu.
 *
 * Só entra quem realmente avaliou: uma linha em `rating` sem nota é "quero
 * ouvir" registrado, não um zero — mostrar estrelas vazias no nome da outra
 * pessoa contaria uma coisa que ela não disse.
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
  <div class="group relative">
    <component
      :is="url ? 'a' : 'div'"
      :href="url ?? undefined"
      target="_blank"
      rel="noopener noreferrer"
      class="block"
      :aria-label="url ? `Abrir ${item.media.titulo} no Spotify` : undefined"
    >
      <div class="relative aspect-square overflow-hidden rounded-lg border bg-muted">
        <img
          v-if="item.media.capa_url"
          :src="item.media.capa_url"
          :alt="`Capa de ${item.media.titulo}`"
          loading="lazy"
          class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        >
        <div v-else class="grid size-full place-items-center text-muted-foreground">
          <MusicIcon class="size-6" />
        </div>
      </div>

      <p class="mt-2 flex items-center gap-1 text-sm font-medium leading-snug">
        <span class="line-clamp-2">{{ item.media.titulo }}</span>
        <ExternalLinkIcon v-if="url" class="size-3 shrink-0 text-muted-foreground" />
      </p>
      <p class="truncate text-xs text-muted-foreground">{{ legenda }}</p>
    </component>

    <Button
      variant="ghost"
      size="icon"
      class="absolute right-1 top-1 size-7 rounded-md bg-black/50 text-white backdrop-blur-sm hover:bg-destructive hover:text-destructive-foreground"
      :disabled="salvando"
      :aria-label="`Tirar ${item.media.titulo} da lista`"
      @click.stop.prevent="emit('remover')"
    >
      <Trash2Icon class="size-3.5" />
    </Button>

    <div class="mt-1.5 space-y-1">
      <NotaEstrelas
        :nota="minha?.nota ?? null"
        tamanho="sm"
        @update:nota="emit('nota', $event)"
      />

      <StatusSelect
        :status="minha?.status ?? 'quero'"
        :rotulos="STATUS_ROTULO_MUSICA"
        @update:status="emit('status', $event)"
      />

      <p
        v-for="outra in dosOutros"
        :key="outra.userId"
        class="flex items-center gap-1.5 text-[11px] text-muted-foreground"
      >
        <span class="truncate">{{ outra.quem.split(' ')[0] }}</span>
        <NotaEstrelas :nota="outra.nota" tamanho="sm" somente-leitura />
      </p>
    </div>
  </div>
</template>
