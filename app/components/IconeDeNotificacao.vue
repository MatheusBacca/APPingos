<script setup lang="ts">
import {
  BellIcon,
  CircleCheckIcon,
  ClapperboardIcon,
  EyeIcon,
  PencilIcon,
  PlaneIcon,
  SparklesIcon,
  Trash2Icon,
  WalletIcon,
} from '@lucide/vue'

/**
 * Resolve o ícone que `textoDaNotificacao` devolve, pelo nome.
 *
 * Mapa explícito pelo mesmo motivo de `ModuleIcon`: import dinâmico por string
 * traria o pacote inteiro do lucide para o bundle. O fallback é o sino — um tipo
 * gravado por uma versão mais nova do banco não pode deixar buraco na lista.
 */
const ICONES = {
  BellIcon,
  CircleCheckIcon,
  ClapperboardIcon,
  EyeIcon,
  PencilIcon,
  PlaneIcon,
  SparklesIcon,
  Trash2Icon,
  WalletIcon,
} as const

const props = defineProps<{ nome: string, class?: string }>()

const componente = computed(() => ICONES[props.nome as keyof typeof ICONES] ?? BellIcon)
</script>

<template>
  <component :is="componente" :class="props.class" />
</template>
