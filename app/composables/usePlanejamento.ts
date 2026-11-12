/**
 * A contribuição de cada um ao casal — a divisão salarial conjunta.
 *
 * Duas leituras, e a diferença entre elas é a privacidade:
 *
 *   - `useContribuicoesDoEspaco` é o que o ESPAÇO vê, pela RPC
 *     `contribuicoes_do_espaco`: o valor em reais de cada um, e o percentual só de
 *     quem tem o salário aberto ali. A tabela `contribuicao` não é legível pelo
 *     outro membro — com o percentual cru e o valor efetivo, o salário sairia por
 *     regra de três.
 *   - `useMinhasContribuicoes` são as MINHAS linhas cruas, em todos os espaços —
 *     o que o planejamento pessoal subtrai do salário e o que o formulário edita.
 *
 * Ver supabase/migrations/20261112120000_planejamento_renda.sql.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { MaybeRefOrGetter } from 'vue'
import type { Contribuicao, ContribuicaoDoEspaco, ModoContribuicao } from '~/types/planejamento'
import { useEspacoQuery } from '~/composables/useSpaceQuery'
import { useUsuarioId } from '~/composables/useUsuarioId'

type Espaco = MaybeRefOrGetter<string | null | undefined>

const numeroOuNulo = (v: unknown) => (v === null || v === undefined ? null : Number(v))

/** O que o espaço vê das contribuições. `null` desliga (ex.: o espaço ativo é o pessoal). */
export function useContribuicoesDoEspaco(espaco: Espaco) {
  const supabase = useSupabaseClient()

  return useEspacoQuery(espaco, ['planejamento', 'contribuicoes'], async (spaceId): Promise<ContribuicaoDoEspaco[]> => {
    const { data, error } = await supabase.rpc('contribuicoes_do_espaco', { p_space: spaceId })
    if (error) throw error

    // O gerador declara `number` nas duas colunas; a RPC devolve `null` de propósito.
    return (data ?? []).map(c => ({
      user_id: c.user_id,
      modo: c.modo as ModoContribuicao,
      valor_efetivo: numeroOuNulo(c.valor_efetivo),
      percentual: numeroOuNulo(c.percentual),
    }))
  })
}

/**
 * As minhas contribuições, em todos os espaços. Sob `['renda', ...]` porque é
 * dado da pessoa (o salário mudar já invalida esta chave).
 */
export function useMinhasContribuicoes() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: ['renda', 'contribuicoes', usuarioId],
    enabled: computed(() => !!usuarioId.value),
    queryFn: async (): Promise<Contribuicao[]> => {
      const { data, error } = await supabase
        .from('contribuicao')
        .select('space_id, user_id, modo, valor')
        .eq('user_id', usuarioId.value!)

      if (error) throw error
      return (data ?? []).map(c => ({ ...c, modo: c.modo as ModoContribuicao, valor: Number(c.valor) }))
    },
  })
}

/**
 * Declarar, trocar ou retirar a própria contribuição num espaço. `null` retira —
 * "não contribuo" é a ausência da linha.
 *
 * Invalida as duas leituras: a do espaço (o valor central muda para os dois) e a
 * minha (o planejamento pessoal subtrai outro valor).
 */
export function useDefinirContribuicao(espaco: Espaco) {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()
  const usuarioId = useUsuarioId()

  return useMutation({
    mutationFn: async (contribuicao: { modo: ModoContribuicao, valor: number } | null) => {
      const spaceId = toValue(espaco)
      if (!spaceId || !usuarioId.value) throw new Error('Nenhum espaço ativo')

      const { error } = contribuicao
        ? await supabase
            .from('contribuicao')
            .upsert({ space_id: spaceId, user_id: usuarioId.value, ...contribuicao }, { onConflict: 'space_id,user_id' })
        : await supabase
            .from('contribuicao')
            .delete()
            .eq('space_id', spaceId)
            .eq('user_id', usuarioId.value)

      if (error) throw error
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['space', toValue(espaco), 'planejamento'] }),
      queryClient.invalidateQueries({ queryKey: ['renda', 'contribuicoes'] }),
    ]),
  })
}
