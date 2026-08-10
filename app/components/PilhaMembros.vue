<script setup lang="ts">
import { PlusIcon } from '@lucide/vue'
import type { Membro } from '~/composables/useMembros'

const props = withDefaults(defineProps<{
  /** Quem está neste estado do filme. Vazio some do rodapé. */
  membros: Membro[]
  /** Mostra o "+" para entrar neste estado. O card decide quando (hover). */
  podeEntrar?: boolean
  entrando?: boolean
}>(), { podeEntrar: false, entrando: false })

const emit = defineEmits<{ entrar: [] }>()

/**
 * Três é o teto: mais que isso a pilha come a largura do cartaz, e ainda
 * precisa sobrar espaço para o "+".
 */
const MAX = 3

const visiveis = computed(() => props.membros.slice(0, MAX))
const excedente = computed(() => Math.max(0, props.membros.length - MAX))
const nomes = computed(() => props.membros.map(m => m.exibicao).join(', '))

function inicial(nome: string): string {
  return (nome.trim()[0] ?? '?').toUpperCase()
}
</script>

<template>
  <div class="flex items-center gap-1">
    <!-- `title` em vez de um componente de tooltip: é o mesmo resultado para o
         usuário, sem arrastar uma dependência nova só por isto. -->
    <div v-if="membros.length" class="flex" :title="nomes">
      <span
        v-for="(m, i) in visiveis"
        :key="m.user_id"
        class="grid size-5 place-items-center rounded-full border border-background bg-primary text-[10px] font-semibold text-primary-foreground"
        :class="i > 0 ? '-ml-1.5' : ''"
        :style="{ zIndex: visiveis.length - i }"
      >
        {{ inicial(m.exibicao) }}
      </span>
      <span
        v-if="excedente"
        class="-ml-1.5 grid size-5 place-items-center rounded-full border border-background bg-muted text-[10px] font-semibold text-muted-foreground"
      >
        +{{ excedente }}
      </span>
    </div>

    <button
      v-if="podeEntrar"
      type="button"
      class="grid size-5 place-items-center rounded-full border border-dashed border-white/70 bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-50"
      :disabled="entrando"
      :aria-label="membros.length ? `Entrar junto com ${nomes}` : 'Marcar para mim também'"
      @click.stop.prevent="emit('entrar')"
    >
      <PlusIcon class="size-3" />
    </button>
  </div>
</template>
