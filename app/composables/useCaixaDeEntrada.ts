import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { MaybeRefOrGetter } from 'vue'
import type { Json } from '~/types/database.generated'
import { nomeDeExibicao } from '~/types/database.types'
import type { Participante } from '~/types/orcamento'
import type { CompraCandidata, TransacaoDaCaixa } from '~/lib/caixa-de-entrada'
import type { PlanoDaCompra } from '~/lib/importacao-bancaria'
import { somarDias } from '~/lib/datas'
import { JANELA_JA_LANCEI_DIAS } from '~/lib/caixa-de-entrada'
import { useEspacoQuery } from '~/composables/useSpaceQuery'
import { useUsuarioId } from '~/composables/useUsuarioId'

/**
 * A caixa de entrada do extrato (fase 5 do plano de Open Finance).
 *
 * Tudo aqui é da pessoa logada: a RLS de `transacao_bancaria` é
 * `user_id = auth.uid()`, e por isso as chaves de cache não são de espaço. O que
 * vira compra passa a ser do espaço — e é esse cache que se invalida ao
 * classificar.
 */
const CHAVE = 'caixa-de-entrada'

const COLUNAS = `
  id, conta_id, provider_id, pluggy_id, descricao, valor, sentido, data, competencia,
  pendente, parcela_numero, parcelas_total, valor_total_compra, data_compra, fatura_id,
  chave_compra, contraparte_nome, contraparte_documento, metodo, categoria_pluggy,
  motivo_exclusao, destino, compra_id, classificada_em
`

export type LinhaDaCaixa = TransacaoDaCaixa & {
  conta: { nome: string, tipo: 'conta' | 'cartao' } | null
}

export type LinhaClassificada = LinhaDaCaixa & {
  compra: { id: string, space_id: string, descricao: string } | null
}

/** O que está esperando um destino — as mais novas primeiro. */
export function useTransacoesDaCaixa() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: [CHAVE, usuarioId, 'pendentes'],
    enabled: computed(() => !!usuarioId.value),
    queryFn: async (): Promise<LinhaDaCaixa[]> => {
      const { data, error } = await supabase
        .from('transacao_bancaria')
        .select(`${COLUNAS}, conta:conta_bancaria(nome, tipo)`)
        .is('destino', null)
        .order('data', { ascending: false })
        .limit(300)

      if (error) throw error
      return (data ?? []) as unknown as LinhaDaCaixa[]
    },
  })
}

/**
 * O que foi classificado nos últimos 30 dias — inclusive pela regra de contagem
 * dupla e pela entrada automática do cartão designado. É daqui que se desfaz ou
 * se muda de gaveta.
 */
export function useClassificadasRecentes() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: [CHAVE, usuarioId, 'classificadas'],
    enabled: computed(() => !!usuarioId.value),
    queryFn: async (): Promise<LinhaClassificada[]> => {
      const desde = new Date(Date.now() - 30 * 86_400_000).toISOString()
      const { data, error } = await supabase
        .from('transacao_bancaria')
        .select(`${COLUNAS}, conta:conta_bancaria(nome, tipo), compra:compra(id, space_id, descricao)`)
        .not('destino', 'is', null)
        .gte('classificada_em', desde)
        .order('classificada_em', { ascending: false })
        .limit(60)

      if (error) throw error
      return (data ?? []) as unknown as LinhaClassificada[]
    },
  })
}

/** Os membros de um espaço qualquer (não só do ativo) — para o rateio do destino. */
export function useMembrosDoEspaco(espaco: MaybeRefOrGetter<string | null>) {
  const supabase = useSupabaseClient()

  return useEspacoQuery(espaco, ['caixa', 'membros'], async (spaceId) => {
    const { data, error } = await supabase
      .from('membership')
      .select('user_id, profile:profile(nome, apelido)')
      .eq('space_id', spaceId)

    if (error) throw error
    return ((data ?? []) as unknown as Array<{ user_id: string, profile: { nome: string, apelido: string | null } | null }>)
      .map(m => ({ user_id: m.user_id, exibicao: nomeDeExibicao(m.profile ?? { nome: 'Sem nome' }) }))
  })
}

/** Os acertos de um espaço qualquer — para o aviso de mês acertado. */
export function useAcertosDoEspaco(espaco: MaybeRefOrGetter<string | null>) {
  const supabase = useSupabaseClient()

  return useEspacoQuery(espaco, ['orcamento', 'acertos'], async (spaceId) => {
    const { data, error } = await supabase
      .from('acerto_mes')
      .select('competencia')
      .eq('space_id', spaceId)

    if (error) throw error
    return (data ?? []) as Array<{ competencia: string }>
  })
}

/**
 * "Já lancei": compras de mesmo valor perto da data, em qualquer espaço da
 * pessoa (a RLS de `compra` já limita aos dela). O filtro fino é
 * `candidatasJaLancei`.
 */
export function useComprasCandidatas(plano: MaybeRefOrGetter<Pick<PlanoDaCompra, 'valor_total' | 'data_compra'> | null>) {
  const supabase = useSupabaseClient()

  return useQuery({
    queryKey: computed(() => [CHAVE, 'candidatas', toValue(plano)?.valor_total, toValue(plano)?.data_compra]),
    enabled: computed(() => !!toValue(plano)),
    queryFn: async (): Promise<CompraCandidata[]> => {
      const p = toValue(plano)!
      const { data, error } = await supabase
        .from('compra')
        .select('id, space_id, descricao, valor_total, data_compra')
        .eq('valor_total', p.valor_total)
        .gte('data_compra', somarDias(p.data_compra, -JANELA_JA_LANCEI_DIAS))
        .lte('data_compra', somarDias(p.data_compra, JANELA_JA_LANCEI_DIAS))
        .limit(20)

      if (error) throw error
      return (data ?? []).map(c => ({ ...c, valor_total: Number(c.valor_total) }))
    },
  })
}

/** As metas ativas de todos os espaços da pessoa — o destino "Aporte em meta". */
export function useMetasAtivas() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: [CHAVE, usuarioId, 'metas'],
    enabled: computed(() => !!usuarioId.value),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meta')
        .select('id, titulo, space_id, valor_alvo')
        .eq('estado', 'ativa')
        .order('titulo')

      if (error) throw error
      return data ?? []
    },
  })
}

export type Classificacao =
  | {
    tipo: 'compra'
    transacao: string
    space: string
    descricao: string
    plano: PlanoDaCompra
    participantes: Participante[]
    categoria: string | null
  }
  | { tipo: 'vincular', transacao: string, compra: string }
  | { tipo: 'ignorar', transacoes: string[] }
  | { tipo: 'renda', transacao: string, competencia: string }
  | { tipo: 'aporte', transacao: string, meta: string }
  | { tipo: 'devolver', transacao: string }
  | { tipo: 'reclassificar', compra: string, space: string, participantes: Participante[] }
  | { tipo: 'acerto', transacao: string, space: string, competencia: string }

/**
 * Um destino para uma transação — cada um é uma RPC da migration
 * 20261112140000, menos "Ignorar", que é um UPDATE na própria linha (o
 * privilégio de coluna deixa a dona mexer só na classificação).
 */
export function useClassificar() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (c: Classificacao) => {
      const resultado = await (() => {
        switch (c.tipo) {
          case 'compra':
            return supabase.rpc('classificar_compra', {
              p_transacao: c.transacao,
              p_space: c.space,
              p_descricao: c.descricao,
              p_valor_total: c.plano.valor_total,
              p_data_compra: c.plano.data_compra,
              p_competencia_inicial: c.plano.competencia_inicial,
              p_parcelas: c.plano.parcelas,
              p_participantes: c.participantes as unknown as Json,
              ...(c.categoria ? { p_categoria_nome: c.categoria } : {}),
            })
          case 'vincular':
            return supabase.rpc('vincular_transacao', { p_transacao: c.transacao, p_compra: c.compra })
          case 'ignorar':
            return supabase
              .from('transacao_bancaria')
              .update({ destino: 'ignorada', classificada_em: new Date().toISOString() })
              .in('id', c.transacoes)
          case 'renda':
            return supabase.rpc('classificar_renda', { p_transacao: c.transacao, p_competencia: c.competencia })
          case 'aporte':
            return supabase.rpc('classificar_aporte', { p_transacao: c.transacao, p_meta: c.meta })
          case 'devolver':
            return supabase.rpc('devolver_para_caixa', { p_transacao: c.transacao })
          case 'acerto':
            return supabase.rpc('conciliar_acerto', {
              p_transacao: c.transacao,
              p_space: c.space,
              p_competencia: c.competencia,
            })
          case 'reclassificar':
            return supabase.rpc('reclassificar_compra', {
              p_compra: c.compra,
              p_space_destino: c.space,
              p_participantes: c.participantes as unknown as Json,
            })
        }
      })()

      if (resultado.error) throw resultado.error
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: [CHAVE] }),
      // O que virou compra, salário ou aporte aparece nas telas de espaço, de
      // renda e de metas — que são cache de outras chaves.
      queryClient.invalidateQueries({ predicate: q => q.queryKey[0] === 'space' }),
      queryClient.invalidateQueries({ queryKey: ['renda'] }),
    ]),
  })
}
