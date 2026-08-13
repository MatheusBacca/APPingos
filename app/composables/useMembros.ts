import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { Papel } from '~/types/database.types'
import { nomeDeExibicao } from '~/types/database.types'
import { useSpaceQuery } from '~/composables/useSpaceQuery'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'

export interface Membro {
  user_id: string
  papel: Papel
  /** Nome de cadastro. Para MOSTRAR a pessoa, use `exibicao`. */
  nome: string
  apelido: string | null
  /**
   * Como o app chama esta pessoa: o apelido quando ela pôs um, o nome quando
   * não. Campo pronto em vez de resolver em cada tela, porque "às vezes é o
   * apelido" é o tipo de regra que uma tela nova esquece de aplicar.
   */
  exibicao: string
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
      .select('user_id, papel, profile:profile(nome, apelido, avatar_url)')
      .eq('space_id', spaceId)

    if (error) throw error

    return ((data ?? []) as unknown as Array<{
      user_id: string
      papel: Papel
      profile: { nome: string, apelido: string | null, avatar_url: string | null } | null
    }>).map((m) => {
      const nome = m.profile?.nome ?? 'Sem nome'
      const apelido = m.profile?.apelido ?? null

      return {
        user_id: m.user_id,
        papel: m.papel,
        nome,
        apelido,
        exibicao: nomeDeExibicao({ nome, apelido }),
        avatar_url: m.profile?.avatar_url ?? null,
      }
    })
  })
}

/**
 * Todo mundo que este app sabe nomear: você e quem divide algum espaço com você.
 *
 * Existe porque `useMembros()` é do espaço ATIVO, e há nomes a mostrar que não estão
 * nele: um interesse do casal visto do espaço pessoal pode ter sido assumido pela
 * outra pessoa, e ali `useMembros()` devolveria só você — a tela diria "assumido
 * por" e ficaria sem nome. Sem escopo de espaço, então, com o mesmo cache servindo
 * todas as telas; quem limita é a policy de `profile`, que já libera só você mais
 * quem compartilha espaço (`shares_space_with`).
 */
export function usePessoas() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: ['pessoas', usuarioId],
    enabled: computed(() => !!usuarioId.value),
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase.from('profile').select('id, nome, apelido')
      if (error) throw error

      return new Map(
        (data ?? []).map(p => [p.id, nomeDeExibicao({ nome: p.nome, apelido: p.apelido })]),
      )
    },
  })
}

/** Como chamar esta pessoa, ou um rótulo neutro quando ela não está no alcance. */
export function nomeDaPessoa(pessoas: Map<string, string> | undefined, userId: string | null) {
  if (!userId) return null
  return pessoas?.get(userId) ?? 'Alguém'
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
