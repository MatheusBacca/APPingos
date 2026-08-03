<script setup lang="ts">
import { ArrowLeftIcon } from '@lucide/vue'

/**
 * Volta para a tela anterior, com destino de reserva.
 *
 * `router.back()` sozinho não serve: quem abre o link do filme direto (de um
 * favorito, ou do link compartilhado) não tem histórico dentro do app e cairia
 * fora dele. Então só voltamos quando há de onde voltar.
 */
const props = withDefaults(defineProps<{ para?: string, rotulo?: string }>(), {
  para: '/',
  rotulo: 'Voltar',
})

const router = useRouter()

function onVoltar() {
  if (window.history.length > 1) router.back()
  else router.push(props.para)
}
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    @click="onVoltar"
  >
    <ArrowLeftIcon class="size-4" />
    {{ rotulo }}
  </button>
</template>
