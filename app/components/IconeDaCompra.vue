<script setup lang="ts">
/**
 * O selo à esquerda de uma compra ou de uma categoria.
 *
 * Com `descricao`, tenta reconhecer a loja (iFood, Uber, Netflix...) e mostra o
 * selo dela na cor da marca. Sem loja conhecida — ou sem descrição, que é o caso
 * da linha de categoria — mostra o desenho da categoria na cor que vocês
 * escolheram para ela.
 */
import { CLASSE_COR } from '~/types/orcamento'
import type { CorCategoria } from '~/types/database.types'
import { desenhoDaCompra, iconeDaCategoria } from '~/lib/icones-categoria'

const props = withDefaults(defineProps<{
  categoria?: string | null
  cor?: CorCategoria | null
  descricao?: string | null
  tamanho?: 'sm' | 'md'
}>(), { categoria: null, cor: null, descricao: null, tamanho: 'md' })

const desenho = computed(() =>
  props.descricao
    ? desenhoDaCompra(props.descricao, props.categoria)
    : { tipo: 'icone' as const, icone: iconeDaCategoria(props.categoria) },
)

const caixa = computed(() => (props.tamanho === 'sm' ? 'size-8 rounded-lg' : 'size-10 rounded-xl'))
</script>

<template>
  <span
    v-if="desenho.tipo === 'marca'"
    class="grid shrink-0 place-items-center font-bold tracking-tight shadow-sm ring-1 ring-inset ring-black/10 dark:ring-white/20"
    :class="[caixa, tamanho === 'sm' ? 'text-[10px]' : 'text-xs']"
    :style="{ backgroundColor: desenho.estabelecimento.cor, color: desenho.estabelecimento.corTexto }"
    :title="desenho.estabelecimento.nome"
    aria-hidden="true"
  >
    {{ desenho.estabelecimento.sigla }}
  </span>
  <span
    v-else
    class="grid shrink-0 place-items-center"
    :class="[caixa, cor ? CLASSE_COR[cor] : 'bg-muted text-muted-foreground']"
    aria-hidden="true"
  >
    <component :is="desenho.icone" :class="tamanho === 'sm' ? 'size-4' : 'size-5'" />
  </span>
</template>
