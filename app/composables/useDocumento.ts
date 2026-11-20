import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { nomeDeExibicao } from '~/types/database.types'
import type { PessoaDoApp } from '~/lib/contrapartes'

/**
 * O CPF de quem está logado (`documento_pessoal`, migration 20261121110000).
 *
 * Só a dona lê: a RLS da tabela é `user_id = auth.uid()`. Quem divide um espaço
 * com ela nunca vê o número — vê só o efeito, o Pix dela reconhecido no extrato
 * (`useContrapartes`).
 */
export function useMeuCpf() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: ['meu-cpf', usuarioId],
    enabled: computed(() => !!usuarioId.value),
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('documento_pessoal')
        .select('cpf')
        .eq('user_id', usuarioId.value!)
        .maybeSingle()
      if (error) throw error
      return data?.cpf ?? null
    },
  })
}

/** Grava (ou apaga, com `null`) o CPF. Quem chama já validou (`cpfValido`). */
export function useSalvarCpf() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()
  const usuarioId = useUsuarioId()

  return useMutation({
    mutationFn: async (cpf: string | null) => {
      if (!usuarioId.value) throw new Error('Não autenticado')
      const { error } = cpf
        ? await supabase
            .from('documento_pessoal')
            .upsert({ user_id: usuarioId.value, cpf, atualizado_em: new Date().toISOString() }, { onConflict: 'user_id' })
        : await supabase.from('documento_pessoal').delete().eq('user_id', usuarioId.value)
      if (error) {
        // `unique (cpf)`: o mesmo CPF já está em outra conta do app.
        if (error.code === '23505') throw new Error('Este CPF já está cadastrado em outra conta do APPingos.')
        throw error
      }
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['meu-cpf'] }),
      queryClient.invalidateQueries({ queryKey: ['contrapartes'] }),
    ]),
  })
}

/**
 * Todas as pessoas dos meus espaços (eu incluída), com o nome de exibição. A
 * contraparte de um Pix pode ser de qualquer espaço em comum, não só do ativo.
 */
export function usePessoasDosMeusEspacos() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: ['pessoas-dos-meus-espacos', usuarioId],
    enabled: computed(() => !!usuarioId.value),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PessoaDoApp[]> => {
      const { data, error } = await supabase
        .from('membership')
        .select('user_id, profile:profile(nome, apelido)')
      if (error) throw error
      const vistas = new Map<string, PessoaDoApp>()
      for (const m of (data ?? []) as unknown as Array<{ user_id: string, profile: { nome: string, apelido: string | null } | null }>) {
        if (!m.profile || vistas.has(m.user_id)) continue
        vistas.set(m.user_id, { user_id: m.user_id, exibicao: nomeDeExibicao(m.profile) })
      }
      return [...vistas.values()]
    },
  })
}

/**
 * Quem é quem nos Pix do extrato: para cada documento de contraparte que
 * aparece nas MINHAS transações, o membro de um espaço em comum que tem aquele
 * CPF. A RPC nunca devolve o CPF de ninguém — só o `user_id` de um documento que
 * já está no meu extrato.
 */
export function useContrapartes() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: ['contrapartes', usuarioId],
    enabled: computed(() => !!usuarioId.value),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase.rpc('contrapartes_reconhecidas')
      if (error) throw error
      return new Map((data ?? []).map(r => [r.documento, r.user_id]))
    },
  })
}
