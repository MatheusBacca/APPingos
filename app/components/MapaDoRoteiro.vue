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
}>()

const chave = useRuntimeConfig().public.googleMapsEmbedKey

const src = computed(() => urlDoEmbed(props.paradas, props.modo, chave))
const truncado = computed(() => embedTruncado(props.paradas))
</script>

<template>
  <div class="space-y-2">
    <div class="overflow-hidden rounded-lg border bg-muted">
      <iframe
        v-if="src"
        :src="src"
        class="aspect-video w-full"
        style="border: 0"
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
        title="Mapa do roteiro"
        allowfullscreen
      />

      <!--
        Sem chave e sem parada são estados diferentes com a mesma aparência de
        "caixa vazia", e confundi-los faz perder meia hora procurando bug de
        rota quando o que falta é a variável no .env.
      -->
      <div v-else class="grid aspect-video place-items-center px-6 text-center">
        <div>
          <MapIcon class="mx-auto size-8 text-muted-foreground" />
          <p class="mt-2 text-sm text-muted-foreground">
            {{ chave
              ? 'Adicione uma parada do Google Maps para ver a rota.'
              : 'Mapa indisponível — falta NUXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY no ambiente.' }}
          </p>
        </div>
      </div>
    </div>

    <p v-if="truncado" class="text-xs text-muted-foreground">
      O mapa desenha as {{ MAX_PONTOS_EMBED }} primeiras paradas — o roteiro tem mais.
      Os links abaixo cobrem o percurso inteiro.
    </p>
  </div>
</template>
