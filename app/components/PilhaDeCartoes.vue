<script setup lang="ts">
/**
 * Os cartões de um espaço, em círculos empilhados — o mesmo desenho da pilha de
 * pessoas de Filmes (`PilhaMembros`): recuo negativo, o primeiro por cima e um
 * "+N" quando passa de três. Aqui cada círculo é o selo do banco do cartão.
 *
 * O nome do espaço vai ao lado, fora daqui: a pilha só diz QUAIS cartões seus
 * caem naquele espaço.
 */
export interface CartaoNaPilha {
  id: string
  banco: string
  /** "Nubank •••• 0750" — o que o `title` e o leitor de tela dizem. */
  rotulo: string
}

const props = defineProps<{ cartoes: CartaoNaPilha[] }>()

/** O mesmo teto de `PilhaMembros`: mais que três come a largura da linha. */
const MAX = 3
const visiveis = computed(() => props.cartoes.slice(0, MAX))
const excedente = computed(() => Math.max(0, props.cartoes.length - MAX))
const texto = computed(() => props.cartoes.map(c => c.rotulo).join(', '))
</script>

<template>
  <div v-if="cartoes.length" class="flex shrink-0" :title="texto">
    <SeloDoBanco
      v-for="(c, i) in visiveis"
      :key="c.id"
      :banco="c.banco"
      tamanho="xs"
      redondo
      class="ring-2 ring-card"
      :class="i > 0 ? '-ml-1.5' : ''"
      :style="{ zIndex: visiveis.length - i }"
    />
    <span
      v-if="excedente"
      class="-ml-1.5 grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground ring-2 ring-card"
      aria-hidden="true"
    >
      +{{ excedente }}
    </span>
    <span class="sr-only">{{ texto }}</span>
  </div>
</template>
