<script setup lang="ts">
/**
 * Uma meta na lista: quanto já foi guardado, quanto falta, e quanto guardar por
 * mês para chegar no prazo.
 *
 * O progresso é derivado dos aportes (`progressoDaMeta`), nunca de um campo
 * guardado. E "quem guardou quanto" aparece na meta do casal porque é a pergunta
 * que o casal faz ("Ana R$ 800 · Bia R$ 1.200") — numa meta pessoal só há você.
 */
import { toast } from 'vue-sonner'
import { MoreHorizontalIcon, Trash2Icon } from '@lucide/vue'
import { mensagemDeErro } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatarDia, formatarDiaCompleto, hojeIso } from '@/lib/datas'
import { formatarDinheiro } from '@/lib/dinheiro'
import { ROTULO_ESTADO_META, aporteMensalSugerido, guardadoPorPessoa, progressoDaMeta } from '~/types/meta'
import type { EstadoMeta } from '~/types/meta'
import type { MetaComAportes } from '~/composables/useMetas'
import { useAtualizarMeta, useRemoverAporte, useRemoverMeta } from '~/composables/useMetas'
import { useUsuarioId } from '~/composables/useUsuarioId'

const props = defineProps<{
  meta: MetaComAportes
  /** Nome de exibição por user_id. */
  nomes: Map<string, string>
  /** Mora na gaveta pessoal — leva o selo "Pessoal". */
  pessoal: boolean
  /** Sou admin do espaço da meta? Decide o "apagar" de meta e aporte alheios. */
  admin: boolean
}>()

const emit = defineEmits<{
  guardar: [meta: MetaComAportes]
  resgatar: [meta: MetaComAportes]
  editar: [meta: MetaComAportes]
}>()

const eu = useUsuarioId()
const atualizar = useAtualizarMeta()
const apagar = useRemoverMeta()
const removerAporte = useRemoverAporte()

const progresso = computed(() => progressoDaMeta(props.meta, props.meta.aportes))
const sugerido = computed(() => aporteMensalSugerido(props.meta, progresso.value.guardado, hojeIso()))

const porPessoa = computed(() =>
  [...guardadoPorPessoa(props.meta.aportes)]
    .filter(([, v]) => v !== 0)
    .map(([id, v]) => `${props.nomes.get(id) ?? 'Alguém'} ${formatarDinheiro(v)}`)
    .join(' · '),
)

const andando = computed(() => props.meta.estado === 'ativa' || props.meta.estado === 'pausada')

const podeApagar = computed(() => props.meta.criado_por === eu.value || props.admin)

/** As trocas de estado que fazem sentido a partir do estado atual. */
const trocas = computed<Array<{ para: EstadoMeta, rotulo: string }>>(() => {
  switch (props.meta.estado) {
    case 'ativa':
      return [
        ...(progresso.value.alcancada ? [{ para: 'cumprida' as const, rotulo: 'Marcar como cumprida' }] : []),
        { para: 'pausada', rotulo: 'Pausar' },
        { para: 'abandonada', rotulo: 'Abandonar' },
      ]
    case 'pausada':
      return [{ para: 'ativa', rotulo: 'Retomar' }, { para: 'abandonada', rotulo: 'Abandonar' }]
    default:
      return [{ para: 'ativa', rotulo: 'Reabrir' }]
  }
})

async function trocarEstado(estado: EstadoMeta) {
  try {
    await atualizar.mutateAsync({ meta: props.meta, mudancas: { estado } })
    toast.success(`"${props.meta.titulo}": ${ROTULO_ESTADO_META[estado].toLowerCase()}.`)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para mudar a meta.'))
  }
}

async function onApagar() {
  try {
    await apagar.mutateAsync(props.meta)
    toast.success('Meta apagada.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para apagar a meta.'))
  }
}

async function onRemoverAporte(aporteId: string) {
  try {
    await removerAporte.mutateAsync({ aporte: { id: aporteId }, meta: props.meta })
    toast.success('Aporte apagado.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para apagar o aporte.'))
  }
}
</script>

<template>
  <article
    class="space-y-3 rounded-lg border bg-card p-4"
    :class="pessoal ? 'border-dashed' : ''"
  >
    <header class="flex items-start gap-2">
      <div class="min-w-0 flex-1">
        <h3 class="truncate font-medium">{{ meta.titulo }}</h3>
        <div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge v-if="meta.estado !== 'ativa'" variant="secondary">{{ ROTULO_ESTADO_META[meta.estado] }}</Badge>
          <Badge v-if="pessoal" variant="outline" class="font-normal">Pessoal · só você vê</Badge>
          <span v-if="meta.prazo">até {{ formatarDiaCompleto(meta.prazo) }}</span>
          <span v-if="meta.interesse_id">· veio de um interesse</span>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon" aria-label="Mais ações da meta">
            <MoreHorizontalIcon class="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-52">
          <DropdownMenuItem @select="emit('editar', meta)">Editar</DropdownMenuItem>
          <DropdownMenuItem v-for="t in trocas" :key="t.para" @select="trocarEstado(t.para)">
            {{ t.rotulo }}
          </DropdownMenuItem>
          <DropdownMenuItem v-if="progresso.guardado > 0" @select="emit('resgatar', meta)">Resgatar</DropdownMenuItem>
          <DropdownMenuItem v-if="podeApagar" class="text-destructive" @select="onApagar">Apagar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>

    <div>
      <div class="flex items-baseline justify-between gap-2 text-sm">
        <span class="font-semibold">{{ formatarDinheiro(progresso.guardado) }}</span>
        <span class="text-muted-foreground">de {{ formatarDinheiro(meta.valor_alvo) }}</span>
      </div>
      <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full transition-[width]"
          :class="progresso.alcancada ? 'bg-emerald-500' : 'bg-primary'"
          :style="{ width: `${progresso.fracao * 100}%` }"
        />
      </div>
      <p class="mt-1 text-xs text-muted-foreground">
        <template v-if="progresso.alcancada">Alvo alcançado.</template>
        <template v-else>
          Faltam {{ formatarDinheiro(progresso.falta) }}<template v-if="sugerido && andando">
            <template v-if="sugerido.vencido"> — o prazo passou.</template>
            <template v-else>
              — {{ formatarDinheiro(sugerido.porMes) }} por mês
              {{ sugerido.meses === 1 ? 'neste mês' : `nos próximos ${sugerido.meses} meses` }}.
            </template>
          </template><template v-else>.</template>
        </template>
      </p>
      <p v-if="!pessoal && porPessoa" class="mt-0.5 text-xs text-muted-foreground">{{ porPessoa }}</p>
    </div>

    <div v-if="andando" class="flex gap-2">
      <Button size="sm" variant="secondary" @click="emit('guardar', meta)">Guardar</Button>
    </div>

    <details v-if="meta.aportes.length" class="text-xs">
      <summary class="cursor-pointer text-muted-foreground hover:text-foreground">
        {{ meta.aportes.length === 1 ? '1 movimento' : `${meta.aportes.length} movimentos` }}
      </summary>
      <ul class="mt-2 space-y-1">
        <li v-for="a in meta.aportes" :key="a.id" class="flex items-center gap-2">
          <span class="w-24 shrink-0 text-muted-foreground">{{ formatarDia(a.data) }}</span>
          <span class="min-w-0 flex-1 truncate">{{ nomes.get(a.user_id) ?? 'Alguém' }}</span>
          <span class="tabular-nums" :class="a.valor < 0 ? 'text-muted-foreground' : ''">
            {{ a.valor < 0 ? '−' : '+' }} {{ formatarDinheiro(Math.abs(a.valor)) }}
          </span>
          <button
            v-if="a.user_id === eu || admin"
            type="button"
            class="text-muted-foreground hover:text-destructive"
            :aria-label="`Apagar o movimento de ${formatarDia(a.data)}`"
            @click="onRemoverAporte(a.id)"
          >
            <Trash2Icon class="size-3.5" />
          </button>
        </li>
      </ul>
    </details>
  </article>
</template>
