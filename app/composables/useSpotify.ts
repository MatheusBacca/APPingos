/**
 * A conta do Spotify conectada e o snapshot das playlists.
 *
 * Nada aqui é `useSpaceQuery`: conta e playlist pertencem a uma PESSOA, não a
 * um espaço (ver a migration 20260815172135_spotify_integracao.sql). Trocar de
 * espaço não muda a sua conexão nem faz as suas playlists sumirem — quem
 * recorta por espaço é a tela, ao agrupar por membro.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { MaybeRefOrGetter } from 'vue'
import type { DetalheMusica } from '~~/server/utils/spotify'
import type { Database } from '~/types/database.types'
import type { Json } from '~/types/database.generated'
import type { ItemDoEspaco } from '~/types/catalogo'
import { formatoDe } from '~/lib/musica'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'

export interface IntegracaoSpotify {
  spotify_user_id: string | null
  escopos: string
  conectado_em: string
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
        .select('spotify_user_id, escopos, conectado_em')
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
