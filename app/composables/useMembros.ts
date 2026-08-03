import { useMutation, useQueryClient } from '@tanstack/vue-query'
import type { Papel } from '~/types/database.types'

export interface Membro {
  user_id: string
  papel: Papel
  nome: string
  avatar_url: string | null
}

/**
 * Membros do espaço ativo.
 *
 * A policy de `membership` devolve todo mundo do espaço (não só você), o que é
 * exatamente o que precisamos para rotular "quem deu qual nota".
 */
export function useMembros() {
  const supabase = useSupabaseClient()

  return useSpaceQuery(['membros'], async (spaceId): Promise<Membro[]> => {
    const { data, error } = await supabase
      .from('membership')
      .select('user_id, papel, profile:profile(nome, avatar_url)')
      .eq('space_id', spaceId)

    if (error) throw error

    return ((data ?? []) as unknown as Array<{
      user_id: string
      papel: Papel
      profile: { nome: string, avatar_url: string | null } | null
    }>).map(m => ({
      user_id: m.user_id,
      papel: m.papel,
      nome: m.profile?.nome ?? 'Sem nome',
      avatar_url: m.profile?.avatar_url ?? null,
    }))
  })
}

/** Promover ou rebaixar alguém. A RPC recusa quem não for dono do espaço. */
export function useDefinirPapel() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()
  const store = useSpaceStore()

  return useMutation({
    mutationFn: async ({ userId, papel }: { userId: string, papel: Exclude<Papel, 'dono'> }) => {
      const { error } = await supabase.rpc('definir_papel', {
        p_space: store.espacoAtivoId!,
        p_user: userId,
        p_papel: papel,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['space', store.espacoAtivoId, 'membros'] }),
        // O papel do próprio usuário vive na lista de espaços do seletor.
        queryClient.invalidateQueries({ queryKey: ['espacos'] }),
      ])
    },
  })
}
