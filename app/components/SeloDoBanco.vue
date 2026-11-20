<script setup lang="ts">
/**
 * O selo do banco: o ícone que a Pluggy mostra no widget para aquela
 * instituição, sobre fundo branco. Sem ícone conhecido — ou se ele não carregar
 * —, um quadrado na cor que todo mundo associa ao banco, com a sigla: o
 * suficiente para o olho achar o Itaú laranja e o Nubank roxo numa lista.
 */
import { seloDoBanco } from '~/lib/cartoes'

const props = withDefaults(defineProps<{ banco: string, tamanho?: 'xs' | 'sm' | 'md' }>(), { tamanho: 'md' })
const selo = computed(() => seloDoBanco(props.banco))

const falhou = ref(false)
watch(() => props.banco, () => { falhou.value = false })

const TAMANHO = {
  xs: 'size-5 rounded-md text-[7px]',
  sm: 'size-8 rounded-lg text-[11px]',
  md: 'size-11 rounded-xl text-sm',
} as const
const RESPIRO = { xs: 'p-0.5', sm: 'p-1', md: 'p-1.5' } as const
</script>

<template>
  <span
    v-if="selo.icone && !falhou"
    class="grid shrink-0 place-items-center overflow-hidden bg-white shadow-sm ring-1 ring-black/5"
    :class="[TAMANHO[tamanho], RESPIRO[tamanho]]"
    :title="banco"
    aria-hidden="true"
  >
    <img :src="selo.icone" alt="" class="size-full object-contain" @error="falhou = true">
  </span>
  <span
    v-else
    class="grid shrink-0 place-items-center font-bold lowercase tracking-tight shadow-sm"
    :class="TAMANHO[tamanho]"
    :style="{ backgroundColor: selo.cor, color: selo.texto }"
    :title="banco"
    aria-hidden="true"
  >
    {{ selo.sigla }}
  </span>
</template>
