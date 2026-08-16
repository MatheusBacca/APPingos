<script setup lang="ts">
/**
 * As playlists de cada pessoa do espaço, lado a lado.
 *
 * V1 é LEITURA: mostra o que já existe no Spotify de cada um e não escreve nada
 * lá. E é uma ESCOLHA, não um espelho — "Listar as minhas" abre o que a conta
 * tem, e só o que for marcado entra no espaço. Uma conta comum passa de cem
 * playlists, quase todas seguidas e não criadas pela pessoa; despejar tudo
 * encheria a tela do par com o que ninguém pediu.
 */
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  ListMusicIcon,
  MusicIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
  UsersIcon,
} from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatarDia } from '@/lib/datas'
import { mensagemDeErro } from '@/lib/utils'
import type { Membro } from '~/composables/useMembros'
import type { PlaylistDoSpotify, PlaylistSpotify } from '~/composables/useSpotify'
import {
  useAtualizarPlaylists,
  useFaixasDaPlaylist,
  useIntegracaoSpotify,
  useListarPlaylistsDoSpotify,
  usePlaylistsSpotify,
  useRemoverPlaylist,
  useSalvarPlaylists,
  useSincronizarFaixas,
} from '~/composables/useSpotify'
import { useUsuarioId } from '~/composables/useUsuarioId'

const props = defineProps<{ membros: Membro[] }>()

const euId = useUsuarioId()
const { data: integracao } = useIntegracaoSpotify()
const { data: playlists, isPending } = usePlaylistsSpotify()

const listar = useListarPlaylistsDoSpotify()
const salvar = useSalvarPlaylists()
const atualizar = useAtualizarPlaylists()
const remover = useRemoverPlaylist()
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

// ---- Escolher o que entra no espaço -----------------------------------------

const escolhendo = ref(false)
const disponiveis = ref<PlaylistDoSpotify[]>([])
const marcadas = ref(new Set<string>())
const filtro = ref('')

/** Já salvas: entram marcadas e o texto do botão não promete novidade. */
const jaSalvas = computed(() =>
  new Set((playlists.value ?? [])
    .filter(p => p.user_id === euId.value)
    .map(p => p.spotify_id)),
)

const visiveis = computed(() => {
  const termo = filtro.value.trim().toLowerCase()
  if (!termo) return disponiveis.value

  return disponiveis.value.filter(p =>
    p.nome.toLowerCase().includes(termo) || (p.dono ?? '').toLowerCase().includes(termo),
  )
})

async function abrirEscolha() {
  try {
    const { playlists: doSpotify } = await listar.mutateAsync()
    disponiveis.value = doSpotify
    marcadas.value = new Set(jaSalvas.value)
    filtro.value = ''
    escolhendo.value = true
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para listar as suas playlists.'))
  }
}

function alternarMarca(id: string) {
  const copia = new Set(marcadas.value)
  if (copia.has(id)) copia.delete(id)
  else copia.add(id)
  marcadas.value = copia
}

/** Marca/desmarca tudo que o filtro está mostrando, não a lista inteira. */
function marcarVisiveis(marcar: boolean) {
  const copia = new Set(marcadas.value)
  for (const p of visiveis.value) {
    if (marcar) copia.add(p.spotify_id)
    else copia.delete(p.spotify_id)
  }
  marcadas.value = copia
}

async function onSalvar() {
  try {
    const { total } = await salvar.mutateAsync([...marcadas.value])
    escolhendo.value = false
    toast.success(total
      ? (total === 1 ? '1 playlist no espaço.' : `${total} playlists no espaço.`)
      : 'Nenhuma playlist no espaço agora.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para salvar.'))
  }
}

// ---- Recarregar o que já está salvo -----------------------------------------

async function onAtualizar() {
  try {
    const { total } = await atualizar.mutateAsync()
    toast.success(total
      ? `${total} playlist(s) recarregada(s).`
      : 'Nenhuma playlist salva para recarregar.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para recarregar.'))
  }
}

async function onRemover(playlist: PlaylistSpotify) {
  try {
    await remover.mutateAsync(playlist.id)
    if (aberta.value === playlist.id) aberta.value = null
    toast.success(`"${playlist.nome}" saiu do espaço.`)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para remover.'))
  }
}

// ---- Abrir uma playlist e ver as faixas -------------------------------------

const aberta = ref<string | null>(null)
const { data: faixas, isPending: faixasCarregando } = useFaixasDaPlaylist(aberta)

async function alternar(playlist: PlaylistSpotify) {
  if (aberta.value === playlist.id) {
    aberta.value = null
    return
  }

  aberta.value = playlist.id

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

      <div v-if="integracao" class="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          class="gap-1.5"
          :disabled="atualizar.isPending.value"
          @click="onAtualizar"
        >
          <RefreshCwIcon class="size-3.5" :class="atualizar.isPending.value ? 'animate-spin' : ''" />
          {{ atualizar.isPending.value ? 'Recarregando…' : 'Recarregar' }}
        </Button>

        <Button size="sm" class="gap-1.5" :disabled="listar.isPending.value" @click="abrirEscolha">
          <ListMusicIcon class="size-3.5" />
          {{ listar.isPending.value ? 'Listando…' : 'Listar as minhas' }}
        </Button>
      </div>
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

        <p v-if="!grupo.lista.length" class="text-sm text-muted-foreground">
          <template v-if="grupo.souEu && !integracao">
            Conecte a sua conta em
            <NuxtLink to="/espacos" class="text-primary hover:underline">Espaços</NuxtLink>
            para as suas playlists aparecerem aqui.
          </template>
          <template v-else-if="grupo.souEu">
            Nenhuma ainda — clique em "Listar as minhas" e escolha quais entram.
          </template>
          <template v-else>
            {{ grupo.membro.exibicao }} ainda não trouxe playlists para cá.
          </template>
        </p>

        <ul v-else class="space-y-2">
          <li v-for="playlist in grupo.lista" :key="playlist.id" class="rounded-lg border bg-card">
            <div class="flex items-center gap-3 p-3">
              <!--
                O card inteiro leva ao Spotify; ver as faixas é o botão de seta
                ao lado. Antes era o contrário, e o link ficava num ícone
                pequeno no canto — o gesto grande deve ser o destino óbvio.
              -->
              <component
                :is="playlist.url_spotify ? 'a' : 'div'"
                :href="playlist.url_spotify ?? undefined"
                target="_blank"
                rel="noopener noreferrer"
                class="flex min-w-0 flex-1 items-center gap-3 rounded-md"
                :class="playlist.url_spotify ? 'group cursor-pointer' : ''"
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
                  <span class="flex items-center gap-1.5 text-sm font-medium">
                    <span class="truncate group-hover:underline">{{ playlist.nome }}</span>
                    <ExternalLinkIcon
                      v-if="playlist.url_spotify"
                      class="size-3 shrink-0 text-muted-foreground"
                    />
                  </span>
                  <span class="block truncate text-xs text-muted-foreground">
                    {{ playlist.total_faixas }} faixa(s)
                    <template v-if="playlist.colaborativa"> · colaborativa</template>
                    · atualizada em {{ formatarDia(playlist.sincronizado_em.slice(0, 10)) }}
                  </span>
                </span>
              </component>

              <Button
                v-if="grupo.souEu"
                variant="ghost"
                size="icon"
                class="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                :aria-label="`Tirar ${playlist.nome} do espaço`"
                :disabled="remover.isPending.value"
                @click="onRemover(playlist)"
              >
                <Trash2Icon class="size-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                class="size-8 shrink-0 text-muted-foreground"
                :aria-label="`Ver as faixas de ${playlist.nome}`"
                :aria-expanded="aberta === playlist.id"
                @click="alternar(playlist)"
              >
                <ChevronDownIcon
                  class="size-4 transition-transform"
                  :class="aberta === playlist.id ? 'rotate-180' : ''"
                />
              </Button>
            </div>

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
                    <component
                      :is="faixa.url_spotify ? 'a' : 'span'"
                      :href="faixa.url_spotify ?? undefined"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="min-w-0 flex-1"
                      :class="faixa.url_spotify ? 'hover:underline' : ''"
                    >
                      <span class="block truncate">{{ faixa.titulo }}</span>
                      <span class="block truncate text-xs text-muted-foreground">{{ faixa.artistas }}</span>
                    </component>
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
                  Recarregar as faixas
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

    <!-- Escolher quais entram no espaço -->
    <Dialog :open="escolhendo" @update:open="escolhendo = $event">
      <DialogContent class="max-h-[85vh] gap-3 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Quais entram no espaço?</DialogTitle>
          <DialogDescription>
            {{ disponiveis.length }} playlists na sua conta do Spotify. Ficam no espaço
            exatamente as marcadas — desmarcar tira de lá. Nada muda no seu Spotify.
          </DialogDescription>
        </DialogHeader>

        <div class="relative">
          <SearchIcon class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="filtro" placeholder="Filtrar por nome ou dono…" class="pl-9" autocomplete="off" />
        </div>

        <div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{{ marcadas.size }} marcada(s)</span>
          <span class="flex gap-2">
            <button type="button" class="text-primary hover:underline" @click="marcarVisiveis(true)">
              Marcar as visíveis
            </button>
            <button type="button" class="text-primary hover:underline" @click="marcarVisiveis(false)">
              Desmarcar
            </button>
          </span>
        </div>

        <ul class="min-h-0 flex-1 space-y-1 overflow-y-auto">
          <li v-for="p in visiveis" :key="p.spotify_id">
            <label class="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted/60">
              <input
                type="checkbox"
                class="size-4 shrink-0 accent-primary"
                :checked="marcadas.has(p.spotify_id)"
                @change="alternarMarca(p.spotify_id)"
              >

              <span class="size-9 shrink-0 overflow-hidden rounded border bg-muted">
                <img v-if="p.capa_url" :src="p.capa_url" :alt="`Capa de ${p.nome}`" loading="lazy" class="size-full object-cover">
                <span v-else class="grid size-full place-items-center text-muted-foreground">
                  <MusicIcon class="size-3.5" />
                </span>
              </span>

              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm">{{ p.nome }}</span>
                <span class="block truncate text-xs text-muted-foreground">
                  {{ p.total_faixas }} faixa(s)
                  <template v-if="p.dono"> · de {{ p.dono }}</template>
                </span>
              </span>

              <span v-if="jaSalvas.has(p.spotify_id)" class="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                no espaço
              </span>
            </label>
          </li>

          <li v-if="!visiveis.length" class="p-4 text-center text-sm text-muted-foreground">
            Nada com "{{ filtro }}".
          </li>
        </ul>

        <DialogFooter>
          <Button variant="ghost" @click="escolhendo = false">Cancelar</Button>
          <!--
            Habilitado com zero marcadas de propósito: salvar SUBSTITUI o que
            está no espaço, então desmarcar tudo é como se tira tudo.
          -->
          <Button :disabled="salvar.isPending.value" @click="onSalvar">
            {{ salvar.isPending.value ? 'Salvando…' : `Salvar no espaço (${marcadas.size})` }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
