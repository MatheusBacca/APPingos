/**
 * A conta do Spotify conectada e o snapshot das playlists.
 *
 * Nada aqui é `useSpaceQuery`: conta e playlist pertencem a uma PESSOA, não a
 * um espaço (ver a migration 20260815172135_spotify_integracao.sql). Trocar de
 * espaço não muda a sua conexão nem faz as suas playlists sumirem — quem
 * recorta por espaço é a tela, ao agrupar por membro.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import type { MaybeRefOrGetter } from 'vue'
import type { DetalheMusica } from '~~/server/utils/spotify'
import type { Database } from '~/types/database.types'
import type { Json } from '~/types/database.generated'
import type { ItemDoEspaco } from '~/types/catalogo'
import { formatoDe } from '~/lib/musica'
import { useSpaceMutation, useSpaceQuery } from '~/composables/useSpaceQuery'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'

export interface IntegracaoSpotify {
  spotify_user_id: string | null
  escopos: string
  conectado_em: string
  mostrar_escuta: boolean
}

/**
 * Quem conectou antes da fase 3 não concedeu o escopo de "o que está tocando".
 *
 * Escopo se concede autorizando, não com um deploy — sem isto a pessoa ligaria
 * o interruptor e nada aconteceria, sem explicação nenhuma na tela.
 */
export function temEscopoDeEscuta(escopos: string | undefined): boolean {
  return (escopos ?? '').split(/\s+/).includes('user-read-currently-playing')
}

export interface PlaylistSpotify {
  id: string
  user_id: string
  spotify_id: string
  nome: string
  descricao: string | null
  capa_url: string | null
  total_faixas: number
  publica: boolean
  colaborativa: boolean
  url_spotify: string | null
  sincronizado_em: string
  faixas_sincronizadas_em: string | null
}

export interface EscutaAgora {
  user_id: string
  tocando: boolean
  titulo: string | null
  artistas: string | null
  album: string | null
  capa_url: string | null
  url_spotify: string | null
  atualizado_em: string
}

export interface FaixaDaPlaylist {
  posicao: number
  spotify_track_id: string
  titulo: string
  artistas: string
  album: string | null
  duracao_ms: number | null
  url_spotify: string | null
}

const CHAVE_INTEGRACAO = ['spotify', 'integracao']
const CHAVE_PLAYLISTS = ['spotify', 'playlists']
const CHAVE_FAVORITAS = ['spotify', 'playlists', 'favoritas']
const CHAVE_ESCUTA = ['spotify', 'escuta']

/** A sua conexão, ou `null` se você ainda não conectou. */
export function useIntegracaoSpotify() {
  const supabase = useSupabaseClient<Database>()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: CHAVE_INTEGRACAO,
    enabled: computed(() => !!usuarioId.value),
    queryFn: async (): Promise<IntegracaoSpotify | null> => {
      // A RLS já limita à própria linha; o select sem filtro devolve só a sua.
      const { data, error } = await supabase
        .from('integracao_spotify')
        .select('spotify_user_id, escopos, conectado_em, mostrar_escuta')
        .maybeSingle()

      if (error) throw error
      return data
    },
  })
}

/**
 * Desconectar apaga a conexão E as playlists sincronizadas.
 *
 * Deixar o snapshot para trás seria manter na tela do par uma lista que não tem
 * mais como ser atualizada — e que a pessoa achou que tinha tirado do app.
 */
export function useDesconectarSpotify() {
  const supabase = useSupabaseClient<Database>()
  const usuarioId = useUsuarioId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const id = usuarioId.value
      if (!id) throw new Error('Sem sessão.')

      const { error: erroPlaylists } = await supabase
        .from('playlist_spotify')
        .delete()
        .eq('user_id', id)
      if (erroPlaylists) throw erroPlaylists

      const { error } = await supabase
        .from('integracao_spotify')
        .delete()
        .eq('user_id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CHAVE_INTEGRACAO }),
        queryClient.invalidateQueries({ queryKey: CHAVE_PLAYLISTS }),
      ])
    },
  })
}

/**
 * Todas as playlists que você pode ver: as suas e as de quem divide espaço.
 *
 * Sem filtro por espaço na consulta — quem limita é a RLS, e a tela agrupa por
 * membro do espaço ativo. Uma playlist de alguém de outro espaço simplesmente
 * não encontra um grupo e não é desenhada.
 */
export function usePlaylistsSpotify() {
  const supabase = useSupabaseClient<Database>()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: CHAVE_PLAYLISTS,
    enabled: computed(() => !!usuarioId.value),
    queryFn: async (): Promise<PlaylistSpotify[]> => {
      const { data, error } = await supabase
        .from('playlist_spotify')
        .select('id, user_id, spotify_id, nome, descricao, capa_url, total_faixas, publica, colaborativa, url_spotify, sincronizado_em, faixas_sincronizadas_em')
        .order('nome')

      if (error) throw error
      return data ?? []
    },
  })
}

export function useFaixasDaPlaylist(playlistId: MaybeRefOrGetter<string | null>) {
  const supabase = useSupabaseClient<Database>()

  return useQuery({
    queryKey: computed(() => [...CHAVE_PLAYLISTS, 'faixas', toValue(playlistId)]),
    enabled: computed(() => !!toValue(playlistId)),
    queryFn: async (): Promise<FaixaDaPlaylist[]> => {
      const { data, error } = await supabase
        .from('playlist_faixa')
        .select('posicao, spotify_track_id, titulo, artistas, album, duracao_ms, url_spotify')
        .eq('playlist_id', toValue(playlistId)!)
        .order('posicao')

      if (error) throw error
      return data ?? []
    },
  })
}

/** Uma playlist como o Spotify a devolve — ainda não está no banco. */
export interface PlaylistDoSpotify {
  spotify_id: string
  nome: string
  descricao: string | null
  capa_url: string | null
  total_faixas: number
  publica: boolean
  colaborativa: boolean
  url_spotify: string | null
  dono: string | null
}

/**
 * Lista as playlists da conta, sem gravar nada.
 *
 * `useMutation` e não `useQuery` de propósito: isto é uma AÇÃO que a pessoa
 * dispara ("listar as minhas"), com custo de rede real e resultado descartável.
 * Como query, o TanStack a refaria sozinho ao voltar para a aba, gastando cota
 * do Spotify para encher uma lista que ninguém está olhando.
 */
export function useListarPlaylistsDoSpotify() {
  return useMutation({
    mutationFn: () => $fetch<{ playlists: PlaylistDoSpotify[] }>('/api/spotify/playlists/minhas'),
  })
}

/** Grava no espaço só as playlists escolhidas. */
export function useSalvarPlaylists() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ids: string[]) => $fetch<{ total: number }>('/api/spotify/playlists/salvar', {
      method: 'POST',
      body: { ids },
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CHAVE_PLAYLISTS })
    },
  })
}

/** Recarrega nome, capa e contagem do que já está salvo. */
export function useAtualizarPlaylists() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => $fetch<{ total: number }>('/api/spotify/playlists/atualizar', {
      method: 'POST',
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CHAVE_PLAYLISTS })
    },
  })
}

/**
 * Tira uma playlist do espaço — sem tocar em nada no Spotify.
 *
 * Pelo client mesmo: a RLS já garante que só o dono apaga a própria linha, e
 * as faixas saem junto pelo `on delete cascade`.
 */
export function useRemoverPlaylist() {
  const supabase = useSupabaseClient<Database>()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('playlist_spotify').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CHAVE_PLAYLISTS })
    },
  })
}

/**
 * Recarrega no Spotify os itens de música já adicionados ao espaço.
 *
 * Uma ida por item, em sequência e não em paralelo: são poucas músicas num
 * catálogo de casal, e disparar tudo de uma vez é a forma mais fácil de tomar
 * 429 justamente na ação que a pessoa pediu.
 *
 * Passa pela RPC `atualizar_media_item`, e não por `adicionar_item`: aquela
 * termina inserindo `rating (…, 'quero')`, então recarregar uma música que a
 * outra pessoa adicionou marcaria você como interessado nela, em silêncio.
 */
export function useAtualizarMusicas() {
  const supabase = useSupabaseClient<Database>()
  const queryClient = useQueryClient()
  const store = useSpaceStore()

  return useMutation({
    mutationFn: async (itens: ItemDoEspaco[]) => {
      let atualizados = 0

      for (const item of itens) {
        // Item que não veio do Spotify não tem o que recarregar de lá.
        if (item.media.fonte !== 'spotify' || !item.media.fonte_id) continue

        const formato = formatoDe(item.media.metadados)
        const detalhe = await $fetch<DetalheMusica>(
          `/api/spotify/${formato}/${item.media.fonte_id}`,
        )

        const { error } = await supabase.rpc('atualizar_media_item', {
          p_media: item.media.id,
          p_dados: {
            titulo: detalhe.titulo,
            ano: detalhe.ano,
            capa_url: detalhe.capa_url,
            metadados: {
              formato: detalhe.formato,
              artistas: detalhe.artistas,
              album: detalhe.album,
              duracao_ms: detalhe.duracao_ms,
              url_spotify: detalhe.url_spotify,
            },
          } as unknown as Json,
        })
        if (error) throw error

        atualizados++
      }

      return atualizados
    },
    onSuccess: async () => {
      // A chave do catálogo é prefixada pelo espaço (ver useSpaceQuery) —
      // invalidar só `['catalogo']` não casa com nada e a tela ficaria velha.
      await queryClient.invalidateQueries({
        queryKey: ['space', store.espacoAtivoId, 'catalogo'],
      })
    },
  })
}

// ---- Favoritas: o que vira "Nossas músicas" ---------------------------------

/**
 * Os ids das playlists favoritadas NO ESPAÇO ATIVO.
 *
 * Só os ids: o dado da playlist já vem em `usePlaylistsSpotify`, e buscar de
 * novo com join deixaria duas listas para manter em dia. A tela cruza as duas.
 */
export function useFavoritasDoEspaco() {
  const supabase = useSupabaseClient<Database>()

  return useSpaceQuery(CHAVE_FAVORITAS, async (spaceId): Promise<string[]> => {
    const { data, error } = await supabase
      .from('playlist_favorita')
      .select('playlist_id')
      .eq('space_id', spaceId)

    if (error) throw error
    return (data ?? []).map(f => f.playlist_id)
  })
}

/** Favoritar promove ao topo; desfavoritar só tira do destaque. */
export function useAlternarFavorita() {
  const supabase = useSupabaseClient<Database>()
  const usuarioId = useUsuarioId()

  return useSpaceMutation<{ playlistId: string, favoritar: boolean }, void>(
    async (spaceId, { playlistId, favoritar }) => {
      if (favoritar) {
        const { error } = await supabase.from('playlist_favorita').insert({
          playlist_id: playlistId,
          space_id: spaceId,
          marcada_por: usuarioId.value!,
        })
        if (error) throw error
        return
      }

      const { error } = await supabase
        .from('playlist_favorita')
        .delete()
        .eq('playlist_id', playlistId)
        .eq('space_id', spaceId)
      if (error) throw error
    },
    [['spotify', 'playlists', 'favoritas']],
  )
}

// ---- O que cada um está ouvindo ---------------------------------------------

export function useEscutaDoEspaco() {
  const supabase = useSupabaseClient<Database>()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: CHAVE_ESCUTA,
    enabled: computed(() => !!usuarioId.value),
    queryFn: async (): Promise<EscutaAgora[]> => {
      // A RLS resolve quem aparece: você, e quem divide espaço com você E
      // ligou `mostrar_escuta`.
      const { data, error } = await supabase
        .from('escuta_agora')
        .select('user_id, tocando, titulo, artistas, album, capa_url, url_spotify, atualizado_em')

      if (error) throw error
      return data ?? []
    },
  })
}

/**
 * Liga/desliga o "mostrar o que estou ouvindo".
 *
 * Desligar apaga a linha em `escuta_agora` — isso acontece por trigger no
 * banco, e não aqui, para valer mesmo se alguém desligar por outro caminho.
 */
export function useAlternarMostrarEscuta() {
  const supabase = useSupabaseClient<Database>()
  const usuarioId = useUsuarioId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (mostrar: boolean) => {
      const { error } = await supabase
        .from('integracao_spotify')
        .update({ mostrar_escuta: mostrar })
        .eq('user_id', usuarioId.value!)
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CHAVE_INTEGRACAO }),
        queryClient.invalidateQueries({ queryKey: CHAVE_ESCUTA }),
      ])
    },
  })
}

/**
 * Pede ao servidor que pergunte ao Spotify por todo mundo do espaço.
 *
 * Quem chama é quem está OLHANDO — é isso que faz o polling existir só
 * enquanto alguém tem o app aberto. Ver `useEscutaViva`.
 */
export function useAtualizarEscuta() {
  const queryClient = useQueryClient()
  const store = useSpaceStore()

  return useMutation({
    mutationFn: () => $fetch<{ total: number }>('/api/spotify/escuta/atualizar', {
      method: 'POST',
      body: { space: store.espacoAtivoId },
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CHAVE_ESCUTA })
    },
  })
}

/**
 * O polling: só existe enquanto alguém está olhando.
 *
 * Três guardas, e as três importam:
 *
 *   - **conectado**: sem a sua conta ligada não há a quem perguntar. Quem nunca
 *     conectou não gera uma única chamada ao Spotify.
 *   - **aba visível**: `useDocumentVisibility` para o app esquecido numa aba de
 *     fundo, ou o PWA minimizado no celular, pararem de perguntar. Sem isto o
 *     "só enquanto alguém olha" viraria "para sempre, depois da primeira visita".
 *   - **intervalo**: 25s. O rate limit do Spotify é uma janela curta, e a faixa
 *     mais curta que existe dura minutos — perguntar mais que isso gasta cota
 *     para mostrar a mesma coisa.
 *
 * Não há cron por trás. Ninguém com o app aberto, nenhuma chamada.
 */
export function useEscutaViva(intervaloMs = 25_000) {
  const { data: integracao } = useIntegracaoSpotify()
  const atualizar = useAtualizarEscuta()
  const store = useSpaceStore()
  const visibilidade = useDocumentVisibility()

  const ativo = computed(() =>
    !!integracao.value && !!store.espacoAtivoId && visibilidade.value === 'visible',
  )

  async function perguntar() {
    if (!ativo.value || atualizar.isPending.value) return
    // Falha aqui é silenciosa de propósito: isto roda sozinho, de fundo, e um
    // toast de erro a cada 25 segundos por causa de uma queda de rede seria
    // pior que a informação desatualizada.
    try {
      await atualizar.mutateAsync()
    }
    catch { /* segue no próximo tique */ }
  }

  const { pause, resume } = useIntervalFn(perguntar, intervaloMs, { immediate: false })

  watch(ativo, (ligado) => {
    if (ligado) {
      // Uma pergunta imediata ao voltar para a aba: esperar 25s para a tela
      // deixar de mentir seria tempo demais para quem acabou de olhar.
      perguntar()
      resume()
    }
    else {
      pause()
    }
  }, { immediate: true })
}

/** Puxa as faixas de UMA playlist — só quando alguém abre. */
export function useSincronizarFaixas() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (playlistId: string) =>
      $fetch<{ total: number }>(`/api/spotify/playlists/${playlistId}/faixas`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CHAVE_PLAYLISTS })
    },
  })
}
