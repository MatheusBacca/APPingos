import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { nomeDoBanco } from '~/lib/instituicoes'
import type { Caixinha, PosicaoDoBanco } from '~/lib/investimentos'

/**
 * As caixinhas dos espaços de quem está logado — as pessoais e as dos espaços de
 * casal (a RLS é de membro, como as metas). A tela escolhe quais mostrar.
 */
const CHAVE = 'caixinhas'

export function useCaixinhas() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: [CHAVE, usuarioId],
    enabled: computed(() => !!usuarioId.value),
    queryFn: async (): Promise<Caixinha[]> => {
      const { data, error } = await supabase
        .from('caixinha')
        .select(`
          id, space_id, criado_por, nome, instituicao, meta_id, arquivada,
          meta:meta(id, titulo, valor_alvo),
          movimentos:caixinha_movimento(id, valor, data, transacao_id, meta_aporte_id, user_id)
        `)
        .order('criado_em')
      if (error) throw error
      return ((data ?? []) as unknown as Caixinha[]).map(c => ({
        ...c,
        meta: c.meta ? { ...c.meta, valor_alvo: Number(c.meta.valor_alvo) } : null,
        movimentos: c.movimentos.map(m => ({ ...m, valor: Number(m.valor) })),
      }))
    },
  })
}

export interface NovaCaixinha {
  id?: string
  space_id: string
  nome: string
  instituicao: string | null
  meta_id: string | null
}

export function useSalvarCaixinha() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (c: NovaCaixinha): Promise<string> => {
      const campos = { space_id: c.space_id, nome: c.nome.trim(), instituicao: c.instituicao, meta_id: c.meta_id }
      const { data, error } = c.id
        ? await supabase.from('caixinha').update(campos).eq('id', c.id).select('id').single()
        : await supabase.from('caixinha').insert(campos).select('id').single()
      if (error) throw error
      return data.id
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CHAVE] }),
  })
}

export function useRemoverCaixinha() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('caixinha').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CHAVE] }),
  })
}

/** Aplicação (+) ou resgate (−) à mão; com meta ligada, vira aporte nela também. */
export function useRegistrarMovimentoCaixinha() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (v: { caixinha: string, valor: number, data: string }) => {
      const { error } = await supabase.rpc('registrar_movimento_caixinha', {
        p_caixinha: v.caixinha,
        p_valor: v.valor,
        p_data: v.data,
      })
      if (error) throw error
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: [CHAVE] }),
      queryClient.invalidateQueries({ predicate: q => q.queryKey[0] === 'space' }),
      queryClient.invalidateQueries({ queryKey: ['metas'] }),
    ]),
  })
}

/**
 * As posições que a Pluggy traz dos bancos conectados (`investimento`). São da
 * pessoa: a RLS devolve só as suas.
 */
export function useInvestimentosDosBancos() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: ['investimentos-dos-bancos', usuarioId],
    enabled: computed(() => !!usuarioId.value),
    queryFn: async (): Promise<PosicaoDoBanco[]> => {
      const { data, error } = await supabase
        .from('investimento')
        .select(`
          id, nome, subtipo, saldo, valor_original, vencimento, situacao,
          conexao:conexao_bancaria(banco, instituicao, contas:conta_bancaria(nome, tipo))
        `)
      if (error) throw error
      type Linha = Omit<PosicaoDoBanco, 'banco'> & {
        conexao: { banco: string, instituicao: string | null, contas: Array<{ nome: string, tipo: string }> } | null
      }
      return ((data ?? []) as unknown as Linha[]).map(({ conexao, ...p }) => ({
        ...p,
        saldo: p.saldo === null ? null : Number(p.saldo),
        valor_original: p.valor_original === null ? null : Number(p.valor_original),
        banco: nomeDoBanco(conexao, conexao?.contas.find(c => c.tipo === 'conta')?.nome ?? conexao?.banco ?? 'Banco'),
      }))
    },
  })
}
