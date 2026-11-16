import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { nomeDeExibicao } from '~/types/database.types'
import { useUsuarioId } from '~/composables/useUsuarioId'
import type { TipoChavePix } from '~/lib/pix'
import type { Ref } from 'vue'

export interface Perfil {
  id: string
  nome: string
  apelido: string | null
  /** O apelido, ou o nome de cadastro quando não há. */
  exibicao: string
  /** Já normalizada (`normalizarChavePix`). Vai no Pix do acerto de quem paga você. */
  chave_pix: string | null
  chave_pix_tipo: TipoChavePix | null
}

/**
 * O perfil de quem está logado.
 *
 * Não é `useSpaceQuery`: o perfil é da pessoa, não do espaço. O mesmo apelido
 * vale no espaço pessoal e no do casal — trocar de espaço não deve nem refazer
 * esta busca, nem mudar o que ela devolve.
 */
export function usePerfil() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: ['perfil', usuarioId],
    enabled: computed(() => !!usuarioId.value),
    queryFn: async (): Promise<Perfil | null> => {
      const { data, error } = await supabase
        .from('profile')
        .select('id, nome, apelido, chave_pix, chave_pix_tipo')
        .eq('id', usuarioId.value!)
        .maybeSingle()

      if (error) throw error
      if (!data) return null

      return {
        ...data,
        chave_pix_tipo: data.chave_pix_tipo as TipoChavePix | null,
        exibicao: nomeDeExibicao(data),
      }
    },
  })
}

/**
 * Define (ou apaga, com `null`) o apelido do próprio usuário.
 *
 * UPDATE direto, sem RPC: a policy `profile_update` já limita a escrita à
 * própria linha, e o trigger `profile_apelido_normalizado` cuida de espaços em
 * branco. Uma RPC aqui só repetiria as duas coisas.
 */
export function useDefinirApelido() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()
  const usuarioId = useUsuarioId()

  return useMutation({
    mutationFn: async (apelido: string | null) => {
      if (!usuarioId.value) throw new Error('Não autenticado')

      const { error } = await supabase
        .from('profile')
        .update({ apelido })
        .eq('id', usuarioId.value)

      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['perfil'] }),
        // A lista de membros é por espaço, e o apelido novo vale em TODOS eles
        // — inclusive nos que não estão na tela agora. Daí o predicado, em vez
        // de invalidar a chave do espaço ativo e deixar os outros com o nome
        // velho em cache até alguém trocar de espaço.
        queryClient.invalidateQueries({
          predicate: q => q.queryKey[0] === 'space' && q.queryKey[2] === 'membros',
        }),
      ])
    },
  })
}

/**
 * Define (ou apaga, com `null`) a chave Pix do próprio usuário.
 *
 * Quem chama já normalizou e validou (`app/lib/pix.ts`); o banco só garante
 * que chave e tipo andam juntos. A policy `profile_select` é o que deixa quem
 * divide um espaço com você ler a chave — é ela que vai no Pix do acerto.
 */
export function useDefinirChavePix() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()
  const usuarioId = useUsuarioId()

  return useMutation({
    mutationFn: async (v: { chave: string, tipo: TipoChavePix } | null) => {
      if (!usuarioId.value) throw new Error('Não autenticado')

      const { error } = await supabase
        .from('profile')
        .update({ chave_pix: v?.chave ?? null, chave_pix_tipo: v?.tipo ?? null })
        .eq('id', usuarioId.value)

      if (error) throw error
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['perfil'] }),
      queryClient.invalidateQueries({ queryKey: ['chave-pix'] }),
    ]),
  })
}

/**
 * A chave Pix de OUTRA pessoa — a de quem vai receber o acerto.
 *
 * Só volta preenchida para quem divide um espaço com ela (`profile_select`).
 * Sem chave cadastrada, volta `null` e a tela explica em vez de gerar um Pix.
 */
export function useChavePixDe(userId: Ref<string | null>) {
  const supabase = useSupabaseClient()

  return useQuery({
    queryKey: ['chave-pix', userId],
    enabled: computed(() => !!userId.value),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profile')
        .select('nome, chave_pix, chave_pix_tipo')
        .eq('id', userId.value!)
        .maybeSingle()

      if (error) throw error
      if (!data?.chave_pix) return null
      return { nome: data.nome, chave: data.chave_pix, tipo: data.chave_pix_tipo as TipoChavePix }
    },
  })
}
