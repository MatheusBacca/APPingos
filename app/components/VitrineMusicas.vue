<script setup lang="ts">
/**
 * A última faixa que alguém do espaço ouviu — e, sem ninguém transmitindo, a
 * última que entrou na lista.
 *
 * A escolha está em `musicaDaVitrine`; aqui ficam o desenho e o relógio.
 *
 * O botão verde é um link de verdade para o Spotify, e por isso é o único
 * pedaço da vitrine que sobe acima do link do cartão (`relative z-10`): sem
 * isso, o clique cairia no cartão e abriria o módulo em vez da faixa. É também
 * por ele que o cartão do painel não pode ser um `<a>` por fora — link dentro
 * de link é HTML inválido, e o navegador desmonta a árvore para consertar.
 */
import { MusicIcon, PlayIcon } from '@lucide/vue'
import { useIntervalFn } from '@vueuse/core'
import { Skeleton } from '@/components/ui/skeleton'
import { LIMITE_ESCUTA_MS, artistasDe, creditos } from '@/lib/musica'
import { ESPACO_DA_VITRINE, ESPACO_INDEFINIDO, musicaDaVitrine } from '@/lib/vitrine'
import { useItens } from '~/composables/useCatalogo'
import { useMembros } from '~/composables/useMembros'
import { useEscutaDoEspaco, useEscutaViva } from '~/composables/useSpotify'
import { useUsuarioId } from '~/composables/useUsuarioId'

const { data: escutas, isPending: buscandoEscuta } = useEscutaDoEspaco()
const { data: itens } = useItens(['musica'])
const { data: membros } = useMembros()
const euId = useUsuarioId()

/*
 * O painel também pergunta. No celular não existe sidebar — sem esta linha, a
 * única superfície que mantém a escuta fresca não existiria justamente onde o
 * app é mais usado. A fila dentro de `useEscutaViva` garante que ter as duas na
 * tela (desktop) não dobra as chamadas ao Spotify.
 */
useEscutaViva()

/*
 * O relógio precisa andar para "há 3 horas" envelhecer e para o "agora" vencer
 * sozinho; sem isto os dois só mudariam no próximo dado que chegasse.
 */
const agora = ref(Date.now())
useIntervalFn(() => { agora.value = Date.now() }, 30_000)

const musica = computed(() =>
  musicaDaVitrine(
    escutas.value ?? [],
    membros.value ?? [],
    itens.value ?? [],
    euId.value,
    agora.value,
    LIMITE_ESCUTA_MS,
  ),
)

/** De onde veio a faixa, em uma linha — é o que dá sentido ao card. */
const legenda = computed(() => {
  const m = musica.value
  if (!m) return ''
  if (m.aoVivo) return `${m.quem} está ouvindo agora`
  if (m.origem === 'escuta') return [`Última de ${m.quem}`, m.quando].filter(Boolean).join(' · ')
  return 'A última que entrou na lista'
})

/** Artista e álbum, sem o "·" pendurado quando um dos dois não veio. */
const linhaDeCreditos = computed(() =>
  [musica.value?.artistas, musica.value?.album].filter(Boolean).join(' · '),
)

const espaco = inject(ESPACO_DA_VITRINE, computed(() => ESPACO_INDEFINIDO))

/**
 * O que mais está na lista — só quando o cartão foi esticado e sobrou espaço.
 *
 * A faixa em destaque responde "o que tocou por último"; um cartão alto pede
 * mais do que isso, e o que o módulo tem de mais próximo é o que entrou depois.
 * Quatro é o teto pelo mesmo motivo das outras vitrines: o cartão do painel não
 * vira a tela de Músicas.
 *
 * O destaque sai da lista quando ele mesmo veio do catálogo — senão a primeira
 * linha seria a repetição do que está logo acima dela.
 */
const DESTAQUE_PX = 132
const LINHA_PX = 52

const extras = computed(() => {
  const altura = espaco.value.altura
  if (altura === null) return []

  const quantos = Math.min(Math.max(Math.floor((altura - DESTAQUE_PX) / LINHA_PX), 0), 4)
  if (!quantos) return []

  return (itens.value ?? [])
    .filter(item => item.id !== musica.value?.id)
    .slice(0, quantos)
})

function creditosDo(item: (typeof extras.value)[number]): string {
  return creditos(artistasDe(item.media.metadados))
}
</script>

<template>
  <div class="mt-3 flex flex-col">
    <Skeleton v-if="buscandoEscuta" class="h-20 w-full rounded-lg" />

    <p v-else-if="!musica" class="text-sm text-muted-foreground">
      Nada tocando, e nenhuma música na lista ainda.
    </p>

    <template v-else>
      <!--
        Sem a linha de legenda que ficava aqui ("Ana está ouvindo agora", "A
        última que entrou na lista"): o cartão passou a ser só a faixa, e o
        convite fixo "Bora ouvir" mora no canto do cabeçalho (ver o `cabecalho`
        de Músicas em `app/modules.ts`). Aquela linha explicava a PROCEDÊNCIA do
        dado — bastidor, num cartão cujo assunto é a música.

        O que ela carregava de essencial — "isto está tocando AGORA" — sobrevive
        no ponto verde pulsando ao lado do título. A frase que dizia isso em
        palavras continua existindo em `sr-only`: cor e movimento não chegam a
        quem usa leitor de tela, e essa parte não é decoração.
      -->
      <div class="flex items-center gap-3">
        <span class="size-20 shrink-0 overflow-hidden rounded-lg border bg-muted">
          <img
            v-if="musica.capaUrl"
            :src="musica.capaUrl"
            :alt="`Capa de ${musica.titulo}`"
            loading="lazy"
            class="size-full object-cover"
          >
          <span v-else class="grid size-full place-items-center text-muted-foreground">
            <MusicIcon class="size-6" />
          </span>
        </span>

        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-1.5 font-medium leading-snug">
            <span
              v-if="musica.aoVivo"
              aria-hidden="true"
              class="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500"
            />
            <span class="truncate">{{ musica.titulo }}</span>
            <span class="sr-only">{{ legenda }}</span>
          </p>
          <p v-if="linhaDeCreditos" class="truncate text-sm text-muted-foreground">
            {{ linhaDeCreditos }}
          </p>
        </div>

        <a
          v-if="musica.url"
          :href="musica.url"
          target="_blank"
          rel="noopener noreferrer"
          class="relative z-10 grid size-10 shrink-0 place-items-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-500"
          :aria-label="`Abrir ${musica.titulo} no Spotify`"
          @click.stop
        >
          <PlayIcon class="size-4 fill-current" />
        </a>
      </div>

      <!-- Só aparece quando o cartão foi esticado — ver `extras`. -->
      <ul v-if="extras.length" class="mt-3 space-y-2 border-t pt-2">
        <li v-for="item in extras" :key="item.id" class="flex items-center gap-2">
          <span class="size-9 shrink-0 overflow-hidden rounded border bg-muted">
            <img
              v-if="item.media.capa_url"
              :src="item.media.capa_url"
              :alt="`Capa de ${item.media.titulo}`"
              loading="lazy"
              class="size-full object-cover"
            >
            <span v-else class="grid size-full place-items-center text-muted-foreground">
              <MusicIcon class="size-3.5" />
            </span>
          </span>

          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm">{{ item.media.titulo }}</span>
            <span class="block truncate text-xs text-muted-foreground">
              {{ creditosDo(item) }}
            </span>
          </span>
        </li>
      </ul>
    </template>
  </div>
</template>
