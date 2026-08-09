<script setup lang="ts">
import { BikeIcon, BusIcon, CarIcon, FootprintsIcon, LockIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { RoteiroParaSalvar } from '~/composables/useRoteiros'
import type { ModoTransporte, Roteiro } from '~/types/viagem'
import { MODOS_TRANSPORTE } from '~/types/viagem'

/**
 * Criar e editar o cabeçalho do roteiro.
 *
 * "Tornar secreto" só aparece na criação. Depois que o roteiro existe, o
 * caminho é de mão única: esconder de volta algo que o outro já viu não desfaz
 * nada, só confunde — e o banco recusaria de qualquer forma. Quem estiver com um
 * segredo na mão libera pela tela do roteiro, que é onde a decisão tem contexto.
 */
const props = defineProps<{
  open: boolean
  /** Nulo = criar. Preenchido = editar, e aí o alternador de segredo some. */
  roteiro?: Roteiro | null
  salvando?: boolean
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  'salvar': [RoteiroParaSalvar]
}>()

const ICONES = { CarIcon, BusIcon, FootprintsIcon, BikeIcon } as const

const nome = ref('')
const descricao = ref('')
const modo = ref<ModoTransporte>('driving')
const dataInicio = ref('')
const dataFim = ref('')
const secreto = ref(false)

const editando = computed(() => !!props.roteiro)

/*
 * Semear ao abrir, e não a cada mudança do roteiro: revalidar a query no meio
 * do preenchimento (o que acontece ao salvar as paradas) jogaria fora o que a
 * pessoa está digitando. Mesmo motivo do rascunho de avaliação em Filmes.
 */
watch(() => props.open, (aberto) => {
  if (!aberto) return

  nome.value = props.roteiro?.nome ?? ''
  descricao.value = props.roteiro?.descricao ?? ''
  modo.value = props.roteiro?.modo_transporte ?? 'driving'
  dataInicio.value = props.roteiro?.data_inicio ?? ''
  dataFim.value = props.roteiro?.data_fim ?? ''
  secreto.value = false
})

// O banco recusa fim sem início e fim antes do início — avisar aqui evita
// mandar o formulário só para receber a mensagem crua do Postgres de volta.
const erroDeData = computed(() => {
  if (dataFim.value && !dataInicio.value) return 'Informe também a data de ida.'
  if (dataInicio.value && dataFim.value && dataFim.value < dataInicio.value) {
    return 'A volta não pode ser antes da ida.'
  }
  return null
})

const podeSalvar = computed(() => !!nome.value.trim() && !erroDeData.value && !props.salvando)

function salvar() {
  if (!podeSalvar.value) return

  emit('salvar', {
    nome: nome.value.trim(),
    descricao: descricao.value.trim() || null,
    modo_transporte: modo.value,
    data_inicio: dataInicio.value || null,
    data_fim: dataFim.value || null,
    ...(editando.value ? {} : { secreto: secreto.value }),
  })
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ editando ? 'Editar roteiro' : 'Novo roteiro' }}</DialogTitle>
        <DialogDescription>
          As datas são opcionais — dá para montar o roteiro antes de saber quando vão.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <div class="space-y-2">
          <Label for="roteiro-nome">Nome</Label>
          <Input id="roteiro-nome" v-model="nome" placeholder="Fim de semana no litoral" />
        </div>

        <div class="space-y-2">
          <Label for="roteiro-descricao">Descrição</Label>
          <Textarea id="roteiro-descricao" v-model="descricao" rows="2" placeholder="Opcional" />
        </div>

        <div class="space-y-2">
          <Label>Como vão</Label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="opcao in MODOS_TRANSPORTE"
              :key="opcao.valor"
              type="button"
              class="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors"
              :class="modo === opcao.valor
                ? 'border-primary bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted'"
              :aria-pressed="modo === opcao.valor"
              @click="modo = opcao.valor"
            >
              <component :is="ICONES[opcao.icone as keyof typeof ICONES]" class="size-4" />
              {{ opcao.rotulo }}
            </button>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-2">
            <Label for="roteiro-ida">Ida</Label>
            <Input id="roteiro-ida" v-model="dataInicio" type="date" />
          </div>
          <div class="space-y-2">
            <Label for="roteiro-volta">Volta</Label>
            <Input id="roteiro-volta" v-model="dataFim" type="date" />
          </div>
        </div>

        <p v-if="erroDeData" class="text-sm text-destructive">{{ erroDeData }}</p>

        <label
          v-if="!editando"
          class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
          :class="secreto ? 'border-amber-500/60 bg-amber-500/5' : ''"
        >
          <input v-model="secreto" type="checkbox" class="mt-1 size-4 accent-amber-500">
          <span class="min-w-0 text-sm">
            <span class="flex items-center gap-1.5 font-medium">
              <LockIcon class="size-3.5" />
              Tornar secreto
            </span>
            <span class="mt-0.5 block text-xs text-muted-foreground">
              Ninguém mais do espaço vê este roteiro até você liberar. Ao liberar,
              ele aparece para os outros com um aviso.
            </span>
          </span>
        </label>
      </div>

      <DialogFooter>
        <Button variant="ghost" @click="emit('update:open', false)">Cancelar</Button>
        <Button :disabled="!podeSalvar" @click="salvar">
          {{ salvando ? 'Salvando…' : editando ? 'Salvar' : 'Criar roteiro' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
