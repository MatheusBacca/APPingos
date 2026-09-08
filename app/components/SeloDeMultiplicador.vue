<script setup lang="ts">
/**
 * "🔥 1,35×" — o que está valendo mais agora.
 *
 * O irmão de `SeloDePins`, e a outra metade da pergunta. O saldo é o passado
 * ("quanto eu já fiz"); isto é o presente ("registrar agora rende mais"), e é a
 * única superfície do app que responde isso ANTES de a pessoa agir — até aqui o
 * multiplicador só aparecia no extrato, depois do fato, quando ele já não muda
 * mais o que ninguém faz.
 *
 * SILÊNCIO ENQUANTO NÃO SABE, a mesma regra de `SeloDePins`: carregando ou com
 * erro, o componente não desenha nada. Aqui isso cobre um caso concreto — a RPC
 * `meu_multiplicador_de_pins` nasce numa migration, e num banco que ainda não a
 * recebeu a tela inicial simplesmente não mostra o fogo, em vez de quebrar.
 *
 * Quem decide aceso/apagado e monta a frase é `seloDoMultiplicador`, em
 * `~/types/pin` — aqui fica só o desenho.
 */
import { seloDoMultiplicador } from '~/types/pin'
import { useMultiplicadorAgora, useRegrasDePins } from '~/composables/usePins'

const { data, isPending, isError } = useMultiplicadorAgora()
const { data: economia } = useRegrasDePins()

/** As chaves viram os rótulos do banco — "sequencia" não é palavra de tela. */
const rotulos = computed(() =>
  new Map((economia.value?.hotspots ?? []).map(h => [h.chave, h.rotulo])),
)

const selo = computed(() => {
  if (isPending.value || isError.value || !data.value) return null

  return seloDoMultiplicador(
    data.value.multiplicador,
    data.value.hotspots,
    chave => rotulos.value.get(chave) ?? chave,
  )
})
</script>

<template>
  <NuxtLink
    v-if="selo?.aceso"
    to="/pins"
    class="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-xs font-medium tabular-nums text-amber-700 transition-colors hover:bg-amber-500/25 dark:text-amber-300"
    :title="selo.explicacao"
  >
    <span aria-hidden="true">🔥</span>
    <span aria-hidden="true">{{ selo.numero }}</span>
    <span class="sr-only">{{ selo.explicacao }}</span>
  </NuxtLink>
</template>
