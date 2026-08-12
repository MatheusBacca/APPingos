<script setup lang="ts">
import { toast } from 'vue-sonner'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, UserIcon } from '@lucide/vue'
import { mensagemDeErro } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarDia, formatarMes, hojeIso, mesAbreviado, partesDaData, primeiroDoMes, somarMeses } from '@/lib/datas'
import { formatarDinheiro, formatarPercentual } from '@/lib/dinheiro'
import { ehAdmin } from '~/types/database.types'
import { fracaoDe, gastoPorCategoria, meuBolso, totalDoMes } from '~/types/orcamento'
import type { CompraDoMes } from '~/types/orcamento'
import type { Barra } from '~/components/GraficoBarras.vue'
import { useGastosPessoais } from '~/composables/useGastosPessoais'
import { useMembros } from '~/composables/useMembros'
import { useComprasDoMes, useSerieMensal, useSerieSemanal, useCategorias, useRemoverCompra } from '~/composables/useOrcamento'
import { useUsuarioId } from '~/composables/useUsuarioId'

useHead({ title: 'Orçamentos · APPingos' })

const usuarioId = useUsuarioId()
const { data: membros } = useMembros()
const { data: categorias } = useCategorias()

/*
 * Os gastos pessoais são a MESMA consulta feita numa segunda gaveta — o espaço
 * pessoal — e sobrepostas à tela do espaço ativo. Enquanto o alternador está
 * desligado, `espacoVisivel` é `null` e nenhuma dessas queries dispara: a tela
 * é exatamente a de antes, sem uma requisição a mais.
 */
const { espacoPessoalId, disponivel: temGavetaPessoal, ligado: mostrandoPessoais, espacoVisivel, ehPessoal } = useGastosPessoais()

const competencia = ref(primeiroDoMes(hojeIso()))
const { data: compras, isPending } = useComprasDoMes(competencia)
const { data: serie, isFetching: buscandoSerie } = useSerieMensal(competencia)
const { data: semanal, isFetching: buscandoSemanal } = useSerieSemanal(competencia)

const { data: pessoais } = useComprasDoMes(competencia, espacoVisivel)
const { data: seriePessoal } = useSerieMensal(competencia, undefined, espacoVisivel)
const { data: semanalPessoal } = useSerieSemanal(competencia, espacoVisivel)

/*
 * As categorias do pessoal são carregadas mesmo com o alternador desligado: dá
 * para lançar uma compra pessoal sem estar vendo as pessoais, e o autocomplete
 * do diálogo precisa da lista certa na hora em que a gaveta é trocada.
 */
const { data: categoriasPessoais } = useCategorias(espacoPessoalId)

const dialogoAberto = ref(false)
/** Preenchida = o diálogo abre em modo de edição. */
const compraEmEdicao = ref<CompraDoMes | null>(null)
const remover = useRemoverCompra()

function novaCompra() {
  compraEmEdicao.value = null
  dialogoAberto.value = true
}

function editar(compra: CompraDoMes) {
  compraEmEdicao.value = compra
  dialogoAberto.value = true
}

const souAdmin = computed(() =>
  ehAdmin(membros.value?.find(m => m.user_id === usuarioId.value)?.papel),
)

const mesCorrente = computed(() => primeiroDoMes(hojeIso()))

/**
 * A competência fecha no dia 1º do mês seguinte: julho está fechado a partir de
 * 01/08. Não é um botão nem um estado no banco — é só a passagem do tempo.
 */
const situacao = computed(() => {
  if (competencia.value < mesCorrente.value) return 'fechado'
  if (competencia.value > mesCorrente.value) return 'futuro'
  return 'aberto'
})

/*
 * Duas leituras que NÃO se somam, e é esse o ponto.
 *
 * "Gasto do espaço" é o que existe desde sempre: o que o casal comprou no mês,
 * rateável, e a única coisa que o acerto do mês enxerga. "Meu bolso" é a sua
 * parte disso mais o que é só seu. Um total único misturando as duas coisas
 * seria um número que não responde pergunta nenhuma — metade dele é dívida da
 * outra pessoa.
 */
const total = computed(() => totalDoMes(compras.value ?? []))

const comprasPessoais = computed(() => pessoais.value ?? [])

const bolso = computed(() =>
  meuBolso(compras.value ?? [], comprasPessoais.value, usuarioId.value),
)

/**
 * As duas gavetas viram um conjunto só antes de qualquer leitura — dois blocos
 * obrigariam a juntar de cabeça o que "Mercado" custou no mês.
 */
const comprasVisiveis = computed(() =>
  [...(compras.value ?? []), ...comprasPessoais.value],
)

function nomeDoMembro(id: string): string {
  return membros.value?.find(m => m.user_id === id)?.exibicao ?? 'Alguém'
}

// ---- Gráficos ---------------------------------------------------------------

function tomDoMes(mes: string): Barra['tom'] {
  if (mes < mesCorrente.value) return 'passado'
  if (mes > mesCorrente.value) return 'futuro'
  return 'atual'
}

/**
 * Variação percentual ante o item anterior da mesma sequência cronológica.
 *
 * `null` quando não há período anterior (primeira linha) ou quando o anterior
 * é zero — "quanto por cento a mais que zero" não é uma pergunta com resposta
 * numérica sensata, então a tabela mostra "—" em vez de "Infinity%".
 */
function variacaoEntre(atual: number, anterior: number | undefined): number | null {
  if (anterior === undefined || anterior === 0) return null
  return (atual - anterior) / anterior
}

/*
 * O pessoal entra como segmento empilhado, não como um segundo gráfico nem uma
 * barra vizinha: é a mesma medida (reais gastos no período) vinda de outra
 * gaveta. A variação da tabela passa a comparar o total exibido — comparar só a
 * parte compartilhada enquanto a barra mostra as duas seria uma leitura que não
 * corresponde ao desenho.
 */
const pessoalPorMes = computed(() =>
  new Map((seriePessoal.value ?? []).map(p => [p.competencia, p.total])),
)

const pessoalPorSemana = computed(() =>
  new Map((semanalPessoal.value ?? []).map(b => [b.chave, b.total])),
)

const barrasMensais = computed<Barra[]>(() => {
  const pontos = serie.value ?? []
  const comPessoal = (mes: string, valor: number) => valor + (pessoalPorMes.value.get(mes) ?? 0)

  return pontos.map((ponto, i) => {
    const anterior = pontos[i - 1]
    return {
      chave: ponto.competencia,
      rotulo: mesAbreviado(ponto.competencia),
      rotuloLongo: formatarMes(ponto.competencia),
      valor: ponto.total,
      valorSecundario: pessoalPorMes.value.get(ponto.competencia) ?? 0,
      tom: tomDoMes(ponto.competencia),
      detalhe: `Sua parte do espaço: ${formatarDinheiro(ponto.minhaParte)}`,
      variacao: variacaoEntre(
        comPessoal(ponto.competencia, ponto.total),
        anterior ? comPessoal(anterior.competencia, anterior.total) : undefined,
      ),
    }
  })
})

const barrasSemanais = computed<Barra[]>(() => {
  const blocos = semanal.value ?? []
  const comPessoal = (chave: string, valor: number) => valor + (pessoalPorSemana.value.get(chave) ?? 0)

  return blocos.map((bloco, i) => {
    const anterior = blocos[i - 1]
    return {
      chave: bloco.chave,
      rotulo: `${partesDaData(bloco.inicio).dia}–${partesDaData(bloco.fim).dia}`,
      rotuloLongo: `${formatarDia(bloco.inicio)} a ${formatarDia(bloco.fim)}`,
      valor: bloco.total,
      valorSecundario: pessoalPorSemana.value.get(bloco.chave) ?? 0,
      // Uma semana dentro do mês visível não tem os três estados do calendário.
      tom: 'atual' as const,
      variacao: variacaoEntre(
        comPessoal(bloco.chave, bloco.total),
        anterior ? comPessoal(anterior.chave, anterior.total) : undefined,
      ),
    }
  })
})

/*
 * A tabela de "Por mês" mostra só o ano corrente — o gráfico de barras continua
 * com a janela deslizante inteira (é a projeção da fase 5), só a leitura em
 * texto é que fica mais estreita. Filtrar aqui, não em `barrasMensais`, para
 * uma coisa não puxar a outra.
 */
const barrasMensaisDoAno = computed(() =>
  barrasMensais.value.filter(b => b.chave.slice(0, 4) === String(partesDaData(mesCorrente.value).ano)),
)

/** "Meio a meio" quando todo mundo tem a mesma fatia; senão, a lista das fatias. */
function comoDivide(compra: CompraDoMes): string {
  const participantes = compra.participantes
  if (!participantes.length) return '—'
  if (participantes.length === 1) return `Integral de ${nomeDoMembro(participantes[0]!.user_id)}`

  const fracoes = participantes.map(p => fracaoDe(participantes, p.user_id))
  const iguais = fracoes.every(f => Math.abs(f - fracoes[0]!) < 0.0001)
  if (iguais) return 'Meio a meio'

  return participantes
    .map(p => `${nomeDoMembro(p.user_id)} ${formatarPercentual(fracaoDe(participantes, p.user_id))}`)
    .join(' · ')
}

/**
 * Espelha a policy de `compra`: o autor do lançamento, ou dono/admin.
 *
 * Numa compra pessoal a pergunta nem chega ao papel: ser admin do espaço do
 * casal não diz nada sobre a sua gaveta, e lá você é o único membro.
 */
function podeEditar(compra: CompraDoMes): boolean {
  if (ehPessoal(compra)) return true
  return souAdmin.value || compra.registrado_por === usuarioId.value
}

// ---- Onde o mês foi parar ----------------------------------------------------

const fatias = computed(() => gastoPorCategoria(comprasVisiveis.value))

/** Só a chave: a fatia em si é derivada, para acompanhar edições e remoções. */
const categoriaAberta = ref<string | null>(null)

const fatiaAberta = computed(() =>
  fatias.value.find(f => f.chave === categoriaAberta.value) ?? null,
)

/*
 * Esvaziar a categoria — removendo a última compra dela — apaga a fatia, e um
 * diálogo aberto sobre nada é uma tela morta. Fechar aqui, e não no `onRemover`,
 * cobre também a compra que sai de cena por uma edição feita em outra aba.
 */
watch(fatiaAberta, (fatia) => {
  if (!fatia) categoriaAberta.value = null
})

/**
 * A linha miúda do cartão dentro do diálogo — a mesma que a lista mostrava.
 *
 * Numa compra pessoal, "pago por você · integral de você" seria dizer duas
 * vezes o que o selo já disse. Sobra a data, que é o que ainda informa algo.
 */
function detalheDe(compra: CompraDoMes): string {
  const dia = formatarDia(compra.data_compra)
  if (ehPessoal(compra)) return dia
  return `${dia} · pago por ${nomeDoMembro(compra.pago_por)} · ${comoDivide(compra)}`
}

/*
 * O diálogo da compra substitui o da categoria em vez de se empilhar sobre ele:
 * dois modais disputam o foco, e o de baixo vira um fundo clicável que não
 * responde. Como a categoria continua escolhida, fechar a compra faz ela voltar
 * sozinha — é de lá que a pessoa veio, e costuma haver mais linhas para ver.
 */
const categoriaVisivel = computed({
  get: () => !!fatiaAberta.value && !dialogoAberto.value,
  set: (aberto: boolean) => {
    if (!aberto) categoriaAberta.value = null
  },
})

async function onRemover(compra: CompraDoMes) {
  try {
    await remover.mutateAsync(compra)
    toast.success(compra.parcelas > 1
      ? `"${compra.descricao}" removida, com as parcelas seguintes.`
      : `"${compra.descricao}" removida.`)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para remover.'))
  }
}
</script>

<template>
  <div class="space-y-6">
    <OrcamentosAbas subtitulo="Gastos do mês, parcelas em andamento e como cada compra divide.">
      <template #acoes>
        <Button class="gap-1.5" @click="novaCompra()">
          <PlusIcon class="size-4" />
          Nova compra
        </Button>
      </template>
    </OrcamentosAbas>

    <!-- Navegação de mês -->
    <section class="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
      <div class="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Mês anterior" @click="competencia = somarMeses(competencia, -1)">
          <ChevronLeftIcon class="size-4" />
        </Button>
        <span class="min-w-40 text-center text-sm font-medium">{{ formatarMes(competencia) }}</span>
        <Button variant="ghost" size="icon" aria-label="Próximo mês" @click="competencia = somarMeses(competencia, 1)">
          <ChevronRightIcon class="size-4" />
        </Button>
      </div>

      <!--
        Sem badge para o mês corrente — "em aberto" é óbvio quando é o mês que
        você já está vendo. O selo só aparece para dizer algo que não é óbvio:
        que este mês já fechou, ou que ainda nem começou.
      -->
      <span
        v-if="situacao !== 'aberto'"
        class="rounded-full px-2 py-0.5 text-xs"
        :class="situacao === 'fechado'
          ? 'bg-muted text-muted-foreground'
          : 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100'"
      >
        {{ situacao === 'fechado' ? 'Fechado' : 'Já comprometido' }}
      </span>

      <!-- Só aparece quando você navegou para longe de hoje — o caminho de volta. -->
      <button
        v-if="situacao !== 'aberto'"
        type="button"
        class="rounded-full border px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        @click="competencia = mesCorrente"
      >
        Hoje
      </button>

      <!--
        O alternador do plano: liga a segunda gaveta em paralelo, sem sair da
        tela. Não aparece dentro do próprio espaço pessoal — lá a lista já é
        essa, e um botão que não muda nada é pior que a ausência dele.
      -->
      <Button
        v-if="temGavetaPessoal"
        type="button"
        size="sm"
        class="gap-1.5"
        :variant="mostrandoPessoais ? 'default' : 'outline'"
        :aria-pressed="mostrandoPessoais"
        @click="mostrandoPessoais = !mostrandoPessoais"
      >
        <UserIcon class="size-4" />
        Gastos pessoais
      </Button>

      <!--
        Sem `tabular-nums`: são dois números lado a lado, não uma coluna. Dígitos
        de largura fixa só ajudam quando os números se alinham na vertical.
      -->
      <div class="ml-auto text-right">
        <p class="text-xs text-muted-foreground">Gasto do espaço</p>
        <p class="text-lg font-semibold">{{ formatarDinheiro(total) }}</p>
      </div>

      <!--
        A segunda leitura só aparece quando há a segunda gaveta. Os dois números
        não se somam, e ficam separados por uma régua para não convidar a isso.
      -->
      <div v-if="mostrandoPessoais" class="border-l pl-4 text-right">
        <p class="text-xs text-muted-foreground">Meu bolso</p>
        <p class="text-lg font-semibold">{{ formatarDinheiro(bolso) }}</p>
      </div>
    </section>

    <p v-if="mostrandoPessoais" class="-mt-3 text-xs text-muted-foreground">
      <strong>Gasto do espaço</strong> é o que vocês compraram juntos, e é o que o acerto do mês
      usa. <strong>Meu bolso</strong> é a sua parte disso mais os seus gastos pessoais — que só
      você vê.
    </p>

    <!--
      `compras`, e nunca `comprasVisiveis`: o acerto é a dívida entre vocês, e a
      outra pessoa não deve nada de um gasto pessoal — nem poderia vê-lo. É a
      invariante mais fácil de quebrar sem ninguém perceber.
    -->
    <SaldoDoMes
      :compras="compras ?? []"
      :membros="membros ?? []"
      :competencia="competencia"
      :fechado="situacao === 'fechado'"
      :futuro="situacao === 'futuro'"
    />

    <p v-if="situacao === 'futuro'" class="text-sm text-muted-foreground">
      Estes são os valores já comprometidos por parcelas de compras anteriores — o mês ainda vai receber lançamentos.
    </p>

    <!-- Dois gráficos, duas perguntas. Nunca dois eixos no mesmo plot. -->
    <section class="grid gap-4 lg:grid-cols-2">
      <div class="rounded-lg border bg-card p-4">
        <h2 class="text-sm font-medium">Por semana</h2>
        <p class="mt-0.5 text-xs text-muted-foreground">
          Quanto foi comprado em cada semana de {{ formatarMes(competencia) }} — pelo valor cheio, não pela parcela.
        </p>
        <GraficoBarras
          class="mt-3"
          :barras="barrasSemanais"
          :formatar="formatarDinheiro"
          :atualizando="buscandoSemanal"
          vazio="Nenhuma compra feita neste mês."
        />
      </div>

      <div class="rounded-lg border bg-card p-4">
        <h2 class="text-sm font-medium">Por mês</h2>
        <p class="mt-0.5 text-xs text-muted-foreground">
          Quanto pesa em cada competência. Os meses à frente já contam as parcelas em andamento.
        </p>
        <GraficoBarras
          class="mt-3"
          :barras="barrasMensais"
          :barras-tabela="barrasMensaisDoAno"
          :formatar="formatarDinheiro"
          :atualizando="buscandoSerie"
          vazio="Nenhuma compra nesta janela de meses."
          @selecionar="competencia = $event"
        />
      </div>
    </section>

    <!--
      Por categoria, e não a lista corrida de antes: com dezenas de linhas no
      mês, "em que a gente gastou" é uma pergunta que a lista não respondia sem
      um trabalho de somar de cabeça. As compras continuam a um clique — dentro
      da categoria a que pertencem, que é onde elas querem dizer alguma coisa.
    -->
    <section class="rounded-lg border bg-card p-4">
      <h2 class="text-sm font-medium">Em que foi</h2>
      <p class="mt-0.5 text-xs text-muted-foreground">
        Quanto cada categoria pesou em {{ formatarMes(competencia) }} — pela parcela do mês. Clique para ver as compras.
      </p>

      <div v-if="isPending" class="mt-3 space-y-3">
        <Skeleton v-for="i in 4" :key="i" class="h-10 w-full rounded-lg" />
      </div>

      <GraficoCategorias
        v-else
        class="mt-3"
        :fatias="fatias"
        :vazio="`Nenhuma compra em ${formatarMes(competencia)}.`"
        @selecionar="categoriaAberta = $event"
      />
    </section>

    <CategoriaCompras
      v-model:aberto="categoriaVisivel"
      :fatia="fatiaAberta"
      :periodo="formatarMes(competencia)"
      :pode-editar="podeEditar"
      :detalhe="detalheDe"
      @selecionar="editar"
      @remover="onRemover"
    />

    <CompraDialogo
      v-model:aberto="dialogoAberto"
      :membros="membros ?? []"
      :categorias="categorias ?? []"
      :categorias-pessoais="categoriasPessoais ?? []"
      :competencia-visivel="competencia"
      :compra="compraEmEdicao"
    />
  </div>
</template>
