<script setup lang="ts">
/**
 * Criar ou editar uma caixinha: nome, banco, de quem é (o pessoal ou um espaço
 * de casal) e a meta que ela alimenta. A meta precisa ser do mesmo espaço — o
 * banco recusa a outra (`validar_caixinha`) e a lista aqui só oferece as dele.
 */
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { mensagemDeErro } from '@/lib/utils'
import { INSTITUICOES } from '~/lib/instituicoes'
import type { Caixinha } from '~/lib/investimentos'
import { useArquivarCaixinha, useRemoverCaixinha, useSalvarCaixinha } from '~/composables/useCaixinhas'
import { useMetas } from '~/composables/useMetas'
import { useSpaceStore } from '~/stores/space'

const props = defineProps<{
  aberto: boolean
  /** `null` cria uma nova. */
  caixinha: Caixinha | null
  /** O espaço sugerido para a nova (o ativo). */
  espacoSugerido: string | null
}>()
const emit = defineEmits<{ fechar: [] }>()

const store = useSpaceStore()
const salvar = useSalvarCaixinha()
const remover = useRemoverCaixinha()
const arquivar = useArquivarCaixinha()
/** Com movimentos, a caixinha se arquiva: apagar deixaria as transações do extrato sem dono. */
const temHistorico = computed(() => !!props.caixinha && props.caixinha.movimentos.length > 0)

const nome = ref('')
const instituicao = ref('')
const espaco = ref('')
const meta = ref('')

watch(() => [props.aberto, props.caixinha] as const, ([aberto, c]) => {
  if (!aberto) return
  nome.value = c?.nome ?? ''
  instituicao.value = c?.instituicao ?? ''
  espaco.value = c?.space_id ?? props.espacoSugerido ?? store.espacos[0]?.id ?? ''
  meta.value = c?.meta_id ?? ''
}, { immediate: true })

const { data: metas } = useMetas(espaco)
const metasAtivas = computed(() => (metas.value ?? []).filter(m => m.estado === 'ativa' || m.id === meta.value))

// Trocar de espaço solta a meta: ela era do espaço anterior.
watch(espaco, (novo, antigo) => { if (antigo && novo !== antigo) meta.value = '' })

const rotuloDoEspaco = (e: { tipo: string, nome: string }) => (e.tipo === 'pessoal' ? 'Pessoal (só sua)' : `Compartilhada com ${e.nome}`)

async function onSalvar() {
  if (!nome.value.trim() || !espaco.value) return
  try {
    await salvar.mutateAsync({
      id: props.caixinha?.id,
      space_id: espaco.value,
      nome: nome.value,
      instituicao: instituicao.value || null,
      meta_id: meta.value || null,
    })
    toast.success(props.caixinha ? 'Caixinha salva.' : `Caixinha "${nome.value.trim()}" criada.`)
    emit('fechar')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para salvar a caixinha.'))
  }
}

async function onRemover() {
  if (!props.caixinha) return
  try {
    if (temHistorico.value) {
      await arquivar.mutateAsync(props.caixinha.id)
      toast.success('Caixinha arquivada. Os movimentos e os aportes dela continuam guardados.')
    }
    else {
      await remover.mutateAsync(props.caixinha.id)
      toast.success('Caixinha removida.')
    }
    emit('fechar')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, temHistorico.value ? 'Não deu para arquivar a caixinha.' : 'Não deu para remover a caixinha.'))
  }
}
</script>

<template>
  <Dialog :open="aberto" @update:open="(v) => { if (!v) emit('fechar') }">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ caixinha ? 'Editar caixinha' : 'Nova caixinha' }}</DialogTitle>
        <DialogDescription>
          Um investimento seu: a caixinha do banco, um CDB, o Tesouro. As aplicações e os resgates
          do extrato se ligam a ela pela caixa de entrada.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="onSalvar">
        <div class="space-y-1.5">
          <Label for="cx-nome">Nome</Label>
          <Input id="cx-nome" v-model="nome" maxlength="60" placeholder="Reserva de emergência" />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1.5">
            <Label for="cx-banco">Banco</Label>
            <select id="cx-banco" v-model="instituicao" class="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Outro</option>
              <option v-for="i in INSTITUICOES" :key="i.codigo" :value="i.codigo">{{ i.nome }}</option>
            </select>
          </div>
          <div class="space-y-1.5">
            <Label for="cx-espaco">De quem é</Label>
            <select id="cx-espaco" v-model="espaco" class="h-9 w-full rounded-md border bg-background px-2 text-sm" :disabled="!!caixinha && caixinha.movimentos.length > 0">
              <option v-for="e in store.espacos" :key="e.id" :value="e.id">{{ rotuloDoEspaco(e) }}</option>
            </select>
          </div>
        </div>

        <div class="space-y-1.5">
          <Label for="cx-meta">Meta que ela alimenta</Label>
          <select id="cx-meta" v-model="meta" class="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="">Nenhuma</option>
            <option v-for="m in metasAtivas" :key="m.id" :value="m.id">{{ m.titulo }}</option>
          </select>
          <p class="text-xs text-muted-foreground">
            Com meta, cada aplicação vira aporte nela — e o aporte aponta para esta caixinha. As que já
            entraram não mudam.
          </p>
        </div>

        <DialogFooter class="gap-2">
          <Button v-if="caixinha" type="button" variant="ghost" class="mr-auto text-destructive" :disabled="remover.isPending.value || arquivar.isPending.value" @click="onRemover">
            {{ temHistorico ? 'Arquivar' : 'Remover' }}
          </Button>
          <Button type="button" variant="ghost" @click="emit('fechar')">Cancelar</Button>
          <Button type="submit" :disabled="!nome.trim() || !espaco || salvar.isPending.value">
            {{ salvar.isPending.value ? 'Salvando…' : 'Salvar' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
