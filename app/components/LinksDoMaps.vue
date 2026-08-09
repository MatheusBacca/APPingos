<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { ExternalLinkIcon, MapPinIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { AberturaNoMaps, ModoTransporte, ParadaParaSalvar } from '~/types/viagem'
import {
  MAX_PONTOS_LINK_DESKTOP,
  MAX_PONTOS_LINK_MOBILE,
  aberturaNoMaps,
  aberturasPorDia,
  rotuloDoDia,
  urlDoLugar,
  urlDoTrecho,
} from '~/types/viagem'

/**
 * As três formas de levar o roteiro para o Google Maps.
 *
 * O roteiro inteiro responde "como é a viagem". O dia responde "o que a gente
 * faz hoje", que é a pergunta de quem já está lá, com o celular na mão. A
 * seleção responde "e se a gente fizer só estes três?", que é planejamento no
 * sofá — e é a única que muda de resposta a cada toque.
 *
 * Os três são o mesmo cálculo (`aberturaNoMaps`) sobre listas diferentes. O
 * limite de waypoints do celular vive num lugar só; ter três caminhos até o
 * Maps não pode virar três lugares para ele ficar desatualizado.
 */
const props = defineProps<{
  paradas: ParadaParaSalvar[]
  modo: ModoTransporte
  dataInicio: string | null
  /** Índices marcados na lista, quando o modo é seleção. */
  selecionadas: number[]
}>()

const modoDeAbertura = defineModel<'tudo' | 'dia' | 'selecao'>('aberturaEm', { required: true })

/*
 * A doc da Maps URLs API é explícita: 3 waypoints no navegador do celular, 9
 * fora dele. Contando origem e destino, 5 e 11 pontos. A largura é um proxy
 * imperfeito para "navegador de celular", e erra para o lado seguro — uma
 * janela estreita no desktop gera links menores que o necessário, o que
 * funciona; o contrário perderia paradas em silêncio.
 */
const noDesktop = useMediaQuery('(min-width: 768px)')
const maxPontos = computed(() => noDesktop.value ? MAX_PONTOS_LINK_DESKTOP : MAX_PONTOS_LINK_MOBILE)

const temDias = computed(() => props.paradas.some(p => p.dia !== null))

const selecionadasNaOrdem = computed(() =>
  [...props.selecionadas].sort((a, b) => a - b).map(i => props.paradas[i]).filter(p => !!p),
)

interface Recorte {
  chave: string
  rotulo: string
  abertura: AberturaNoMaps<ParadaParaSalvar>
}

const recortes = computed<Recorte[]>(() => {
  if (modoDeAbertura.value === 'dia') {
    return aberturasPorDia(props.paradas, maxPontos.value).map(({ dia, ...abertura }) => ({
      chave: `dia-${dia ?? 'sem'}`,
      rotulo: rotuloDoDia(dia, props.dataInicio),
      abertura,
    }))
  }

  if (modoDeAbertura.value === 'selecao') {
    return [{
      chave: 'selecao',
      rotulo: selecionadasNaOrdem.value.length === 1
        ? '1 selecionada'
        : `${selecionadasNaOrdem.value.length} selecionadas`,
      abertura: aberturaNoMaps(selecionadasNaOrdem.value, maxPontos.value),
    }]
  }

  return [{
    chave: 'tudo',
    rotulo: 'Roteiro inteiro',
    abertura: aberturaNoMaps(props.paradas, maxPontos.value),
  }]
})

/** No modo "tudo" o recorte é óbvio — o rótulo só faria ruído. */
const mostrarRotulos = computed(() => modoDeAbertura.value !== 'tudo')

const nenhumLink = computed(() =>
  recortes.value.every(r => !r.abertura.trechos.length && !r.abertura.lugarUnico),
)

function rotuloDoBotao(abertura: AberturaNoMaps<ParadaParaSalvar>, i: number): string {
  return abertura.trechos.length === 1
    ? 'Abrir no Google Maps'
    : `Trecho ${i + 1} de ${abertura.trechos.length}`
}
</script>

<template>
  <section class="space-y-3">
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="mr-1 text-sm font-medium">Abrir no Google Maps</h2>

      <div class="flex gap-1 rounded-lg bg-muted p-0.5">
        <button
          v-for="opcao in [
            { valor: 'tudo' as const, rotulo: 'Tudo' },
            { valor: 'dia' as const, rotulo: 'Por dia' },
            { valor: 'selecao' as const, rotulo: 'Seleção' },
          ]"
          :key="opcao.valor"
          type="button"
          class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
          :class="modoDeAbertura === opcao.valor
            ? 'bg-background shadow-sm'
            : 'text-muted-foreground hover:text-foreground'"
          :disabled="opcao.valor === 'dia' && !temDias"
          :aria-pressed="modoDeAbertura === opcao.valor"
          @click="modoDeAbertura = opcao.valor"
        >
          {{ opcao.rotulo }}
        </button>
      </div>
    </div>

    <p v-if="modoDeAbertura === 'dia' && !temDias" class="text-xs text-muted-foreground">
      Nenhuma parada tem dia ainda — marque o dia de cada uma na lista abaixo.
    </p>

    <p v-else-if="modoDeAbertura === 'selecao' && !selecionadas.length" class="text-xs text-muted-foreground">
      Marque as paradas abaixo para montar um percurso avulso, sem mexer no roteiro.
    </p>

    <p v-else-if="nenhumLink" class="text-xs text-muted-foreground">
      Nada a abrir aqui: o Google Maps precisa de pelo menos um lugar que ele conheça.
    </p>

    <div v-else class="space-y-2">
      <div
        v-for="recorte in recortes"
        :key="recorte.chave"
        class="flex flex-wrap items-center gap-2"
      >
        <span
          v-if="mostrarRotulos"
          class="min-w-28 text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          {{ recorte.rotulo }}
        </span>

        <Button
          v-for="(trecho, i) in recorte.abertura.trechos"
          :key="i"
          as="a"
          :href="urlDoTrecho(trecho, modo) ?? undefined"
          target="_blank"
          rel="noopener"
          variant="outline"
          size="sm"
          class="gap-1.5"
        >
          <ExternalLinkIcon class="size-4" />
          {{ rotuloDoBotao(recorte.abertura, i) }}
        </Button>

        <!--
          Um recorte de uma parada só não tem rota, mas tem lugar. Esconder o dia
          faria a tela mentir sobre o roteiro; um botão de rota morto seria pior.
        -->
        <Button
          v-if="recorte.abertura.lugarUnico"
          as="a"
          :href="urlDoLugar(recorte.abertura.lugarUnico) ?? undefined"
          target="_blank"
          rel="noopener"
          variant="outline"
          size="sm"
          class="gap-1.5"
        >
          <MapPinIcon class="size-4" />
          {{ recorte.abertura.lugarUnico.nome }}
        </Button>

        <span
          v-if="!recorte.abertura.trechos.length && !recorte.abertura.lugarUnico"
          class="text-xs text-muted-foreground"
        >
          sem lugar do Maps
        </span>

        <span v-else-if="recorte.abertura.foraDaRota" class="text-xs text-muted-foreground">
          {{ recorte.abertura.foraDaRota }}
          {{ recorte.abertura.foraDaRota === 1 ? 'parada fora' : 'paradas fora' }} da rota
        </span>
      </div>
    </div>

    <p v-if="modoDeAbertura === 'tudo' && recortes[0]!.abertura.trechos.length > 1" class="text-xs text-muted-foreground">
      O Google Maps não abre um roteiro deste tamanho num link só, então ele vai em
      trechos — o fim de um é o começo do seguinte.
    </p>
  </section>
</template>
