/**
 * O salário de quem está logado, e com quais espaços ele está aberto.
 *
 * Não é `useSpaceQuery`, pelo mesmo motivo do perfil: o salário é da PESSOA, não
 * do espaço. A linha mora em `renda` (uma por pessoa), e onde ela aparece é
 * decidido por `renda_compartilhamento` — ver
 * supabase/migrations/20261112120000_planejamento_renda.sql.
 *
 * As chaves ficam sob `['renda', ...]`, fora de `['space', ...]`: trocar de espaço
 * não deve refazer nem mudar nada aqui.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { RecebimentoTipo, Renda } from '~/types/planejamento'
import { useUsuarioId } from '~/composables/useUsuarioId'

export interface NovaRenda {
  valor_liquido: number
  recebimento_tipo: RecebimentoTipo
  recebimento_dia: number
}

/**
 * O que depende do salário e precisa ser recalculado quando ele muda: a
 * contribuição em percentual vira outro valor efetivo, e com ele o valor central
 * de cada espaço e as projeções. Um predicado, e não a chave do espaço ativo,
 * porque o salário vale em TODOS os espaços — inclusive nos que não estão na tela.
 */
function invalidarPlanejamento(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['renda'] }),
    queryClient.invalidateQueries({
      predicate: q => q.queryKey[0] === 'space' && q.queryKey[2] === 'planejamento',
    }),
  ])
}

/** A própria renda, ou `null` quando a pessoa ainda não cadastrou. */
export function useMinhaRenda() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: ['renda', 'minha', usuarioId],
    enabled: computed(() => !!usuarioId.value),
    queryFn: async (): Promise<Renda | null> => {
      const { data, error } = await supabase
        .from('renda')
        .select('user_id, valor_liquido, recebimento_tipo, recebimento_dia, updated_at')
        .eq('user_id', usuarioId.value!)
        .maybeSingle()

      if (error) throw error
      if (!data) return null
      return { ...data, valor_liquido: Number(data.valor_liquido) } as Renda
    },
  })
}

/**
 * Cadastrar ou trocar o salário. Upsert pela chave primária (`user_id`): é uma
 * linha por pessoa, e "editar" e "cadastrar" são a mesma operação para quem usa.
 */
export function useSalvarRenda() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()
  const usuarioId = useUsuarioId()

  return useMutation({
    mutationFn: async (renda: NovaRenda) => {
      if (!usuarioId.value) throw new Error('Não autenticado')

      const { error } = await supabase
        .from('renda')
        .upsert({ user_id: usuarioId.value, ...renda }, { onConflict: 'user_id' })

      if (error) throw error
    },
    onSuccess: () => invalidarPlanejamento(queryClient),
  })
}

/**
 * Apagar o salário. Os compartilhamentos ficam — sem linha em `renda`, eles não
 * abrem nada, e cadastrar de novo não deveria pedir para refazer a escolha de
 * quem vê.
 */
export function useRemoverRenda() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()
  const usuarioId = useUsuarioId()

  return useMutation({
    mutationFn: async () => {
      if (!usuarioId.value) throw new Error('Não autenticado')
      const { error } = await supabase.from('renda').delete().eq('user_id', usuarioId.value)
      if (error) throw error
    },
    onSuccess: () => invalidarPlanejamento(queryClient),
  })
}

/** Os espaços em que o MEU salário está aberto. */
export function useMeusCompartilhamentos() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: ['renda', 'compartilhamentos', usuarioId],
    enabled: computed(() => !!usuarioId.value),
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('renda_compartilhamento')
        .select('space_id')
        .eq('user_id', usuarioId.value!)

      if (error) throw error
      return new Set((data ?? []).map(c => c.space_id))
    },
  })
}

/**
 * Abrir ou fechar o salário num espaço. Inserir é compartilhar, apagar é deixar
 * de compartilhar — a presença da linha é o estado, como em `acerto_mes`.
 */
export function useCompartilharRenda() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()
  const usuarioId = useUsuarioId()

  return useMutation({
    mutationFn: async ({ spaceId, compartilhar }: { spaceId: string, compartilhar: boolean }) => {
      if (!usuarioId.value) throw new Error('Não autenticado')

      const { error } = compartilhar
        ? await supabase
            .from('renda_compartilhamento')
            .insert({ user_id: usuarioId.value, space_id: spaceId })
        : await supabase
            .from('renda_compartilhamento')
            .delete()
            .eq('user_id', usuarioId.value)
            .eq('space_id', spaceId)

      if (error) throw error
    },
    // Abrir o salário muda o que o espaço vê das contribuições (o percentual).
    onSuccess: () => invalidarPlanejamento(queryClient),
  })
}
