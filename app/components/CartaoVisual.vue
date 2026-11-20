<script setup lang="ts">
/**
 * O cartão desenhado com a cara do banco: o fundo na cor da instituição
 * (`~/lib/instituicoes`), o ícone da Pluggy num canto, o chip, o final e a
 * bandeira. É para a pessoa reconhecer "o roxo do Nubank, final 0750" sem ler.
 *
 * Não reproduz o cartão de verdade de ninguém: é o formato de cartão
 * (1,586 : 1) com as cores da marca.
 */
import { seloDoBanco } from '~/lib/cartoes'

const props = withDefaults(defineProps<{
  banco: string
  /** O apelido, se a pessoa deu; senão o nome do produto que o banco manda. */
  titulo: string
  final?: string | null
  bandeira?: string | null
  /** Ícone do destino (👤, 👥, 🔀). */
  destino?: string | null
  tamanho?: 'sm' | 'md'
  /** O cartão bloqueado ou cancelado fica apagado. */
  inativo?: boolean
}>(), { tamanho: 'md', final: null, bandeira: null, destino: null, inativo: false })

const selo = computed(() => seloDoBanco(props.banco))
const falhou = ref(false)

const bandeira = computed(() => {
  const b = props.bandeira?.toUpperCase() ?? ''
  if (b.includes('MASTER')) return 'mastercard'
  if (b.includes('VISA')) return 'VISA'
  if (b.includes('ELO')) return 'elo'
  if (b.includes('AMEX') || b.includes('AMERICAN')) return 'AMEX'
  if (b.includes('HIPER')) return 'hiper'
  return b ? b.toLowerCase() : ''
})
</script>

<template>
  <div
    class="relative flex shrink-0 flex-col justify-between overflow-hidden rounded-xl shadow-md ring-1 ring-black/10"
    :class="[
      tamanho === 'md' ? 'aspect-[1.586] w-56 p-3.5' : 'aspect-[1.586] w-36 p-2.5',
      inativo && 'opacity-50 grayscale',
    ]"
    :style="{ background: selo.cartao.fundo, color: selo.cartao.texto }"
    :title="`${banco} · ${titulo}${final ? ` · final ${final}` : ''}`"
  >
    <!-- O brilho na diagonal, para parecer plástico e não um retângulo chapado. -->
    <span class="pointer-events-none absolute -right-1/4 -top-1/2 h-[160%] w-2/3 rotate-12 bg-white/10 blur-xl" aria-hidden="true" />

    <div class="relative flex items-start justify-between gap-2">
      <span
        v-if="selo.icone && !falhou"
        class="grid place-items-center rounded-md bg-white/95 shadow-sm"
        :class="tamanho === 'md' ? 'size-7 p-1' : 'size-5 p-0.5'"
      >
        <img :src="selo.icone" alt="" class="size-full object-contain" @error="falhou = true">
      </span>
      <span v-else class="font-bold lowercase tracking-tight" :class="tamanho === 'md' ? 'text-base' : 'text-xs'">{{ selo.sigla }}</span>
      <span
        v-if="destino"
        class="grid place-items-center rounded-full bg-white/90 shadow-sm"
        :class="tamanho === 'md' ? 'size-7 text-sm' : 'size-5 text-[10px]'"
        aria-hidden="true"
      >{{ destino }}</span>
    </div>

    <!-- O chip. -->
    <span
      class="relative rounded-[3px] bg-gradient-to-br from-amber-200 via-amber-300 to-amber-500 opacity-90"
      :class="tamanho === 'md' ? 'h-5 w-7' : 'h-3 w-4'"
      aria-hidden="true"
    />

    <div class="relative flex items-end justify-between gap-2">
      <div class="min-w-0">
        <p class="truncate font-medium leading-tight" :class="tamanho === 'md' ? 'text-sm' : 'text-[10px]'">{{ titulo }}</p>
        <p v-if="final" class="font-mono tracking-widest opacity-90" :class="tamanho === 'md' ? 'text-xs' : 'text-[9px]'">•••• {{ final }}</p>
      </div>
      <span
        v-if="bandeira"
        class="shrink-0 font-bold italic opacity-90"
        :class="tamanho === 'md' ? 'text-xs' : 'text-[8px]'"
      >{{ bandeira }}</span>
    </div>
  </div>
</template>
