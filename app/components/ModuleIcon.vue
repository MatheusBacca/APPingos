<script setup lang="ts">
import {
  BookOpenIcon,
  ClapperboardIcon,
  DumbbellIcon,
  LayoutDashboardIcon,
  MusicIcon,
  PlaneIcon,
  TargetIcon,
  WalletIcon,
} from '@lucide/vue'

/**
 * Resolve o nome de ícone declarado em `app/modules.ts` para o componente.
 *
 * Mapa explícito de propósito: import dinâmico por string traria o pacote
 * inteiro do lucide para o bundle.
 */
const ICONES = {
  BookOpenIcon,
  ClapperboardIcon,
  DumbbellIcon,
  LayoutDashboardIcon,
  MusicIcon,
  PlaneIcon,
  TargetIcon,
  WalletIcon,
} as const

const props = defineProps<{ nome: string, class?: string }>()

const componente = computed(
  () => ICONES[props.nome as keyof typeof ICONES] ?? LayoutDashboardIcon,
)
</script>

<template>
  <component :is="componente" :class="props.class" />
</template>
