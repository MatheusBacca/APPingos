<script setup lang="ts">
/**
 * O mapa da próxima viagem — ou da última que aconteceu.
 *
 * Qual roteiro (e por que o secreto fica de fora) está em `roteiroDaVitrine`.
 *
 * Duas consultas, e a segunda é inevitável: a lista de roteiros traz só quantas
 * paradas cada um tem, e o mapa precisa dos `place_id` na ordem. É a mesma chave
 * de cache da tela do roteiro, então abrir a viagem depois de ver o painel não
 * busca de novo.
 *
 * O iframe fica acima do link do cartão (`relative z-10` no bloco do mapa):
 * dentro dele o gesto é do Google — arrastar o mapa não pode virar navegação
 * para o módulo. O resto do card continua clicável.
 */
import { Skeleton } from '@/components/ui/skeleton'
import { formatarDiaCurto, hojeIso } from '@/lib/datas'
import { ESPACO_DA_VITRINE, ESPACO_INDEFINIDO, roteiroDaVitrine } from '@/lib/vitrine'
import { paradasOrdenadas } from '~/types/viagem'
import { useRoteiro, useRoteiros } from '~/composables/useRoteiros'

const espaco = inject(ESPACO_DA_VITRINE, computed(() => ESPACO_INDEFINIDO))

/** Com altura fixa no cartão, o mapa ocupa o que sobrar; senão, fica em 16:9. */
const preencher = computed(() => espaco.value.altura !== null)

const { data: roteiros, isPending } = useRoteiros()

const escolha = computed(() => roteiroDaVitrine(roteiros.value ?? [], hojeIso()))

const { data: roteiro, isPending: buscandoParadas } = useRoteiro(
  computed(() => escolha.value?.roteiro.id ?? ''),
)

const paradas = computed(() => paradasOrdenadas(roteiro.value?.paradas ?? []))

/** "A próxima viagem · sáb, 12 de dez" — o quando entra só quando existe. */
const legenda = computed(() => {
  const atual = escolha.value
  if (!atual) return ''

  const quando = atual.roteiro.data_inicio ? formatarDiaCurto(atual.roteiro.data_inicio) : null
  return [atual.legenda, quando].filter(Boolean).join(' · ')
})
</script>

<template>
  <div class="mt-3 flex min-h-0 flex-col">
    <Skeleton v-if="isPending" class="aspect-video w-full rounded-lg" />

    <p v-else-if="!escolha" class="text-sm text-muted-foreground">
      Nenhum roteiro por aqui ainda.
    </p>

    <template v-else>
      <!--
        `line-clamp-2` e não `truncate`: o nome do roteiro é livre ("4 anos 👫") e
        somado ao "quando" passa da linha em qualquer cartão de meia tela — cortar
        no meio comeria justamente a data, que é a informação nova.
      -->
      <p class="line-clamp-2 text-sm">
        <span class="font-medium">{{ escolha.roteiro.nome }}</span>
        <span class="text-muted-foreground"> · {{ legenda }}</span>
      </p>

      <!--
        Esqueleto até as paradas chegarem: sem ele, o mapa pisca a caixa de
        "adicione uma parada" — a mensagem de um roteiro vazio — no meio segundo
        entre saber QUAL roteiro e saber por onde ele passa.
      -->
      <Skeleton
        v-if="buscandoParadas"
        class="mt-2 w-full rounded-lg"
        :class="preencher ? 'min-h-24 flex-1' : 'aspect-video'"
      />

      <!-- Ver o comentário do cabeçalho: o gesto dentro do mapa é do Google. -->
      <div
        v-else
        class="relative z-10 mt-2 flex flex-col"
        :class="preencher ? 'min-h-0 flex-1' : ''"
      >
        <MapaDoRoteiro
          :paradas="paradas"
          :modo="escolha.roteiro.modo_transporte"
          :preencher="preencher"
        />
      </div>
    </template>
  </div>
</template>
