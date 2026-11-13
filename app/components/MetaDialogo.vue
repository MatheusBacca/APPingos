<script setup lang="ts">
/**
 * Criar ou editar uma meta: o que, quanto e até quando.
 *
 * Como no `CompraDialogo`, a primeira pergunta é EM QUE GAVETA ela mora — do
 * espaço ou pessoal. A meta pessoal (o presente surpresa) vive no espaço pessoal,
 * e a privacidade dela é a da RLS de membro, não um filtro. Editar não muda a
 * gaveta: os aportes de quem guardou ficariam num espaço de que a pessoa não faz
 * parte.
 *
 * Quando a meta vem de um interesse ("transformar em meta"), o alvo nasce do total
 * do conjunto favorito. Se ele tem item sem preço o total é `null`, e a meta herda
 * essa honestidade: pede o valor à mão em vez de começar com uma soma parcial.
 */
import { toast } from 'vue-sonner'
import { mensagemDeErro } from '@/lib/utils'
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
import { hojeIso } from '@/lib/datas'
import type { MetaComAportes } from '~/composables/useMetas'
import { useAtualizarMeta, useCriarMeta } from '~/composables/useMetas'
import { useGastosPessoais } from '~/composables/useGastosPessoais'
import { useSpaceStore } from '~/stores/space'

export interface OrigemDaMeta {
  interesseId: string
  titulo: string
  /** Total do conjunto favorito, ou `null` com item sem preço. */
  valor: number | null
  /** Onde o interesse mora — a gaveta sugerida. */
  spaceId: string
}

const props = defineProps<{
  /** Preenchida = edição. */
  meta?: MetaComAportes | null
  origem?: OrigemDaMeta | null
}>()

const emit = defineEmits<{ criada: [id: string] }>()

const aberto = defineModel<boolean>('aberto', { required: true })

const store = useSpaceStore()
const { espacoPessoalId } = useGastosPessoais()
const criar = useCriarMeta()
const atualizar = useAtualizarMeta()

const editando = computed(() => !!props.meta)
const salvando = computed(() => criar.isPending.value || atualizar.isPending.value)

const titulo = ref('')
// `undefined` e não `null`: o Input do shadcn não aceita null em model-value.
const valorAlvo = ref<number | undefined>(undefined)
const prazo = ref('')
const gaveta = ref<'espaco' | 'pessoal'>('espaco')

/** O espaço de que se fala quando a gaveta é "do espaço": o ativo, ou o do interesse. */
const espacoBase = computed(() => {
  const id = props.origem?.spaceId ?? store.espacoAtivoId
  return store.espacos.find(e => e.id === id) ?? null
})

/** Só há escolha num espaço compartilhado: no pessoal, a meta já é sua. */
const podeEscolherGaveta = computed(() =>
  !editando.value && !!espacoPessoalId.value && !!espacoBase.value && espacoBase.value.tipo !== 'pessoal',
)

const destino = computed(() =>
  gaveta.value === 'pessoal' || !podeEscolherGaveta.value
    ? (espacoBase.value?.tipo === 'pessoal' ? espacoBase.value.id : espacoPessoalId.value)
    : espacoBase.value?.id ?? null,
)

watch(aberto, (estaAberto) => {
  if (!estaAberto) return
  const m = props.meta
  titulo.value = m?.titulo ?? props.origem?.titulo ?? ''
  valorAlvo.value = m?.valor_alvo ?? props.origem?.valor ?? undefined
  prazo.value = m?.prazo ?? ''
  gaveta.value = 'espaco'
})

const podeSalvar = computed(() =>
  !!titulo.value.trim()
  && (valorAlvo.value ?? 0) > 0
  && (!prazo.value || prazo.value >= hojeIso() || editando.value)
  && !!(editando.value || destino.value)
  && !salvando.value,
)

async function salvar() {
  if (!podeSalvar.value) return
  try {
    if (props.meta) {
      await atualizar.mutateAsync({
        meta: props.meta,
        mudancas: { titulo: titulo.value.trim(), valor_alvo: valorAlvo.value!, prazo: prazo.value || null },
      })
      toast.success('Meta atualizada.')
    }
    else {
      const id = await criar.mutateAsync({
        spaceId: destino.value!,
        titulo: titulo.value.trim(),
        valor_alvo: valorAlvo.value!,
        prazo: prazo.value || null,
        interesseId: props.origem?.interesseId ?? null,
      })
      toast.success(props.origem
        ? 'Virou meta — o interesse ficou como convertido.'
        : destino.value === espacoPessoalId.value ? 'Meta criada nas suas metas pessoais.' : 'Meta criada.')
      emit('criada', id)
    }
    aberto.value = false
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para salvar a meta.'))
  }
}
</script>

<template>
  <Dialog v-model:open="aberto">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ editando ? 'Editar meta' : origem ? 'Transformar em meta' : 'Nova meta' }}</DialogTitle>
        <DialogDescription>
          Quanto juntar e até quando. O progresso é a soma do que cada um guardar.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="salvar">
        <div v-if="podeEscolherGaveta" class="space-y-2">
          <Label class="text-sm">Onde mora</Label>
          <div class="flex gap-1 rounded-lg border p-1">
            <Button
              type="button"
              size="sm"
              class="flex-1"
              :variant="gaveta === 'espaco' ? 'default' : 'ghost'"
              @click="gaveta = 'espaco'"
            >
              De {{ espacoBase?.nome }}
            </Button>
            <Button
              type="button"
              size="sm"
              class="flex-1"
              :variant="gaveta === 'pessoal' ? 'default' : 'ghost'"
              @click="gaveta = 'pessoal'"
            >
              Pessoal
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">
            <template v-if="gaveta === 'pessoal'">Só você vê — serve para o presente surpresa. Dá para compartilhar depois, só para acompanharem.</template>
            <template v-else>Todo mundo do espaço vê e pode guardar nela.</template>
          </p>
        </div>

        <div class="space-y-2">
          <Label for="meta-titulo">O que</Label>
          <Input id="meta-titulo" v-model="titulo" placeholder="Viagem para o Chile" />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-2">
            <Label for="meta-valor">Quanto</Label>
            <Input
              id="meta-valor"
              v-model.number="valorAlvo"
              type="number"
              inputmode="decimal"
              step="0.01"
              min="0.01"
              placeholder="0,00"
            />
          </div>
          <div class="space-y-2">
            <Label for="meta-prazo">Até quando <span class="font-normal text-muted-foreground">(opcional)</span></Label>
            <Input id="meta-prazo" v-model="prazo" type="date" :min="editando ? undefined : hojeIso()" />
          </div>
        </div>

        <p v-if="origem && origem.valor === null" class="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
          O conjunto favorito deste interesse tem item sem preço, então não há um total para usar —
          informe o valor à mão.
        </p>
        <p v-else-if="origem" class="text-xs text-muted-foreground">
          O valor veio do conjunto favorito do interesse.
        </p>
        <p v-if="prazo" class="text-xs text-muted-foreground">
          Com prazo, a meta sugere quanto guardar por mês — e cumpri-la no prazo rende Pins.
        </p>

        <DialogFooter>
          <Button type="button" variant="ghost" @click="aberto = false">Cancelar</Button>
          <Button type="submit" :disabled="!podeSalvar">
            {{ salvando ? 'Salvando…' : editando ? 'Salvar' : 'Criar meta' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
