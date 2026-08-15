<script setup lang="ts">
/**
 * As playlists de cada pessoa do espaço, lado a lado.
 *
 * V1 é LEITURA: mostra o que já existe no Spotify de cada um e não escreve nada
 * lá. É o que mantém os escopos pequenos (só `playlist-read-*`) e o que evita
 * resolução de conflito — ver "fora de escopo" no plano.
 */
import { ExternalLinkIcon, ListMusicIcon, MusicIcon, RefreshCwIcon, UsersIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { formatarDia } from '@/lib/datas'
import { mensagemDeErro } from '@/lib/utils'
import type { Membro } from '~/composables/useMembros'
import type { PlaylistSpotify } from '~/composables/useSpotify'
import {
  useFaixasDaPlaylist,
  useIntegracaoSpotify,
  usePlaylistsSpotify,
  useSincronizarFaixas,
  useSincronizarPlaylists,
} from '~/composables/useSpotify'
import { useUsuarioId } from '~/composables/useUsuarioId'

const props = defineProps<{ membros: Membro[] }>()

const euId = useUsuarioId()
const { data: integracao } = useIntegracaoSpotify()
const { data: playlists, isPending } = usePlaylistsSpotify()
const sincronizar = useSincronizarPlaylists()
const sincronizarFaixas = useSincronizarFaixas()

/**
 * Uma faixa por pessoa DO ESPAÇO ATIVO.
 *
 * A RLS libera quem divide qualquer espaço com você, que é mais gente do que
 * esta tela quer mostrar. Partir dos membros (e não das playlists) também dá o
 * estado vazio de graça: quem não conectou aparece com a linha explicando.
 */
const porPessoa = computed(() =>
  props.membros.map(membro => ({
    membro,
    souEu: membro.user_id === euId.value,
    lista: (playlists.value ?? []).filter(p => p.user_id === membro.user_id),
  })),
)

const aberta = ref<string | null>(null)
const { data: faixas, isPending: faixasCarregando } = useFaixasDaPlaylist(aberta)

async function alternar(playlist: PlaylistSpotify) {
  if (aberta.value === playlist.id) {
    aberta.value = null
    return
  }

  aberta.value = playlist.id

  // As faixas são buscadas do Spotify na primeira abertura — depois disso o
  // snapshot serve, e atualizar é escolha de quem está olhando.
  if (!playlist.faixas_sincronizadas_em && playlist.user_id === euId.value) {
    await puxarFaixas(playlist)
  }
}

async function puxarFaixas(playlist: PlaylistSpotify) {
  try {
    await sincronizarFaixas.mutateAsync(playlist.id)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para carregar as faixas.'))
  }
}

async function onSincronizar() {
  try {
    const { total } = await sincronizar.mutateAsync()
    toast.success(total ? `${total} playlist(s) atualizada(s).` : 'Nenhuma playlist encontrada.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para atualizar as playlists.'))
  }
}

function duracao(ms: number | null): string {
  if (!ms) return ''
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="flex items-center gap-2 text-sm font-medium">
        <ListMusicIcon class="size-4 text-muted-foreground" />
        Playlists do espaço
      </h2>

      <Button
        v-if="integracao"
        variant="outline"
        size="sm"
        class="gap-1.5"
        :disabled="sincronizar.isPending.value"
        @click="onSincronizar"
      >
        <RefreshCwIcon class="size-3.5" :class="sincronizar.isPending.value ? 'animate-spin' : ''" />
        {{ sincronizar.isPending.value ? 'Atualizando…' : 'Atualizar as minhas' }}
      </Button>
    </div>

    <div v-if="isPending" class="space-y-3">
      <div v-for="i in 2" :key="i" class="h-20 animate-pulse rounded-lg bg-muted" />
    </div>

    <div v-else class="space-y-5">
      <div v-for="grupo in porPessoa" :key="grupo.membro.user_id" class="space-y-2">
        <h3 class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <UsersIcon class="size-3.5" />
          {{ grupo.souEu ? 'Suas playlists' : `Playlists de ${grupo.membro.exibicao}` }}
          <span v-if="grupo.lista.length" class="rounded-full bg-muted px-1.5 text-[10px]">
            {{ grupo.lista.length }}
          </span>
        </h3>

        <!-- Vazio: a frase muda conforme dá para agir ou só esperar. -->
        <p v-if="!grupo.lista.length" class="text-sm text-muted-foreground">
          <template v-if="grupo.souEu && !integracao">
            Conecte a sua conta em
            <NuxtLink to="/espacos" class="text-primary hover:underline">Espaços</NuxtLink>
            para as suas playlists aparecerem aqui.
          </template>
          <template v-else-if="grupo.souEu">
            Nenhuma playlist ainda — clique em "Atualizar as minhas".
          </template>
          <template v-else>
            {{ grupo.membro.exibicao }} ainda não conectou o Spotify.
          </template>
        </p>

        <ul v-else class="space-y-2">
          <li v-for="playlist in grupo.lista" :key="playlist.id" class="rounded-lg border bg-card">
            <button
              type="button"
              class="flex w-full items-center gap-3 p-3 text-left"
              :aria-expanded="aberta === playlist.id"
              @click="alternar(playlist)"
            >
              <span class="size-12 shrink-0 overflow-hidden rounded-md border bg-muted">
                <img
                  v-if="playlist.capa_url"
                  :src="playlist.capa_url"
                  :alt="`Capa de ${playlist.nome}`"
                  loading="lazy"
                  class="size-full object-cover"
                >
                <span v-else class="grid size-full place-items-center text-muted-foreground">
                  <MusicIcon class="size-4" />
                </span>
              </span>

              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ playlist.nome }}</span>
                <span class="block truncate text-xs text-muted-foreground">
                  {{ playlist.total_faixas }} faixa(s)
                  <template v-if="playlist.colaborativa"> · colaborativa</template>
                  · atualizada em {{ formatarDia(playlist.sincronizado_em.slice(0, 10)) }}
                </span>
              </span>

              <a
                v-if="playlist.url_spotify"
                :href="playlist.url_spotify"
                target="_blank"
                rel="noopener noreferrer"
                class="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                :aria-label="`Abrir ${playlist.nome} no Spotify`"
                @click.stop
              >
                <ExternalLinkIcon class="size-4" />
              </a>
            </button>

            <div v-if="aberta === playlist.id" class="border-t px-3 py-2">
              <p v-if="faixasCarregando || sincronizarFaixas.isPending.value" class="py-2 text-sm text-muted-foreground">
                Carregando as faixas…
              </p>

              <template v-else-if="faixas?.length">
                <ol class="divide-y">
                  <li
                    v-for="faixa in faixas"
                    :key="faixa.posicao"
                    class="flex items-baseline gap-3 py-1.5 text-sm"
                  >
                    <span class="w-6 shrink-0 text-right text-xs text-muted-foreground">
                      {{ faixa.posicao + 1 }}
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate">{{ faixa.titulo }}</span>
                      <span class="block truncate text-xs text-muted-foreground">{{ faixa.artistas }}</span>
                    </span>
                    <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {{ duracao(faixa.duracao_ms) }}
                    </span>
                  </li>
                </ol>

                <Button
                  v-if="grupo.souEu"
                  variant="ghost"
                  size="sm"
                  class="mt-2 gap-1.5"
                  :disabled="sincronizarFaixas.isPending.value"
                  @click="puxarFaixas(playlist)"
                >
                  <RefreshCwIcon class="size-3.5" />
                  Atualizar as faixas
                </Button>
              </template>

              <!--
                As duas ausências são diferentes e a frase precisa distinguir:
                "nunca buscamos" pede uma ação, "buscamos e não veio nada" é o
                fato de a playlist estar vazia.
              -->
              <p v-else-if="!playlist.faixas_sincronizadas_em" class="py-2 text-sm text-muted-foreground">
                <template v-if="grupo.souEu">
                  As faixas ainda não foram buscadas.
                </template>
                <template v-else>
                  {{ grupo.membro.exibicao }} ainda não abriu esta playlist aqui — as faixas só
                  são buscadas por quem é dono dela.
                </template>
              </p>
              <p v-else class="py-2 text-sm text-muted-foreground">Esta playlist está vazia.</p>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
