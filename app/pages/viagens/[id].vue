<script setup lang="ts">
import { mensagemDeErro } from '@/lib/utils'
import { watchDebounced } from '@vueuse/core'
import { LockIcon, PencilIcon, Trash2Icon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarDiaCurto } from '@/lib/datas'
import type { ParadaParaSalvar } from '~/types/viagem'
import type { RoteiroParaSalvar } from '~/composables/useRoteiros'
import { MODOS_TRANSPORTE, paradasOrdenadas } from '~/types/viagem'
import {
  paraSalvar,
  useApagarRoteiro,
  useAtualizarRoteiro,
  useLiberarRoteiro,
  useMarcarRoteiroVisto,
  useRoteiro,
  useSalvarParadas,
} from '~/composables/useRoteiros'
import { useUsuarioId } from '~/composables/useUsuarioId'

const route = useRoute()
const roteiroId = route.params.id as string
const usuarioId = useUsuarioId()

const { data: roteiro, isPending, isError, error } = useRoteiro(roteiroId)
const atualizar = useAtualizarRoteiro()
const apagar = useApagarRoteiro()
const salvarParadas = useSalvarParadas()
const liberar = useLiberarRoteiro()
const marcarVisto = useMarcarRoteiroVisto()

useHead({ title: () => `${roteiro.value?.nome ?? 'Carregando…'} · APPingos` })

const souOCriador = computed(() => roteiro.value?.criado_por === usuarioId.value)
const secreto = computed(() => roteiro.value?.visibilidade === 'segredo')

/*
 * Abrir É a leitura. Dispara uma vez, quando o roteiro chega, e falha em
 * silêncio — o pior caso é o selo "Novo" continuar aparecendo, que é o estado
 * de antes. Um toast de erro aqui só atrapalharia quem só queria ler.
 */
const jaMarquei = ref(false)
watch(roteiro, (r) => {
  if (!r || jaMarquei.value) return
  jaMarquei.value = true
  marcarVisto.mutate(r.id)
}, { immediate: true })

// ---- Paradas ---------------------------------------------------------------

/*
 * A tela edita um rascunho e o banco recebe a lista inteira, com atraso.
 *
 * Salvar a cada tecla da anotação seria uma RPC por caractere; um botão
 * "Salvar" seria a forma clássica de perder o trabalho de alguém que fechou a
 * aba. O meio-termo é gravar sozinho pouco depois da última mexida.
 *
 * O que está gravado é `ultimoSalvo`, e "sujo" é a comparação com ele — não uma
 * bandeira que alguém liga e desliga. A diferença importa numa corrida real:
 * mexer numa parada ENQUANTO o salvamento anterior está no ar. Com bandeira, o
 * salvamento que volta desliga o "sujo" e a mexida seguinte nunca é gravada,
 * sem erro nenhum na tela. Comparando com o que de fato foi gravado, a segunda
 * mexida continua diferente e é salva na sequência.
 *
 * É também o que impede a revalidação da query de pisar no que está sendo
 * editado — foi assim que o rascunho de avaliação em Filmes se perdia.
 */
const rascunho = ref<ParadaParaSalvar[]>([])
const ultimoSalvo = ref<string | null>(null)

const sujo = computed(() =>
  ultimoSalvo.value !== null && JSON.stringify(rascunho.value) !== ultimoSalvo.value,
)

watch(() => roteiro.value?.paradas, (paradas) => {
  if (!paradas || sujo.value) return

  rascunho.value = paraSalvar(paradasOrdenadas(paradas))
  ultimoSalvo.value = JSON.stringify(rascunho.value)
}, { immediate: true, deep: true })

function atualizarParadas(lista: ParadaParaSalvar[]) {
  rascunho.value = lista
}

watchDebounced(rascunho, async () => {
  if (!sujo.value) return

  // Congelado ANTES da chamada: o que volta confirma esta lista, não a que a
  // pessoa possa ter deixado na tela enquanto a RPC estava no ar.
  const enviado = JSON.stringify(rascunho.value)

  try {
    await salvarParadas.mutateAsync({ roteiroId, paradas: JSON.parse(enviado) })
    ultimoSalvo.value = enviado
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para salvar as paradas.'))
  }
}, { debounce: 700, deep: true })

// ---- Abertura no Google Maps -----------------------------------------------

/*
 * Três recortes: o roteiro inteiro, um dia, ou o que estiver marcado. Quem
 * monta os links é `LinksDoMaps`; aqui fica só a escolha, porque ela também
 * comanda a lista — no modo seleção a lista mostra caixas e para de ser
 * editável, senão reordenar embaralharia o que está marcado.
 */
const aberturaEm = ref<'tudo' | 'dia' | 'selecao'>('tudo')
const selecionadas = ref<number[]>([])

const selecionando = computed(() => aberturaEm.value === 'selecao')

/*
 * Sair do modo zera a seleção. Ela é por índice, e fora dele a lista volta a ser
 * reordenável — guardar índices através disso seria guardar posições que já
 * podem ser de outras paradas. Entrar não zera: o gesto que abre o modo já traz
 * a primeira parada marcada.
 */
watch(aberturaEm, (modo) => {
  if (modo !== 'selecao') selecionadas.value = []
})

/** Segurar no toque, ou marcar a caixa no mouse: abre o modo já com ela dentro. */
function entrarNaSelecao(i: number) {
  aberturaEm.value = 'selecao'
  selecionadas.value = [i]
}

/*
 * Desmarcar a última fecha o modo. É o que a galeria de fotos faz, e evita a
 * tela ficar num estado que não serve para nada — modo seleção sem nada
 * selecionado só tira a edição de quem esqueceu de sair.
 */
function alternarSelecao(i: number) {
  const proxima = selecionadas.value.includes(i)
    ? selecionadas.value.filter(n => n !== i)
    : [...selecionadas.value, i]

  selecionadas.value = proxima
  if (!proxima.length) aberturaEm.value = 'tudo'
}

const modo = computed(() =>
  MODOS_TRANSPORTE.find(m => m.valor === roteiro.value?.modo_transporte),
)

const periodo = computed(() => {
  const inicio = roteiro.value?.data_inicio
  const fim = roteiro.value?.data_fim
  if (!inicio) return null
  return fim ? `${formatarDiaCurto(inicio)} → ${formatarDiaCurto(fim)}` : `A partir de ${formatarDiaCurto(inicio)}`
})

// ---- Cabeçalho: editar, liberar, apagar ------------------------------------

const dialogoAberto = ref(false)

async function onEditar(campos: RoteiroParaSalvar) {
  try {
    const { secreto: _ignorado, ...resto } = campos
    await atualizar.mutateAsync({ id: roteiroId, campos: resto })
    dialogoAberto.value = false
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para salvar o roteiro.'))
  }
}

async function onLiberar() {
  try {
    await liberar.mutateAsync(roteiroId)
    toast.success('Roteiro liberado — já aparece para o resto do espaço.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para liberar o roteiro.'))
  }
}

async function onApagar() {
  if (!confirm(`Apagar "${roteiro.value?.nome}" e todas as paradas?`)) return

  try {
    await apagar.mutateAsync(roteiroId)
    await navigateTo('/viagens')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para apagar o roteiro.'))
  }
}
</script>

<template>
  <div class="space-y-6">
    <BotaoVoltar to="/viagens" rotulo="Viagens" />

    <div v-if="isPending" class="space-y-4">
      <Skeleton class="h-8 w-64" />
      <Skeleton class="aspect-video w-full rounded-lg" />
    </div>

    <p v-else-if="isError" class="text-sm text-destructive">
      {{ mensagemDeErro(error, 'Este roteiro não existe ou não é seu.') }}
    </p>

    <template v-else-if="roteiro">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {{ roteiro.nome }}
            <span
              v-if="secreto"
              class="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
            >
              <LockIcon class="size-3" />
              Segredo
            </span>
          </h1>

          <p v-if="roteiro.descricao" class="mt-1 text-sm text-muted-foreground">
            {{ roteiro.descricao }}
          </p>

          <p class="mt-1 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
            <span v-if="periodo">{{ periodo }}</span>
            <span v-if="modo">{{ modo.rotulo }}</span>
          </p>
        </div>

        <div class="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" class="gap-1.5" @click="dialogoAberto = true">
            <PencilIcon class="size-4" />
            Editar
          </Button>
          <Button variant="ghost" size="sm" class="gap-1.5 text-destructive" @click="onApagar">
            <Trash2Icon class="size-4" />
            Apagar
          </Button>
        </div>
      </header>

      <!--
        A faixa da revelação. Só quem criou vê, porque para o resto do espaço
        este roteiro ainda não existe.
      -->
      <section
        v-if="secreto && souOCriador"
        class="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3"
      >
        <p class="min-w-0 flex-1 text-sm">
          Só você enxerga este roteiro. Ao liberar, ele aparece para o resto do
          espaço com um aviso no painel — e não dá para escondê-lo de novo.
        </p>
        <Button size="sm" :disabled="liberar.isPending.value" @click="onLiberar">
          {{ liberar.isPending.value ? 'Liberando…' : 'Liberar' }}
        </Button>
      </section>

      <MapaDoRoteiro :paradas="rascunho" :modo="roteiro.modo_transporte" />

      <LinksDoMaps
        v-model:abertura-em="aberturaEm"
        :paradas="rascunho"
        :modo="roteiro.modo_transporte"
        :data-inicio="roteiro.data_inicio"
        :selecionadas="selecionadas"
      />

      <!-- Paradas -->
      <section class="space-y-3">
        <div class="flex items-baseline justify-between gap-2">
          <h2 class="text-sm font-medium">Paradas</h2>
          <span v-if="sujo || salvarParadas.isPending.value" class="text-xs text-muted-foreground">
            Salvando…
          </span>
        </div>

        <BuscaDeLugar v-if="!selecionando" @adicionar="atualizarParadas([...rascunho, $event])" />

        <ListaDeParadas
          :paradas="rascunho"
          :data-inicio="roteiro.data_inicio"
          :editavel="!selecionando"
          :selecionavel="selecionando"
          :selecionadas="selecionadas"
          @atualizar="atualizarParadas"
          @alternar="alternarSelecao"
          @entrar-na-selecao="entrarNaSelecao"
        />
      </section>

      <RoteiroDialogo
        v-model:open="dialogoAberto"
        :roteiro="roteiro"
        :salvando="atualizar.isPending.value"
        @salvar="onEditar"
      />
    </template>
  </div>
</template>
