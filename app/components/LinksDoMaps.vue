<script setup lang="ts">
import { ExternalLinkIcon, MapPinIcon, XIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { ModoTransporte, ParadaParaSalvar } from '~/types/viagem'
import { aberturaNoMaps, urlDoLugar, urlDoTrecho } from '~/types/viagem'
import { usePontosPorLink } from '~/composables/usePontosPorLink'

/**
 * Levar o roteiro para o Google Maps: inteiro, ou só o que estiver marcado.
 *
 * O recorte por dia morava aqui e foi para o cabeçalho de cada dia na lista —
 * um ícone ao lado do "Dia 2" acerta o alvo melhor que um botão no outro canto
 * da tela, que obriga a pessoa a traduzir um "Dia 2" no outro.
 *
 * Os dois recortes que sobraram são o mesmo cálculo (`aberturaNoMaps`) sobre
 * listas diferentes — o mesmo que os atalhos do dia usam. O limite de waypoints
 * do celular vive em `usePontosPorLink`, e em nenhum outro lugar.
 */
const props = defineProps<{
  paradas: ParadaParaSalvar[]
  modo: ModoTransporte
  /** Índices marcados na lista, quando o modo é seleção. */
  selecionadas: number[]
}>()

const modoDeAbertura = defineModel<'tudo' | 'selecao'>('aberturaEm', { required: true })

const pontosPorLink = usePontosPorLink()
const selecionando = computed(() => modoDeAbertura.value === 'selecao')

/*
 * Segurar no toque e passar o mouse são gestos que ninguém descobre sozinho.
 * A dica aparece só quando há roteiro o bastante para a seleção fazer diferença
 * — em duas paradas, selecionar é o mesmo que abrir tudo.
 */
const MINIMO_PARA_DICA = 3
const mostrarDica = computed(() =>
  !selecionando.value && props.paradas.filter(p => p.google_place_id).length >= MINIMO_PARA_DICA,
)

const selecionadasNaOrdem = computed(() =>
  [...props.selecionadas].sort((a, b) => a - b).map(i => props.paradas[i]).filter(p => !!p),
)

const abertura = computed(() => aberturaNoMaps(
  selecionando.value ? selecionadasNaOrdem.value : props.paradas,
  pontosPorLink.value,
))

const nenhumLink = computed(() => !abertura.value.trechos.length && !abertura.value.lugarUnico)
</script>

<template>
  <section class="space-y-3">
    <!--
      Na seleção a barra inteira passa a ser sobre ela: o recorte é temporário e
      tem saída própria. Deixar o título normal ao lado faria parecer que as duas
      coisas convivem, quando a seleção substitui a leitura do roteiro inteiro.
    -->
    <div v-if="selecionando" class="flex flex-wrap items-center gap-2">
      <h2 class="mr-1 text-sm font-medium">
        {{ selecionadasNaOrdem.length }}
        {{ selecionadasNaOrdem.length === 1 ? 'parada selecionada' : 'paradas selecionadas' }}
      </h2>

      <button
        type="button"
        class="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        @click="modoDeAbertura = 'tudo'"
      >
        <XIcon class="size-3.5" />
        Sair da seleção
      </button>
    </div>

    <h2 v-else class="text-sm font-medium">Abrir no Google Maps</h2>

    <p v-if="selecionando && !selecionadas.length" class="text-xs text-muted-foreground">
      Marque as paradas abaixo para montar um percurso avulso, sem mexer no roteiro.
    </p>

    <p v-else-if="nenhumLink" class="text-xs text-muted-foreground">
      Nada a abrir aqui: o Google Maps precisa de pelo menos um lugar que ele conheça.
    </p>

    <div v-else class="flex flex-wrap items-center gap-2">
      <Button
        v-for="(trecho, i) in abertura.trechos"
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
        {{ abertura.trechos.length === 1
          ? 'Abrir no Google Maps'
          : `Trecho ${i + 1} de ${abertura.trechos.length}` }}
      </Button>

      <!--
        Um recorte de uma parada só não tem rota, mas tem lugar. Um botão de rota
        morto seria pior que não ter botão.
      -->
      <Button
        v-if="abertura.lugarUnico"
        as="a"
        :href="urlDoLugar(abertura.lugarUnico) ?? undefined"
        target="_blank"
        rel="noopener"
        variant="outline"
        size="sm"
        class="gap-1.5"
      >
        <MapPinIcon class="size-4" />
        {{ abertura.lugarUnico.nome }}
      </Button>

      <span v-if="abertura.foraDaRota" class="text-xs text-muted-foreground">
        {{ abertura.foraDaRota }}
        {{ abertura.foraDaRota === 1 ? 'parada fora' : 'paradas fora' }} da rota
      </span>
    </div>

    <p v-if="!selecionando && abertura.trechos.length > 1" class="text-xs text-muted-foreground">
      O Google Maps não abre um roteiro deste tamanho num link só, então ele vai em
      trechos — o fim de um é o começo do seguinte.
    </p>

    <p v-if="mostrarDica" class="text-xs text-muted-foreground">
      Para abrir só algumas paradas, segure uma delas na lista — ou passe o mouse e
      marque a caixinha.
    </p>
  </section>
</template>
