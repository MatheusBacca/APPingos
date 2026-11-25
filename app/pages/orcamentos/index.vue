<script setup lang="ts">
/**
 * Orçamentos › Painel — todos os números do módulo numa tela só.
 *
 * Cada cartão é um atalho para a tela que detalha o seu número (Chico Moedas,
 * Planejamento, Open Finance, Objetivos), e leva junto o mês que está na tela.
 * O painel não tem conta própria para nada que já tenha dono: gasto do mês,
 * projeções, faturas, acerto e investimentos vêm das mesmas funções e consultas
 * das telas de detalhe — e, pelo cache do vue-query, chegar numa delas a partir
 * daqui não refaz a consulta.
 *
 * Duas famílias de dado convivem aqui, e a tela diz qual é qual:
 *   - do espaço (compras, acerto, metas do espaço) — quem divide o espaço vê;
 *   - da pessoa (salário, Open Finance, gastos pessoais) — só quem está logado.
 *
 * O único botão do topo é o "Como funciona". A ação de todo dia, lançar uma
 * compra, fica no cartão de Gastos (e flutuando no celular).
 */
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowLeftRightIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleHelpIcon,
  CreditCardIcon,
  HandCoinsIcon,
  PieChartIcon,
  PlusIcon,
  ReceiptIcon,
  TargetIcon,
  TrendingUpIcon,
  WalletIcon,
  BarChart3Icon,
  GaugeIcon,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarInstante, formatarMes, hojeIso, mesAbreviado, nomeDoMes, partesDaData, primeiroDoMes, somarMeses, tempoRelativo } from '@/lib/datas'
import { formatarDinheiro, formatarPercentual } from '@/lib/dinheiro'
import { seloDoBanco } from '~/lib/cartoes'
import { resumoPorBanco, saldoDaCaixinha } from '~/lib/investimentos'
import { aplicadoNasCaixinhas, competenciaDaUrl, corDeDado, etiquetaDaMovimentacao, fracaoDoMes, mesNaUrl, quandoFoi, repartirSalario, ritmoDoMes, saldoDasContas, semanasDoPlanejado, variacaoEntre } from '~/lib/painel-orcamentos'
import { bancoDaConta, textoParaSelo } from '~/lib/caixa-lista'
import { rotuloParaRegra } from '~/lib/auto-tag'
import { CLASSE_BARRA, CLASSE_BARRA_SEM_CATEGORIA, gastoPorCategoria, meuBolso, saldoDoMes, totalDoMes } from '~/types/orcamento'
import { progressoDaMeta } from '~/types/meta'
import type { Barra } from '~/components/GraficoBarras.vue'
import { useCaixinhas, useInvestimentosDosBancos } from '~/composables/useCaixinhas'
import { useCartoes, useQuantasNaCaixa } from '~/composables/useCartoes'
import { useMovimentacoesRecentes } from '~/composables/useCaixaDeEntrada'
import { useConexoesBancarias } from '~/composables/useContasBancarias'
import { useGastosPessoais } from '~/composables/useGastosPessoais'
import { useMembros } from '~/composables/useMembros'
import { useMetas } from '~/composables/useMetas'
import { useAcertos, useCategorias, useComprasDoMes, useSerieMensal } from '~/composables/useOrcamento'
import { useProjecoesDoMes } from '~/composables/useProjecoesDoMes'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'

// Tela de dado: ocupa a largura inteira no computador (ver layouts/default.vue).
definePageMeta({ larguraAmpla: true })

useHead({ title: 'Orçamentos · APPingos' })

const store = useSpaceStore()
const route = useRoute()
const usuarioId = useUsuarioId()
const { data: membros } = useMembros()

const mesCorrente = computed(() => primeiroDoMes(hojeIso()))
const competencia = ref(competenciaDaUrl(route.query.mes) ?? mesCorrente.value)

const situacao = computed(() => {
  if (competencia.value < mesCorrente.value) return 'fechado'
  if (competencia.value > mesCorrente.value) return 'futuro'
  return 'aberto'
})

/** O destino de um atalho, com o mês da tela — o detalhe abre onde o painel estava. */
const comMes = (caminho: string, ancora = '') => `${caminho}?mes=${mesNaUrl(competencia.value)}${ancora}`

const comoFunciona = ref(false)

// ---- Gastos -------------------------------------------------------------------

/*
 * As compras pessoais entram sempre que existe a gaveta pessoal (e ela não é a
 * ativa): o "Meu bolso" é um número do painel, e não depende do alternador de
 * Chico Moedas.
 */
const { espacoPessoalId, disponivel: temGavetaPessoal } = useGastosPessoais()
const gavetaPessoal = computed(() => (temGavetaPessoal.value ? espacoPessoalId.value : null))

const { data: compras, isPending: carregandoCompras } = useComprasDoMes(competencia)
const { data: pessoais } = useComprasDoMes(competencia, gavetaPessoal)

/** Um ano para trás e três meses à frente: cobre os três recortes do gráfico. */
const JANELA = { antes: 11, depois: 3 }
const { data: serie, isFetching: buscandoSerie } = useSerieMensal(competencia, JANELA)
const { data: seriePessoal } = useSerieMensal(competencia, JANELA, gavetaPessoal)

const gastoDoEspaco = computed(() => totalDoMes(compras.value ?? []))
const bolso = computed(() => meuBolso(compras.value ?? [], pessoais.value ?? [], usuarioId.value))

const pessoalPorMes = computed(() => new Map((seriePessoal.value ?? []).map(p => [p.competencia, p.total])))
const totalDoPonto = (mes: string, valor: number) => valor + (pessoalPorMes.value.get(mes) ?? 0)

/** O mês da tela contra o anterior, pelo total exibido (espaço + pessoal). */
const variacaoDosGastos = computed(() => {
  const pontos = serie.value ?? []
  const i = pontos.findIndex(p => p.competencia === competencia.value)
  if (i < 1) return null
  return variacaoEntre(
    totalDoPonto(pontos[i]!.competencia, pontos[i]!.total),
    totalDoPonto(pontos[i - 1]!.competencia, pontos[i - 1]!.total),
  )
})

/** A minicurva do cartão: os seis meses até o da tela. */
const curvaDosGastos = computed(() => {
  const pontos = (serie.value ?? []).filter(p => p.competencia <= competencia.value).slice(-6)
  return pontos.map(p => totalDoPonto(p.competencia, p.total))
})

function caminhoDaCurva(valores: number[], largura = 96, altura = 28): string {
  if (valores.length < 2) return ''
  const max = Math.max(...valores, 1)
  const passo = largura / (valores.length - 1)
  return valores
    .map((v, i) => `${i ? 'L' : 'M'}${(i * passo).toFixed(1)},${(altura - (v / max) * (altura - 2) - 1).toFixed(1)}`)
    .join(' ')
}

const RECORTES = [
  { meses: 3, rotulo: '3 meses' },
  { meses: 6, rotulo: '6 meses' },
  { meses: 12, rotulo: '1 ano' },
]
const recorte = ref(6)

/**
 * As barras do recorte: N meses até o da tela, mais os três à frente que as
 * parcelas já comprometeram — a mesma leitura de "Por mês" em Chico Moedas.
 */
const barras = computed<Barra[]>(() => {
  const desde = somarMeses(competencia.value, -(recorte.value - 1))
  const pontos = (serie.value ?? []).filter(p => p.competencia >= desde)
  return pontos.map((p, i) => {
    const anterior = pontos[i - 1]
    return {
      chave: p.competencia,
      rotulo: mesAbreviado(p.competencia),
      rotuloLongo: formatarMes(p.competencia),
      valor: p.total,
      valorSecundario: pessoalPorMes.value.get(p.competencia) ?? 0,
      tom: p.competencia < mesCorrente.value ? 'passado' : p.competencia > mesCorrente.value ? 'futuro' : 'atual',
      detalhe: `Sua parte do espaço: ${formatarDinheiro(p.minhaParte)}`,
      variacao: variacaoEntre(
        totalDoPonto(p.competencia, p.total),
        anterior ? totalDoPonto(anterior.competencia, anterior.total) : undefined,
      ),
    }
  })
})

// ---- Nova compra --------------------------------------------------------------

const { data: categorias } = useCategorias()
const { data: categoriasPessoais } = useCategorias(espacoPessoalId)
const dialogoDaCompra = ref(false)

// ---- Planejamento -------------------------------------------------------------

const {
  espacoCasal,
  meuMes,
  carregandoMeuMes,
  mesDoCasal,
  aportesDoCasal,
  comprasPessoais,
  aportesPessoais,
  comprasDoCasal,
} = useProjecoesDoMes(competencia)

const passouDoMes = computed(() => fracaoDoMes(competencia.value, hojeIso()))

/** A projeção do cartão grande: a sua quando há salário, senão a do casal. */
const projecaoPrincipal = computed(() => meuMes.value ?? (espacoCasal.value ? mesDoCasal.value : null))

const ritmo = computed(() => {
  const p = projecaoPrincipal.value
  if (!p || situacao.value !== 'aberto' || !Number.isFinite(p.uso)) return null
  return ritmoDoMes(p.uso, passouDoMes.value)
})

/** O anel do cartão: até 100%, e a cor diz quando passou. */
const ANEL = 2 * Math.PI * 44
const arcoDoAnel = computed(() => {
  const uso = projecaoPrincipal.value?.uso ?? 0
  return `${Math.min(Number.isFinite(uso) ? uso : 1, 1) * ANEL} ${ANEL}`
})

/**
 * As linhas do realizado da projeção do cartão, com o dia de cada uma: as
 * compras do mês (pela data da compra) e os aportes nas metas daquela gaveta.
 */
const lancamentosDaProjecao = computed(() => {
  const compras = meuMes.value ? comprasPessoais.value : comprasDoCasal.value
  const aportes = meuMes.value ? aportesPessoais.value : aportesDoCasal.value
  return [
    ...(compras ?? []).map(c => ({ valor: c.valor, data: c.data_compra })),
    ...(aportes ?? []).map(a => ({ valor: a.valor, data: a.data })),
  ]
})

const semanas = computed(() => semanasDoPlanejado({
  competencia: competencia.value,
  planejado: projecaoPrincipal.value?.planejado ?? 0,
  lancamentos: lancamentosDaProjecao.value,
  hoje: hojeIso(),
  mesCurto: mesAbreviado(competencia.value),
}))

/**
 * A situação do planejado no mês inteiro, que dá a cor do anel e do recado:
 * abaixo do ritmo do calendário é verde, no ritmo é laranja, e na frente dele —
 * ou já passado do planejado — é vermelho. Um mês fechado é medido contra o mês
 * todo; um mês futuro só tem parcelas já comprometidas, e só fica vermelho se
 * elas já passarem do planejado.
 */
const situacaoDoPlano = computed<'folgado' | 'no-ritmo' | 'acima' | 'estourou'>(() => {
  const p = projecaoPrincipal.value
  if (!p) return 'folgado'
  if (p.sobra < 0 || !Number.isFinite(p.uso)) return 'estourou'
  if (situacao.value === 'futuro') return 'folgado'
  return ritmoDoMes(p.uso, passouDoMes.value)
})

const TOM_DO_PLANO = {
  'folgado': {
    titulo: 'Você está no caminho certo!',
    icone: TrendingUpIcon,
    anel: 'stroke-emerald-500',
    recado: 'border-emerald-500/30 bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100',
  },
  'no-ritmo': {
    titulo: 'Na meta: o gasto acompanha o mês.',
    icone: GaugeIcon,
    anel: 'stroke-orange-500',
    recado: 'border-orange-500/30 bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100',
  },
  'acima': {
    titulo: 'Acima do ritmo: o gasto está na frente do mês.',
    icone: AlertTriangleIcon,
    anel: 'stroke-red-500',
    recado: 'border-red-500/30 bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100',
  },
  'estourou': {
    titulo: 'O mês passou do planejado.',
    icone: AlertTriangleIcon,
    anel: 'stroke-red-500',
    recado: 'border-red-500/30 bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100',
  },
} as const

// ---- Open Finance: contas, faturas, investimentos ------------------------------

const { data: conexoes, isPending: carregandoConexoes } = useConexoesBancarias()
const contas = computed(() => saldoDasContas(conexoes.value ?? []))

const { data: cartoes, isPending: carregandoCartoes } = useCartoes()
const { data: naCaixa } = useQuantasNaCaixa()

const CLASSE_DA_FAIXA = {
  tranquilo: 'text-muted-foreground',
  atencao: 'text-amber-600 dark:text-amber-400',
  alerta: 'text-red-600 dark:text-red-400',
} as const

const { data: caixinhas } = useCaixinhas()
const { data: posicoes, isPending: carregandoPosicoes } = useInvestimentosDosBancos()

const bancosInvestidos = computed(() => resumoPorBanco(posicoes.value ?? []))

/* As caixinhas do espaço pessoal e do ativo — a mesma régua do Planejamento. */
const caixinhasVisiveis = computed(() =>
  (caixinhas.value ?? []).filter(c => !c.arquivada && (c.space_id === espacoPessoalId.value || c.space_id === store.espacoAtivoId)),
)

/**
 * O total investido. As posições dos bancos são o saldo de verdade; as caixinhas
 * são rótulos sobre esse mesmo dinheiro ("para quê"), então somar as duas
 * contaria duas vezes. Só sem banco conectado é que a soma das caixinhas vale.
 */
const investimentos = computed(() => {
  const bancos = bancosInvestidos.value
  if (bancos.length) {
    const saldo = bancos.reduce((s, b) => s + b.saldo, 0)
    const aplicado = bancos.reduce((s, b) => s + b.aplicado, 0)
    return { total: saldo, rendimento: saldo - aplicado, origem: 'bancos' as const }
  }
  if (caixinhasVisiveis.value.length) {
    return { total: caixinhasVisiveis.value.reduce((s, c) => s + saldoDaCaixinha(c), 0), rendimento: null, origem: 'caixinhas' as const }
  }
  return null
})

/** A rosca: um arco por banco, na cor do banco. */
const RAIO_ROSCA = 30
const VOLTA_ROSCA = 2 * Math.PI * RAIO_ROSCA
const arcosDaRosca = computed(() => {
  const total = bancosInvestidos.value.reduce((s, b) => s + b.saldo, 0)
  if (!total) return []
  let deslocamento = 0
  return bancosInvestidos.value.map((b) => {
    const comprimento = (b.saldo / total) * VOLTA_ROSCA
    const arco = { banco: b.banco, cor: corDeDado(seloDoBanco(b.banco).cor) ?? 'currentColor', fracao: b.saldo / total, traco: `${comprimento} ${VOLTA_ROSCA}`, deslocamento: -deslocamento }
    deslocamento += comprimento
    return arco
  })
})

// ---- A pizza do salário --------------------------------------------------------

/**
 * O investido DO MÊS (não o patrimônio): os aportes nas suas metas pessoais, os
 * seus aportes nas metas do casal e o que você aplicou direto nas caixinhas.
 */
const investidoNoMes = computed(() => {
  const pessoais = meuMes.value?.aportes ?? 0
  const noCasal = (aportesDoCasal.value ?? [])
    .filter(a => a.user_id === usuarioId.value)
    .reduce((s, a) => s + a.valor, 0)
  return pessoais + noCasal + aplicadoNasCaixinhas(caixinhasVisiveis.value, competencia.value, usuarioId.value)
})

/**
 * O salário repartido em Faturas · Investido · Livre.
 *
 * Só no mês corrente: as faturas abertas são as do ciclo de hoje, e pô-las
 * contra o salário de outro mês seria juntar dois recortes que não conversam.
 */
const salarioRepartido = computed(() => {
  if (situacao.value !== 'aberto' || !meuMes.value) return null
  return repartirSalario({
    salario: meuMes.value.salario,
    faturas: cartoes.value?.total ?? 0,
    investido: investidoNoMes.value,
  })
})

const COR_DA_FATIA = {
  faturas: { traco: 'stroke-amber-500', ponto: 'bg-amber-500' },
  investido: { traco: 'stroke-violet-500', ponto: 'bg-violet-500' },
  livre: { traco: 'stroke-emerald-500', ponto: 'bg-emerald-500' },
} as const

/** Os arcos da pizza, na ordem das fatias, começando no topo. */
const RAIO_PIZZA = 30
const VOLTA_PIZZA = 2 * Math.PI * RAIO_PIZZA
const arcosDoSalario = computed(() => {
  let deslocamento = 0
  return (salarioRepartido.value?.fatias ?? []).filter(f => f.fracao > 0).map((f) => {
    const comprimento = f.fracao * VOLTA_PIZZA
    const arco = { chave: f.chave, traco: `${comprimento} ${VOLTA_PIZZA}`, deslocamento: -deslocamento }
    deslocamento += comprimento
    return arco
  })
})

// ---- Acerto, categorias e últimas compras -------------------------------------

const { data: acertos } = useAcertos()
const acertado = computed(() => (acertos.value ?? []).some(a => primeiroDoMes(a.competencia) === competencia.value))

const nomeDoMembro = (id: string) => membros.value?.find(m => m.user_id === id)?.exibicao ?? 'Alguém'

/** "Fulano deve X a Beltrano" — só com duas pessoas, como em Chico Moedas. */
const acerto = computed(() => {
  const saldos = saldoDoMes(compras.value ?? [], (membros.value ?? []).map(m => m.user_id))
  if (saldos.length !== 2) return null
  const [a, b] = saldos as [typeof saldos[0], typeof saldos[0]]
  const credor = a.saldo >= b.saldo ? a : b
  const devedor = credor === a ? b : a
  return { credor: nomeDoMembro(credor.user_id), devedor: nomeDoMembro(devedor.user_id), valor: credor.saldo }
})

const comprasVisiveis = computed(() => [...(compras.value ?? []), ...(pessoais.value ?? [])])

const categoriasDoMes = computed(() => gastoPorCategoria(comprasVisiveis.value).slice(0, 5))

const { data: movimentacoes, isPending: carregandoMovimentacoes } = useMovimentacoesRecentes(6)

const ultimasCompras = computed(() =>
  [...comprasVisiveis.value]
    .sort((a, b) => (b.created_at ?? b.data_compra).localeCompare(a.created_at ?? a.data_compra))
    .slice(0, 5),
)

const ehDaGavetaPessoal = (spaceId: string) => spaceId === espacoPessoalId.value

// ---- Metas --------------------------------------------------------------------

const { data: metasDoEspaco, isPending: carregandoMetas } = useMetas(computed(() => store.espacoAtivoId))
const { data: metasPessoais } = useMetas(gavetaPessoal)

const metasAbertas = computed(() =>
  [...(metasDoEspaco.value ?? []), ...(metasPessoais.value ?? [])]
    .filter(m => m.estado === 'ativa')
    .map(m => ({ meta: m, progresso: progressoDaMeta(m, m.aportes) }))
    .sort((a, b) => b.progresso.fracao - a.progresso.fracao)
    .slice(0, 4),
)

// ---- Formatação ---------------------------------------------------------------

function sinalDaVariacao(v: number): string {
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatarPercentual(Math.abs(v))}`
}

function quandoAtualizou(iso: string | null): string {
  if (!iso) return 'sem data de atualização'
  return `atualizado ${tempoRelativo(iso) ?? `em ${formatarInstante(iso)}`}`
}

/** "24/11" — a coluna estreita das últimas compras. */
function diaEMes(iso: string): string {
  const { dia, mes } = partesDaData(iso)
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`
}
</script>

<template>
  <div class="space-y-4">
    <!--
      O cabeçalho do painel: nome, mês e o "Como funciona". As abas de Orçamentos
      não aparecem aqui — os cartões são a navegação desta tela.
    -->
    <header class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div class="min-w-0 flex-1">
        <h1 class="text-2xl font-semibold tracking-tight">Orçamentos</h1>
        <p class="text-sm text-muted-foreground">Gastos, planejamento, bancos e metas do mês num lugar só.</p>
      </div>

      <Button variant="outline" class="gap-1.5" @click="comoFunciona = true">
        <CircleHelpIcon class="size-4" />
        Como funciona
      </Button>
    </header>

    <section class="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
      <Button variant="ghost" size="icon" aria-label="Mês anterior" @click="competencia = somarMeses(competencia, -1)">
        <ChevronLeftIcon class="size-4" />
      </Button>
      <span class="min-w-36 text-center text-sm font-medium">{{ formatarMes(competencia) }}</span>
      <Button variant="ghost" size="icon" aria-label="Próximo mês" @click="competencia = somarMeses(competencia, 1)">
        <ChevronRightIcon class="size-4" />
      </Button>

      <span
        v-if="situacao !== 'aberto'"
        class="rounded-full px-2 py-0.5 text-xs"
        :class="situacao === 'fechado'
          ? 'bg-muted text-muted-foreground'
          : 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100'"
      >
        {{ situacao === 'fechado' ? 'Fechado' : 'Já comprometido' }}
      </span>
      <button
        v-if="situacao !== 'aberto'"
        type="button"
        class="rounded-full border px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        @click="competencia = mesCorrente"
      >
        Hoje
      </button>
    </section>

    <!--
      ---- Linha 1: o dinheiro do mês ----
      Saldo e Gastos são cartões altos (o número e a lista por trás dele); Sobra e
      Investido, números soltos, dividem a terceira coluna.
    -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <!-- O total e as contas que o compõem, num cartão só. -->
      <PainelCartao titulo="Saldo em contas" :icone="WalletIcon" para="/orcamentos/open-finance/contas" rotulo-do-atalho="Contas">
        <div v-if="carregandoConexoes" class="space-y-2">
          <Skeleton class="h-8 w-32" />
          <Skeleton v-for="i in 3" :key="i" class="h-9 w-full" />
        </div>
        <template v-else-if="contas">
          <p class="text-2xl font-semibold tabular-nums">{{ formatarDinheiro(contas.total) }}</p>
          <p class="text-xs text-muted-foreground">
            {{ contas.contas.length }} {{ contas.contas.length === 1 ? 'conta' : 'contas' }} · {{ quandoAtualizou(contas.atualizadoEm) }}
          </p>
          <ul class="mt-4 space-y-2.5 border-t pt-3">
            <li v-for="c in contas.contas.slice(0, 5)" :key="c.id" class="flex items-center gap-3">
              <SeloDoBanco :banco="c.banco" tamanho="sm" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ c.banco }}</p>
                <p class="truncate text-xs text-muted-foreground">{{ c.nome }}</p>
              </div>
              <span class="text-sm tabular-nums">{{ formatarDinheiro(c.saldo) }}</span>
            </li>
          </ul>
        </template>
        <p v-else class="text-sm text-muted-foreground">Nenhuma conta conectada. Toque para conectar a primeira e ver o saldo aqui.</p>
        <p class="mt-auto pt-3 text-xs text-muted-foreground">Só você vê os seus bancos.</p>
      </PainelCartao>

      <PainelCartao titulo="Gastos do mês" :icone="ReceiptIcon" :para="comMes('/orcamentos/gastos')" rotulo-do-atalho="Chico Moedas">
        <template #acao>
          <button
            type="button"
            class="relative z-10 hidden size-7 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground md:grid"
            aria-label="Nova compra"
            title="Nova compra"
            @click="dialogoDaCompra = true"
          >
            <PlusIcon class="size-4" />
          </button>
        </template>
        <Skeleton v-if="carregandoCompras" class="h-8 w-32" />
        <template v-else>
          <div class="flex items-end justify-between gap-2">
            <div>
              <p class="text-2xl font-semibold tabular-nums">{{ formatarDinheiro(gastoDoEspaco) }}</p>
              <p class="text-xs text-muted-foreground">Gasto do espaço</p>
            </div>
            <svg v-if="curvaDosGastos.length > 1" viewBox="0 0 96 28" class="h-7 w-24 text-primary" aria-hidden="true">
              <path :d="caminhoDaCurva(curvaDosGastos)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
          <p class="flex flex-wrap items-center gap-x-2 pt-2 text-xs text-muted-foreground">
            <span v-if="variacaoDosGastos !== null" class="inline-flex items-center gap-0.5 font-medium">
              <component :is="variacaoDosGastos > 0 ? ArrowUpIcon : ArrowDownIcon" class="size-3" />
              {{ sinalDaVariacao(variacaoDosGastos) }}
              <span class="font-normal">vs. {{ nomeDoMes(somarMeses(competencia, -1)) }}</span>
            </span>
            <span v-if="temGavetaPessoal">Meu bolso: {{ formatarDinheiro(bolso) }}</span>
          </p>
        </template>

        <!--
          As faturas abertas moram aqui: são o mesmo dinheiro do mês visto pelo
          lado do cartão. O link de "Cartões" fica acima do link esticado do
          cartão, que leva a Chico Moedas.
        -->
        <section class="mt-auto border-t pt-3">
          <div class="mb-2 flex items-center gap-2">
            <CreditCardIcon class="size-3.5 text-muted-foreground" aria-hidden="true" />
            <h3 class="flex-1 text-xs font-medium text-muted-foreground">Faturas abertas</h3>
            <NuxtLink to="/orcamentos/open-finance" class="relative z-10 text-xs font-medium text-primary underline-offset-2 hover:underline">
              Cartões
            </NuxtLink>
          </div>
          <div v-if="carregandoCartoes" class="space-y-2">
            <Skeleton v-for="i in 3" :key="i" class="h-9 w-full" />
          </div>
          <template v-else-if="cartoes?.resumos.length">
            <ul class="space-y-3">
              <li v-for="r in cartoes.resumos.slice(0, 5)" :key="r.cartao.id" class="space-y-1">
                <div class="flex items-center gap-3">
                  <SeloDoBanco :banco="r.cartao.banco" tamanho="xs" />
                  <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ r.cartao.apelido || r.cartao.banco }}</span>
                  <span class="text-sm tabular-nums">{{ formatarDinheiro(r.faturaAberta) }}</span>
                </div>
                <div v-if="r.uso" class="flex items-center gap-2">
                  <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted text-muted-foreground">
                    <div class="h-full rounded-full" :style="{ width: `${r.uso.fracao * 100}%`, background: corDeDado(seloDoBanco(r.cartao.banco).cor) ?? 'currentColor' }" />
                  </div>
                  <span class="w-10 text-right text-xs tabular-nums" :class="CLASSE_DA_FAIXA[r.uso.faixa]">{{ formatarPercentual(r.uso.fracao) }}</span>
                </div>
              </li>
            </ul>
            <p class="pt-3 text-xs text-muted-foreground">
              Total {{ formatarDinheiro(cartoes.total) }} · a porcentagem é o limite tomado
            </p>
          </template>
          <p v-else class="text-sm text-muted-foreground">Nenhum cartão conectado.</p>
        </section>
      </PainelCartao>

      <div class="grid gap-4 md:col-span-2 md:grid-cols-2 xl:col-span-1 xl:grid-cols-1">
        <PainelCartao compacto titulo="Sobra do mês" :icone="GaugeIcon" :para="comMes('/orcamentos/planejamento')" rotulo-do-atalho="Planejamento">
          <Skeleton v-if="carregandoMeuMes" class="h-8 w-32" />
          <template v-else-if="meuMes">
            <p class="text-2xl font-semibold tabular-nums" :class="meuMes.sobra < 0 ? 'text-red-600 dark:text-red-400' : ''">
              {{ formatarDinheiro(meuMes.sobra) }}
            </p>
            <div class="mt-auto space-y-1 pt-2">
              <div class="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full rounded-full"
                  :class="meuMes.sobra < 0 ? 'bg-red-500' : 'bg-primary'"
                  :style="{ width: `${Math.min(Number.isFinite(meuMes.uso) ? meuMes.uso : 1, 1) * 100}%` }"
                />
              </div>
              <p class="text-xs text-muted-foreground">
                {{ formatarPercentual(Number.isFinite(meuMes.uso) ? meuMes.uso : 1) }} de {{ formatarDinheiro(meuMes.planejado) }} usados
              </p>
            </div>
          </template>
          <p v-else class="text-sm text-muted-foreground">Cadastre seu salário no Planejamento para ver quanto sobra do mês.</p>
        </PainelCartao>

        <!--
          A pizza do salário — Faturas · Investido · Livre. Veio do cartão de
          Planejamento para o alto da tela: é a leitura de "do que eu ganho, o que
          já está comprometido". O patrimônio investido continua no cartão de
          Investimentos, mais abaixo.
        -->
        <PainelCartao titulo="Salário do mês" :icone="PieChartIcon" :para="comMes('/orcamentos/planejamento')" rotulo-do-atalho="Planejamento">
          <Skeleton v-if="carregandoMeuMes || carregandoCartoes" class="h-24 w-full" />
          <div v-else-if="salarioRepartido" class="flex items-center gap-4">
            <svg viewBox="0 0 80 80" class="size-24 shrink-0 -rotate-90" aria-hidden="true">
              <circle cx="40" cy="40" :r="RAIO_PIZZA" fill="none" stroke-width="16" class="stroke-muted" />
              <circle
                v-for="a in arcosDoSalario"
                :key="a.chave"
                cx="40"
                cy="40"
                :r="RAIO_PIZZA"
                fill="none"
                stroke-width="16"
                :class="COR_DA_FATIA[a.chave].traco"
                :stroke-dasharray="a.traco"
                :stroke-dashoffset="a.deslocamento"
              />
            </svg>
            <dl class="min-w-0 flex-1 space-y-1.5 text-xs">
              <div v-for="f in salarioRepartido.fatias" :key="f.chave" class="flex items-center gap-2">
                <span class="size-2.5 shrink-0 rounded-full" :class="COR_DA_FATIA[f.chave].ponto" aria-hidden="true" />
                <dt class="min-w-0 flex-1 truncate">{{ f.rotulo }}</dt>
                <dd class="tabular-nums">{{ formatarDinheiro(f.valor) }}</dd>
                <dd class="w-10 text-right tabular-nums text-muted-foreground">{{ formatarPercentual(f.fracao) }}</dd>
              </div>
              <p class="pt-1 text-muted-foreground">
                de {{ formatarDinheiro(salarioRepartido.salario) }} de salário
                <span v-if="salarioRepartido.estouro" class="block font-medium text-red-600 dark:text-red-400">
                  Passou {{ formatarDinheiro(salarioRepartido.estouro) }} do salário.
                </span>
              </p>
            </dl>
          </div>
          <p v-else-if="meuMes" class="text-sm text-muted-foreground">
            A pizza mostra o mês corrente: as faturas abertas são as do ciclo de hoje.
          </p>
          <p v-else class="text-sm text-muted-foreground">Cadastre seu salário no Planejamento para ver para onde ele vai.</p>
        </PainelCartao>
      </div>
    </div>

    <!-- ---- Linha 2: gastos por período e planejamento ---- -->
    <div class="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <PainelCartao class="xl:col-span-3" titulo="Gastos por período" :icone="BarChart3Icon" :para="comMes('/orcamentos/gastos')" rotulo-do-atalho="Chico Moedas">
        <!-- Os recortes e o gráfico ficam acima do link esticado: são controles. -->
        <nav class="relative z-10 flex gap-1 self-start rounded-lg border bg-background p-1 text-xs">
          <button
            v-for="r in RECORTES"
            :key="r.meses"
            type="button"
            class="rounded-md px-2 py-1 font-medium transition-colors"
            :class="recorte === r.meses ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
            :aria-pressed="recorte === r.meses"
            @click="recorte = r.meses"
          >
            {{ r.rotulo }}
          </button>
        </nav>
        <GraficoBarras
          class="relative z-10 mt-3"
          :barras="barras"
          :formatar="formatarDinheiro"
          :atualizando="buscandoSerie"
          vazio="Nenhuma compra nesta janela de meses."
          @selecionar="competencia = $event"
        />
      </PainelCartao>

      <PainelCartao class="xl:col-span-2" titulo="Planejamento" :icone="TargetIcon" :para="comMes('/orcamentos/planejamento')">
        <Skeleton v-if="carregandoMeuMes" class="h-28 w-full" />
        <template v-else-if="projecaoPrincipal">
          <!--
            O recado do mês, logo abaixo do título: quanto ainda falta para chegar
            ao planejado (a Sobra), ou quanto já passou dele. A cor é a situação
            do mês inteiro (`situacaoDoPlano`) — a mesma do anel logo abaixo.
          -->
          <div class="flex gap-2.5 rounded-md border px-3 py-2 text-xs" :class="TOM_DO_PLANO[situacaoDoPlano].recado">
            <component :is="TOM_DO_PLANO[situacaoDoPlano].icone" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <p class="font-medium">{{ TOM_DO_PLANO[situacaoDoPlano].titulo }}</p>
              <p v-if="projecaoPrincipal.sobra >= 0">
                Faltam <strong class="tabular-nums">{{ formatarDinheiro(projecaoPrincipal.sobra) }}</strong>
                para atingir o planejado do mês.
              </p>
              <p v-else>
                Passou <strong class="tabular-nums">{{ formatarDinheiro(-projecaoPrincipal.sobra) }}</strong>
                do planejado do mês.
              </p>
              <p v-if="ritmo" class="opacity-80">{{ formatarPercentual(passouDoMes) }} do mês já passou.</p>
            </div>
          </div>

          <!--
            Os dois números e o anel, centralizados no cartão. A régua fica num
            invólucro à parte: dentro da caixa do anel, o recuo dela encolhia o
            círculo e o texto do meio vazava para fora.
          -->
          <div class="mt-4 flex items-center justify-center gap-6 sm:gap-10">
            <dl class="flex flex-col items-center gap-2 text-center sm:flex-row sm:gap-10">
              <div>
                <dd class="text-xl font-semibold tabular-nums sm:text-2xl">{{ formatarDinheiro(projecaoPrincipal.realizado) }}</dd>
                <dt class="text-xs text-muted-foreground">já gastos</dt>
              </div>
              <div>
                <dd class="text-xl font-semibold tabular-nums sm:text-2xl">{{ formatarDinheiro(projecaoPrincipal.planejado) }}</dd>
                <dt class="text-xs text-muted-foreground">planejado no mês</dt>
              </div>
            </dl>
            <div class="shrink-0 border-l pl-6 sm:pl-10">
              <div class="relative size-24 sm:size-28">
                <svg viewBox="0 0 100 100" class="size-full -rotate-90" aria-hidden="true">
                  <circle cx="50" cy="50" r="44" fill="none" stroke-width="8" class="stroke-muted" />
                  <circle
                    cx="50"
                    cy="50"
                    r="44"
                    fill="none"
                    stroke-width="8"
                    stroke-linecap="round"
                    :stroke-dasharray="arcoDoAnel"
                    :class="TOM_DO_PLANO[situacaoDoPlano].anel"
                  />
                </svg>
                <div class="absolute inset-0 grid place-items-center text-center leading-tight">
                  <div>
                    <p class="text-lg font-semibold tabular-nums sm:text-xl">
                      {{ formatarPercentual(Number.isFinite(projecaoPrincipal.uso) ? projecaoPrincipal.uso : 1) }}
                    </p>
                    <p class="text-[10px] text-muted-foreground">do planejado</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!--
            A linha do mês em quatro semanas. Cada bloco se enche com o que foi
            gasto nele contra a parte do planejado que cabia nele; a semana de
            hoje ganha a borda. Passar de 100% numa semana pinta o bloco de
            âmbar — o número continua o real.
          -->
          <!-- Uma barra só, partida em quatro: só as pontas de fora são arredondadas. -->
          <ol class="mt-4 grid grid-cols-4 gap-0.5" aria-label="Gasto do planejado por semana">
            <li v-for="(sem, i) in semanas" :key="sem.inicio" class="min-w-0 space-y-1 text-center">
              <div
                class="relative h-7 overflow-hidden bg-muted"
                :class="[
                  i === 0 ? 'rounded-l-full' : '',
                  i === semanas.length - 1 ? 'rounded-r-full' : '',
                  sem.atual ? 'z-10 ring-2 ring-primary' : '',
                ]"
              >
                <div
                  class="absolute inset-y-0 left-0"
                  :class="sem.fracao > 1 ? 'bg-amber-500/80' : sem.atual ? 'bg-primary/70' : 'bg-emerald-500/70'"
                  :style="{ width: `${Math.min(sem.fracao, 1) * 100}%` }"
                />
                <span
                  class="relative grid h-full place-items-center text-xs font-semibold tabular-nums"
                  :class="sem.futura && !sem.gasto ? 'text-muted-foreground' : ''"
                  :title="`${formatarDinheiro(sem.gasto)} de ${formatarDinheiro(sem.cota)}`"
                >
                  {{ formatarPercentual(sem.fracao) }}
                </span>
              </div>
              <p class="truncate text-[11px]" :class="sem.atual ? 'font-medium text-primary' : 'text-muted-foreground'">
                {{ sem.rotulo }}
              </p>
            </li>
          </ol>

          <!-- O mês do casal, compacto, quando o cartão grande é o "Meu mês". -->
          <div v-if="meuMes && espacoCasal" class="mt-auto space-y-1 pt-3 text-xs">
            <div class="flex justify-between gap-2 text-muted-foreground">
              <span class="truncate">Mês de {{ store.espacoAtivo?.nome }}</span>
              <span class="tabular-nums">{{ formatarDinheiro(mesDoCasal.realizado) }} de {{ formatarDinheiro(mesDoCasal.planejado) }}</span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                class="h-full rounded-full"
                :class="mesDoCasal.sobra < 0 ? 'bg-red-500' : 'bg-primary/70'"
                :style="{ width: `${Math.min(Number.isFinite(mesDoCasal.uso) ? mesDoCasal.uso : 1, 1) * 100}%` }"
              />
            </div>
          </div>
        </template>
        <p v-else class="text-sm text-muted-foreground">
          Sem salário cadastrado não há o que planejar. Toque para cadastrar o seu no Planejamento.
        </p>
      </PainelCartao>
    </div>

    <!-- ---- Linha 3: investimentos e o mês em detalhe ---- -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <PainelCartao titulo="Investimentos" :icone="TrendingUpIcon" :para="comMes('/orcamentos/planejamento', '#investimentos')">
        <!-- O total fica fora da cadeia v-if/v-else abaixo: ele aparece junto com a rosca. -->
        <div v-if="!carregandoPosicoes && investimentos" class="mb-3">
          <p class="text-2xl font-semibold tabular-nums">{{ formatarDinheiro(investimentos.total) }}</p>
          <p class="text-xs text-muted-foreground">
            <template v-if="investimentos.rendimento !== null">Rendimento bruto {{ formatarDinheiro(investimentos.rendimento) }}</template>
            <template v-else>Pelas suas caixinhas</template>
          </p>
        </div>
        <Skeleton v-if="carregandoPosicoes" class="h-28 w-full" />
        <div v-else-if="arcosDaRosca.length" class="flex items-center gap-4">
          <svg viewBox="0 0 80 80" class="size-24 shrink-0 -rotate-90 text-muted-foreground" aria-hidden="true">
            <circle cx="40" cy="40" :r="RAIO_ROSCA" fill="none" stroke-width="12" class="stroke-muted" />
            <circle
              v-for="a in arcosDaRosca"
              :key="a.banco"
              cx="40"
              cy="40"
              :r="RAIO_ROSCA"
              fill="none"
              stroke-width="12"
              :stroke="a.cor"
              :stroke-dasharray="a.traco"
              :stroke-dashoffset="a.deslocamento"
            />
          </svg>
          <ul class="min-w-0 flex-1 space-y-1.5 text-xs">
            <li v-for="a in arcosDaRosca.slice(0, 5)" :key="a.banco" class="flex items-center gap-2">
              <span class="size-2.5 shrink-0 rounded-full text-muted-foreground" :style="{ background: a.cor }" />
              <span class="min-w-0 flex-1 truncate">{{ a.banco }}</span>
              <span class="tabular-nums text-muted-foreground">{{ formatarPercentual(a.fracao) }}</span>
            </li>
          </ul>
        </div>
        <ul v-else-if="caixinhasVisiveis.length" class="space-y-2 text-sm">
          <li v-for="c in caixinhasVisiveis.slice(0, 5)" :key="c.id" class="flex justify-between gap-2">
            <span class="truncate">{{ c.nome }}</span>
            <span class="tabular-nums">{{ formatarDinheiro(saldoDaCaixinha(c)) }}</span>
          </li>
        </ul>
        <p v-else class="text-sm text-muted-foreground">Nada investido por aqui ainda.</p>
        <p v-if="caixinhasVisiveis.length && arcosDaRosca.length" class="mt-auto pt-3 text-xs text-muted-foreground">
          {{ caixinhasVisiveis.length }} {{ caixinhasVisiveis.length === 1 ? 'caixinha' : 'caixinhas' }} cadastradas
        </p>
      </PainelCartao>

      <PainelCartao titulo="Acerto do mês" :icone="HandCoinsIcon" :para="comMes('/orcamentos/gastos')" rotulo-do-atalho="Chico Moedas">
        <p v-if="acertado" class="text-sm">
          <span class="font-medium text-emerald-700 dark:text-emerald-400">Acertado.</span>
          {{ nomeDoMes(competencia) }} já foi marcado como pago.
        </p>
        <p v-else-if="acerto && acerto.valor >= 0.01" class="text-sm">
          <span class="font-medium">{{ acerto.devedor }}</span> deve
          <span class="font-semibold tabular-nums">{{ formatarDinheiro(acerto.valor) }}</span>
          a <span class="font-medium">{{ acerto.credor }}</span>
          {{ situacao === 'fechado' ? 'por' : 'até agora em' }} {{ nomeDoMes(competencia) }}.
        </p>
        <p v-else-if="acerto" class="text-sm text-muted-foreground">Ninguém deve nada a ninguém neste mês.</p>
        <p v-else class="text-sm text-muted-foreground">O acerto aparece nos espaços divididos por duas pessoas.</p>

        <NuxtLink
          v-if="naCaixa"
          :to="`/orcamentos/open-finance/caixa?mes=${mesNaUrl(competencia)}`"
          class="relative z-10 mt-auto inline-flex items-center gap-1.5 self-start pt-3 text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          {{ naCaixa }} {{ naCaixa === 1 ? 'lançamento espera' : 'lançamentos esperam' }} destino na caixa de entrada
        </NuxtLink>
      </PainelCartao>

      <PainelCartao titulo="Em que foi" :icone="PieChartIcon" :para="comMes('/orcamentos/gastos')" rotulo-do-atalho="Categorias">
        <ul v-if="categoriasDoMes.length" class="space-y-2.5">
          <li v-for="f in categoriasDoMes" :key="f.chave" class="space-y-1">
            <div class="flex justify-between gap-2 text-sm">
              <span class="truncate">{{ f.nome }}</span>
              <span class="tabular-nums">{{ formatarDinheiro(f.total) }}</span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-muted">
              <div class="h-full rounded-full" :class="f.cor ? CLASSE_BARRA[f.cor] : CLASSE_BARRA_SEM_CATEGORIA" :style="{ width: `${f.fracao * 100}%` }" />
            </div>
          </li>
        </ul>
        <p v-else class="text-sm text-muted-foreground">Nenhuma compra em {{ formatarMes(competencia) }}.</p>
      </PainelCartao>

      <!--
        O extrato, e não só as compras: transferências, receitas, assinaturas e
        o pagamento da fatura, como o banco mostra. Sem banco conectado, o
        cartão volta a ser o das últimas compras lançadas.
      -->
      <PainelCartao
        v-if="conexoes?.length"
        compacto
        titulo="Últimas movimentações"
        :icone="ArrowLeftRightIcon"
        :para="`/orcamentos/open-finance/caixa?mes=${mesNaUrl(competencia)}`"
        rotulo-do-atalho="Caixa de entrada"
      >
        <div v-if="carregandoMovimentacoes" class="space-y-2">
          <Skeleton v-for="i in 4" :key="i" class="h-9 w-full" />
        </div>
        <ul v-else-if="movimentacoes?.length" class="divide-y">
          <li v-for="t in movimentacoes" :key="t.id" class="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
            <span class="relative shrink-0">
              <IconeDaCompra :descricao="textoParaSelo(t)" tamanho="sm" />
              <SeloDoBanco
                v-if="t.conta"
                :banco="bancoDaConta(t.conta)"
                tamanho="xs"
                class="absolute -bottom-1 -right-1.5 ring-2 ring-card"
              />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ rotuloParaRegra(t) }}</p>
              <p class="truncate text-xs text-muted-foreground">{{ etiquetaDaMovimentacao(t) }}</p>
            </div>
            <div class="shrink-0 text-right">
              <p
                class="text-sm tabular-nums"
                :class="t.sentido === 'entrada' ? 'text-emerald-600 dark:text-emerald-400' : ''"
              >
                {{ t.sentido === 'entrada' ? '+' : '−' }}{{ formatarDinheiro(Number(t.valor)) }}
              </p>
              <p class="text-xs text-muted-foreground">{{ quandoFoi(t.data, hojeIso()) }}</p>
            </div>
          </li>
        </ul>
        <p v-else class="text-sm text-muted-foreground">Nenhuma movimentação no extrato ainda.</p>
      </PainelCartao>

      <PainelCartao v-else titulo="Últimas compras" :icone="ReceiptIcon" :para="comMes('/orcamentos/gastos')" rotulo-do-atalho="Ver todas">
        <ul v-if="ultimasCompras.length" class="divide-y">
          <li v-for="c in ultimasCompras" :key="`${c.id}-${c.numero}`" class="flex items-center gap-2 py-1.5 text-sm first:pt-0">
            <span class="min-w-0 flex-1 truncate">
              {{ c.descricao }}
              <span v-if="ehDaGavetaPessoal(c.space_id)" class="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">pessoal</span>
            </span>
            <span class="tabular-nums">{{ formatarDinheiro(c.valor) }}</span>
            <span class="w-12 text-right text-xs text-muted-foreground">{{ diaEMes(c.data_compra) }}</span>
          </li>
        </ul>
        <p v-else class="text-sm text-muted-foreground">Nenhuma compra em {{ formatarMes(competencia) }}.</p>
      </PainelCartao>
    </div>

    <!-- ---- Linha 4: metas ---- -->
    <PainelCartao titulo="Metas em evolução" :icone="TargetIcon" para="/objetivos" rotulo-do-atalho="Objetivos">
      <div v-if="carregandoMetas" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton v-for="i in 4" :key="i" class="h-16 w-full" />
      </div>
      <ul v-else-if="metasAbertas.length" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <li v-for="{ meta, progresso } in metasAbertas" :key="meta.id" class="space-y-1.5 rounded-md border p-3">
          <p class="truncate text-sm font-medium">
            {{ meta.titulo }}
            <span v-if="ehDaGavetaPessoal(meta.space_id)" class="ml-1 rounded bg-muted px-1 text-[10px] font-normal text-muted-foreground">pessoal</span>
          </p>
          <p class="text-lg font-semibold tabular-nums">{{ formatarPercentual(progresso.fracao) }}</p>
          <div class="h-1.5 overflow-hidden rounded-full bg-muted">
            <div class="h-full rounded-full bg-primary" :style="{ width: `${progresso.fracao * 100}%` }" />
          </div>
          <p class="text-xs text-muted-foreground">
            {{ formatarDinheiro(progresso.guardado) }} de {{ formatarDinheiro(meta.valor_alvo) }}
          </p>
        </li>
      </ul>
      <p v-else class="text-sm text-muted-foreground">Nenhuma meta aberta. Toque para criar uma em Objetivos.</p>
    </PainelCartao>

    <!-- No celular o "+" do cartão de Gastos vira um botão flutuante, acima da barra de baixo. -->
    <Button
      size="icon"
      class="fixed bottom-20 right-4 z-30 size-12 rounded-full shadow-lg md:hidden print:hidden"
      aria-label="Nova compra"
      @click="dialogoDaCompra = true"
    >
      <PlusIcon class="size-5" />
    </Button>

    <CompraDialogo
      v-model:aberto="dialogoDaCompra"
      :membros="membros ?? []"
      :categorias="categorias ?? []"
      :categorias-pessoais="categoriasPessoais ?? []"
      :competencia-visivel="competencia"
      :compra="null"
    />

    <ComoFuncionaOrcamentos v-model:aberto="comoFunciona" />
  </div>
</template>
