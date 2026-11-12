/**
 * Metas e aportes.
 *
 * Toda meta mora num espaço, e as consultas daqui são por espaço
 * (`useEspacoQuery`) — a meta pessoal só existe na gaveta pessoal, pela RLS de
 * membro, como as compras pessoais. Ver supabase/migrations/20261112120100_metas.sql.
 *
 * As chaves ficam sob `['space', id, 'metas', ...]`; registrar um aporte invalida
 * esse prefixo inteiro, porque o mesmo aporte muda a lista, o detalhe e a
 * projeção do mês no Planejamento.
 */
import type { MaybeRefOrGetter } from 'vue'
import { useEspacoQuery } from '~/composables/useSpaceQuery'

type Espaco = MaybeRefOrGetter<string | null | undefined>

export interface AporteDoMes {
  user_id: string
  valor: number
}

/**
 * Os aportes (e resgates) que caem numa competência, em todas as metas do espaço.
 * É o que a projeção do mês subtrai — com sinal: o resgate devolve.
 */
export function useAportesDoMes(espaco: Espaco, competencia: MaybeRefOrGetter<string>) {
  const supabase = useSupabaseClient()

  return useEspacoQuery(
    espaco,
    computed(() => ['metas', 'aportes-do-mes', toValue(competencia)]),
    async (spaceId): Promise<AporteDoMes[]> => {
      const { data, error } = await supabase
        .from('meta_aporte')
        .select('user_id, valor, meta:meta!inner(space_id)')
        .eq('meta.space_id', spaceId)
        .eq('competencia', toValue(competencia))

      if (error) throw error
      return (data ?? []).map(a => ({ user_id: a.user_id, valor: Number(a.valor) }))
    },
  )
}
