<script setup lang="ts">
import { onLongPress } from '@vueuse/core'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  MapIcon,
  MapPinIcon,
  MoreVerticalIcon,
  PenLineIcon,
  SearchIcon,
  Trash2Icon,
} from '@lucide/vue'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import type { AberturaNoMaps, ModoTransporte, ParadaParaSalvar } from '~/types/viagem'
import {
  aberturaNoMaps,
  agruparPorDia,
  numeracaoDoRoteiro,
  rotuloDoDia,
  urlDoLugar,
  urlDoTrecho,
} from '~/types/viagem'
import { usePontosPorLink } from '~/composables/usePontosPorLink'

/**
 * A lista ordenável, com setas como mecanismo principal.
 *
 * Drag-and-drop HTML5 não funciona no toque, e este app é mobile-first — o repo
 * já bateu nisso em `CartazDoEspaco.vue` e teve que acrescentar um "mover
 * para..." depois do fato. Aqui as setas ↑/↓ nascem como o caminho de verdade:
 * funcionam no dedo, no mouse e no teclado. O arrastar existe por cima, para
 * quem está no desktop e tenta por instinto, e nenhuma biblioteca nova entra no
 * `package.json` por causa disso.
 */
const props = defineProps<{
  paradas: ParadaParaSalvar[]
  dataInicio: string | null
  /** Como a rota é traçada nos atalhos do dia. */
  modo: ModoTransporte
  /** Sem isto a lista é só leitura — é o caso do roteiro de outra pessoa. */
  editavel?: boolean
  /** Liga as caixas de marcar, para montar um percurso avulso. */
  selecionavel?: boolean
  /**
   * Índices marcados. A seleção é por índice, e isso só é seguro porque marcar e
   * reordenar não acontecem ao mesmo tempo: no modo seleção a lista não é
   * editável. Se as duas coisas convivessem, mover a parada 2 para o fim
   * embaralharia o que está marcado — bug que ninguém vê até o link abrir errado.
   */
  selecionadas?: number[]
}>()

/*
 * A lista avisa QUAL parada foi tocada; quem monta o conjunto é o pai.
 *
 * Com `defineModel` aqui, dois toques no mesmo tick liam a lista defasada — o
 * segundo enxergava o estado anterior ao primeiro e o sobrescrevia, e uma das
 * duas paradas simplesmente não entrava. Emitir o índice tira o estado de um
 * lugar onde ele só existia de passagem.
 */
const emit = defineEmits<{
  atualizar: [ParadaParaSalvar[]]
  alternar: [number]
  entrarNaSelecao: [number]
  /** Abrir a busca do Maps para corrigir o lugar desta parada — quem abre é o pai. */
  corrigirLugar: [number]
}>()

const marcadas = computed(() => new Set(props.selecionadas ?? []))

/*
 * Como se entra no modo seleção — o padrão que todo aparelho já ensinou.
 *
 * No toque, segurar a parada; no mouse, passar por cima e a caixa aparece. São
 * os dois gestos que a pessoa já usa na galeria de fotos e no e-mail, então não
 * há nada novo a aprender. O preço é que nenhum dos dois é descobrível sozinho:
 * quem nunca segurou um item não sabe que dá. Por isso a barra do Maps ganha a
 * dica em texto quando o roteiro tem paradas suficientes para valer a pena.
 *
 * `onLongPress` já cancela quando o dedo anda mais de 10px — rolar a lista não
 * pode virar seleção, que é o jeito clássico de esta interação irritar.
 */
const lista = useTemplateRef<HTMLElement>('lista')
const SEGURAR_MS = 450

/** Verdadeiro entre o gesto disparar e o menu de contexto do sistema aparecer. */
let acabouDeSegurar = false

onLongPress(
  lista,
  (evento) => {
    if (props.selecionavel) return

    const alvo = evento.target as HTMLElement | null
    // Segurar um campo de texto é gesto do sistema (copiar, colar) — não nosso.
    if (alvo?.closest('input, textarea, button, a')) return

    const linha = alvo?.closest<HTMLElement>('[data-indice]')
    const i = Number(linha?.dataset.indice)
    if (!Number.isInteger(i)) return

    // Mesma regra da caixa de marcar: só entra na seleção o que pode virar link.
    // Segurar uma parada escrita à mão (ou desligada) abriria o modo com ela
    // marcada e nenhum botão para mostrar — parece que a seleção quebrou.
    const parada = props.paradas[i]
    if (!parada?.google_place_id || parada.desativada) return

    acabouDeSegurar = true
    emit('entrarNaSelecao', i)
  },
  { delay: SEGURAR_MS, distanceThreshold: 10 },
)

/**
 * O menu de contexto do sistema não pode brotar em cima da seleção que acabou
 * de abrir. Só é barrado quando o gesto foi nosso — o botão direito no desktop
 * continua funcionando normalmente.
 */
function aoMenuDeContexto(evento: Event) {
  if (!acabouDeSegurar) return
  evento.preventDefault()
  acabouDeSegurar = false
}

const arrastando = ref<number | null>(null)
const alvo = ref<number | null>(null)

/**
 * Onde entra um cabeçalho de dia.
 *
 * Separador dentro da lista, e não grupos separados: agrupar de verdade quebra a
 * reordenação, porque a ordem do roteiro é uma só e as setas precisam poder
 * atravessar a fronteira do dia. Aqui o dia é uma etiqueta que aparece quando
 * muda, e a sequência continua sendo a sequência.
 */
const inicioDeDia = computed(() =>
  props.paradas.map((p, i) => p.dia !== null && p.dia !== props.paradas[i - 1]?.dia),
)

/** 1, 2, 3… pulando as desligadas — a regra mora em `numeracaoDoRoteiro`. */
const numeros = computed(() => numeracaoDoRoteiro(props.paradas))

/*
 * O atalho do dia mora no cabeçalho dele, e não numa barra separada.
 *
 * Um botão longe da lista obriga a pessoa a traduzir "Dia 2" na tela para
 * "Dia 2" no outro canto; aqui o alvo está ao lado do que ele abre. E o dia é
 * agrupado inteiro, mesmo com paradas separadas na lista — o cabeçalho aparece
 * na primeira delas, mas o link leva o dia todo.
 */
const pontosPorLink = usePontosPorLink()

const aberturaDoDia = computed(() => {
  const porDia = new Map<number | null, AberturaNoMaps<ParadaParaSalvar>>()

  for (const grupo of agruparPorDia(props.paradas)) {
    porDia.set(grupo.dia, aberturaNoMaps(grupo.paradas, pontosPorLink.value))
  }

  return porDia
})

function mover(de: number, para: number) {
  if (para < 0 || para >= props.paradas.length || de === para) return

  const lista = [...props.paradas]
  const [parada] = lista.splice(de, 1)
  lista.splice(para, 0, parada!)
  emit('atualizar', lista)
}

function remover(indice: number) {
  emit('atualizar', props.paradas.filter((_, i) => i !== indice))
}

function editar(indice: number, campos: Partial<ParadaParaSalvar>) {
  emit('atualizar', props.paradas.map((p, i) => (i === indice ? { ...p, ...campos } : p)))
}

/**
 * Desligar e religar a parada — o meio-termo entre manter e apagar.
 *
 * A parada fica onde está, com dia, anotação e endereço intactos; o que ela
 * perde é o lugar na rota e o número. É o que torna a decisão reversível: quem
 * desistiu do museu no sábado e mudou de ideia na quinta não pesquisa o endereço
 * de novo.
 */
function alternarDesativada(indice: number) {
  editar(indice, { desativada: !props.paradas[indice]?.desativada })
}

/** `<input type="number">` devolve string vazia quando limpo — vira `null`. */
function editarDia(indice: number, valor: string) {
  const dia = Number.parseInt(valor, 10)
  editar(indice, { dia: Number.isFinite(dia) && dia >= 1 ? dia : null })
}

function soltar(indice: number) {
  if (arrastando.value !== null) mover(arrastando.value, indice)
  arrastando.value = null
  alvo.value = null
}
</script>

<template>
  <ol
    v-if="paradas.length"
    ref="lista"
    class="space-y-2"
    @contextmenu="aoMenuDeContexto"
  >
    <template v-for="(parada, i) in paradas" :key="`${i}-${parada.nome}`">
      <li
        v-if="inicioDeDia[i]"
        class="flex items-center gap-2 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground first:pt-0"
      >
        {{ rotuloDoDia(parada.dia, dataInicio) }}

        <!--
          Um ícone por trecho: um dia longo demais para um link só não pode virar
          um atalho que leva metade do dia sem avisar. No caso comum é um só.
        -->
        <a
          v-for="(trecho, t) in aberturaDoDia.get(parada.dia)?.trechos ?? []"
          :key="t"
          :href="urlDoTrecho(trecho, modo) ?? undefined"
          target="_blank"
          rel="noopener"
          class="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          :title="(aberturaDoDia.get(parada.dia)?.trechos.length ?? 0) > 1
            ? `Abrir no Maps — trecho ${t + 1}`
            : 'Abrir este dia no Google Maps'"
          :aria-label="(aberturaDoDia.get(parada.dia)?.trechos.length ?? 0) > 1
            ? `Abrir ${rotuloDoDia(parada.dia, dataInicio)} no Google Maps, trecho ${t + 1} de ${aberturaDoDia.get(parada.dia)?.trechos.length}`
            : `Abrir ${rotuloDoDia(parada.dia, dataInicio)} no Google Maps`"
        >
          <MapIcon class="size-3.5" />
        </a>

        <!-- Dia de uma parada só: não há rota, mas há lugar. -->
        <a
          v-if="aberturaDoDia.get(parada.dia)?.lugarUnico"
          :href="urlDoLugar(aberturaDoDia.get(parada.dia)!.lugarUnico!) ?? undefined"
          target="_blank"
          rel="noopener"
          class="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          :aria-label="`Abrir ${aberturaDoDia.get(parada.dia)!.lugarUnico!.nome} no Google Maps`"
          title="Abrir este lugar no Google Maps"
        >
          <MapIcon class="size-3.5" />
        </a>
      </li>

      <li
        :data-indice="i"
        class="group rounded-lg border p-3 transition-colors"
        :class="[
          parada.desativada ? 'border-dashed bg-muted/30' : 'bg-card',
          alvo === i ? 'border-primary bg-primary/5' : '',
          marcadas.has(i) ? 'border-primary bg-primary/5' : '',
        ]"
        :draggable="editavel"
        @dragstart="arrastando = i"
        @dragover.prevent="alvo = i"
        @dragleave="alvo = alvo === i ? null : alvo"
        @drop.prevent="soltar(i)"
        @dragend="arrastando = null; alvo = null"
      >
        <div class="flex items-start gap-3">
          <!--
            Caixa só em parada que o Maps conhece: a seleção existe para montar
            um link, e uma parada escrita à mão nunca entra em link nenhum.
            Marcar o que não tem efeito é pior que não poder marcar.

            Ela ocupa o espaço mesmo invisível, senão a linha inteira daria um
            pulo lateral a cada passada do mouse. Fora do modo seleção, marcar é
            o que ENTRA nele — é o mesmo toque que o gesto de segurar, para quem
            está no mouse.
          -->
          <input
            v-if="parada.google_place_id && !parada.desativada"
            :checked="marcadas.has(i)"
            type="checkbox"
            class="mt-1 size-4 shrink-0 accent-primary transition-opacity focus-visible:opacity-100"
            :class="selecionavel || marcadas.has(i) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
            :aria-label="`Selecionar ${parada.nome}`"
            @change="selecionavel ? emit('alternar', i) : emit('entrarNaSelecao', i)"
          >
          <span v-else class="mt-1 size-4 shrink-0" aria-hidden="true" />

          <!--
            A parada desligada perde o número em vez de guardá-lo: ele responde
            "qual é a terceira coisa que a gente faz", e duas terceiras paradas
            não é resposta. No lugar dele, o ícone que diz o que aconteceu.
          -->
          <span
            class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-medium"
            :class="parada.desativada ? 'text-muted-foreground' : 'bg-muted'"
            aria-hidden="true"
          >
            <EyeOffIcon v-if="parada.desativada" class="size-3.5" />
            <template v-else>{{ numeros[i] }}</template>
          </span>

          <div class="min-w-0 flex-1" :class="parada.desativada ? 'opacity-60' : ''">
            <p class="flex items-center gap-1.5 font-medium">
              <component
                :is="parada.google_place_id ? MapPinIcon : PenLineIcon"
                class="size-3.5 shrink-0 text-muted-foreground"
              />
              <span class="truncate" :class="parada.desativada ? 'line-through' : ''">
                {{ parada.nome }}
              </span>
            </p>

            <p v-if="parada.endereco" class="truncate text-xs text-muted-foreground">
              {{ parada.endereco }}
            </p>

            <!--
              Por que o mapa ignora esta parada — e agora são dois motivos. Sem a
              frase, "sumiu da rota" vira bug reportado; com ela, desligar uma
              parada é uma escolha visível, e não um roteiro que encolheu sozinho.
            -->
            <p v-if="parada.desativada" class="text-xs text-muted-foreground">
              Desativada — fora da rota, mas guardada
            </p>
            <p v-else-if="!parada.google_place_id" class="text-xs text-muted-foreground">
              Escrita à mão — não entra na rota
            </p>

            <p v-if="!editavel && parada.anotacao" class="mt-1 text-sm text-muted-foreground">
              {{ parada.anotacao }}
            </p>

            <div v-if="editavel" class="mt-2 flex flex-wrap items-center gap-2">
              <label class="flex items-center gap-1.5 text-xs text-muted-foreground">
                Dia
                <Input
                  :model-value="parada.dia ?? ''"
                  type="number"
                  min="1"
                  class="h-8 w-16"
                  @update:model-value="editarDia(i, String($event))"
                />
              </label>

              <Input
                :model-value="parada.anotacao ?? ''"
                placeholder="Anotação (opcional)"
                class="h-8 min-w-40 flex-1"
                @update:model-value="editar(i, { anotacao: String($event).trim() || null })"
              />
            </div>
          </div>

          <div class="flex shrink-0 flex-col gap-1">
            <!--
              Fora do `v-if="editavel"` de propósito: abrir um lugar no Maps não
              é editar. Vale no roteiro de outra pessoa e no meio da seleção, que
              é justamente quando alguém quer conferir onde fica antes de marcar.
            -->
            <a
              v-if="parada.google_place_id"
              :href="urlDoLugar(parada) ?? undefined"
              target="_blank"
              rel="noopener"
              class="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              :aria-label="`Abrir ${parada.nome} no Google Maps`"
              title="Abrir no Google Maps"
            >
              <ExternalLinkIcon class="size-4" />
            </a>

            <button
              v-if="editavel"
              type="button"
              class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
              :disabled="i === 0"
              :aria-label="`Mover ${parada.nome} para cima`"
              @click="mover(i, i - 1)"
            >
              <ArrowUpIcon class="size-4" />
            </button>
            <button
              v-if="editavel"
              type="button"
              class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
              :disabled="i === paradas.length - 1"
              :aria-label="`Mover ${parada.nome} para baixo`"
              @click="mover(i, i + 1)"
            >
              <ArrowDownIcon class="size-4" />
            </button>

            <!--
              Corrigir, desativar e remover num menu, e não em três botões: a
              coluna já tem quatro alvos, e sete numa linha de 3 mm de sobra no
              celular é onde se erra o toque. Aqui também some o risco que o "X"
              solto criava — remover, que é a única ação irreversível, deixa de
              ser vizinha das setas que a pessoa aperta em sequência.
            -->
            <DropdownMenu v-if="editavel">
              <DropdownMenuTrigger as-child>
                <button
                  type="button"
                  class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted"
                  :aria-label="`Mais opções de ${parada.nome}`"
                >
                  <MoreVerticalIcon class="size-4" />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" class="w-52">
                <!--
                  Vale também para a parada escrita à mão, e é metade da graça:
                  "casa da vó" que só depois se descobriu estar no Maps deixa de
                  ser um caso de apagar e refazer.
                -->
                <DropdownMenuItem class="gap-2" @select="emit('corrigirLugar', i)">
                  <SearchIcon class="size-4" />
                  {{ parada.google_place_id ? 'Corrigir endereço' : 'Buscar no Maps' }}
                </DropdownMenuItem>

                <DropdownMenuItem class="gap-2" @select="alternarDesativada(i)">
                  <component :is="parada.desativada ? EyeIcon : EyeOffIcon" class="size-4" />
                  {{ parada.desativada ? 'Reativar parada' : 'Desativar parada' }}
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem class="gap-2 text-destructive" @select="remover(i)">
                  <Trash2Icon class="size-4" />
                  Remover parada
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </li>
    </template>
  </ol>

  <p v-else class="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
    Nenhuma parada ainda. Busque um lugar acima para começar o roteiro.
  </p>
</template>
