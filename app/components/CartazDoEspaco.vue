<script setup lang="ts">
import { CheckIcon, MoveHorizontalIcon } from '@lucide/vue'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RECORTES, RECORTE_ROTULO } from '@/lib/recortes'
import type { Recorte } from '@/lib/recortes'
import type { Membro } from '~/composables/useMembros'
import type { ItemDoEspaco } from '~/types/catalogo'

const props = withDefaults(defineProps<{
  item: ItemDoEspaco
  /** Quem está neste mesmo estado — vira a pilha de bolinhas no rodapé. */
  membrosNoEstado: Membro[]
  /** Falso quando eu já estou neste estado: nada a somar. */
  podeEntrar: boolean
  entrando: boolean
  /** Onde EU estou neste filme — marca o item atual no menu. */
  meuRecorte?: Recorte | null
  /** Só os recortes do calendário aceitam arraste; a lista, não. */
  arrastavel?: boolean
}>(), { arrastavel: true, meuRecorte: null })

const emit = defineEmits<{ entrar: [], mover: [Recorte] }>()

const arrastando = ref(false)

function onDragStart(e: DragEvent) {
  arrastando.value = true
  // O id do entry é o que o alvo precisa para saber o que foi solto.
  e.dataTransfer?.setData('text/plain', props.item.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
</script>

<template>
  <div
    class="group relative"
    :class="arrastavel ? 'cursor-grab active:cursor-grabbing' : ''"
    :draggable="arrastavel"
    @dragstart="onDragStart"
    @dragend="arrastando = false"
  >
    <NuxtLink :to="`/filmes/${item.id}`" class="block" :class="arrastando ? 'opacity-40' : ''">
      <PosterCard
        :titulo="item.media.titulo"
        :ano="item.media.ano"
        :capa-url="item.media.capa_url"
      >
        <template #rodape>
          <PilhaMembros
            :membros="membrosNoEstado"
            :pode-entrar="podeEntrar"
            :entrando="entrando"
            @entrar="emit('entrar')"
          />
        </template>
      </PosterCard>
    </NuxtLink>

    <!--
      Fora do link, e sempre visível: no celular não existe hover, e arrastar
      não funciona em tela de toque. Este menu é o caminho de lá.
    -->
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <button
          type="button"
          class="absolute right-1 top-1 grid size-6 place-items-center rounded-md bg-black/50 text-white backdrop-blur-sm transition-opacity hover:bg-black/70 focus-visible:opacity-100"
          :aria-label="`Mover ${item.media.titulo}`"
          @click.stop.prevent
        >
          <MoveHorizontalIcon class="size-3.5" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" class="w-44">
        <DropdownMenuLabel class="text-xs text-muted-foreground">Mover para</DropdownMenuLabel>
        <DropdownMenuItem
          v-for="destino in RECORTES"
          :key="destino"
          class="gap-2"
          :disabled="destino === meuRecorte"
          @select="emit('mover', destino)"
        >
          <CheckIcon v-if="destino === meuRecorte" class="size-4 text-primary" />
          <span v-else class="size-4" />
          {{ RECORTE_ROTULO[destino] }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
