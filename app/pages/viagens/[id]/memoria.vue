<script setup lang="ts">
/**
 * A memória da viagem — o editor à esquerda do documento, ou o documento puro.
 *
 * Três coisas moram aqui e em nenhum outro lugar:
 *
 * 1. O RASCUNHO. O texto das seções é editado localmente e gravado sozinho 700 ms
 *    depois da última tecla, exatamente como as paradas do roteiro. E "sujo" é a
 *    COMPARAÇÃO com o que de fato foi gravado, não uma bandeira que alguém liga e
 *    desliga — a diferença aparece numa corrida real: mexer numa seção ENQUANTO o
 *    salvamento anterior está no ar. Com bandeira, o salvamento que volta desliga
 *    o "sujo" e a mexida seguinte nunca é gravada, sem erro nenhum na tela. O
 *    comentário grande de `app/pages/viagens/[id]/index.vue` explica a mesma
 *    corrida com mais calma, e vale palavra por palavra.
 *
 * 2. O ID DA SEÇÃO NASCE AQUI. `crypto.randomUUID()` no instante em que a seção
 *    aparece na tela, e não um default do Postgres. É o que permite `salvar_secoes`
 *    reconciliar por id em vez de apagar e reinserir — e apagar levaria junto,
 *    pelo cascade, todas as fotos e músicas anexadas, a cada salvamento
 *    automático.
 *
 * 3. ANEXAR EXIGE SEÇÃO GRAVADA. `memoria_item.secao_id` é uma FK: não dá para
 *    pendurar uma foto numa seção que só existe no rascunho. Por isso o seletor
 *    espera o salvamento antes de abrir — é meio segundo, e a alternativa é um
 *    erro de chave estrangeira no meio de um gesto que a pessoa considera
 *    instantâneo.
 */
import { watchDebounced } from '@vueuse/core'
import { toast } from 'vue-sonner'
import {
  BookOpenIcon,
  CalendarPlusIcon,
  NotebookPenIcon,
  PlusIcon,
  PrinterIcon,
  RotateCcwIcon,
  StarIcon,
} from '@lucide/vue'
import { mensagemDeErro } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { blocosDaMemoria, diasSemSecao, paginar, rotuloDaData, secaoVazia } from '~/lib/memoria'
import type { ItemDaMemoria, SecaoDaMemoria } from '~/lib/memoria'
import type { ItemAnexavel } from '~/composables/useMemoria'
import {
  secoesParaSalvar,
  useAdicionarItens,
  useConcluirMemoria,
  useCriarMemoria,
  useDefinirNota,
  useMemoria,
  useReabrirMemoria,
  useRemoverItemDaMemoria,
  useSalvarSecoes,
} from '~/composables/useMemoria'
import { useRoteiro } from '~/composables/useRoteiros'
import { useUrlsDosCaminhos } from '~/composables/useFotos'

const route = useRoute()
const roteiroId = route.params.id as string

const { data: roteiro, isPending: carregandoRoteiro } = useRoteiro(roteiroId)
const { data: memoria, isPending: carregandoMemoria } = useMemoria(roteiroId)

const criar = useCriarMemoria()
const salvar = useSalvarSecoes()
const definirNota = useDefinirNota()
const concluir = useConcluirMemoria()
const reabrir = useReabrirMemoria()
const adicionarItens = useAdicionarItens()
const removerItem = useRemoverItemDaMemoria()

useHead({
  title: () => (roteiro.value
    ? `Memória de ${roteiro.value.nome} · APPingos`
    : 'Memória da viagem · APPingos'),
})

const carregando = computed(() => carregandoRoteiro.value || carregandoMemoria.value)
const concluida = computed(() => !!memoria.value?.concluida_em)

// ---- Rascunho das seções ----------------------------------------------------

const rascunho = ref<SecaoDaMemoria[]>([])
const ultimoSalvo = ref<string | null>(null)

const sujo = computed(() =>
  ultimoSalvo.value !== null
  && JSON.stringify(secoesParaSalvar(rascunho.value)) !== ultimoSalvo.value,
)

watch(() => memoria.value?.secoes, (secoes) => {
  if (!secoes || sujo.value) return

  rascunho.value = [...secoes].sort((a, b) => a.ordem - b.ordem)
  ultimoSalvo.value = JSON.stringify(secoesParaSalvar(rascunho.value))
}, { immediate: true, deep: true })

/** O que está gravado agora — o que o autosave manda e o que ele confirma. */
async function gravarSecoes(): Promise<boolean> {
  const alvo = memoria.value?.id
  if (!alvo) return false

  // Congelado ANTES da chamada: o que volta confirma esta lista, não a que a
  // pessoa possa ter deixado na tela enquanto a RPC estava no ar.
  const enviado = JSON.stringify(secoesParaSalvar(rascunho.value))

  try {
    await salvar.mutateAsync({ memoriaId: alvo, secoes: JSON.parse(enviado) })
    ultimoSalvo.value = enviado
    return true
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para salvar a memória.'))
    return false
  }
}

watchDebounced(rascunho, () => {
  if (!sujo.value) return
  gravarSecoes()
}, { debounce: 700, deep: true })

const salvando = computed(() => sujo.value || salvar.isPending.value)

// ---- Mexer nas seções -------------------------------------------------------

function atualizarSecao(id: string, campos: Partial<SecaoDaMemoria>) {
  rascunho.value = rascunho.value.map(s => (s.id === id ? { ...s, ...campos } : s))
}

/**
 * Uma seção nova, com id já formado.
 *
 * `ordem` é a posição no array — a RPC a reescreve pela posição de qualquer
 * jeito, e mandá-la daqui é só para o rascunho e o banco falarem a mesma língua
 * enquanto o salvamento não volta.
 */
function novaSecao(data: string | null) {
  const secao: SecaoDaMemoria = {
    id: crypto.randomUUID(),
    ordem: rascunho.value.length,
    data,
    titulo: null,
    texto: null,
    nova_folha: false,
  }

  /*
   * As seções com data ficam em ordem cronológica; as sem data vão para o fim.
   * É a mesma regra de `agruparPorDia` em Viagens, e pelo mesmo motivo: a
   * memória é lida na ordem em que a viagem aconteceu, e uma seção do sábado
   * inserida depois do domingo faria o documento contar a história fora de
   * ordem só porque foi escrita depois.
   */
  const lista = [...rascunho.value, secao].sort((a, b) => {
    if (!a.data) return b.data ? 1 : 0
    if (!b.data) return -1
    return a.data.localeCompare(b.data)
  })

  rascunho.value = lista.map((s, i) => ({ ...s, ordem: i }))
}

function removerSecao(id: string) {
  const alvo = rascunho.value.find(s => s.id === id)
  const temItens = itensDaSecao(id).length

  if (temItens && !confirm('Esta parte tem fotos ou músicas anexadas. Apagar assim mesmo?')) return
  if (!alvo) return

  rascunho.value = rascunho.value
    .filter(s => s.id !== id)
    .map((s, i) => ({ ...s, ordem: i }))
}

const diasLivres = computed(() =>
  diasSemSecao(rascunho.value, roteiro.value?.data_inicio ?? null, roteiro.value?.data_fim ?? null),
)

// ---- Itens: fotos e músicas -------------------------------------------------

const itens = computed<ItemDaMemoria[]>(() => memoria.value?.itens ?? [])

function itensDaSecao(secaoId: string | null): ItemDaMemoria[] {
  return itens.value
    .filter(i => i.secao_id === secaoId)
    .sort((a, b) => a.ordem - b.ordem)
}

const { data: urls } = useUrlsDosCaminhos(
  computed(() => itens.value.flatMap(i => (i.caminho ? [i.caminho] : []))),
)

const seletorDeFoto = ref(false)
const seletorDeMusica = ref(false)
/** A seção que vai receber o anexo. `null` = item solto, preso à memória. */
const secaoAlvo = ref<string | null>(null)

/*
 * Abrir o seletor GRAVA antes. Uma seção que só existe no rascunho não tem linha
 * no banco, e `memoria_item.secao_id` é uma FK — anexar ali morreria em erro de
 * chave estrangeira, no meio de um gesto que a pessoa considera instantâneo.
 */
async function abrirSeletor(qual: 'foto' | 'musica', secaoId: string | null) {
  if (sujo.value && !(await gravarSecoes())) return

  secaoAlvo.value = secaoId
  if (qual === 'foto') seletorDeFoto.value = true
  else seletorDeMusica.value = true
}

async function anexar(novos: ItemAnexavel[]) {
  const alvo = memoria.value?.id
  if (!alvo || !novos.length) return

  try {
    await adicionarItens.mutateAsync({
      memoriaId: alvo,
      itens: novos.map(item => ({ ...item, secao_id: secaoAlvo.value })),
      aPartirDe: itensDaSecao(secaoAlvo.value).length,
    })
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para anexar.'))
  }
}

async function tirarItem(id: string) {
  try {
    await removerItem.mutateAsync(id)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para tirar isso daqui.'))
  }
}

// ---- O documento ------------------------------------------------------------

/*
 * A prévia é montada a partir do RASCUNHO, e não do que está gravado: o papel
 * acompanha o que está sendo escrito. Só os itens vêm do banco — eles não passam
 * pelo rascunho, porque anexar já é uma escrita confirmada.
 *
 * A seção VAZIA fica de fora do papel, e continua no editor. Clicar em "Sábado,
 * 22 de agosto" abre o campo para escrever, e até que se escreva o documento
 * imprimiria um rótulo de data sozinho, sem nada embaixo — que é uma folha
 * dizendo que aquele dia não teve nada. Filtrar aqui, e não ao salvar, é o que
 * mantém o campo aberto na tela enquanto ninguém digitou.
 */
const paraOPapel = computed(() =>
  rascunho.value.filter(s => !secaoVazia(s, itensDaSecao(s.id))),
)

const folhas = computed(() => paginar(blocosDaMemoria(paraOPapel.value, itens.value)))

const nota = computed(() => memoria.value?.nota ?? null)

async function darNota(valor: number) {
  const alvo = memoria.value?.id
  if (!alvo) return

  try {
    // Clicar na mesma estrela limpa — evita ficar preso numa nota errada, como
    // em `NotaEstrelas`.
    await definirNota.mutateAsync({ memoriaId: alvo, nota: nota.value === valor ? null : valor })
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para salvar a nota.'))
  }
}

async function onCriar() {
  try {
    await criar.mutateAsync(roteiroId)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para começar a memória.'))
  }
}

async function onConcluir() {
  const alvo = memoria.value?.id
  if (!alvo) return

  // O que está na tela precisa estar gravado antes de o documento ser declarado
  // pronto — senão o aviso que sai para o outro fala de um texto que não existe.
  if (sujo.value && !(await gravarSecoes())) return

  try {
    await concluir.mutateAsync(alvo)
    toast.success('Memória fechada. Já dá para baixar o PDF.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para fechar a memória.'))
  }
}

async function onReabrir() {
  const alvo = memoria.value?.id
  if (!alvo) return

  try {
    await reabrir.mutateAsync(alvo)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para reabrir.'))
  }
}

/**
 * O PDF é a impressão do navegador, e nada mais.
 *
 * No iOS com o app INSTALADO isso não funciona como em qualquer outro lugar: o
 * Safari em standalone não abre diálogo de impressão — abre a folha de
 * compartilhamento, e às vezes nem isso. Um botão que não faz nada visível é
 * pior que uma frase explicando; daí a detecção.
 */
const emPwaNoIos = ref(false)

onMounted(() => {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  emPwaNoIos.value = !!nav.standalone && /iPad|iPhone|iPod/.test(nav.userAgent)
})

function baixar() {
  window.print()
}
</script>

<template>
  <div class="space-y-6">
    <div class="print:hidden">
      <BotaoVoltar :to="`/viagens/${roteiroId}`" rotulo="Roteiro" />
    </div>

    <div v-if="carregando" class="space-y-4 print:hidden">
      <Skeleton class="h-8 w-64" />
      <Skeleton class="h-64 w-full rounded-lg" />
    </div>

    <!--
      Sem roteiro visível, a mesma frase de sempre: distinguir "não existe" de
      "existe mas é segredo" já seria contar meia surpresa.
    -->
    <div
      v-else-if="!roteiro"
      class="rounded-xl border border-dashed px-6 py-16 text-center print:hidden"
    >
      <p class="font-medium">Esta viagem não é sua.</p>
      <p class="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Ou ela não existe, ou alguém do espaço ainda está montando.
      </p>
    </div>

    <!-- A viagem existe e ninguém começou o documento. -->
    <div
      v-else-if="!memoria"
      class="rounded-xl border border-dashed px-6 py-16 text-center print:hidden"
    >
      <NotebookPenIcon class="mx-auto size-7 text-muted-foreground" />
      <p class="mt-3 font-medium">A memória de {{ roteiro.nome }} ainda não existe.</p>
      <p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Um caderno com o que aconteceu em cada dia, as fotos que vocês tiraram e as músicas
        que tocaram — e que no fim vira um PDF em folhas A4 para guardar.
      </p>
      <Button class="mt-5 gap-1.5" :disabled="criar.isPending.value" @click="onCriar">
        <NotebookPenIcon class="size-4" />
        {{ criar.isPending.value ? 'Abrindo…' : 'Gerar memória da viagem' }}
      </Button>
    </div>

    <template v-else>
      <header class="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold tracking-tight">Memória de {{ roteiro.nome }}</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            <template v-if="concluida">
              Documento fechado. Dá para reabrir e continuar escrevendo quando quiser.
            </template>
            <template v-else-if="salvando">Salvando…</template>
            <template v-else>Escrito pelos dois. O que vocês digitam é gravado sozinho.</template>
          </p>
        </div>

        <div class="flex shrink-0 flex-wrap gap-2">
          <Button v-if="!emPwaNoIos" variant="outline" size="sm" class="gap-1.5" @click="baixar">
            <PrinterIcon class="size-4" />
            Baixar PDF
          </Button>

          <Button
            v-if="concluida"
            variant="ghost"
            size="sm"
            class="gap-1.5"
            :disabled="reabrir.isPending.value"
            @click="onReabrir"
          >
            <RotateCcwIcon class="size-4" />
            Reabrir
          </Button>
          <Button
            v-else
            size="sm"
            class="gap-1.5"
            :disabled="concluir.isPending.value"
            @click="onConcluir"
          >
            <BookOpenIcon class="size-4" />
            {{ concluir.isPending.value ? 'Fechando…' : 'Concluir' }}
          </Button>
        </div>
      </header>

      <!--
        iOS instalado: `window.print()` ali não abre diálogo de impressão. Melhor
        dizer o caminho que funciona do que oferecer um botão mudo.
      -->
      <p
        v-if="emPwaNoIos"
        class="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm print:hidden"
      >
        Para gerar o PDF no iPhone, abra esta página no Safari (fora do app instalado) e use
        <strong>Compartilhar › Imprimir</strong> — de lá dá para salvar em Arquivos.
      </p>

      <!-- A nota da viagem: um campo do documento, não uma avaliação à parte. -->
      <section v-if="!concluida" class="flex flex-wrap items-center gap-3 print:hidden">
        <span class="text-sm font-medium">Que viagem foi essa?</span>
        <span class="inline-flex gap-0.5">
          <button
            v-for="n in 5"
            :key="n"
            type="button"
            class="p-0.5 transition-transform hover:scale-110"
            :aria-label="`Dar nota ${n} de 5`"
            :aria-pressed="nota === n"
            @click="darNota(n)"
          >
            <StarIcon
              class="size-5"
              :class="nota && n <= nota ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground/40'"
            />
          </button>
        </span>
      </section>

      <!-- O editor. Some inteiro quando o documento está fechado. -->
      <section v-if="!concluida" class="space-y-3 print:hidden">
        <MemoriaSecao
          v-for="secao in rascunho"
          :key="secao.id"
          :secao="secao"
          :itens="itensDaSecao(secao.id)"
          :urls="urls"
          @atualizar="atualizarSecao(secao.id, $event)"
          @remover="removerSecao(secao.id)"
          @anexar-foto="abrirSeletor('foto', secao.id)"
          @anexar-musica="abrirSeletor('musica', secao.id)"
          @remover-item="tirarItem"
        />

        <!--
          Os dias que a viagem teve e que ainda não viraram seção. Sugestão, não
          obrigação: escrever cria a linha, não escrever não cria nada.
        -->
        <div v-if="diasLivres.length" class="space-y-2 rounded-xl border border-dashed p-3">
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Dias desta viagem
          </p>
          <div class="flex flex-wrap gap-2">
            <Button
              v-for="dia in diasLivres"
              :key="dia"
              variant="outline"
              size="sm"
              class="gap-1.5"
              @click="novaSecao(dia)"
            >
              <CalendarPlusIcon class="size-4" />
              {{ rotuloDaData(dia) }}
            </Button>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" class="gap-1.5" @click="novaSecao(null)">
            <PlusIcon class="size-4" />
            Uma parte sem data
          </Button>

          <!--
            A trilha da viagem inteira não pertence a nenhuma tarde — daí anexar
            solto, com `secao_id` nulo. Ela vira o último bloco do documento.
          -->
          <Button variant="ghost" size="sm" class="gap-1.5" @click="abrirSeletor('musica', null)">
            <PlusIcon class="size-4" />
            Trilha da viagem
          </Button>
        </div>
      </section>

      <!-- O documento. Na impressão é a única coisa que sobra na página. -->
      <section class="space-y-2">
        <p v-if="!concluida" class="text-xs text-muted-foreground print:hidden">
          Prévia do documento — é isto que sai no PDF, folha por folha.
        </p>

        <MemoriaPapel
          :folhas="folhas"
          :titulo="roteiro.nome"
          :descricao="roteiro.descricao"
          :data-inicio="roteiro.data_inicio"
          :data-fim="roteiro.data_fim"
          :nota="nota"
          :urls="urls"
        />
      </section>

      <MemoriaFotoSeletor v-model:open="seletorDeFoto" @escolher="anexar" />
      <MemoriaMusicaSeletor v-model:open="seletorDeMusica" @escolher="anexar" />
    </template>
  </div>
</template>
