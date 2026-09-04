<script setup lang="ts">
/**
 * Os interesses em aberto, como cartõezinhos.
 *
 * O ícone é o do DESTINO ("compra", "viagem", "projeto"…), e não um ícone por
 * interesse: é o mesmo agrupamento da tela do módulo, e é a única informação
 * visual que distingue "um sofá" de "uma viagem para a Itália" antes de a pessoa
 * ler o título.
 *
 * O preço aparece só quando existe. Um "sem preço ainda" em cada cartão de um
 * cartão do painel seria três vezes a mesma ressalva na mesma caixa — e ela já
 * está dita, uma vez, na linha de resumo ("Somando · 4 sem preço ainda").
 *
 * Mapa explícito de ícones, como em `ModuleIcon` e pelo mesmo motivo: import
 * dinâmico por string traria o pacote inteiro do lucide para o bundle.
 */
import type { Component } from 'vue'
import { HammerIcon, PlaneIcon, ShoppingBagIcon, TargetIcon, WalletIcon } from '@lucide/vue'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarDinheiro } from '@/lib/dinheiro'
import { ESPACO_DA_VITRINE, ESPACO_INDEFINIDO, interessesDaVitrine, quantosCabem } from '@/lib/vitrine'
import type { DestinoInteresse } from '~/types/interesse'
import { rotuloDestino, valorDoInteresse } from '~/types/interesse'
import { useInteresses } from '~/composables/useInteresses'

const ICONES: Record<DestinoInteresse, Component> = {
  compra: ShoppingBagIcon,
  objetivo: TargetIcon,
  viagem: PlaneIcon,
  projeto: HammerIcon,
  orcamento: WalletIcon,
}

const { data: interesses, isPending } = useInteresses()

/*
 * Quantos cartõezinhos cabem. ~150px é onde "Placa de Vídeo RTX" ainda cabe em
 * duas linhas, e ~100px é a altura de um cartão com destino, título e preço.
 *
 * Com altura automática são duas fileiras — o cartão do painel tem que continuar
 * cabendo na primeira dobra do celular.
 */
const espaco = inject(ESPACO_DA_VITRINE, computed(() => ESPACO_INDEFINIDO))

const cabem = computed(() =>
  quantosCabem(espaco.value, { largura: 150, altura: 100 }, {
    minimo: 2,
    maximo: 8,
    colunas: 4,
    linhas: 2,
    vao: 8,
    reserva: 12,
  }),
)

const vitrine = computed(() => interessesDaVitrine(interesses.value ?? [], cabem.value.total))
</script>

<template>
  <div class="mt-3">
    <div v-if="isPending" class="grid grid-cols-2 gap-2">
      <Skeleton v-for="i in 4" :key="i" class="h-24 w-full rounded-lg" />
    </div>

    <p v-else-if="!vitrine.length" class="text-sm text-muted-foreground">
      Nenhum interesse em aberto.
    </p>

    <!--
      As colunas saem da largura de verdade, e não de um `sm:` fixo: o cartão do
      painel pode ser metade da tela ou a tela inteira, e quatro cartões lado a
      lado num cartão de 340px dariam ~85px cada — "Placa de Vídeo" viraria
      "Placa de..." e o destino, "Co...".
    -->
    <div
      v-else
      class="grid gap-2"
      :style="{ gridTemplateColumns: `repeat(${cabem.colunas}, minmax(0, 1fr))` }"
    >
      <div
        v-for="interesse in vitrine"
        :key="interesse.id"
        class="flex flex-col gap-1.5 rounded-lg border bg-background/60 p-2.5"
      >
        <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <component :is="ICONES[interesse.destino]" class="size-3.5 shrink-0" />
          <span class="truncate">{{ rotuloDestino(interesse.destino) }}</span>
        </span>

        <p class="line-clamp-2 text-sm font-medium leading-snug">{{ interesse.titulo }}</p>

        <p v-if="interesse.observacao" class="line-clamp-2 text-xs leading-snug text-muted-foreground">
          {{ interesse.observacao }}
        </p>

        <p
          v-if="valorDoInteresse(interesse.agrupamentos) !== null"
          class="mt-auto text-xs font-medium tabular-nums"
        >
          {{ formatarDinheiro(valorDoInteresse(interesse.agrupamentos)!) }}
        </p>
      </div>
    </div>
  </div>
</template>
