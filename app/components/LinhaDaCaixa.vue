<script setup lang="ts">
/**
 * Uma compra na caixa de entrada: onde foi, de qual cartão, quanto, e o que o
 * app sugere. Tocar abre o detalhe; os cinco destinos moram lá, e não na linha
 * (eram cinco botões repetidos por compra, e a lista virava um mural).
 *
 * Quando o app já sabe a resposta — destino E categoria, de uma escolha que se
 * repetiu (`aceitavel`) — a seta vira "Aceitar": um toque, sem abrir nada.
 *
 * No celular a linha também desliza: para a direita aceita a sugestão (ou abre
 * o detalhe, se não há o que aceitar), para a esquerda ignora. O aviso que vem
 * depois tem "Desfazer" — deslizar sem querer não pode custar uma compra.
 */
import { CheckIcon, ChevronRightIcon, EyeOffIcon, PanelRightOpenIcon } from '@lucide/vue'
import { formatarDinheiro } from '@/lib/dinheiro'
import { ROTULO_DESTINO_DA_REGRA } from '~/lib/auto-tag'
import type { Sugestao } from '~/lib/auto-tag'
import type { ItemDaCaixa } from '~/lib/caixa-de-entrada'
import { textoParaSelo, valorDoItem } from '~/lib/caixa-lista'
import { iconeDaCategoria } from '~/lib/icones-categoria'
import { rotuloParaRegra } from '~/lib/auto-tag'

const props = defineProps<{
  item: ItemDaCaixa
  sugestao: Sugestao | null
  podeAceitar: boolean
  banco: string
  conta: string
  selecionada?: boolean
  ocupado?: boolean
}>()

const emit = defineEmits<{ abrir: [], aceitar: [], ignorar: [] }>()

const titulo = computed(() => rotuloParaRegra(props.item.principal))
const valor = computed(() => valorDoItem(props.item))

/** "3/10", ou "2–3/10" quando o extrato trouxe mais de uma parcela de uma vez. */
const parcela = computed(() => {
  const numeros = props.item.transacoes.map(t => t.parcela_numero).filter((n): n is number => !!n).sort((a, b) => a - b)
  if (props.item.plano.parcelas <= 1 || !numeros.length) return null
  const faixa = numeros.length > 1 ? `${numeros[0]}–${numeros[numeros.length - 1]}` : `${numeros[0]}`
  return `${faixa}/${props.item.plano.parcelas}`
})

const textoDaSugestao = computed(() => {
  const s = props.sugestao
  if (!s) return null
  return [s.destino ? ROTULO_DESTINO_DA_REGRA[s.destino] : null, s.categoriaNome].filter(Boolean).join(' · ')
})

const iconeDaSugestao = computed(() => iconeDaCategoria(props.sugestao?.categoriaNome))

// ---- deslizar ------------------------------------------------------------------

const linha = ref<HTMLElement | null>(null)
const deslocamento = ref(0)
const arrastando = ref(false)
let inicio: { x: number, y: number } | null = null
let decidido: 'horizontal' | 'vertical' | null = null
/** O clique que encerra um arrasto não pode abrir o detalhe. */
let engolirClique = false

const LIMIAR = 0.33

function aoTocar(e: PointerEvent) {
  if (e.pointerType === 'mouse' || props.ocupado) return
  inicio = { x: e.clientX, y: e.clientY }
  decidido = null
}

function aoMover(e: PointerEvent) {
  if (!inicio) return
  const dx = e.clientX - inicio.x
  const dy = e.clientY - inicio.y
  if (!decidido) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
    // Vertical primeiro é rolagem da página: a linha não se mexe.
    decidido = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
    if (decidido === 'horizontal') {
      arrastando.value = true
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      }
      catch {
        // Sem captura o arrasto ainda funciona enquanto o dedo fica na linha.
      }
    }
  }
  if (decidido === 'horizontal') deslocamento.value = dx
}

function aoSoltar() {
  terminar(true)
}

/** O navegador tomou o gesto (rolagem, outro dedo): a linha volta, e nada acontece. */
function aoCancelar() {
  terminar(false)
}

function terminar(agir: boolean) {
  if (decidido === 'horizontal' && agir) {
    engolirClique = true
    // Nem todo navegador dispara o clique depois de um arrasto capturado; sem
    // isto, o PRÓXIMO toque de verdade seria engolido.
    setTimeout(() => { engolirClique = false }, 60)
    const largura = linha.value?.offsetWidth ?? 1
    const fracao = deslocamento.value / largura
    if (fracao >= LIMIAR) props.podeAceitar ? emit('aceitar') : emit('abrir')
    else if (fracao <= -LIMIAR) emit('ignorar')
  }
  inicio = null
  decidido = null
  arrastando.value = false
  deslocamento.value = 0
}

function aoClicar() {
  if (engolirClique) {
    engolirClique = false
    return
  }
  emit('abrir')
}

/*
 * O cartão é vidro (`--card` translúcido): por baixo dele aparece a cor do
 * deslize. A linha leva o fundo da página por baixo do vidro, e fica opaca.
 */
const CARTAO = 'linear-gradient(var(--card), var(--card))'
const DESTAQUE = 'linear-gradient(color-mix(in oklab, var(--primary) 14%, transparent), color-mix(in oklab, var(--primary) 14%, transparent))'
const fundo = computed(() =>
  [props.selecionada ? DESTAQUE : null, CARTAO, 'var(--background)'].filter(Boolean).join(', '),
)

const passouDoLimiar = computed(() => {
  const largura = linha.value?.offsetWidth ?? 1
  return Math.abs(deslocamento.value / largura) >= LIMIAR
})
</script>

<template>
  <li ref="linha" class="relative overflow-hidden">
    <!-- O que aparece por baixo ao deslizar. -->
    <div
      v-if="arrastando"
      class="absolute inset-0 flex items-center justify-between px-5 text-sm font-medium text-white"
      :class="deslocamento > 0
        ? (podeAceitar ? 'bg-emerald-600' : 'bg-sky-600')
        : 'bg-zinc-600'"
      aria-hidden="true"
    >
      <span v-if="deslocamento > 0" class="flex items-center gap-2" :class="passouDoLimiar ? '' : 'opacity-70'">
        <component :is="podeAceitar ? CheckIcon : PanelRightOpenIcon" class="size-5" />
        {{ podeAceitar ? 'Aceitar' : 'Abrir' }}
      </span>
      <span v-else class="ml-auto flex items-center gap-2" :class="passouDoLimiar ? '' : 'opacity-70'">
        Ignorar
        <EyeOffIcon class="size-5" />
      </span>
    </div>

    <div
      class="relative flex items-center [touch-action:pan-y]"
      :class="[
        arrastando ? '' : 'transition-transform duration-200',
        selecionada ? 'shadow-[inset_3px_0_0_var(--primary)]' : '',
      ]"
      :style="{ transform: `translateX(${deslocamento}px)`, background: fundo }"
      @pointerdown="aoTocar"
      @pointermove="aoMover"
      @pointerup="aoSoltar"
      @pointercancel="aoCancelar"
    >
      <button
        type="button"
        class="flex min-w-0 flex-1 items-start gap-3 px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        :aria-label="`${titulo}, ${formatarDinheiro(valor)}. Ver detalhes e classificar.`"
        @click="aoClicar"
      >
        <!-- A loja grande, o banco pequeno no canto: nunca dá para confundir os dois. -->
        <span class="relative mt-0.5 shrink-0">
          <IconeDaCompra
            :descricao="textoParaSelo(item.principal)"
            :categoria="sugestao?.categoriaNome"
          />
          <SeloDoBanco
            v-if="banco"
            :banco="banco"
            tamanho="xs"
            class="absolute -bottom-1 -right-1.5 ring-2 ring-card"
          />
        </span>

        <span class="min-w-0 flex-1">
          <span class="flex items-baseline justify-between gap-3">
            <span class="truncate font-medium">{{ titulo }}</span>
            <span
              class="shrink-0 font-semibold tabular-nums"
              :class="item.sentido === 'entrada' ? 'text-emerald-600 dark:text-emerald-400' : ''"
            >
              {{ item.sentido === 'entrada' ? '+' : '' }}{{ formatarDinheiro(valor) }}
            </span>
          </span>

          <span class="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span class="truncate">{{ conta }}</span>
            <!-- Só quando a compra foi de outro cartão da fatura (o virtual, um adicional). -->
            <span
              v-if="item.principal.cartao_final && !conta.endsWith(item.principal.cartao_final)"
              class="shrink-0 rounded bg-muted px-1.5 py-px font-medium text-foreground/80"
            >cartão {{ item.principal.cartao_final }}</span>
            <span v-if="parcela" class="shrink-0 rounded bg-muted px-1.5 py-px font-medium tabular-nums text-foreground/80">{{ parcela }}</span>
          </span>
          <span v-if="item.principal.mensagem" class="mt-0.5 block truncate text-xs italic text-muted-foreground">
            “{{ item.principal.mensagem }}”
          </span>

          <span
            v-if="textoDaSugestao"
            class="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
            :class="podeAceitar
              ? 'bg-primary/15 text-primary'
              : 'border border-dashed text-muted-foreground'"
            :title="sugestao?.motivo"
          >
            <component :is="iconeDaSugestao" class="size-3.5 shrink-0" />
            <span class="truncate">{{ textoDaSugestao }}</span>
          </span>
        </span>

        <ChevronRightIcon v-if="!podeAceitar" class="mt-2.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      <button
        v-if="podeAceitar"
        type="button"
        class="mr-3 inline-flex shrink-0 items-center gap-1 self-center rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        :disabled="ocupado"
        :aria-label="`Aceitar: ${titulo} como ${textoDaSugestao}`"
        @click="emit('aceitar')"
      >
        <CheckIcon class="size-3.5" />
        Aceitar
      </button>
    </div>
  </li>
</template>
