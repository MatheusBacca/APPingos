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
import type { Database } from '~/types/database.types'
import { useUsuarioId } from '~/composables/useUsuarioId'

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

/** Puxa do Spotify a lista de playlists e regrava o snapshot. */
export function useSincronizarPlaylists() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => $fetch<{ total: number }>('/api/spotify/playlists/sincronizar', {
      method: 'POST',
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CHAVE_PLAYLISTS })
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
