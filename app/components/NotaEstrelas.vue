<script setup lang="ts">
import { StarIcon } from '@lucide/vue'

/**
 * Nota de 0 a 10 exibida/editada como 5 estrelas (cada estrela = 2 pontos).
 * Meia-estrela via clip-path cobre notas ímpares sem precisar de um SVG à parte.
 */
const props = withDefaults(defineProps<{
  nota?: number | null
  somenteLeitura?: boolean
  tamanho?: 'sm' | 'md'
}>(), {
  nota: null,
  somenteLeitura: false,
  tamanho: 'md',
})

const emit = defineEmits<{ 'update:nota': [valor: number | null] }>()

const tamanhoIcone = computed(() => (props.tamanho === 'sm' ? 'size-4' : 'size-5'))

function preenchimento(estrela: number): 'cheia' | 'meia' | 'vazia' {
  const valor = props.nota ?? 0
  const limiar = estrela * 2
  if (valor >= limiar) return 'cheia'
  if (valor >= limiar - 1) return 'meia'
  return 'vazia'
}

function onClick(estrela: number, metade: boolean) {
  if (props.somenteLeitura) return
  const nova = estrela * 2 - (metade ? 1 : 0)
  // Clicar na mesma nota já marcada limpa — evita ficar preso numa nota errada.
  emit('update:nota', props.nota === nova ? null : nova)
}
</script>

<template>
  <div class="inline-flex items-center gap-0.5" :aria-label="nota != null ? `Nota ${nota} de 10` : 'Sem nota'">
    <span
      v-for="estrela in 5"
      :key="estrela"
      class="relative inline-flex"
      :class="{ 'cursor-pointer': !somenteLeitura }"
    >
      <StarIcon :class="[tamanhoIcone, 'text-muted-foreground/30']" />

      <span
        v-if="preenchimento(estrela) !== 'vazia'"
        class="absolute inset-0 overflow-hidden"
        :style="{ width: preenchimento(estrela) === 'meia' ? '50%' : '100%' }"
      >
        <StarIcon :class="[tamanhoIcone, 'fill-primary text-primary']" />
      </span>

      <template v-if="!somenteLeitura">
        <button
          type="button"
          class="absolute inset-y-0 left-0 w-1/2"
          :aria-label="`Dar nota ${estrela * 2 - 1}`"
          @click="onClick(estrela, true)"
        />
        <button
          type="button"
          class="absolute inset-y-0 right-0 w-1/2"
          :aria-label="`Dar nota ${estrela * 2}`"
          @click="onClick(estrela, false)"
        />
      </template>
    </span>
  </div>
</template>
