import { useQueryClient } from '@tanstack/vue-query'

export interface ConviteFilme {
  id: string
  entry_id: string
  de_user_id: string
  data_proposta: string
  entry: { media: { titulo: string, capa_url: string | null } | null } | null
}

/**
 * Convites pendentes para assistir junto, no espaço ativo.
 *
 * A policy só devolve convites em que você é o convidado ou quem convidou;
 * aqui filtramos pelos seus, ainda sem resposta.
 */
export function useConvitesFilme() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useSpaceQuery(['convites-filme'], async (): Promise<ConviteFilme[]> => {
    const { data, error } = await supabase
      .from('convite_filme')
      .select('id, entry_id, de_user_id, data_proposta, entry:entry(media:media_item(titulo, capa_url))')
      .eq('para_user_id', usuarioId.value!)
      .is('respondido_em', null)
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data ?? []) as unknown as ConviteFilme[]
  }, { enabled: computed(() => !!usuarioId.value) })
}

export function useResponderConvite() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()
  const store = useSpaceStore()

  return useSpaceMutation<{ id: string, aceito: boolean }, void>(
    async (_spaceId, { id, aceito }) => {
      const { error } = await supabase.rpc('responder_convite', {
        p_convite: id,
        p_aceito: aceito,
      })
      if (error) throw error

      // Aceitar grava uma data na avaliação — o catálogo precisa recarregar.
      await queryClient.invalidateQueries({
        queryKey: ['space', store.espacoAtivoId, 'catalogo'],
      })
    },
    [['convites-filme']],
  )
}
