<script setup lang="ts">
/**
 * O selo do banco: um quadrado na cor que todo mundo associa ao banco, com a
 * sigla. Não é o logo (não temos as marcas), é o suficiente para o olho achar
 * o Itaú laranja e o Nubank roxo numa lista.
 */
import { seloDoBanco } from '~/lib/cartoes'

const props = withDefaults(defineProps<{ banco: string, tamanho?: 'xs' | 'sm' | 'md' }>(), { tamanho: 'md' })
const selo = computed(() => seloDoBanco(props.banco))
</script>

<template>
  <span
    class="grid shrink-0 place-items-center font-bold lowercase tracking-tight shadow-sm"
    :class="{ xs: 'size-5 rounded-md text-[7px]', sm: 'size-8 rounded-lg text-[11px]', md: 'size-11 rounded-xl text-sm' }[tamanho]"
    :style="{ backgroundColor: selo.cor, color: selo.texto }"
    :title="banco"
    aria-hidden="true"
  >
    {{ selo.sigla }}
  </span>
</template>
