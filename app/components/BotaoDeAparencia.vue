<script setup lang="ts">
/**
 * Abre o painel de aparência. Substituiu o antigo `ThemeToggle`.
 *
 * Ele ALTERNAVA claro/escuro num clique, e isso era melhor enquanto tema era a
 * única escolha. Com o acento entrando, um clique não dá conta de duas decisões
 * — e o rodapé da lateral não tem lugar para um sexto ícone (ver o comentário em
 * AppSidebar.vue: cinco é o que cabe sem os ícones saírem da barra).
 *
 * O ícone continua mostrando o modo em vigor, então o rodapé segue dizendo qual
 * tema está valendo sem custar largura nenhuma.
 */
import { MoonIcon, SunIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useAparencia } from '~/composables/useAparencia'

const { modo } = useAparencia()

const aberto = ref(false)

/*
 * `modo` guarda a escolha, que pode ser 'auto'; o ícone precisa do que está
 * VALENDO. `useColorMode` resolve 'auto' na classe do `<html>`, e é dela que sai
 * a resposta certa nos dois casos.
 */
const escuro = computed(() => modo.value === 'dark'
  || (modo.value === 'auto' && import.meta.client && document.documentElement.classList.contains('dark')))
</script>

<template>
  <Button
    variant="ghost"
    size="icon"
    aria-label="Aparência"
    title="Aparência"
    @click="aberto = true"
  >
    <SunIcon v-if="escuro" class="size-4" />
    <MoonIcon v-else class="size-4" />
  </Button>

  <AparenciaDialogo v-model:aberto="aberto" />
</template>
