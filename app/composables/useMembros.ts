export interface Membro {
  user_id: string
  papel: string
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
      papel: string
      profile: { nome: string, avatar_url: string | null } | null
    }>).map(m => ({
      user_id: m.user_id,
      papel: m.papel,
      nome: m.profile?.nome ?? 'Sem nome',
      avatar_url: m.profile?.avatar_url ?? null,
    }))
  })
}
