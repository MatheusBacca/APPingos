<script setup lang="ts">
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
}>()

const emit = defineEmits<{ atualizar: [ParadaParaSalvar[]] }>()

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
  <ol v-if="paradas.length" class="space-y-2">
    <template v-for="(parada, i) in paradas" :key="`${i}-${parada.nome}`">
      <li
        v-if="inicioDeDia[i]"
        class="pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground first:pt-0"
      >
        {{ rotuloDoDia(parada.dia, dataInicio) }}
      </li>

      <li
        class="rounded-lg border bg-card p-3 transition-colors"
        :class="alvo === i ? 'border-primary bg-primary/5' : ''"
        :draggable="editavel"
        @dragstart="arrastando = i"
        @dragover.prevent="alvo = i"
        @dragleave="alvo = alvo === i ? null : alvo"
        @drop.prevent="soltar(i)"
        @dragend="arrastando = null; alvo = null"
      >
        <div class="flex items-start gap-3">
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
