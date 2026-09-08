<script setup lang="ts">
/**
 * O selo do canto do cartão do painel — "Na fila", "42%".
 *
 * Irmão pequeno de `ResumoDoModulo`, e existe pelo mesmo motivo: o módulo
 * registra um composable em `app/modules.ts` e a superfície desenha. A diferença
 * é o formato — o resumo são linhas com rótulo e valor, isto é uma palavra só.
 *
 * O TRY/CATCH NÃO É DECORAÇÃO, e a lição é a mesma de `ResumoDoModulo`: um
 * composable que estoure no setup levaria o cartão junto, e o cartão é a
 * navegação do dashboard. Um selo quebrado degrada para "nada a dizer" — o canto
 * fica vazio, e o resto do cartão continua de pé.
 */
// `computed` explícito (e não auto-importado) pela mesma razão de
// `ResumoDoModulo`: este componente é montável fora do Nuxt.
import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { UsarSelo } from '~/types/resumo'

const props = defineProps<{
  usar: UsarSelo
  /** Para o console dizer QUAL módulo quebrou, e não só que algo quebrou. */
  modulo: string
}>()

/*
 * Chamado uma vez, no setup. Parece chamada condicional de composable, mas não
 * é: quem monta este componente passa `:key`, então uma instância nunca troca de
 * módulo — outro módulo é outra instância.
 */
function iniciar(): ComputedRef<string | null> | undefined {
  try {
    return props.usar()
  }
  catch (e) {
    console.error(`[selo] o módulo "${props.modulo}" falhou ao montar:`, e)
    return undefined
  }
}

const fonte = iniciar()

const texto = computed<string | null>(() => {
  try {
    return fonte?.value ?? null
  }
  catch (e) {
    console.error(`[selo] o módulo "${props.modulo}" falhou ao calcular:`, e)
    return null
  }
})
</script>

<template>
  <span v-if="texto" class="shrink-0 text-sm text-muted-foreground">{{ texto }}</span>
</template>
