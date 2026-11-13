<script setup lang="ts">
/**
 * Uma meta na lista: quanto já foi guardado, quanto falta, e quanto guardar por
 * mês para chegar no prazo.
 *
 * O progresso é derivado dos aportes (`progressoDaMeta`), nunca de um campo
 * guardado. E "quem guardou quanto" aparece na meta do casal porque é a pergunta
 * que o casal faz ("Ana R$ 800 · Bia R$ 1.200") — numa meta pessoal só há você.
 *
 * Três jeitos de a mesma meta chegar aqui, e o cartão muda com eles:
 *
 *   - do espaço: todo mundo guarda, edita e muda o estado;
 *   - pessoal, sua: só você vê — a menos que a tenha compartilhado, e o menu é
 *     onde se escolhe com quais espaços;
 *   - compartilhada com você (`somenteLeitura`): a meta pessoal de outra pessoa.
 *     Você acompanha e comemora, mas não guarda nem mexe — é o dinheiro dela, e a
 *     RLS recusaria de qualquer jeito. Os botões que o banco recusaria nem aparecem.
 */
import { toast } from 'vue-sonner'
import { MoreHorizontalIcon, PartyPopperIcon, Trash2Icon } from '@lucide/vue'
import { mensagemDeErro } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatarDia, formatarDiaCompleto, hojeIso } from '@/lib/datas'
import { formatarDinheiro } from '@/lib/dinheiro'
import { ROTULO_ESTADO_META, aporteMensalSugerido, guardadoPorPessoa, progressoDaMeta } from '~/types/meta'
import type { EstadoMeta } from '~/types/meta'
import type { MetaComAportes } from '~/composables/useMetas'
import {
  useAtualizarMeta,
  useComemorarMeta,
  useCompartilharMeta,
  useRemoverAporte,
  useRemoverMeta,
} from '~/composables/useMetas'
import { useUsuarioId } from '~/composables/useUsuarioId'

const props = withDefaults(defineProps<{
  meta: MetaComAportes
  /** Nome de exibição por user_id. */
  nomes: Map<string, string>
  /** Mora na gaveta pessoal — leva o selo "Pessoal". */
  pessoal: boolean
  /** Sou admin do espaço da meta? Decide o "apagar" de meta e aporte alheios. */
  admin: boolean
  /** A meta pessoal de outra pessoa, vista por compartilhamento: só leitura. */
  somenteLeitura?: boolean
  /** Os espaços conjuntos em que a meta pessoal pode ser compartilhada (id → nome). */
  espacosConjuntos?: Array<{ id: string, nome: string }>
}>(), { somenteLeitura: false, espacosConjuntos: () => [] })

const emit = defineEmits<{
  guardar: [meta: MetaComAportes]
  resgatar: [meta: MetaComAportes]
  editar: [meta: MetaComAportes]
}>()

const eu = useUsuarioId()
const atualizar = useAtualizarMeta()
const apagar = useRemoverMeta()
const removerAporte = useRemoverAporte()
const compartilhar = useCompartilharMeta()
const comemorar = useComemorarMeta()

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

const dono = computed(() => props.nomes.get(props.meta.criado_por) ?? 'Alguém')

// ---- Compartilhar (só a meta pessoal, só o dono) ---------------------------------

const souDono = computed(() => props.meta.criado_por === eu.value)
const podeCompartilhar = computed(() => props.pessoal && souDono.value && !props.somenteLeitura)

const nomesCompartilhados = computed(() =>
  props.espacosConjuntos.filter(e => props.meta.compartilhamentos.includes(e.id)).map(e => e.nome),
)

const seloPessoal = computed(() =>
  nomesCompartilhados.value.length
    ? `Pessoal · compartilhada com ${nomesCompartilhados.value.join(', ')}`
    : 'Pessoal · só você vê',
)

async function alternarCompartilhamento(espaco: { id: string, nome: string }) {
  const vai = !props.meta.compartilhamentos.includes(espaco.id)
  try {
    await compartilhar.mutateAsync({ meta: props.meta, spaceId: espaco.id, compartilhar: vai })
    toast.success(vai
      ? `"${props.meta.titulo}" aparece em ${espaco.nome}, só para acompanhar.`
      : `"${props.meta.titulo}" voltou a ser só sua em ${espaco.nome}.`)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para mudar o compartilhamento.'))
  }
}

// ---- Comemorar ---------------------------------------------------------------------

const cumprida = computed(() => props.meta.estado === 'cumprida')
const jaComemorei = computed(() => !!eu.value && props.meta.comemoracoes.includes(eu.value))

const quemComemorou = computed(() =>
  props.meta.comemoracoes.map(id => (id === eu.value ? 'você' : props.nomes.get(id) ?? 'alguém')),
)

/** Comemorar a própria meta não faz sentido — o botão é de quem acompanha. */
const podeComemorar = computed(() => cumprida.value && !souDono.value)

async function alternarComemoracao() {
  try {
    await comemorar.mutateAsync({ meta: props.meta, comemorar: !jaComemorei.value })
    if (!jaComemorei.value) toast.success(`${dono.value} vai saber que você comemorou.`)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para comemorar.'))
  }
}

// ---- Estado ------------------------------------------------------------------------

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
    :class="pessoal || somenteLeitura ? 'border-dashed' : ''"
  >
    <header class="flex items-start gap-2">
      <div class="min-w-0 flex-1">
        <h3 class="truncate font-medium">{{ meta.titulo }}</h3>
        <div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge v-if="meta.estado !== 'ativa'" variant="secondary">{{ ROTULO_ESTADO_META[meta.estado] }}</Badge>
          <Badge v-if="somenteLeitura" variant="outline" class="font-normal">Meta de {{ dono }} · só acompanhar</Badge>
          <Badge v-else-if="pessoal" variant="outline" class="font-normal">{{ seloPessoal }}</Badge>
          <span v-if="meta.prazo">até {{ formatarDiaCompleto(meta.prazo) }}</span>
          <span v-if="meta.interesse_id">· veio de um interesse</span>
        </div>
      </div>

      <DropdownMenu v-if="!somenteLeitura">
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon" aria-label="Mais ações da meta">
            <MoreHorizontalIcon class="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-60">
          <DropdownMenuItem @select="emit('editar', meta)">Editar</DropdownMenuItem>
          <DropdownMenuItem v-for="t in trocas" :key="t.para" @select="trocarEstado(t.para)">
            {{ t.rotulo }}
          </DropdownMenuItem>
          <DropdownMenuItem v-if="progresso.guardado > 0" @select="emit('resgatar', meta)">Resgatar</DropdownMenuItem>

          <template v-if="podeCompartilhar && espacosConjuntos.length">
            <DropdownMenuSeparator />
            <DropdownMenuItem v-for="e in espacosConjuntos" :key="e.id" @select="alternarCompartilhamento(e)">
              {{ meta.compartilhamentos.includes(e.id) ? `Parar de compartilhar com ${e.nome}` : `Compartilhar com ${e.nome}` }}
            </DropdownMenuItem>
          </template>

          <DropdownMenuSeparator v-if="podeApagar" />
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
      <p v-if="!pessoal && !somenteLeitura && porPessoa" class="mt-0.5 text-xs text-muted-foreground">{{ porPessoa }}</p>
    </div>

    <div v-if="andando && !somenteLeitura" class="flex gap-2">
      <Button size="sm" variant="secondary" @click="emit('guardar', meta)">Guardar</Button>
    </div>

    <!-- Cumprida: quem acompanha comemora, e todos veem quem comemorou. -->
    <div v-if="cumprida && (podeComemorar || quemComemorou.length)" class="flex flex-wrap items-center gap-2 text-xs">
      <Button
        v-if="podeComemorar"
        size="sm"
        :variant="jaComemorei ? 'default' : 'outline'"
        class="gap-1.5"
        :aria-pressed="jaComemorei"
        :disabled="comemorar.isPending.value"
        @click="alternarComemoracao"
      >
        <PartyPopperIcon class="size-4" />
        {{ jaComemorei ? 'Comemorado' : 'Comemorar' }}
      </Button>
      <span v-if="quemComemorou.length" class="text-muted-foreground">
        {{ quemComemorou.join(' e ') }} {{ quemComemorou.length === 1 ? 'comemorou' : 'comemoraram' }}
      </span>
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
            v-if="!somenteLeitura && (a.user_id === eu || admin)"
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
