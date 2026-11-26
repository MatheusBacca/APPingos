<script setup lang="ts">
/**
 * O olho de Orçamentos: mostra ou esconde os valores em dinheiro de todas as
 * telas do módulo (e dos resumos da lateral), lembrado neste dispositivo.
 *
 * Um componente só, no painel e no cabeçalho de cada tela de detalhe: quem
 * esconde no painel e abre Cartões tem de poder mostrar de novo ali mesmo.
 */
import { EyeIcon, EyeOffIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useValoresOcultos } from '~/composables/useValoresOcultos'

const { ocultos, alternar } = useValoresOcultos()
</script>

<template>
  <Button
    variant="outline"
    size="icon"
    :aria-pressed="ocultos"
    :aria-label="ocultos ? 'Mostrar valores' : 'Esconder valores'"
    :title="ocultos ? 'Mostrar valores' : 'Esconder valores'"
    @click="alternar"
  >
    <component :is="ocultos ? EyeOffIcon : EyeIcon" class="size-4" />
  </Button>
</template>
