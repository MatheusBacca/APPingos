import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { EspacoComPapel, Papel, TipoEspaco } from '~/types/database.types'

interface MembershipComEspaco {
  papel: Papel
  space: { id: string, tipo: TipoEspaco, nome: string } | null
}

/**
 * Carrega os espaços do usuário e mantém o store sincronizado.
 *
 * Chamado uma vez no layout. Os componentes leem de `useSpaceStore()`.
 */
export function useEspacos() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const store = useSpaceStore()

  const query = useQuery({
    queryKey: ['espacos', computed(() => user.value?.id)],
    enabled: computed(() => !!user.value?.id),
    queryFn: async (): Promise<EspacoComPapel[]> => {
      // Filtramos por user_id de propósito: a policy de membership devolve
      // também as linhas do par, e aqui queremos só "os meus espaços".
      const { data, error } = await supabase
        .from('membership')
        .select('papel, space:space(id, tipo, nome)')
        .eq('user_id', user.value!.id)

      if (error) throw error

      return ((data ?? []) as unknown as MembershipComEspaco[])
        .filter(m => m.space !== null)
        .map(m => ({ ...m.space!, papel: m.papel }))
        // Pessoal primeiro, depois casal por nome — ordem estável no seletor.
        .sort((a, b) => {
          if (a.tipo !== b.tipo) return a.tipo === 'pessoal' ? -1 : 1
          return a.nome.localeCompare(b.nome, 'pt-BR')
        })
    },
  })

  watch(query.data, (lista) => {
    if (lista) store.definirEspacos(lista)
  }, { immediate: true })

  return query
}

export function useCriarEspaco() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()
  const store = useSpaceStore()

  return useMutation({
    mutationFn: async ({ nome, tipo = 'casal' }: { nome: string, tipo?: TipoEspaco }) => {
      const { data, error } = await supabase.rpc('create_space', { p_nome: nome, p_tipo: tipo })
      if (error) throw error
      return data as unknown as string
    },
    onSuccess: async (spaceId) => {
      await queryClient.invalidateQueries({ queryKey: ['espacos'] })
      store.selecionar(spaceId)
    },
  })
}

export function useCriarConvite() {
  const supabase = useSupabaseClient()

  return useMutation({
    mutationFn: async (spaceId: string) => {
      const { data, error } = await supabase.rpc('criar_convite', { p_space: spaceId })
      if (error) throw error
      return data as unknown as string
    },
  })
}

export function useResgatarConvite() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()
  const store = useSpaceStore()

  return useMutation({
    mutationFn: async (codigo: string) => {
      const { data, error } = await supabase.rpc('resgatar_convite', { p_codigo: codigo })
      if (error) throw error
      return data as unknown as string
    },
    onSuccess: async (spaceId) => {
      await queryClient.invalidateQueries({ queryKey: ['espacos'] })
      store.selecionar(spaceId)
    },
  })
}
