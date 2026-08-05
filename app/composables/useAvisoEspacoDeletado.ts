import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { useUsuarioId } from '~/composables/useUsuarioId'

export interface AvisoEspacoDeletado {
  id: string
  space_nome: string
  deletado_por_nome: string
  deletado_em: string
}

/**
 * Aviso de que um espaço em que a pessoa estava foi excluído pelo dono.
 *
 * Existe porque a exclusão é definitiva: sem este registro, o espaço só sumiria
 * do seletor sem explicação nenhuma. A RPC `deletar_espaco` grava um aviso por
 * membro antes de apagar, e ele é lido aqui no primeiro carregamento seguinte.
 */
export function useAvisoEspacoDeletado() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['aviso-espaco-deletado', usuarioId],
    enabled: computed(() => !!usuarioId.value),
    queryFn: async (): Promise<AvisoEspacoDeletado[]> => {
      const { data, error } = await supabase
        .from('space_deletion_notice')
        .select('id, space_nome, deletado_por_nome, deletado_em')
        .is('lido_em', null)
        .order('deletado_em', { ascending: true })

      if (error) throw error
      return (data ?? []) as AvisoEspacoDeletado[]
    },
  })

  // Um de cada vez: se dois espaços foram excluídos, a pessoa lê um, confirma,
  // e o próximo aparece.
  const aviso = computed(() => query.data.value?.[0] ?? null)

  const marcarLido = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('space_deletion_notice')
        .update({ lido_em: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['aviso-espaco-deletado'] }),
  })

  return { aviso, marcarLido }
}
