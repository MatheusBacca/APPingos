<script setup lang="ts">
import { onLongPress } from '@vueuse/core'
import { ArrowDownIcon, ArrowUpIcon, MapPinIcon, PenLineIcon, XIcon } from '@lucide/vue'
import { Input } from '@/components/ui/input'
import type { ParadaParaSalvar } from '~/types/viagem'
import { rotuloDoDia } from '~/types/viagem'

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
        class="pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground first:pt-0"
      >
        {{ rotuloDoDia(parada.dia, dataInicio) }}
      </li>

      <li
        :data-indice="i"
        class="group rounded-lg border bg-card p-3 transition-colors"
        :class="[
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
            v-if="parada.google_place_id"
            :checked="marcadas.has(i)"
            type="checkbox"
            class="mt-1 size-4 shrink-0 accent-primary transition-opacity focus-visible:opacity-100"
            :class="selecionavel || marcadas.has(i) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
            :aria-label="`Selecionar ${parada.nome}`"
            @change="selecionavel ? emit('alternar', i) : emit('entrarNaSelecao', i)"
          >
          <span v-else class="mt-1 size-4 shrink-0" aria-hidden="true" />

          <span
            class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium"
            aria-hidden="true"
          >
            {{ i + 1 }}
          </span>

          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-1.5 font-medium">
              <component
                :is="parada.google_place_id ? MapPinIcon : PenLineIcon"
                class="size-3.5 shrink-0 text-muted-foreground"
              />
              <span class="truncate">{{ parada.nome }}</span>
            </p>

            <p v-if="parada.endereco" class="truncate text-xs text-muted-foreground">
              {{ parada.endereco }}
            </p>

            <!--
              A parada escrita à mão precisa dizer por que o mapa a ignora. Sem
              esta linha, "sumiu da rota" vira bug reportado.
            -->
            <p v-if="!parada.google_place_id" class="text-xs text-muted-foreground">
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

          <div v-if="editavel" class="flex shrink-0 flex-col gap-1">
            <button
              type="button"
              class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
              :disabled="i === 0"
              :aria-label="`Mover ${parada.nome} para cima`"
              @click="mover(i, i - 1)"
            >
              <ArrowUpIcon class="size-4" />
            </button>
            <button
              type="button"
              class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
              :disabled="i === paradas.length - 1"
              :aria-label="`Mover ${parada.nome} para baixo`"
              @click="mover(i, i + 1)"
            >
              <ArrowDownIcon class="size-4" />
            </button>
            <button
              type="button"
              class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              :aria-label="`Remover ${parada.nome}`"
              @click="remover(i)"
            >
              <XIcon class="size-4" />
            </button>
          </div>
        </div>
      </li>
    </template>
  </ol>

  <p v-else class="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
    Nenhuma parada ainda. Busque um lugar acima para começar o roteiro.
  </p>
</template>
