<script setup lang="ts">
import { MapIcon } from '@lucide/vue'
import type { ModoTransporte, PontoDoRoteiro } from '~/types/viagem'
import { MAX_PONTOS_EMBED, embedTruncado, urlDoEmbed } from '~/types/viagem'

/**
 * O mapa embutido — Maps Embed API, gratuita e ilimitada.
 *
 * É um `<iframe>` e não o SDK JavaScript de propósito: o SDK cai no SKU *Dynamic
 * Maps*, pago acima de 10 mil carregamentos, e traria um mapa interativo que
 * ninguém pediu. O preço disso é que a chave vai visível no `src` — protegida
 * por restrição de referrer no Google Cloud, não por segredo.
 */
const props = defineProps<{
  paradas: PontoDoRoteiro[]
  modo: ModoTransporte
  /** O mapa está mostrando um dia só? Muda o que a caixa vazia diz. */
  filtrado?: boolean
  /**
   * Ocupar a altura que o pai der, em vez do 16:9 de sempre.
   *
   * É o modo do cartão do painel com altura fixa: lá o mapa é o conteúdo
   * principal, e deixá-lo em 16:9 no meio de um cartão alto sobraria um vão
   * embaixo do tamanho de outro mapa.
   */
  preencher?: boolean
}>()

const chave = useRuntimeConfig().public.googleMapsEmbedKey

const src = computed(() => urlDoEmbed(props.paradas, props.modo, chave))
const truncado = computed(() => embedTruncado(props.paradas))

/**
 * Por que não há mapa — e são quatro motivos diferentes com a mesma cara de
 * caixa vazia.
 *
 * Confundi-los custa tempo real: "falta a chave no .env" já fez perder meia hora
 * procurando bug de rota, e agora há dois motivos novos, os dois criados pela
 * própria pessoa segundos antes (filtrou um dia sem lugares do Maps, ou desligou
 * as paradas que sobraram). Sem esta frase, desativar a última parada ativa do
 * dia parece o mapa ter quebrado.
 */
const mensagemVazia = computed(() => {
  if (!chave) return 'Mapa indisponível — falta NUXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY no ambiente.'

  if (!props.paradas.length) {
    return props.filtrado
      ? 'Nenhuma parada neste dia.'
      : 'Adicione uma parada do Google Maps para ver a rota.'
  }

  // Há paradas aqui, e nenhuma entra na rota: escritas à mão, desligadas, ou as
  // duas coisas. Em todos os casos o que falta é um lugar que o Google conheça.
  return props.filtrado
    ? 'Nenhuma parada ativa do Google Maps neste dia.'
    : 'Nenhuma parada ativa do Google Maps — o mapa não tem o que desenhar.'
})
</script>

<template>
  <div :class="preencher ? 'flex min-h-0 flex-1 flex-col gap-2' : 'space-y-2'">
    <div
      class="overflow-hidden rounded-lg border bg-muted"
      :class="preencher ? 'min-h-0 flex-1' : ''"
    >
      <iframe
        v-if="src"
        :src="src"
        class="w-full"
        :class="preencher ? 'h-full' : 'aspect-video'"
        style="border: 0"
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
        title="Mapa do roteiro"
        allowfullscreen
      />

      <!-- Os motivos de não haver mapa são vários — ver `mensagemVazia`. -->
      <div
        v-else
        class="grid place-items-center px-6 text-center"
        :class="preencher ? 'h-full' : 'aspect-video'"
      >
        <div>
          <MapIcon class="mx-auto size-8 text-muted-foreground" />
          <p class="mt-2 text-sm text-muted-foreground">{{ mensagemVazia }}</p>
        </div>
      </div>
    </div>

    <p v-if="truncado" class="text-xs text-muted-foreground">
      O mapa desenha as {{ MAX_PONTOS_EMBED }} primeiras paradas — o roteiro tem mais.
      Os links abaixo cobrem o percurso inteiro.
    </p>
  </div>
</template>
