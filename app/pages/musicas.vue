<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { refDebounced } from '@vueuse/core'
import { MusicIcon, PlusIcon, RefreshCwIcon, SearchIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { mensagemDeErro } from '@/lib/utils'
import { FORMATO_ROTULO, creditos } from '@/lib/musica'
import { avaliacaoDe } from '@/lib/recortes'
import type { ResultadoBuscaMusica } from '~~/server/utils/spotify'
import type { ItemDoEspaco, ItemParaAdicionar, StatusItem } from '~/types/catalogo'
import { STATUS_ROTULO_MUSICA } from '~/types/catalogo'
import { useItens, useAdicionarItem, useAvaliar, useRemoverItem } from '~/composables/useCatalogo'
import { useMembros } from '~/composables/useMembros'
import { useAtualizarMusicas } from '~/composables/useSpotify'
import { useUsuarioId } from '~/composables/useUsuarioId'

useHead({ title: 'Músicas · APPingos' })

const euId = useUsuarioId()
const { data: itens, isPending } = useItens(['musica'])
const { data: membros } = useMembros()
const avaliar = useAvaliar()
const remover = useRemoverItem()

// ---- Busca ------------------------------------------------------------------

const termo = ref('')
const termoDebounced = refDebounced(termo, 350)
const adicionar = useAdicionarItem()
const idsAdicionando = ref(new Set<string>())

const busca = useQuery({
  queryKey: computed(() => ['spotify', 'busca', termoDebounced.value]),
  enabled: computed(() => termoDebounced.value.trim().length >= 2),
  queryFn: () => $fetch<ResultadoBuscaMusica[]>('/api/spotify/busca', {
    query: { q: termoDebounced.value.trim() },
  }),
})

const buscando = computed(() => termoDebounced.value.trim().length >= 2)

/*
 * `fonte:fonte_id`, e não título + ano como em Filmes: um álbum e a faixa que
 * dá nome a ele têm título e ano idênticos, e um marcaria o outro como "já está
 * na lista". O id do Spotify separa os dois sem ambiguidade.
 */
const jaNoEspaco = computed(() =>
  new Set((itens.value ?? []).map(i => `${i.media.fonte}:${i.media.fonte_id}`)),
)

async function onAdicionar(resultado: ResultadoBuscaMusica) {
  idsAdicionando.value = new Set(idsAdicionando.value).add(resultado.fonte_id)
  try {
    const item: ItemParaAdicionar = {
      tipo: resultado.tipo,
      fonte: resultado.fonte,
      fonte_id: resultado.fonte_id,
      titulo: resultado.titulo,
      ano: resultado.ano,
      capa_url: resultado.capa_url,
      metadados: {
        formato: resultado.formato,
        artistas: resultado.artistas,
        album: resultado.album,
        duracao_ms: resultado.duracao_ms,
        url_spotify: resultado.url_spotify,
      },
    }
    await adicionar.mutateAsync(item)
    toast.success(`"${resultado.titulo}" na lista.`)
    termo.value = ''
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para adicionar.'))
  }
  finally {
    const copia = new Set(idsAdicionando.value)
    copia.delete(resultado.fonte_id)
    idsAdicionando.value = copia
  }
}

// ---- A lista do espaço ------------------------------------------------------

const GRUPOS: StatusItem[] = ['quero', 'vendo', 'visto', 'abandonei']

const VAZIO: Record<StatusItem, string> = {
  quero: 'Nada na fila.',
  vendo: 'Nada em repeat agora.',
  visto: 'Nada ouvido ainda.',
  abandonei: 'Nada descartado — por enquanto.',
}

/**
 * Agrupado pelo MEU status, não pelo do espaço.
 *
 * Em Filmes um item aparece em todo recorte em que qualquer pessoa o colocou,
 * porque lá o que importa é a agenda comum ("vamos ver sábado"). Aqui não há
 * data nem programa conjunto: a pergunta é "o que EU faço com isto", e a
 * opinião do outro aparece dentro do cartão, junto da minha.
 */
const porStatus = computed<Record<StatusItem, ItemDoEspaco[]>>(() => {
  const grupos = { quero: [], vendo: [], visto: [], abandonei: [] } as Record<StatusItem, ItemDoEspaco[]>
  for (const item of itens.value ?? []) {
    const minha = avaliacaoDe(item, euId.value)
    if (minha) grupos[minha.status].push(item)
  }
  return grupos
})

/**
 * O que entrou pela mão do outro e ainda não passou pela sua.
 *
 * Sem este grupo o item simplesmente não apareceria em lugar nenhum da sua
 * tela — `adicionar_item` só marca "quero" para quem adicionou.
 */
const esperandoVoce = computed(() =>
  (itens.value ?? []).filter(item => !avaliacaoDe(item, euId.value)),
)

const listaVazia = computed(() => !isPending.value && !(itens.value ?? []).length)

// ---- Recarregar do Spotify --------------------------------------------------

const atualizarMusicas = useAtualizarMusicas()

async function onRecarregar() {
  try {
    const total = await atualizarMusicas.mutateAsync(itens.value ?? [])
    toast.success(total
      ? `${total} item(ns) recarregado(s) do Spotify.`
      : 'Nada veio do Spotify para recarregar.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para recarregar.'))
  }
}

// ---- Avaliar ----------------------------------------------------------------

const salvando = ref(new Set<string>())

async function comBloqueio(entryId: string, acao: () => Promise<void>, erro: string) {
  if (salvando.value.has(entryId)) return
  salvando.value = new Set(salvando.value).add(entryId)
  try {
    await acao()
  }
  catch (e) {
    toast.error(mensagemDeErro(e, erro))
  }
  finally {
    const copia = new Set(salvando.value)
    copia.delete(entryId)
    salvando.value = copia
  }
}

function onStatus(item: ItemDoEspaco, status: StatusItem) {
  return comBloqueio(
    item.id,
    async () => {
      await avaliar.mutateAsync({ entryId: item.id, status })
      toast.success(`"${item.media.titulo}": ${STATUS_ROTULO_MUSICA[status].toLowerCase()}.`)
    },
    'Não deu para mudar o status.',
  )
}

function onNota(item: ItemDoEspaco, nota: number | null) {
  return comBloqueio(
    item.id,
    async () => {
      // Dar nota é dizer que ouviu — deixar em "quero ouvir" com 8 estrelas
      // seria a tela guardando dois fatos que se contradizem.
      const minha = avaliacaoDe(item, euId.value)
      const status: StatusItem | undefined
        = nota != null && (!minha || minha.status === 'quero') ? 'visto' : undefined

      await avaliar.mutateAsync({ entryId: item.id, nota, ...(status ? { status } : {}) })
    },
    'Não deu para salvar a nota.',
  )
}

function onRemover(item: ItemDoEspaco) {
  return comBloqueio(
    item.id,
    async () => {
      await remover.mutateAsync(item.id)
      toast.success(`"${item.media.titulo}" saiu da lista.`)
    },
    'Não deu para remover.',
  )
}
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Músicas</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Álbuns e faixas que valem repetir — com a nota de cada um.
        </p>
      </div>

      <Button
        v-if="!listaVazia"
        variant="outline"
        size="sm"
        class="gap-1.5"
        :disabled="atualizarMusicas.isPending.value"
        @click="onRecarregar"
      >
        <RefreshCwIcon class="size-3.5" :class="atualizarMusicas.isPending.value ? 'animate-spin' : ''" />
        {{ atualizarMusicas.isPending.value ? 'Recarregando…' : 'Recarregar' }}
      </Button>
    </header>

    <!-- Busca -->
    <section class="space-y-4">
      <div class="relative">
        <SearchIcon class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          v-model="termo"
          placeholder="Buscar faixa ou álbum…"
          class="pl-9"
          autocomplete="off"
        />
      </div>

      <template v-if="buscando">
        <div v-if="busca.isPending.value" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          <Skeleton v-for="i in 6" :key="i" class="aspect-square w-full rounded-lg" />
        </div>

        <p v-else-if="busca.isError.value" class="text-sm text-destructive">
          {{ mensagemDeErro(busca.error.value, 'Falha na busca.') }}
        </p>

        <p v-else-if="!busca.data.value?.length" class="text-sm text-muted-foreground">
          Nada encontrado para "{{ termoDebounced }}".
        </p>

        <!--
          Menos colunas que em Filmes de propósito: capa de disco é quadrada, e
          num card estreito o botão de adicionar fica mais alto que a própria
          capa. Cartaz 2:3 aguenta seis colunas; capa 1:1, não.
        -->
        <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          <PosterCard
            v-for="resultado in busca.data.value"
            :key="`${resultado.formato}:${resultado.fonte_id}`"
            proporcao="quadrada"
            :titulo="resultado.titulo"
            :ano="resultado.ano"
            :capa-url="resultado.capa_url"
            :legenda="`${FORMATO_ROTULO[resultado.formato]} · ${creditos(resultado.artistas)}`"
          >
            <template #overlay>
              <button
                v-if="!jaNoEspaco.has(`${resultado.fonte}:${resultado.fonte_id}`)"
                type="button"
                class="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1 rounded-md bg-primary py-1.5 text-xs font-medium text-primary-foreground shadow-sm disabled:opacity-60"
                :disabled="idsAdicionando.has(resultado.fonte_id)"
                @click="onAdicionar(resultado)"
              >
                <PlusIcon class="size-3.5" />
                {{ idsAdicionando.has(resultado.fonte_id) ? 'Adicionando…' : 'Quero ouvir' }}
              </button>
              <span
                v-else
                class="absolute inset-x-2 bottom-2 rounded-md bg-background/90 py-1.5 text-center text-xs font-medium"
              >
                Já está na lista
              </span>
            </template>
          </PosterCard>
        </div>
      </template>
    </section>

    <!--
      A ordem do módulo: "Nossas músicas" (as playlists favoritadas), depois as
      playlists de cada um, e por fim as músicas soltas. É a ordem de quem chega
      querendo ouvir algo — o destaque primeiro, a faixa avulsa por último.
    -->
    <section v-if="!buscando" class="space-y-8">
      <PlaylistsDoEspaco :membros="membros ?? []" />

      <section class="space-y-5">
        <h2 class="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <MusicIcon class="size-5 text-muted-foreground" />
          Músicas soltas
        </h2>

        <div v-if="isPending" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          <Skeleton v-for="i in 4" :key="i" class="aspect-square w-full rounded-lg" />
        </div>

        <p v-else-if="listaVazia" class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Ainda não há nada aqui — busque uma faixa ou um álbum acima para começar.
        </p>

        <template v-else>
          <section v-if="esperandoVoce.length" class="space-y-2">
            <h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Esperando você
              <span class="rounded-full bg-muted px-1.5 text-[10px]">{{ esperandoVoce.length }}</span>
            </h4>
            <p class="text-xs text-muted-foreground">
              Entrou pela mão de quem divide o espaço e ainda não passou pela sua.
            </p>
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              <MusicaCard
                v-for="item in esperandoVoce"
                :key="item.id"
                :item="item"
                :membros="membros ?? []"
                :eu-id="euId"
                :salvando="salvando.has(item.id)"
                @status="onStatus(item, $event)"
                @nota="onNota(item, $event)"
                @remover="onRemover(item)"
              />
            </div>
          </section>

          <section v-for="status in GRUPOS" :key="status" class="space-y-2">
            <h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {{ STATUS_ROTULO_MUSICA[status] }}
              <span class="rounded-full bg-muted px-1.5 text-[10px]">{{ porStatus[status].length }}</span>
            </h4>

            <div v-if="porStatus[status].length" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              <MusicaCard
                v-for="item in porStatus[status]"
                :key="item.id"
                :item="item"
                :membros="membros ?? []"
                :eu-id="euId"
                :salvando="salvando.has(item.id)"
                @status="onStatus(item, $event)"
                @nota="onNota(item, $event)"
                @remover="onRemover(item)"
              />
            </div>
            <p v-else class="text-sm text-muted-foreground">{{ VAZIO[status] }}</p>
          </section>
        </template>
      </section>
    </section>
  </div>
</template>
