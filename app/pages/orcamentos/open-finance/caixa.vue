<script setup lang="ts">
/**
 * Caixa de entrada — o extrato que chegou do banco, esperando um destino.
 *
 * Fase 5 de docs/notion-plano-open-finance.md: "lançar vira classificar". Cada
 * pessoa vê só as próprias transações (RLS `user_id = auth.uid()`); a outra
 * pessoa do espaço só vê o que vira compra no espaço do casal.
 *
 * A lista é de LINHAS que se tocam, agrupadas por dia (`LinhaDaCaixa`): onde
 * foi, de qual cartão, quanto e a sugestão do auto-tag. Os destinos ficam no
 * detalhe (`DetalheDaCaixa`) — folha de baixo no celular, coluna ao lado no PC.
 * Quando o app já sabe a resposta, "Aceitar" resolve num toque; várias de uma
 * vez passam por uma lista de conferência. Tudo com "Desfazer".
 *
 * Embaixo, o que foi classificado nos últimos 30 dias — é de lá que se desfaz
 * ou se muda uma compra de gaveta (`mover_compra`, da Frente A).
 */
import { toast } from 'vue-sonner'
import { useMediaQuery } from '@vueuse/core'
import {
  ArrowLeftRightIcon,
  CheckCheckIcon,
  ChevronDownIcon,
  CreditCardIcon,
  InboxIcon,
  LandmarkIcon,
  LayersIcon,
  RefreshCwIcon,
  SlidersHorizontalIcon,
  Undo2Icon,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatarDia, hojeIso, nomeDoMes, primeiroDoMes } from '@/lib/datas'
import { formatarDinheiro } from '@/lib/dinheiro'
import { mensagemDeErro } from '@/lib/utils'
import { avisoDeMesAcertado, itensDaCaixa } from '~/lib/caixa-de-entrada'
import type { ItemDaCaixa, ModoClassificacao } from '~/lib/caixa-de-entrada'
import {
  FILTRO_INICIAL,
  aceitavel,
  contagemPorDia,
  filtrarCaixa,
  gruposPorDia,
  mesDoItem,
  mesesDaCaixa,
  recortarPorData,
  resumoDaCaixa,
  bancoDaConta,
  rotuloDaConta,
  textoParaSelo,
  valorDoItem,
} from '~/lib/caixa-lista'
import type { FiltroDaCaixa, Origem } from '~/lib/caixa-lista'
import { ROTULO_DESTINO_DA_REGRA, rotuloParaRegra, sugerirClassificacao } from '~/lib/auto-tag'
import type { Sugestao } from '~/lib/auto-tag'
import { seloDoBanco } from '~/lib/cartoes'
import { nomeDoBanco } from '~/lib/instituicoes'
import { useCategorias } from '~/composables/useOrcamento'
import { rateioIgual } from '~/types/orcamento'
import {
  useAcertosDoEspaco,
  useClassificadasRecentes,
  useClassificar,
  useRegrasClassificacao,
  useTransacoesDaCaixa,
} from '~/composables/useCaixaDeEntrada'
import type { LinhaClassificada, LinhaDaCaixa } from '~/composables/useCaixaDeEntrada'
import { useAceiteDaCaixa } from '~/composables/useAceiteDaCaixa'
import { useConciliacaoPix } from '~/composables/useConciliacaoPix'
import { useConexoesBancarias, useSincronizacaoInicial } from '~/composables/useContasBancarias'
import { aguardandoSincronizacaoInicial } from '~/lib/contas-bancarias'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'
import { rotuloDaCategoriaNaCaixa } from '~/lib/categorias-pluggy'

useHead({ title: 'Caixa de entrada · APPingos' })

const store = useSpaceStore()
const usuarioId = useUsuarioId()
const supabase = useSupabaseClient()

const { data: conexoes } = useConexoesBancarias()
const { data: transacoes, isPending } = useTransacoesDaCaixa()
const { data: classificadas } = useClassificadasRecentes()
const classificar = useClassificar()
const sincronizacaoInicial = useSincronizacaoInicial()
const { data: regras } = useRegrasClassificacao()
// As categorias do espaço ativo dão a grafia da sugestão na lista; o diálogo
// refaz a conta com as do espaço de destino.
const { data: categoriasDoEspaco } = useCategorias()

/*
 * A primeira leitura do extrato (90 dias) acontece sozinha no cron das 7h. Até
 * lá, quem acabou de conectar pode trazê-la agora — uma vez por conexão: depois
 * o ritmo é o diário do MeuPluggy, e o card some.
 */
const semSincronizacaoInicial = computed(() => aguardandoSincronizacaoInicial(conexoes.value ?? []))

async function sincronizarAgora() {
  try {
    const total = await sincronizacaoInicial.mutateAsync()
    toast.success(total === 1 ? '1 transação trazida do banco.' : `${total} transações trazidas do banco.`)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para sincronizar agora. O cron das 7h tenta de novo.'))
  }
}

// O Pix do acerto marca o mês como pago sozinho — ver useConciliacaoPix.
useConciliacaoPix(transacoes)

const itens = computed(() => itensDaCaixa(transacoes.value ?? []))
// Pendente não tem o que fazer até o banco lançar (no cartão, às vezes só no
// fechamento da fatura): fica num bloco recolhido no fim, para não empurrar
// para baixo o que dá para classificar agora.
const prontas = computed(() => itens.value.filter(i => !i.pendente))
const pendentes = computed(() => itens.value.filter(i => i.pendente))

/** A sugestão de cada compra pronta, pela `chave` do item. Entrada não tem: Salário e Meta não são "deste estabelecimento". */
const sugestoes = computed(() => {
  const mapa = new Map<string, Sugestao>()
  for (const item of prontas.value) {
    if (item.sentido !== 'saida') continue
    const s = sugerirClassificacao(item.principal, regras.value ?? [], categoriasDoEspaco.value ?? [])
    if (s) mapa.set(item.chave, s)
  }
  return mapa
})

// ---- de qual conta ------------------------------------------------------------

const contaDe = (contaId: string): LinhaDaCaixa['conta'] =>
  transacoes.value?.find(t => t.conta_id === contaId)?.conta ?? null
const nomeDaConta = (contaId: string) => contaDe(contaId)?.nome ?? ''
const rotuloDe = (item: ItemDaCaixa) => rotuloDaConta(contaDe(item.principal.conta_id), item.principal.cartao_final)
const bancoDe = (item: ItemDaCaixa) => bancoDaConta(contaDe(item.principal.conta_id))

/** As contas que têm algo na caixa — viram os chips de filtro, na cor do banco. */
const contasNaCaixa = computed(() => {
  const vistas = new Map<string, { id: string, rotulo: string, cor: string, tipo: 'conta' | 'cartao' }>()
  for (const item of prontas.value) {
    const id = item.principal.conta_id
    if (vistas.has(id)) continue
    const conta = contaDe(id)
    if (!conta) continue
    vistas.set(id, { id, rotulo: rotuloDaConta(conta), cor: seloDoBanco(bancoDaConta(conta)).cor, tipo: conta.tipo })
  }
  return [...vistas.values()]
})

// ---- filtros, resumo e grupos -------------------------------------------------

const filtro = ref<FiltroDaCaixa>({ ...FILTRO_INICIAL })
const mostrarPendentes = ref(true)

const ORIGENS: { valor: Origem, rotulo: string, icone: typeof CreditCardIcon }[] = [
  { valor: 'todas', rotulo: 'Todas', icone: LayersIcon },
  { valor: 'cartao', rotulo: 'Cartões', icone: CreditCardIcon },
  { valor: 'conta', rotulo: 'Contas', icone: LandmarkIcon },
]

function escolherOrigem(origem: Origem) {
  filtro.value = { ...filtro.value, origem, conta: null }
}

function escolherConta(id: string) {
  filtro.value = { ...filtro.value, conta: filtro.value.conta === id ? null : id }
}

const chipsVisiveis = computed(() =>
  contasNaCaixa.value.filter(c => filtro.value.origem === 'todas' || c.tipo === filtro.value.origem),
)

/** Origem, conta e "só com sugestão" — antes do recorte por data, para o calendário contar o que o filtro deixa ver. */
const filtradas = computed(() =>
  filtrarCaixa(prontas.value, filtro.value, id => contaDe(id)?.tipo ?? null, sugestoes.value),
)

// ---- a página do mês ----------------------------------------------------------

/*
 * A caixa abre no mês corrente: com o Open Finance ligado, a pergunta do dia a
 * dia é a fatura que está aberta, não o extrato inteiro. O que ficou para trás
 * está no calendário ("Também esperando"). `?mes=2026-10` abre outro mês, e
 * `?compra=<chave>` abre direto numa compra — é o caminho do Chico Moedas.
 */
const route = useRoute()
const router = useRouter()

function mesDaUrl(): string | null {
  const valor = route.query.mes
  return typeof valor === 'string' && /^\d{4}-\d{2}$/.test(valor) ? `${valor}-01` : null
}

const mes = ref(mesDaUrl() ?? primeiroDoMes(hojeIso()))
const dia = ref<string | null>(null)

// O mês vai para a URL: voltar de outra tela (ou recarregar) cai na mesma página.
watch(mes, (m) => {
  const { compra: _, ...resto } = route.query
  router.replace({ query: { ...resto, mes: m.slice(0, 7) } })
})

const mesesComAlgo = computed(() => mesesDaCaixa(filtradas.value))
const contagens = computed(() => contagemPorDia(filtradas.value, mes.value))

const visiveis = computed(() => recortarPorData(filtradas.value, mes.value, dia.value))
const pendentesDoMes = computed(() => recortarPorData(pendentes.value, mes.value, null))

/** "em novembro", ou "em 16 de novembro" com um dia marcado. */
const periodo = computed(() => (dia.value ? formatarDia(dia.value) : nomeDoMes(mes.value).toLowerCase()))

const resumo = computed(() => resumoDaCaixa(visiveis.value))
const hoje = hojeIso()
const grupos = computed(() => gruposPorDia(visiveis.value, hoje))

// ---- Aceitar ------------------------------------------------------------------

const aceite = useAceiteDaCaixa()

/*
 * Mês já acertado no casal: o diálogo avisa antes de mexer no saldo. O Aceitar
 * não tem tela para avisar, então nesse caso ele some e a compra vai pelo
 * detalhe, como antes.
 */
const { data: acertos } = useAcertosDoEspaco(() => aceite.espacoCasal.value?.id ?? null)

function avisoDoAceite(item: ItemDaCaixa): string | null {
  const s = sugestoes.value.get(item.chave)
  if (!aceitavel(s) || s.destino !== 'casal') return null
  return avisoDeMesAcertado(item.plano, acertos.value ?? [])
}

function podeAceitar(item: ItemDaCaixa): boolean {
  return aceitavel(sugestoes.value.get(item.chave)) && !avisoDoAceite(item)
}

const aceitaveis = computed(() => visiveis.value.filter(podeAceitar))

async function aceitar(item: ItemDaCaixa) {
  const s = sugestoes.value.get(item.chave)
  if (!aceitavel(s)) return abrir(item)
  await aceite.aceitar(item, s)
}

async function ignorar(item: ItemDaCaixa) {
  await aceite.ignorar(item, sugestoes.value.get(item.chave))
}

const conferindoLote = ref(false)

async function aceitarLote() {
  const pares = aceitaveis.value.flatMap((item) => {
    const s = sugestoes.value.get(item.chave)
    return aceitavel(s) ? [{ item, sugestao: s }] : []
  })
  conferindoLote.value = false
  await aceite.aceitarTodos(pares)
}

const resumoDaSugestao = (s: Sugestao | undefined) =>
  s ? [s.destino ? ROTULO_DESTINO_DA_REGRA[s.destino] : null, s.categoriaNome].filter(Boolean).join(' · ') : ''

// ---- detalhe ------------------------------------------------------------------

/*
 * No PC o detalhe é uma coluna fixa ao lado da lista; no celular, uma folha que
 * sobe de baixo. A seleção é pela chave, e não pelo objeto: classificar faz o
 * item sumir da lista, e no PC o próximo assume o lugar dele.
 */
const largo = useMediaQuery('(min-width: 1024px)')
const selecionada = ref<string | null>(null)
const itemSelecionado = computed(() => visiveis.value.find(i => i.chave === selecionada.value) ?? null)

const emClassificacao = ref<{ item: ItemDaCaixa, modo: ModoClassificacao } | null>(null)

const folhaAberta = computed({
  get: () => !largo.value && !!itemSelecionado.value && !emClassificacao.value,
  set: (v: boolean) => { if (!v) selecionada.value = null },
})

watch([visiveis, largo], ([lista], anterior) => {
  if (!largo.value) return
  if (selecionada.value && lista.some(i => i.chave === selecionada.value)) return
  // O selecionado sumiu (foi classificado): o vizinho de baixo assume.
  const listaAnterior = anterior?.[0] as ItemDaCaixa[] | undefined
  const antes = listaAnterior?.findIndex(i => i.chave === selecionada.value) ?? -1
  selecionada.value = (lista[Math.max(0, antes)] ?? lista[0])?.chave ?? null
}, { immediate: true })

/*
 * `?compra=<chave>`: quando a lista chega, a página vai para o mês da compra e
 * ela fica selecionada — no celular, a folha do detalhe já sobe aberta. Uma vez
 * só: depois disso a seleção é da pessoa.
 */
const compraDaUrl = typeof route.query.compra === 'string' ? route.query.compra : null
if (compraDaUrl) {
  const parar = watch(prontas, (lista) => {
    if (!lista.length) return
    const alvo = lista.find(i => i.chave === compraDaUrl)
    if (alvo) {
      mes.value = mesDoItem(alvo)
      selecionada.value = alvo.chave
    }
    queueMicrotask(() => parar())
  }, { immediate: true })
}

function abrir(item: ItemDaCaixa, modo?: ModoClassificacao) {
  if (modo) emClassificacao.value = { item, modo }
  else selecionada.value = item.chave
}

/** Ao fechar o diálogo de um destino, no celular a folha também fecha: a compra foi resolvida (ou a pessoa desistiu). */
function fecharClassificacao() {
  emClassificacao.value = null
  if (!largo.value) selecionada.value = null
}

async function devolver(linha: LinhaClassificada) {
  try {
    await classificar.mutateAsync({ tipo: 'devolver', transacao: linha.id })
    /*
     * O Pix do acerto marcou o mês como pago, e devolver não desmarca: o mês pode já
     * estar pago à mão antes do Pix, e o acerto não guarda quem o marcou. A tela diz
     * onde desfazer, em vez de deixar o "pago" parecer obra do Pix ainda.
     */
    if (linha.motivo_exclusao === 'acerto') {
      toast.success('De volta à caixa. O mês continua marcado como pago — desfaça em Chico Moedas se o Pix não era o acerto.')
    }
    else {
      toast.success('De volta à caixa de entrada.')
    }
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para desfazer.'))
  }
}

/*
 * Mudar de gaveta: do casal para o pessoal (com 100% seu), ou do pessoal para o
 * primeiro espaço de casal, com metade para cada membro (`rateioIgual`).
 */
const pessoal = computed(() => store.espacos.find(e => e.tipo === 'pessoal') ?? null)
const casais = computed(() => store.espacos.filter(e => e.tipo === 'casal'))

function destinoDaMudanca(linha: LinhaClassificada) {
  if (!linha.compra) return null
  if (linha.compra.space_id === pessoal.value?.id) return casais.value[0] ?? null
  return pessoal.value
}

async function mover(linha: LinhaClassificada) {
  const destino = destinoDaMudanca(linha)
  if (!linha.compra || !destino || !usuarioId.value) return
  try {
    let participantes = rateioIgual([usuarioId.value])
    if (destino.tipo === 'casal') {
      const { data, error } = await supabase.from('membership').select('user_id').eq('space_id', destino.id)
      if (error) throw error
      participantes = rateioIgual((data ?? []).map(m => m.user_id))
    }
    await classificar.mutateAsync({ tipo: 'reclassificar', compra: linha.compra.id, space: destino.id, participantes })
    toast.success(`Movida para ${destino.nome}.`)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para mover a compra.'))
  }
}

const ROTULO_DESTINO: Record<string, string> = {
  compra: 'Compra',
  ignorada: 'Ignorada',
  renda: 'Salário',
  aporte: 'Meta',
}

const ROTULO_MOTIVO: Record<string, string> = {
  pagamento_fatura: 'pagamento de fatura',
  transferencia_propria: 'entre contas suas',
  valor_zero: 'valor zero',
  acerto: 'Pix do acerto do mês',
}

const nomeDoEspaco = (id: string) => store.espacos.find(e => e.id === id)?.nome ?? 'espaço'
</script>

<template>
  <div class="space-y-6">
    <OrcamentosAbas subtitulo="O extrato que chegou do banco, esperando um destino. Só você vê." />
    <OpenFinanceSecoes />

    <Card v-if="conexoes && !conexoes.length">
      <CardContent class="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p class="text-muted-foreground">
          Nenhum banco conectado. Conectando, as compras chegam sozinhas aqui — e você decide com
          um toque se são do casal ou só suas.
        </p>
        <Button as-child variant="secondary">
          <NuxtLink to="/orcamentos/open-finance/como-funciona">Como conectar</NuxtLink>
        </Button>
      </CardContent>
    </Card>

    <Card v-if="semSincronizacaoInicial.length">
      <CardContent class="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p class="text-muted-foreground">
          <template v-if="semSincronizacaoInicial.length === 1">
            O extrato de {{ nomeDoBanco(semSincronizacaoInicial[0], semSincronizacaoInicial[0]!.banco) }} ainda não chegou.
          </template>
          <template v-else>
            O extrato de {{ semSincronizacaoInicial.length }} bancos ainda não chegou.
          </template>
          Os últimos 90 dias chegam sozinhos na sincronização das 7h — ou traga agora.
        </p>
        <Button :disabled="sincronizacaoInicial.isPending.value" class="gap-1.5" @click="sincronizarAgora">
          <RefreshCwIcon class="size-4" :class="sincronizacaoInicial.isPending.value ? 'animate-spin' : ''" />
          {{ sincronizacaoInicial.isPending.value ? 'Trazendo o extrato…' : 'Trazer agora' }}
        </Button>
      </CardContent>
    </Card>

    <div v-if="isPending" class="space-y-2">
      <Skeleton v-for="i in 3" :key="i" class="h-16 w-full" />
    </div>

    <Card v-else-if="!itens.length && conexoes?.length && !semSincronizacaoInicial.length">
      <CardContent class="flex items-center gap-3 text-sm text-muted-foreground">
        <InboxIcon class="size-5" />
        Nada esperando. O extrato novo chega uma vez por dia.
      </CardContent>
    </Card>

    <Card v-else-if="!prontas.length && pendentes.length">
      <CardContent class="flex items-center gap-3 text-sm text-muted-foreground">
        <InboxIcon class="size-5" />
        Nada pronto para classificar. O que está pendente no banco aparece aqui quando for lançado.
      </CardContent>
    </Card>

    <template v-if="!isPending && prontas.length">
      <!--
        O resumo e as ações do conjunto: quanto está parado, aceitar o que o app
        já sabe, e os ajustes da vista.
      -->
      <section class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-2xl font-semibold tabular-nums">{{ formatarDinheiro(resumo.total) }}</p>
          <p class="text-sm text-muted-foreground">
            em {{ resumo.quantidade }} {{ resumo.quantidade === 1 ? 'compra' : 'compras' }} esperando destino em {{ periodo }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Button v-if="aceitaveis.length" class="gap-1.5" :disabled="aceite.ocupado.value" @click="conferindoLote = true">
            <CheckCheckIcon class="size-4" />
            Aceitar {{ aceitaveis.length }} {{ aceitaveis.length === 1 ? 'sugestão' : 'sugestões' }}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline" size="icon" aria-label="Ajustes da lista">
                <SlidersHorizontalIcon class="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-56">
              <DropdownMenuLabel>Mostrar</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                :model-value="filtro.soComSugestao"
                @update:model-value="(v: boolean) => filtro = { ...filtro, soComSugestao: v }"
              >
                Só com sugestão
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                :model-value="mostrarPendentes"
                @update:model-value="(v: boolean) => mostrarPendentes = v"
              >
                Pendentes no banco
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </section>

      <!-- De onde veio: o tipo, e cada cartão ou conta na cor do banco. -->
      <section class="space-y-2">
        <nav class="flex gap-1 rounded-xl border bg-card p-1 text-sm" aria-label="Origem">
          <button
            v-for="o in ORIGENS"
            :key="o.valor"
            type="button"
            class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors"
            :class="filtro.origem === o.valor ? 'bg-primary/15 text-primary ring-1 ring-primary/40' : 'text-muted-foreground hover:text-foreground'"
            :aria-pressed="filtro.origem === o.valor"
            @click="escolherOrigem(o.valor)"
          >
            <component :is="o.icone" class="size-4" />
            {{ o.rotulo }}
          </button>
        </nav>
        <div v-if="chipsVisiveis.length > 1" class="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          <button
            v-for="c in chipsVisiveis"
            :key="c.id"
            type="button"
            class="flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
            :class="filtro.conta === c.id ? 'border-primary/50 bg-primary/10 text-foreground' : 'text-muted-foreground hover:text-foreground'"
            :aria-pressed="filtro.conta === c.id"
            @click="escolherConta(c.id)"
          >
            <span class="size-2 rounded-full" :style="{ backgroundColor: c.cor }" />
            {{ c.rotulo }}
          </button>
        </div>
      </section>

      <!--
        No PC, a lista e, à direita, o calendário do mês com o detalhe embaixo;
        no celular, o calendário vem antes da lista e o detalhe sobe numa folha.
      -->
      <div class="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div class="space-y-4">
          <CalendarioDaCaixa
            v-if="!largo"
            v-model:mes="mes"
            v-model:dia-selecionado="dia"
            :contagens="contagens"
            :meses="mesesComAlgo"
          />

          <p v-if="!visiveis.length" class="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
            <template v-if="filtro.origem !== 'todas' || filtro.conta || filtro.soComSugestao">Nada com esse filtro em {{ periodo }}.</template>
            <template v-else>Nada esperando destino em {{ periodo }}.</template>
          </p>

          <section v-for="grupo in grupos" :key="grupo.dia">
            <h2 class="sticky top-[calc(3.6rem+env(safe-area-inset-top))] z-10 -mx-1 mb-1.5 bg-background/80 px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur md:top-0">
              {{ grupo.rotulo }}
            </h2>
            <ul class="divide-y overflow-hidden rounded-xl border bg-card">
              <LinhaDaCaixa
                v-for="item in grupo.itens"
                :key="item.chave"
                :item="item"
                :sugestao="sugestoes.get(item.chave) ?? null"
                :pode-aceitar="podeAceitar(item)"
                :banco="bancoDe(item)"
                :conta="rotuloDe(item)"
                :selecionada="largo && selecionada === item.chave"
                :ocupado="aceite.ocupado.value"
                @abrir="abrir(item)"
                @aceitar="aceitar(item)"
                @ignorar="ignorar(item)"
              />
            </ul>
          </section>
        </div>

        <aside v-if="largo" class="sticky top-4 max-h-[calc(100dvh-2rem)] space-y-4 overflow-y-auto [scrollbar-width:thin]">
          <CalendarioDaCaixa
            v-model:mes="mes"
            v-model:dia-selecionado="dia"
            :contagens="contagens"
            :meses="mesesComAlgo"
          />
          <div class="rounded-xl border bg-card p-4">
            <DetalheDaCaixa
              v-if="itemSelecionado"
              :item="itemSelecionado"
              :sugestao="sugestoes.get(itemSelecionado.chave) ?? null"
              :pode-aceitar="podeAceitar(itemSelecionado)"
              :aviso-do-aceite="avisoDoAceite(itemSelecionado)"
              :banco="bancoDe(itemSelecionado)"
              :conta="rotuloDe(itemSelecionado)"
              :ocupado="aceite.ocupado.value"
              @escolher="(modo) => abrir(itemSelecionado!, modo)"
              @aceitar="aceitar(itemSelecionado!)"
              @ignorar="ignorar(itemSelecionado!)"
            />
            <p v-else class="py-10 text-center text-sm text-muted-foreground">Escolha uma compra na lista.</p>
          </div>
        </aside>
      </div>
    </template>

    <!-- No celular, o detalhe sobe de baixo. -->
    <Dialog v-model:open="folhaAberta">
      <DialogContent
        v-if="itemSelecionado"
        class="top-auto bottom-0 left-0 max-h-[88dvh] max-w-full translate-x-0 translate-y-0 overflow-y-auto rounded-b-none rounded-t-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 sm:max-w-full"
      >
        <DialogTitle class="sr-only">{{ rotuloParaRegra(itemSelecionado.principal) }}</DialogTitle>
        <DialogDescription class="sr-only">Detalhes da compra e para onde ela vai.</DialogDescription>
        <div class="mx-auto -mt-2 mb-1 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true" />
        <DetalheDaCaixa
          :item="itemSelecionado"
          :sugestao="sugestoes.get(itemSelecionado.chave) ?? null"
          :pode-aceitar="podeAceitar(itemSelecionado)"
          :aviso-do-aceite="avisoDoAceite(itemSelecionado)"
          :banco="bancoDe(itemSelecionado)"
          :conta="rotuloDe(itemSelecionado)"
          :ocupado="aceite.ocupado.value"
          @escolher="(modo) => abrir(itemSelecionado!, modo)"
          @aceitar="() => { const i = itemSelecionado!; selecionada = null; aceitar(i) }"
          @ignorar="() => { const i = itemSelecionado!; selecionada = null; ignorar(i) }"
        />
      </DialogContent>
    </Dialog>

    <!-- Aceitar em lote: a lista de conferência é o toque humano de cada uma. -->
    <Dialog v-model:open="conferindoLote">
      <DialogContent class="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Aceitar {{ aceitaveis.length }} {{ aceitaveis.length === 1 ? 'sugestão' : 'sugestões' }}</DialogTitle>
          <DialogDescription>
            Cada compra vai para o destino e a categoria abaixo — como nas outras vezes. Dá para desfazer em seguida.
          </DialogDescription>
        </DialogHeader>
        <ul class="divide-y rounded-lg border text-sm">
          <li v-for="item in aceitaveis" :key="item.chave" class="flex items-center gap-3 px-3 py-2">
            <IconeDaCompra :descricao="textoParaSelo(item.principal)" :categoria="sugestoes.get(item.chave)?.categoriaNome" tamanho="sm" />
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{ rotuloParaRegra(item.principal) }}</span>
              <span class="block truncate text-xs text-muted-foreground">{{ resumoDaSugestao(sugestoes.get(item.chave)) }}</span>
            </span>
            <span class="shrink-0 tabular-nums">{{ formatarDinheiro(valorDoItem(item)) }}</span>
          </li>
        </ul>
        <DialogFooter>
          <Button variant="ghost" @click="conferindoLote = false">Cancelar</Button>
          <Button class="gap-1.5" :disabled="aceite.ocupado.value" @click="aceitarLote">
            <CheckCheckIcon class="size-4" />
            Lançar todas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <PagamentosDeFatura v-if="!isPending" :mes="mes" />

    <details v-if="!isPending && pendentesDoMes.length && mostrarPendentes" class="group rounded-lg border bg-card">
      <summary class="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm">
        <span>
          <span class="font-medium">Pendentes no banco em {{ nomeDoMes(mes).toLowerCase() }} ({{ pendentesDoMes.length }})</span>
          <span class="block text-xs text-muted-foreground">Dá para classificar quando o banco lançar — no cartão, às vezes só no fechamento da fatura.</span>
        </span>
        <ChevronDownIcon class="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ul class="divide-y border-t">
        <li v-for="item in pendentesDoMes" :key="item.chave" class="flex items-baseline justify-between gap-3 px-3 py-2">
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm">{{ item.plano.descricao }}</p>
            <p class="text-xs text-muted-foreground">
              {{ formatarDia(item.data) }} · {{ nomeDaConta(item.principal.conta_id) }}
              <template v-if="rotuloDaCategoriaNaCaixa(item.principal.categoria_pluggy)"> · {{ rotuloDaCategoriaNaCaixa(item.principal.categoria_pluggy) }}</template>
            </p>
          </div>
          <span class="shrink-0 text-sm tabular-nums" :class="item.sentido === 'entrada' ? 'text-emerald-600 dark:text-emerald-400' : ''">
            {{ item.sentido === 'entrada' ? '+' : '' }}{{ formatarDinheiro(item.transacoes.reduce((s, t) => s + Number(t.valor), 0)) }}
          </span>
        </li>
      </ul>
    </details>

    <section v-if="classificadas?.length" class="space-y-2">
      <h2 class="text-sm font-medium text-muted-foreground">Classificadas nos últimos 30 dias</h2>
      <ul class="divide-y rounded-lg border bg-card text-sm">
        <!--
          No celular a descrição ocupa a linha inteira e o selo e as ações descem para
          a de baixo: lado a lado, a descrição era cortada até sumir.
        -->
        <li v-for="linha in classificadas" :key="linha.id" class="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
          <div class="min-w-0 basis-full sm:basis-0 sm:flex-1">
            <p class="truncate">{{ linha.descricao }}</p>
            <p class="text-xs text-muted-foreground">{{ formatarDia(linha.data) }} · {{ formatarDinheiro(Number(linha.valor)) }}</p>
          </div>
          <span class="rounded-full bg-muted px-2 py-0.5 text-xs">
            {{ ROTULO_DESTINO[linha.destino ?? ''] }}
            <template v-if="linha.compra"> · {{ nomeDoEspaco(linha.compra.space_id) }}</template>
            <template v-if="linha.motivo_exclusao && linha.destino === 'ignorada'"> · {{ ROTULO_MOTIVO[linha.motivo_exclusao] }}</template>
          </span>
          <Button
            v-if="linha.compra && destinoDaMudanca(linha)"
            size="sm"
            variant="ghost"
            class="gap-1"
            :disabled="classificar.isPending.value"
            @click="mover(linha)"
          >
            <ArrowLeftRightIcon class="size-3.5" />
            Mover para {{ destinoDaMudanca(linha)!.nome }}
          </Button>
          <Button
            v-if="linha.destino === 'ignorada' || linha.destino === 'renda' || linha.destino === 'aporte' || (linha.destino === 'compra' && linha.compra)"
            size="sm"
            variant="ghost"
            class="gap-1"
            :disabled="classificar.isPending.value"
            @click="devolver(linha)"
          >
            <Undo2Icon class="size-3.5" />
            Devolver à caixa
          </Button>
        </li>
      </ul>
    </section>

    <ClassificarDialogo
      :item="emClassificacao?.item ?? null"
      :modo="emClassificacao?.modo ?? null"
      @fechar="fecharClassificacao"
    />
  </div>
</template>
