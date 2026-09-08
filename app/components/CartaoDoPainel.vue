<script setup lang="ts">
/**
 * Um cartão do painel — o módulo, o que ele tem a dizer e o que ele mostra.
 *
 * Fora do modo de ajuste, é o cartão de sempre: um alvo só, que leva ao módulo.
 *
 * No modo de ajuste ele vira um objeto que se pega. Duas regras vêm da lição que
 * `ListaDeParadas` já tinha aprendido neste repo:
 *
 * - **Os botões são o mecanismo de verdade.** Setas, largura e altura funcionam
 *   no dedo, no mouse e no teclado. Arrastar e puxar o canto existem POR CIMA
 *   disso, para quem está no mouse e tenta por instinto — drag-and-drop HTML5 não
 *   existe no toque, e este app é mobile-first.
 * - **Nada dentro do cartão responde enquanto se ajusta.** Um véu cobre a vitrine
 *   no modo de ajuste: sem ele, arrastar o cartão de Viagens seria arrastar o
 *   mapa do Google, e um toque no cartão de Músicas abriria o Spotify quando a
 *   pessoa só queria mover o cartão de lugar.
 */
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  Columns2Icon,
  EyeOffIcon,
  GripVerticalIcon,
  MinusIcon,
  MoveDiagonal2Icon,
  PlusIcon,
  RectangleHorizontalIcon,
  RotateCcwIcon,
} from '@lucide/vue'
import { useElementSize } from '@vueuse/core'
import type { AppModule, CabecalhoDoCartao } from '~/modules'
import type { LarguraDoCard } from '~/lib/painel'
import { ALTURA_MINIMA, PASSO_DA_ALTURA, limitarAltura, linhasDoCartao } from '~/lib/painel'
import type { EspacoDaVitrine } from '~/lib/vitrine'
import { ESPACO_DA_VITRINE } from '~/lib/vitrine'

const props = defineProps<{
  modulo: AppModule
  largura: LarguraDoCard
  altura: number | null
  editando: boolean
  primeiro: boolean
  ultimo: boolean
  /** No celular a grade tem uma coluna só: largura não é uma escolha que exista. */
  podeLargura: boolean
  /** Realce de "solte aqui" enquanto outro cartão passa por cima. */
  alvo: boolean
  arrastando: boolean
}>()

const emit = defineEmits<{
  mover: [-1 | 1]
  largura: [LarguraDoCard]
  altura: [number | null]
  esconder: []
}>()

const raiz = ref<HTMLElement | null>(null)
const caixaDaVitrine = ref<HTMLElement | null>(null)

/** O mesmo vão da grade do painel — entra na conta da coluna ao redimensionar. */
const VAO = 12

/*
 * Quantas linhas da malha este cartão ocupa — é o que faz a coluna vizinha
 * começar logo abaixo dele em vez de esperar o cartão mais alto da fileira (ver
 * `linhasDoCartao`).
 *
 * Com altura fixa, o número é sabido. Sem ela, o cartão é medido: `self-start` +
 * altura automática significam que a caixa dele é o conteúdo dele, então medir a
 * raiz não morde o próprio rabo — o `span` só RESERVA espaço na grade, não
 * dimensiona o cartão.
 */
const { height: alturaMedida } = useElementSize(raiz, undefined, { box: 'border-box' })

const alturaFinal = computed(() => props.altura ?? Math.ceil(alturaMedida.value))

const linhasNaGrade = computed(() => linhasDoCartao(alturaFinal.value))

/*
 * O que a vitrine tem para preencher.
 *
 * A altura só é anunciada quando a pessoa fixou uma: com altura automática, uma
 * vitrine que mostrasse mais itens por ter mais espaço criaria o espaço que
 * justificaria mais itens (ver `EspacoDaVitrine`). A largura é sempre real.
 */
const { height: alturaDaVitrine, width: larguraDaVitrine } = useElementSize(caixaDaVitrine)

const espaco = computed<EspacoDaVitrine>(() => ({
  largura: larguraDaVitrine.value,
  altura: props.altura === null ? null : alturaDaVitrine.value,
}))

provide(ESPACO_DA_VITRINE, espaco)

/** Ausente = as linhas de resumo, que é o que o painel sempre mostrou. */
const cabecalho = computed<CabecalhoDoCartao>(() => props.modulo.cabecalho ?? { tipo: 'resumo' })

/**
 * A altura de agora, medida, para os botões continuarem de onde o cartão está.
 *
 * Sem isto, o primeiro clique em "−" saltaria de uma altura natural de 420px
 * para o mínimo, e o botão pareceria um "encolher tudo".
 */
function alturaAtual(): number {
  return props.altura ?? Math.round(raiz.value?.getBoundingClientRect().height ?? ALTURA_MINIMA)
}

function ajustarAltura(passo: number) {
  emit('altura', limitarAltura(alturaAtual() + passo))
}

/*
 * Puxar o canto: um gesto, as duas medidas.
 *
 * A altura é livre, em pixels. A largura NÃO é: a grade tem duas colunas, e
 * fingir uma largura contínua entregaria cartões desalinhados que a grade
 * arredondaria de volta no próximo render. Então o arraste horizontal escolhe
 * entre uma coluna e duas, com o corte em uma coluna e meia — que é onde a mão
 * já decidiu para qual dos dois lados está indo.
 */
let inicio: { x: number, y: number, altura: number, largura: number, coluna: number } | null = null

/**
 * Enquanto o canto está sendo puxado, o cartão para de ser arrastável.
 *
 * Sem isto o redimensionar simplesmente não funcionava no mouse, e o motivo é
 * sutil: o punho não é arrastável (`draggable="false"`), então o navegador sobe
 * a árvore, acha o CARTÃO arrastável e começa um arraste de reordenação a partir
 * dele. O `dragstart` nasce no cartão, não no punho — um `@dragstart.prevent` no
 * botão nunca o veria —, e o arraste HTML5 mata o gesto de ponteiro com um
 * `pointercancel`. O cartão não mudava de tamanho e ninguém dizia por quê.
 */
const redimensionando = ref(false)

function pegarCanto(evento: PointerEvent) {
  const caixa = raiz.value?.getBoundingClientRect()
  if (!caixa) return

  // Cinto e suspensório com o `draggable` acima: `preventDefault` no pointerdown
  // já barra o arraste nativo, e ainda evita a seleção de texto durante o gesto.
  evento.preventDefault()
  redimensionando.value = true

  inicio = {
    x: evento.clientX,
    y: evento.clientY,
    altura: caixa.height,
    largura: caixa.width,
    coluna: props.largura === 2 ? (caixa.width - VAO) / 2 : caixa.width,
  }

  // Um ponteiro sintético (teste, automação) não pode ser capturado, e o
  // `NotFoundError` derrubaria o gesto inteiro por causa de um detalhe opcional.
  try {
    (evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId)
  }
  catch { /* segue sem captura: o alvo continua recebendo os eventos */ }
}

function puxarCanto(evento: PointerEvent) {
  if (!inicio) return
  evento.preventDefault()

  emit('altura', limitarAltura(inicio.altura + (evento.clientY - inicio.y)))

  if (props.podeLargura) {
    const desejada = inicio.largura + (evento.clientX - inicio.x)
    emit('largura', desejada > inicio.coluna * 1.5 ? 2 : 1)
  }
}

function largarCanto(evento: PointerEvent) {
  inicio = null
  redimensionando.value = false

  try {
    (evento.currentTarget as HTMLElement).releasePointerCapture(evento.pointerId)
  }
  catch { /* não havia captura para soltar */ }
}
</script>

<template>
  <!--
    `self-start` + `mb-3`: o cartão não estica para preencher a fileira (era daí
    que vinha o buraco embaixo do cartão mais baixo), e o vão vertical é margem
    dele, não `row-gap` da grade — ver `linhasDoCartao`.
  -->
  <article
    ref="raiz"
    :draggable="editando && !redimensionando"
    class="group relative mb-3 flex min-w-0 flex-col self-start overflow-hidden rounded-xl border bg-card p-4 transition-colors"
    :class="[
      largura === 2 ? 'sm:col-span-2' : '',
      editando
        ? 'cursor-grab border-dashed ring-1 ring-primary/20'
        : 'focus-within:border-primary/40 hover:border-primary/40 hover:bg-accent/40',
      alvo ? 'border-primary bg-primary/5' : '',
      arrastando ? 'opacity-50' : '',
    ]"
    :style="{
      gridRowEnd: `span ${linhasNaGrade}`,
      height: altura !== null ? `${altura}px` : undefined,
    }"
  >
    <!--
      A barra de ajuste some inteira fora do modo — nada de ícones aparecendo no
      hover num painel que é, na maior parte do tempo, para ser lido e não mexido.
    -->
    <div
      v-if="editando"
      class="relative z-30 mb-3 flex flex-wrap items-center gap-1 border-b pb-2"
    >
      <GripVerticalIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />

      <button
        type="button"
        class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
        :disabled="primeiro"
        :aria-label="`Mover ${modulo.rotulo} para cima`"
        @click="emit('mover', -1)"
      >
        <ArrowUpIcon class="size-4" />
      </button>
      <button
        type="button"
        class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
        :disabled="ultimo"
        :aria-label="`Mover ${modulo.rotulo} para baixo`"
        @click="emit('mover', 1)"
      >
        <ArrowDownIcon class="size-4" />
      </button>

      <span class="mx-1 h-5 w-px bg-border" aria-hidden="true" />

      <!--
        Um botão que alterna, e não dois: são dois estados, e o ícone mostra para
        onde ele vai. No celular a largura não existe como escolha — a grade tem
        uma coluna só —, então o botão nem aparece.
      -->
      <button
        v-if="podeLargura"
        type="button"
        class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted"
        :aria-label="largura === 2
          ? `Deixar ${modulo.rotulo} com meia largura`
          : `Deixar ${modulo.rotulo} com a largura inteira`"
        @click="emit('largura', largura === 2 ? 1 : 2)"
      >
        <Columns2Icon v-if="largura === 2" class="size-4" />
        <RectangleHorizontalIcon v-else class="size-4" />
      </button>

      <button
        type="button"
        class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted"
        :aria-label="`Diminuir a altura de ${modulo.rotulo}`"
        @click="ajustarAltura(-PASSO_DA_ALTURA)"
      >
        <MinusIcon class="size-4" />
      </button>
      <button
        type="button"
        class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted"
        :aria-label="`Aumentar a altura de ${modulo.rotulo}`"
        @click="ajustarAltura(PASSO_DA_ALTURA)"
      >
        <PlusIcon class="size-4" />
      </button>
      <button
        v-if="altura !== null"
        type="button"
        class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted"
        :aria-label="`Devolver ${modulo.rotulo} à altura automática`"
        @click="emit('altura', null)"
      >
        <RotateCcwIcon class="size-4" />
      </button>

      <button
        type="button"
        class="ml-auto grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
        :aria-label="`Esconder ${modulo.rotulo}`"
        @click="emit('esconder')"
      >
        <EyeOffIcon class="size-4" />
      </button>
    </div>

    <div class="flex items-start gap-3">
      <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <ModuleIcon :nome="modulo.icone" class="size-5" />
      </span>

      <!-- div, e não span: o resumo desenha uma lista, que não pode viver dentro de um span -->
      <div class="min-w-0 flex-1">
        <span class="flex items-center gap-2">
          <!--
            No modo de ajuste o título deixa de ser link: o cartão inteiro está
            sendo arrastado, e um clique que navegasse no meio disso jogaria a
            pessoa para fora da tela que ela está arrumando.
          -->
          <NuxtLink
            v-if="!editando"
            :to="modulo.rota"
            class="font-medium after:absolute after:inset-0"
          >
            {{ modulo.rotulo }}
          </NuxtLink>
          <span v-else class="font-medium">{{ modulo.rotulo }}</span>

          <span
            v-if="!modulo.ativo"
            class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
          >
            em breve
          </span>
        </span>

        <!--
          No mobile não existe painel lateral: a tela toda é o conteúdo e a
          navegação vive na bottom bar. É aqui, no dashboard, que o resumo
          alcança o celular — e o cartão que já existia vira a superfície.

          Sem vitrine, o resumo ocupa a linha de baixo como sempre ocupou. Com
          vitrine, ele sai daqui e vai para o canto direito do cabeçalho: quem
          preenche o cartão passa a ser o visual, e a descrição estática só
          roubaria a linha do que o módulo tem de concreto a dizer.
        -->
        <template v-if="!modulo.vitrine">
          <ResumoDoModulo
            v-if="modulo.resumo"
            :key="modulo.slug"
            :modulo="modulo"
            variante="cartao"
          />
          <p v-else class="mt-0.5 text-sm text-muted-foreground">
            {{ modulo.descricao }}
          </p>
        </template>
      </div>

      <!--
        Ao lado do título: um selo vivo, uma legenda fixa, as linhas de resumo,
        ou nada — quem decide é o módulo (ver `CabecalhoDoCartao`).

        O SELO É O ÚNICO QUE VALE SEM VITRINE, e é de propósito: Livros não tem
        visual nenhum (o cartão é as linhas de resumo) e mesmo assim quer a
        porcentagem da meta no canto. Os outros dois continuam presos à vitrine,
        porque sem ela o resumo já ocupa o corpo do cartão e repeti-lo no canto
        seria dizer a mesma coisa duas vezes na mesma caixa.
      -->
      <SeloDoCartao
        v-if="cabecalho.tipo === 'selo'"
        :key="`selo-${modulo.slug}`"
        :usar="cabecalho.usar"
        :modulo="modulo.slug"
      />

      <template v-else-if="modulo.vitrine">
        <span
          v-if="cabecalho.tipo === 'legenda'"
          class="shrink-0 text-sm text-muted-foreground"
        >
          {{ cabecalho.texto }}
        </span>

        <ResumoDoModulo
          v-else-if="cabecalho.tipo === 'resumo' && modulo.resumo"
          :key="`cabecalho-${modulo.slug}`"
          :modulo="modulo"
          variante="cabecalho"
        />
      </template>

      <ArrowRightIcon
        v-if="!editando"
        class="mt-2 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
      />
    </div>

    <!--
      O visual do módulo: as barras do mês, os cartazes, o mapa. Quem o registra é
      `app/modules.ts`, e ele só existe aqui — a sidebar mostra as mesmas
      informações em texto, e um mapa de 16:9 dentro de 256px não seria um mapa.

      `min-h-0` porque o cartão pode ter altura fixa: sem isso um filho de flex
      recusa encolher abaixo do conteúdo e vaza para fora da caixa que a pessoa
      escolheu.
    -->
    <div
      v-if="modulo.vitrine"
      ref="caixaDaVitrine"
      class="flex min-h-0 flex-col"
      :class="altura !== null ? 'flex-1' : ''"
    >
      <component :is="modulo.vitrine" class="min-h-0 flex-1" />
    </div>

    <!--
      O véu do modo de ajuste — ver o cabeçalho do arquivo. A barra de botões
      acima dele (`z-30`) fica de fora, senão o véu comeria os próprios controles:
      o painel entrava em modo de ajuste e nenhum botão respondia.
    -->
    <div v-if="editando" class="absolute inset-0 z-20" aria-hidden="true" />

    <!--
      O canto que se puxa. Fica acima do véu, e `touch-none` para o dedo
      redimensionar em vez de rolar a página junto.

      `span` e não `button` de propósito: um botão que só responde a arraste
      seria um alvo de teclado que não faz nada ao Enter. O caminho acessível às
      duas medidas são os botões da barra acima — este canto é o atalho de quem
      está no ponteiro, e a frase em `sr-only` diz isso a quem lê a tela.

      `draggable="false"` e o `dragstart` barrado porque o cartão inteiro é
      arrastável no modo de ajuste: sem isso, puxar o canto no mouse virava um
      arraste de reordenação e o cartão nunca mudava de tamanho.
    -->
    <span
      v-if="editando"
      draggable="false"
      class="absolute bottom-0 right-0 z-30 grid size-6 cursor-nwse-resize touch-none place-items-center rounded-tl-md text-muted-foreground hover:text-foreground"
      @dragstart.stop.prevent
      @pointerdown="pegarCanto"
      @pointermove="puxarCanto"
      @pointerup="largarCanto"
      @pointercancel="largarCanto"
    >
      <MoveDiagonal2Icon class="size-3.5" />
      <span class="sr-only">Arraste este canto para redimensionar {{ modulo.rotulo }}</span>
    </span>
  </article>
</template>
