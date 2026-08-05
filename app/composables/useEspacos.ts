import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { EspacoComPapel, Papel, TipoEspaco } from '~/types/database.types'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'

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
  const usuarioId = useUsuarioId()
  const store = useSpaceStore()

  const query = useQuery({
    queryKey: ['espacos', usuarioId],
    enabled: computed(() => !!usuarioId.value),
    queryFn: async (): Promise<EspacoComPapel[]> => {
      // Filtramos por user_id de propósito: a policy de membership devolve
      // também as linhas do par, e aqui queremos só "os meus espaços".
      const { data, error } = await supabase
        .from('membership')
        .select('papel, space:space(id, tipo, nome)')
        .eq('user_id', usuarioId.value!)

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

/**
 * Exclusão definitiva de um espaço de casal. A RPC recusa se quem chama não for
 * o dono, e avisa os outros membros antes de apagar.
 *
 * Não mexe no espaço ativo de propósito: ao invalidar a lista, o
 * `definirEspacos` do store já cai para o pessoal sozinho.
 */
export function useDeletarEspaco() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (spaceId: string) => {
      const { error } = await supabase.rpc('deletar_espaco', { p_space: spaceId })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['espacos'] }),
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
