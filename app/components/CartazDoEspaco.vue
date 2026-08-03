<script setup lang="ts">
import type { Membro } from '~/composables/useMembros'
import type { ItemDoEspaco } from '~/types/catalogo'

const props = withDefaults(defineProps<{
  item: ItemDoEspaco
  /** Quem está neste mesmo estado — vira a pilha de bolinhas no rodapé. */
  membrosNoEstado: Membro[]
  /** Falso quando eu já estou neste estado: nada a somar. */
  podeEntrar: boolean
  entrando: boolean
  /** Só os tópicos do calendário aceitam arraste; a lista de baixo, não. */
  arrastavel?: boolean
}>(), { arrastavel: true })

const emit = defineEmits<{ entrar: [] }>()

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
  </div>
</template>
