<script setup lang="ts">
/**
 * Formulário de uma compra.
 *
 * O rateio é o campo que carrega a regra: o que a pessoa digita — porcentagem
 * ou reais — vira o PESO de cada participante, sem virar percentual pelo
 * caminho. "R$ 500 de R$ 1.500" grava peso 500 contra 1000, uma razão exata;
 * guardar 33,33% devolveria R$ 499,95 na hora de exibir.
 *
 * O segundo eixo do formulário é EM QUE GAVETA a compra cai. Num espaço
 * compartilhado o default é "compartilhada" — é o caso comum de quem está com o
 * espaço do casal aberto, e é o erro barato (aparece para os dois, e alguém
 * corrige). O contrário esconderia da outra pessoa um lançamento que ela espera
 * ver. "Pessoal" grava no espaço pessoal, que é onde a privacidade é garantida
 * pela RLS e não por um filtro que alguém precise lembrar de aplicar.
 */
import { toast } from 'vue-sonner'
import { CheckIcon } from '@lucide/vue'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deMesInput, hojeIso, paraMesInput, primeiroDoMes } from '@/lib/datas'
import { formatarDinheiro } from '@/lib/dinheiro'
import { ehAdmin } from '~/types/database.types'
import type { CorCategoria, InformadoComo } from '~/types/database.types'
import { formatarListaDeMeses, formatarMes } from '@/lib/datas'
import { competenciasAcertadas, dividirIgualmente as dividirEmPartesIguais, rateioIgual } from '~/types/orcamento'
import type { Categoria, CompraDoMes, Participante } from '~/types/orcamento'
import type { Membro } from '~/composables/useMembros'
import { useGastosPessoais } from '~/composables/useGastosPessoais'
import { useAcertos, useAtualizarCompra, useMoverCompra, useRegistrarCompra } from '~/composables/useOrcamento'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'

const props = defineProps<{
  membros: Membro[]
  categorias: Categoria[]
  /** As do espaço pessoal — cada gaveta tem a sua lista. */
  categoriasPessoais: Categoria[]
  competenciaVisivel: string
  /** Preenchida = edição; ausente = compra nova. */
  compra?: CompraDoMes | null
}>()

const aberto = defineModel<boolean>('aberto', { required: true })

const usuarioId = useUsuarioId()
const store = useSpaceStore()

// ---- Em que gaveta a compra cai ---------------------------------------------

const { espacoPessoalId, disponivel: podeEscolherGaveta, ligado } = useGastosPessoais()

const GAVETAS = [
  { valor: 'compartilhado' as const, rotulo: 'Compra compartilhada' },
  { valor: 'pessoal' as const, rotulo: 'Compra pessoal' },
]

const modo = ref<'compartilhado' | 'pessoal'>('compartilhado')
const pessoal = computed(() => modo.value === 'pessoal')

/** No espaço pessoal não há escolha a fazer: tudo ali já é seu. */
const espacoAtivoEhPessoal = computed(() =>
  !!espacoPessoalId.value && espacoPessoalId.value === store.espacoAtivoId,
)

const espacoDestino = computed(() =>
  pessoal.value ? espacoPessoalId.value : store.espacoAtivoId,
)

const registrar = useRegistrarCompra(espacoDestino)
const atualizar = useAtualizarCompra(espacoDestino)

const editando = computed(() => !!props.compra)
const salvando = computed(() => registrar.isPending.value || atualizar.isPending.value)

const categoriasDaGaveta = computed(() =>
  pessoal.value ? props.categoriasPessoais : props.categorias,
)

const souAdmin = computed(() =>
  ehAdmin(props.membros.find(m => m.user_id === usuarioId.value)?.papel),
)

// ---- Estado do formulário ---------------------------------------------------

const descricao = ref('')
// `undefined` e não `null`: o Input do shadcn não aceita null em model-value.
const valorTotal = ref<number | undefined>(undefined)
const dataCompra = ref(hojeIso())
const competencia = ref(paraMesInput(props.competenciaVisivel))
const parcelas = ref(1)
const pagoPor = ref('')
const categoriaNome = ref('')
const categoriaCor = ref<CorCategoria>('cinza')

const modoRateio = ref<InformadoComo>('percentual')
/** O que foi digitado por pessoa, na unidade do modo. Vira peso direto. */
const partes = ref<Record<string, number>>({})

/*
 * A competência acompanha a data da compra até alguém mexer nela à mão. Depende
 * do fechamento do cartão — comprar dia 28/07 pode cair em julho ou agosto, e
 * só quem comprou sabe —, então o palpite é útil mas nunca definitivo.
 */
const competenciaTocada = ref(false)

watch(dataCompra, (nova) => {
  if (!competenciaTocada.value && nova) competencia.value = paraMesInput(primeiroDoMes(nova))
})

/** A conta mora em `app/types/orcamento.ts`, para servir também a quem não tem formulário. */
function dividirIgualmente() {
  if (!props.membros.length) return
  const total = modoRateio.value === 'percentual' ? 100 : (valorTotal.value ?? 0)
  partes.value = dividirEmPartesIguais(props.membros.map(m => m.user_id), total)
}

/**
 * Ao mexer na parte de alguém, o restante se redistribui entre os outros. Num
 * espaço de duas pessoas isso é o comportamento óbvio: "eu pago 500" implica
 * que o resto é do outro, sem precisar digitar duas vezes.
 */
function ajustar(userId: string, valor: number) {
  const total = modoRateio.value === 'percentual' ? 100 : (valorTotal.value ?? 0)
  const outros = props.membros.filter(m => m.user_id !== userId).map(m => m.user_id)

  partes.value = {
    ...partes.value,
    [userId]: valor,
    ...dividirEmPartesIguais(outros, Math.max(total - valor, 0)),
  }
}

function reiniciar() {
  modo.value = espacoAtivoEhPessoal.value ? 'pessoal' : 'compartilhado'
  descricao.value = ''
  valorTotal.value = undefined
  dataCompra.value = hojeIso()
  competencia.value = paraMesInput(props.competenciaVisivel)
  competenciaTocada.value = false
  parcelas.value = 1
  pagoPor.value = usuarioId.value ?? ''
  categoriaNome.value = ''
  categoriaCor.value = 'cinza'
  modoRateio.value = 'percentual'
  dividirIgualmente()
}

/*
 * Preencher para edição é direto porque o peso é o que a pessoa digitou — não
 * um percentual derivado. "R$ 500 de R$ 1.500" volta ao campo como 500, no modo
 * R$; "50%" volta como 50, no modo %. Nada é reconstruído por engenharia
 * reversa, que é onde apareceria o centavo perdido.
 */
function preencherCom(compra: CompraDoMes) {
  modo.value = compra.space_id === espacoPessoalId.value ? 'pessoal' : 'compartilhado'
  descricao.value = compra.descricao
  valorTotal.value = Number(compra.valor_total)
  dataCompra.value = compra.data_compra
  competencia.value = paraMesInput(compra.competencia_inicial)
  competenciaTocada.value = true
  parcelas.value = compra.parcelas
  pagoPor.value = compra.pago_por
  categoriaNome.value = compra.categoria?.nome ?? ''
  categoriaCor.value = compra.categoria?.cor ?? 'cinza'
  modoRateio.value = compra.participantes[0]?.informado_como ?? 'percentual'

  // Quem não estava no rateio entra com zero, para o campo dele existir na tela.
  const novo: Record<string, number> = {}
  for (const membro of props.membros) novo[membro.user_id] = 0
  for (const p of compra.participantes) novo[p.user_id] = Number(p.peso)
  partes.value = novo
}

watch(aberto, (estaAberto) => {
  if (!estaAberto) return
  confirmandoMover.value = false
  if (props.compra) preencherCom(props.compra)
  else reiniciar()
})

// ---- Mover de gaveta (`mover_compra`) -------------------------------------------

/*
 * Editar não troca a gaveta pelo alternador de cima: mudar a compra de espaço é
 * apagar e recriar (o rateio antigo aponta para membros do espaço de origem), e
 * isso é uma ação própria, com confirmação, e não um efeito colateral de "Salvar".
 * Ela leva a compra SALVA — o que estiver mexido no formulário fica para trás.
 */
const mover = useMoverCompra()
const confirmandoMover = ref(false)

const destinoDoMover = computed(() => (pessoal.value ? store.espacoAtivoId : espacoPessoalId.value))

/** Mover para o pessoal uma compra que outra pessoa pagou faz de você quem pagou. */
const outraPessoaPagou = computed(() =>
  !!props.compra && !pessoal.value && props.compra.pago_por !== usuarioId.value,
)

async function moverDeGaveta() {
  const compra = props.compra
  const destino = destinoDoMover.value
  if (!compra || !destino || !usuarioId.value) return

  const paraPessoal = !pessoal.value
  // O pessoal é você inteiro; o espaço entra meio a meio, e a pessoa ajusta depois.
  const participantes: Participante[] = paraPessoal
    ? [{ user_id: usuarioId.value, peso: 1, informado_como: 'percentual' }]
    : rateioIgual(props.membros.map(m => m.user_id))

  try {
    await mover.mutateAsync({ compra, destino, participantes })
    // O "salvei e sumiu" do lançamento vale aqui também: mostrar onde a compra caiu.
    if (paraPessoal && podeEscolherGaveta.value) ligado.value = true
    toast.success(paraPessoal
      ? 'Movida para os seus gastos pessoais.'
      : 'Movida para o espaço, meio a meio — edite se o rateio for outro.')
    aberto.value = false
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para mover a compra.'))
  }
}

/*
 * Trocar de unidade redivide, mas só quando é a pessoa clicando. Um `watch` em
 * `modoRateio` também dispararia ao abrir em modo de edição — e apagaria o
 * rateio que acabou de ser carregado do banco.
 */
function trocarModo(modo: InformadoComo) {
  if (modoRateio.value === modo) return
  modoRateio.value = modo
  dividirIgualmente()
}

/**
 * Trocar de gaveta não é só mudar o destino: um gasto pessoal não tem rateio nem
 * "quem pagou" (é você, sempre), então os dois campos somem da tela. Ao voltar
 * para compartilhada, o rateio só é refeito se tiver deixado de fechar — mexer
 * num rateio que a pessoa digitou à mão seria perder o que ela escreveu.
 */
function trocarGaveta(nova: 'compartilhado' | 'pessoal') {
  if (modo.value === nova || editando.value) return
  modo.value = nova

  if (nova === 'pessoal') pagoPor.value = usuarioId.value ?? ''
  else if (!somaConfere.value) dividirIgualmente()
}

// ---- Derivados --------------------------------------------------------------

const somaPartes = computed(() =>
  Object.values(partes.value).reduce((t, v) => t + (Number(v) || 0), 0),
)

const alvoSoma = computed(() =>
  modoRateio.value === 'percentual' ? 100 : (valorTotal.value ?? 0),
)

const somaConfere = computed(() => Math.abs(somaPartes.value - alvoSoma.value) < 0.01)

const valorDaParcela = computed(() => {
  const total = valorTotal.value ?? 0
  const n = Math.max(parcelas.value || 1, 1)
  if (n === 1) return total
  // Espelha a view: as N-1 primeiras truncadas, a última absorve o resto.
  return Math.floor((total / n) * 100) / 100
})

const podeSalvar = computed(() =>
  !!descricao.value.trim()
  && (valorTotal.value ?? 0) > 0
  && !!dataCompra.value
  && !!competencia.value
  // Numa compra pessoal não há rateio a fechar nem pagador a escolher.
  && (pessoal.value
    ? !!usuarioId.value && !!espacoPessoalId.value
    : !!pagoPor.value && somaConfere.value)
  && !salvando.value,
)

const nomeDoMembro = (id: string) => props.membros.find(m => m.user_id === id)?.exibicao ?? 'Alguém'

/**
 * Mexer na competência move TODAS as parcelas de uma vez — a view reexpande a
 * compra a partir da nova âncora. Não há nada a reconciliar, mas o mês que a
 * pessoa estava olhando pode passar a mostrar outra parcela, ou nenhuma. Pior:
 * o saldo de um mês já acertado muda sem aviso, porque o app ainda não tem o
 * conceito de competência fechada. Daí o alerta explícito.
 */
const competenciaMudou = computed(() =>
  editando.value
  && !!props.compra
  && deMesInput(competencia.value) !== props.compra.competencia_inicial,
)

const parcelaNoMesVisivel = computed(() => {
  if (!editando.value) return null
  const inicio = deMesInput(competencia.value)
  const [anoI, mesI] = inicio.split('-').map(Number)
  const [anoV, mesV] = props.competenciaVisivel.split('-').map(Number)
  const delta = (anoV! - anoI!) * 12 + (mesV! - mesI!)
  const n = Math.max(parcelas.value || 1, 1)
  return delta >= 0 && delta < n ? delta + 1 : null
})

// ---- Mês já acertado ------------------------------------------------------------

/*
 * Avisa, não trava (decisão 7 do planejamento): o casal corrige o passado, e o
 * acerto é decisão humana, não proibição. Mas mexer num mês que já foi pago muda
 * um saldo que os dois deram por resolvido — e isso precisa estar na tela antes de
 * salvar, e não ser descoberto depois.
 *
 * Os acertos são os do espaço ativo, que é onde vive a compra compartilhada. A
 * compra pessoal não entra em acerto nenhum, então não avisa.
 */
const { data: acertos } = useAcertos()

/**
 * Numa edição, só avisa se o que mudou mexe em dinheiro — corrigir a descrição de
 * uma compra de julho não muda o saldo de julho.
 */
const mudaDinheiro = computed(() => {
  const c = props.compra
  if (!c) return true
  if (Number(c.valor_total) !== valorTotal.value) return true
  if (c.parcelas !== Math.max(parcelas.value || 1, 1)) return true
  if (c.competencia_inicial !== deMesInput(competencia.value)) return true
  if (c.pago_por !== pagoPor.value) return true
  const pesoDe = (id: string) => Number(partes.value[id] ?? 0)
  return c.participantes.some(p => Math.abs(Number(p.peso) - pesoDe(p.user_id)) > 0.00001)
    || Object.keys(partes.value).some(id => pesoDe(id) > 0 && !c.participantes.some(p => p.user_id === id))
})

/** Os meses acertados que a compra toca — os de depois e, numa edição, os de antes. */
const mesesAcertados = computed(() => {
  const lista = acertos.value ?? []
  if (pessoal.value || !lista.length || !competencia.value || !mudaDinheiro.value) return []

  const meses = new Set(competenciasAcertadas(
    { competencia_inicial: deMesInput(competencia.value), parcelas: Math.max(parcelas.value || 1, 1) },
    lista,
  ))
  if (props.compra) for (const m of competenciasAcertadas(props.compra, lista)) meses.add(m)

  return [...meses].sort()
})

async function salvar() {
  if (!podeSalvar.value) return

  /*
   * Numa compra pessoal o rateio é você inteiro: um participante, peso 1. A RPC
   * exige ao menos um participante com peso positivo (uma compra sem rateio
   * dividiria por zero no saldo), e no espaço pessoal você é o único membro que
   * o trigger de validação aceitaria de qualquer forma.
   */
  const dados = {
    descricao: descricao.value.trim(),
    valor_total: valorTotal.value!,
    data_compra: dataCompra.value,
    competencia_inicial: deMesInput(competencia.value),
    parcelas: Math.max(parcelas.value || 1, 1),
    pago_por: pessoal.value ? usuarioId.value! : pagoPor.value,
    participantes: pessoal.value
      ? [{ user_id: usuarioId.value!, peso: 1, informado_como: 'percentual' as InformadoComo }]
      : props.membros
          .map(m => ({
            user_id: m.user_id,
            peso: Number(partes.value[m.user_id] ?? 0),
            informado_como: modoRateio.value,
          }))
          // Quem não participa do rateio não entra — peso zero só polui a linha.
          .filter(p => p.peso > 0),
    categoria_nome: categoriaNome.value.trim() || null,
    categoria_cor: categoriaNome.value.trim() ? categoriaCor.value : null,
  }

  try {
    if (props.compra) {
      await atualizar.mutateAsync({ ...dados, id: props.compra.id })
      toast.success('Compra atualizada.')
    }
    else {
      await registrar.mutateAsync(dados)

      /*
       * Sem isto, lançar uma compra pessoal com o alternador desligado grava uma
       * linha que não aparece em lugar nenhum da tela — o clássico "salvei e
       * sumiu", que faz a pessoa lançar de novo. Ligar o alternador é mais
       * honesto do que só avisar: mostra onde a compra caiu.
       */
      if (pessoal.value && podeEscolherGaveta.value) ligado.value = true

      toast.success(pessoal.value
        ? 'Lançada nos seus gastos pessoais.'
        : 'Compra registrada.')
    }
    aberto.value = false
  }
  catch (e) {
    toast.error(mensagemDeErro(e, editando.value
      ? 'Não deu para salvar as alterações.'
      : 'Não deu para registrar a compra.'))
  }
}
</script>

<template>
  <Dialog v-model:open="aberto">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ editando ? 'Editar compra' : 'Nova compra' }}</DialogTitle>
        <DialogDescription>
          {{ pessoal
            ? 'Um gasto que é só seu: o que foi e quanto custou.'
            : 'Uma linha da lista: o que foi, quanto custou e como divide.' }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <!--
          A primeira pergunta do formulário, e não a última: ela decide se metade
          dos campos abaixo existe. Só aparece num espaço compartilhado — dentro
          do próprio pessoal não há escolha a fazer.
        -->
        <div v-if="podeEscolherGaveta" class="space-y-2">
          <Label class="text-sm">Onde entra</Label>

          <div class="flex gap-1 rounded-lg border p-1">
            <Button
              v-for="gaveta in GAVETAS"
              :key="gaveta.valor"
              type="button"
              size="sm"
              class="flex-1"
              :variant="modo === gaveta.valor ? 'default' : 'ghost'"
              :disabled="editando && modo !== gaveta.valor"
              @click="trocarGaveta(gaveta.valor)"
            >
              {{ gaveta.rotulo }}
            </Button>
          </div>

          <p class="text-xs text-muted-foreground">
            <template v-if="pessoal">
              Só você vê. Não entra no rateio nem no acerto do mês.
            </template>
            <template v-else>
              Aparece para todo mundo do espaço e entra no acerto do mês.
            </template>
          </p>

          <!--
            Trocar de gaveta numa compra lançada é mudá-la de espaço (`mover_compra`):
            uma ação própria, com confirmação, e não o alternador acima.
          -->
          <div v-if="editando" class="space-y-2">
            <Button
              v-if="!confirmandoMover"
              type="button"
              size="sm"
              variant="outline"
              @click="confirmandoMover = true"
            >
              {{ pessoal ? 'Mover para o espaço' : 'Mover para os meus gastos pessoais' }}
            </Button>

            <div v-else class="space-y-2 rounded-md border p-2.5 text-xs">
              <p>
                <template v-if="pessoal">
                  A compra entra no espaço dividida meio a meio, passa a aparecer para todo mundo
                  e entra no acerto do mês.
                </template>
                <template v-else>
                  A compra sai do espaço — some para os outros e do acerto do mês — e fica só com você.
                  <template v-if="outraPessoaPagou">Quem pagou passa a ser você: no pessoal não há mais ninguém.</template>
                </template>
                O que estiver mexido neste formulário não vai junto.
              </p>
              <div class="flex gap-2">
                <Button type="button" size="sm" :disabled="mover.isPending.value" @click="moverDeGaveta">
                  {{ mover.isPending.value ? 'Movendo…' : 'Mover' }}
                </Button>
                <Button type="button" size="sm" variant="ghost" @click="confirmandoMover = false">Cancelar</Button>
              </div>
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <Label for="compra-descricao">Descrição</Label>
          <Input id="compra-descricao" v-model="descricao" placeholder="Mercado do mês" />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-2">
            <Label for="compra-valor">Valor total</Label>
            <Input
              id="compra-valor"
              v-model.number="valorTotal"
              type="number"
              inputmode="decimal"
              step="0.01"
              min="0.01"
              placeholder="0,00"
            />
          </div>

          <div class="space-y-2">
            <Label for="compra-parcelas">Parcelas</Label>
            <Input
              id="compra-parcelas"
              v-model.number="parcelas"
              type="number"
              inputmode="numeric"
              min="1"
              max="120"
            />
            <p v-if="parcelas > 1 && valorTotal" class="text-xs text-muted-foreground">
              {{ parcelas }}× de {{ formatarDinheiro(valorDaParcela) }}
              <span class="opacity-70">— a última ajusta os centavos</span>
            </p>
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-2">
            <Label for="compra-data">Data da compra</Label>
            <Input id="compra-data" v-model="dataCompra" type="date" />
          </div>

          <div class="space-y-2">
            <Label for="compra-competencia">Primeira parcela em</Label>
            <Input
              id="compra-competencia"
              v-model="competencia"
              type="month"
              @input="competenciaTocada = true"
            />
            <p class="text-xs text-muted-foreground">
              Depende do fechamento do cartão.
            </p>
          </div>
        </div>

        <!--
          Mover a competência é limpo no banco (as parcelas são derivadas), mas
          muda o saldo de meses que talvez já tenham sido acertados. O app não
          tem trava de mês fechado, então o aviso é a única defesa.
        -->
        <p
          v-if="competenciaMudou"
          class="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs"
        >
          Isto move todas as parcelas desta compra.
          <template v-if="parcelaNoMesVisivel">
            Em {{ formatarMes(competenciaVisivel) }} ela passa a aparecer como
            <strong>{{ parcelaNoMesVisivel }}/{{ Math.max(parcelas || 1, 1) }}</strong>.
          </template>
          <template v-else>
            Ela deixa de aparecer em {{ formatarMes(competenciaVisivel) }}.
          </template>
          O acerto dos meses afetados muda junto — inclusive de meses já fechados.
        </p>

        <!-- Aviso, não trava: salvar continua valendo. -->
        <p
          v-if="mesesAcertados.length"
          class="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs"
        >
          {{ editando ? 'Isto muda' : 'Esta compra muda' }} o saldo de
          <strong>{{ formatarListaDeMeses(mesesAcertados) }}</strong>,
          {{ mesesAcertados.length === 1 ? 'que já foi acertado' : 'que já foram acertados' }}.
          O acerto continua marcado — vale combinar se é preciso refazer a conta.
        </p>

        <div class="space-y-2">
          <Label for="compra-categoria">Categoria</Label>
          <CategoriaSelect
            id="compra-categoria"
            v-model:nome="categoriaNome"
            v-model:cor="categoriaCor"
            :categorias="categoriasDaGaveta"
          />
        </div>

        <div v-if="!pessoal" class="space-y-2">
          <Label>Quem pagou</Label>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline" class="w-full justify-start" :disabled="!souAdmin">
                {{ pagoPor ? nomeDoMembro(pagoPor) : 'Selecione' }}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" class="w-56">
              <DropdownMenuItem
                v-for="membro in membros"
                :key="membro.user_id"
                class="gap-2"
                @select="pagoPor = membro.user_id"
              >
                <span class="flex-1">{{ membro.exibicao }}</span>
                <CheckIcon v-if="membro.user_id === pagoPor" class="size-4 text-primary" />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <p v-if="!souAdmin" class="text-xs text-muted-foreground">
            Só dono ou admin lança compra no nome de outra pessoa.
          </p>
        </div>

        <!-- Rateio — não existe numa compra pessoal: é você inteiro -->
        <div v-if="!pessoal" class="space-y-3 rounded-lg border p-3">
          <div class="flex items-center justify-between gap-2">
            <Label class="text-sm">Como divide</Label>
            <div class="flex gap-1">
              <Button
                v-for="modo in (['percentual', 'valor'] as InformadoComo[])"
                :key="modo"
                type="button"
                size="sm"
                :variant="modoRateio === modo ? 'default' : 'ghost'"
                @click="trocarModo(modo)"
              >
                {{ modo === 'percentual' ? '%' : 'R$' }}
              </Button>
            </div>
          </div>

          <div v-for="membro in membros" :key="membro.user_id" class="flex items-center gap-3">
            <span class="min-w-0 flex-1 truncate text-sm">{{ membro.exibicao }}</span>
            <Input
              :model-value="partes[membro.user_id] ?? 0"
              type="number"
              inputmode="decimal"
              step="0.01"
              min="0"
              class="w-28"
              @update:model-value="ajustar(membro.user_id, Number($event) || 0)"
            />
            <span class="w-6 text-xs text-muted-foreground">
              {{ modoRateio === 'percentual' ? '%' : 'R$' }}
            </span>
          </div>

          <div class="flex items-center justify-between gap-2 text-xs">
            <Button type="button" size="sm" variant="ghost" @click="dividirIgualmente">
              Dividir igualmente
            </Button>
            <span :class="somaConfere ? 'text-muted-foreground' : 'text-destructive'">
              Soma: {{ modoRateio === 'percentual'
                ? `${somaPartes.toFixed(2)}%`
                : formatarDinheiro(somaPartes) }}
            </span>
          </div>

          <p v-if="modoRateio === 'valor'" class="text-xs text-muted-foreground">
            Digite quanto é de cada um; o resto vai para o outro automaticamente.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" @click="aberto = false">Cancelar</Button>
        <Button :disabled="!podeSalvar" @click="salvar">
          {{ salvando ? 'Salvando…' : editando ? 'Salvar' : 'Registrar' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
