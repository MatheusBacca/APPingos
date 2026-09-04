<script setup lang="ts">
/**
 * O mural em rodízio: as fotos que já podem ser postadas passando uma a uma.
 *
 * O que entra no rodízio (e por que só imagens) está em `fotosDaVitrine`. Aqui
 * ficam o tempo e o movimento — e três decisões de desenho:
 *
 * 1. **A moldura é fixa e as fotos passam DENTRO dela.** A moldura tem a
 *    proporção 16:9 e existe sempre; as fotos vivem `absolute inset-0` em cima.
 *    Antes a troca era `mode="out-in"`, e entre uma foto e outra o container
 *    ficava vazio — o cartão encolhia, empurrava o resto do painel para cima e
 *    remontava meio segundo depois, a cada cinco segundos.
 *
 * 2. **O tempo é a barra.** Quem manda a foto trocar é o fim da animação da
 *    barra (`animationend`), não um cronômetro paralelo. Com dois relógios, o
 *    que a barra mostra e o instante em que a foto troca divergem no primeiro
 *    hover — a barra pausa e o cronômetro segue. Com um só, "pausar" é uma linha
 *    de CSS (`animation-play-state`) e as duas coisas param juntas por
 *    construção.
 *
 * 3. **Três motivos para pausar**, e todos passam pela mesma classe: aba de
 *    fundo (o PWA no bolso não gasta bateria trocando foto), ponteiro em cima (o
 *    "pause" que a WCAG 2.2.2 pede para conteúdo que se move sozinho) e
 *    `prefers-reduced-motion`, que não pausa: nem começa. Quem pediu menos
 *    movimento fica com a primeira foto, parada, e a barra cheia.
 *
 * A moldura cresce com o cartão quando a pessoa fixou uma altura: aí a caixa é
 * firme e a foto ocupa o que sobrar. Com altura automática ela volta ao 16:9, que
 * é o tamanho "de fábrica" do mural no painel.
 *
 * As URLs são assinadas em lote pelo mesmo composable da galeria — o painel pede
 * as oito de uma vez, e não uma por troca de foto.
 */
import { ImageOffIcon } from '@lucide/vue'
import { useDocumentVisibility, usePreferredReducedMotion } from '@vueuse/core'
import { Skeleton } from '@/components/ui/skeleton'
import { ESPACO_DA_VITRINE, ESPACO_INDEFINIDO, fotosDaVitrine } from '@/lib/vitrine'
import { useFotos, useUrlsDasFotos } from '~/composables/useFotos'
import { useMembros } from '~/composables/useMembros'
import { useUsuarioId } from '~/composables/useUsuarioId'

/** Tempo de leitura de uma foto sem virar slideshow de tela de descanso. */
const INTERVALO_MS = 5000

const { data: fotos, isPending } = useFotos()
const { data: membros } = useMembros()
const euId = useUsuarioId()

const vitrine = computed(() =>
  fotosDaVitrine(fotos.value ?? [], euId.value, membros.value?.length ?? 0),
)

const lista = computed(() => vitrine.value?.fotos ?? [])
const { data: urls } = useUrlsDasFotos(lista)

const espaco = inject(ESPACO_DA_VITRINE, computed(() => ESPACO_INDEFINIDO))

/** Altura fixa no cartão = a moldura preenche; altura automática = 16:9. */
const preencher = computed(() => espaco.value.altura !== null)

const indice = ref(0)
const sobre = ref(false)
const visibilidade = useDocumentVisibility()
const movimento = usePreferredReducedMotion()

const atual = computed(() => lista.value[indice.value] ?? null)
const url = computed(() => (atual.value ? urls.value?.get(atual.value.caminho) ?? null : null))

/** Uma foto só não roda: a barra ficaria enchendo e esvaziando sem nada mudar. */
const rodando = computed(() =>
  lista.value.length > 1 && movimento.value !== 'reduce',
)

const pausado = computed(() =>
  sobre.value || visibilidade.value !== 'visible',
)

/*
 * Uma foto curtida sai da lista debaixo do rodízio. Sem voltar ao começo, o
 * índice fica além do fim e o card mostra o vazio de um array que encolheu.
 */
watch(() => lista.value.length, () => { indice.value = 0 })

function avancar() {
  if (!lista.value.length) return
  indice.value = (indice.value + 1) % lista.value.length
}
</script>

<template>
  <div class="mt-3 flex flex-col">
    <Skeleton v-if="isPending" class="aspect-video w-full rounded-lg" />

    <p v-else-if="!vitrine" class="text-sm text-muted-foreground">
      Nenhuma foto esperando por vocês.
    </p>

    <template v-else>
      <!--
        Nenhuma legenda aqui: o cartão já se apresenta no cabeçalho ("Nossas
        memórias"), e uma segunda linha logo abaixo diria a mesma coisa com
        outras palavras. O que a legenda carregava de informação — se a foto já
        pode ser postada ou se espera o seu coração — continua na frase de leitor
        de tela, embaixo.
      -->
      <div
        class="relative mt-2 w-full overflow-hidden rounded-lg border bg-muted"
        :class="preencher ? 'min-h-24 flex-1' : 'aspect-video'"
        @mouseenter="sobre = true"
        @mouseleave="sobre = false"
      >
        <Transition
          enter-active-class="transition-opacity duration-700"
          leave-active-class="transition-opacity duration-700"
          enter-from-class="opacity-0"
          leave-to-class="opacity-0"
        >
          <img
            v-if="url"
            :key="atual!.id"
            :src="url"
            :alt="atual!.legenda ?? 'Foto do espaço'"
            class="absolute inset-0 size-full object-cover"
          >
          <!-- Sem assinatura ainda, ou arquivo que sumiu do bucket. -->
          <div
            v-else
            key="sem-previa"
            class="absolute inset-0 grid size-full place-items-center text-muted-foreground"
          >
            <ImageOffIcon class="size-6" />
          </div>
        </Transition>
      </div>

      <!--
        A barra é o relógio do rodízio — ver a decisão 2 no cabeçalho. A `key`
        troca junto com a foto: é ela que reinicia a animação do zero.
      -->
      <div
        v-if="lista.length > 1"
        class="mt-2 h-1 overflow-hidden rounded-full bg-muted-foreground/20"
        @mouseenter="sobre = true"
        @mouseleave="sobre = false"
      >
        <div
          v-if="rodando"
          :key="atual?.id"
          class="barra h-full rounded-full bg-primary"
          :class="pausado ? 'pausada' : ''"
          :style="{ animationDuration: `${INTERVALO_MS}ms` }"
          aria-hidden="true"
          @animationend="avancar"
        />
        <!-- Sem rodízio (movimento reduzido), a barra fica cheia e quieta. -->
        <div v-else class="h-full rounded-full bg-primary" aria-hidden="true" />
      </div>

      <p class="sr-only">
        Foto {{ indice + 1 }} de {{ lista.length }} — {{ vitrine.legenda.toLowerCase() }}
      </p>
    </template>
  </div>
</template>

<style scoped>
/*
 * `width` e não `transform: scaleX`: a barra tem cantos arredondados, e escalar
 * esticaria o raio junto — a ponta viraria um bico achatado que cresce.
 */
@keyframes crescer {
  from { width: 0%; }
  to { width: 100%; }
}

.barra {
  animation-name: crescer;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}

.pausada {
  animation-play-state: paused;
}
</style>
