<script setup lang="ts">
/**
 * O apelido de uma conta ou cartão, editável no lugar: o texto com um lápis;
 * tocar abre o campo; Enter salva, Esc desiste. Vazio volta ao nome do banco.
 */
import { CheckIcon, PencilIcon, XIcon } from '@lucide/vue'
import { Input } from '@/components/ui/input'

const props = defineProps<{
  apelido: string | null
  /** O que aparece quando não há apelido ("platinum", "Conta corrente"). */
  reserva: string
  salvando?: boolean
  rotulo: string
}>()
const emit = defineEmits<{ salvar: [apelido: string] }>()

const editando = ref(false)
const texto = ref('')
const campo = ref<InstanceType<typeof Input> | null>(null)

function abrir() {
  texto.value = props.apelido ?? ''
  editando.value = true
  nextTick(() => (campo.value?.$el as HTMLInputElement | undefined)?.focus())
}

function salvar() {
  if ((texto.value.trim() || null) !== (props.apelido ?? null)) emit('salvar', texto.value)
  editando.value = false
}
</script>

<template>
  <form v-if="editando" class="flex items-center gap-1" @submit.prevent="salvar">
    <Input
      ref="campo"
      v-model="texto"
      maxlength="40"
      :placeholder="reserva"
      class="h-8 w-44 text-sm"
      :aria-label="rotulo"
      @keydown.esc.prevent="editando = false"
    />
    <button type="submit" class="grid size-7 place-items-center rounded-md hover:bg-muted" aria-label="Salvar apelido">
      <CheckIcon class="size-4" />
    </button>
    <button type="button" class="grid size-7 place-items-center rounded-md hover:bg-muted" aria-label="Cancelar" @click="editando = false">
      <XIcon class="size-4" />
    </button>
  </form>
  <button
    v-else
    type="button"
    class="group inline-flex min-w-0 items-center gap-1.5 rounded-md text-left text-sm font-medium hover:text-primary"
    :disabled="salvando"
    :aria-label="rotulo"
    @click="abrir"
  >
    <span class="truncate">{{ apelido || reserva }}</span>
    <PencilIcon class="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
  </button>
</template>
