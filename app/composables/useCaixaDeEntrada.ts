import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { MaybeRefOrGetter } from 'vue'
import type { Json } from '~/types/database.generated'
import { nomeDeExibicao } from '~/types/database.types'
import type { Participante } from '~/types/orcamento'
import type { CompraCandidata, TransacaoDaCaixa } from '~/lib/caixa-de-entrada'
import type { PlanoDaCompra } from '~/lib/importacao-bancaria'
import type { DestinoDaRegra, RegraAprendida } from '~/lib/auto-tag'
import { somarDias } from '~/lib/datas'
import { JANELA_JA_LANCEI_DIAS } from '~/lib/caixa-de-entrada'
import { useEspacoQuery } from '~/composables/useSpaceQuery'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'

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
  categoria_pluggy_id, estabelecimento_nome, estabelecimento_cnpj,
  motivo_exclusao, destino, compra_id, classificada_em
`

export type LinhaDaCaixa = TransacaoDaCaixa & {
  /**
   * O número e o banco dão o "Itaú •••• 1234" da linha, e o filtro por cartão.
   * `destino` e `space_id` dizem se o cartão é do casal — e de qual espaço —,
   * para o Chico Moedas mostrar só o que é dos cartões daquele espaço.
   */
  conta: {
    nome: string
    tipo: 'conta' | 'cartao'
    numero?: string | null
    destino?: 'casal' | 'pessoal' | 'perguntar'
    space_id?: string | null
    conexao?: { banco: string } | null
  } | null
}

/**
 * Quantas linhas cada ida ao banco traz. É o teto padrão do PostgREST (`max-rows`
 * do Supabase): pedir mais devolve 1000 do mesmo jeito, e o laço acharia que
 * acabou.
 */
const PAGINA_DO_BANCO = 1000

export type LinhaClassificada = LinhaDaCaixa & {
  compra: { id: string, space_id: string, descricao: string } | null
}

/**
 * O que está esperando um destino — TUDO, as mais novas primeiro.
 *
 * Inteiro, e não uma página por mês no banco: as parcelas de uma compra viram
 * uma linha só (`itensDaCaixa`), e elas podem ter datas em meses diferentes —
 * cortar pela data no banco partiria a compra em duas metades, uma em cada
 * página. A paginação da tela é por mês, sobre a lista já agrupada.
 *
 * Já foi `.limit(300)`, e com 448 linhas paradas a caixa escondia tudo de antes
 * de 13/09 sem avisar. Agora busca em páginas até a última vir incompleta; o
 * `id` no fim da ordem deixa o corte entre páginas estável quando várias linhas
 * têm a mesma data.
 */
export function useTransacoesDaCaixa() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: [CHAVE, usuarioId, 'pendentes'],
    enabled: computed(() => !!usuarioId.value),
    queryFn: async (): Promise<LinhaDaCaixa[]> => {
      const linhas: LinhaDaCaixa[] = []
      for (let desde = 0; ; desde += PAGINA_DO_BANCO) {
        const { data, error } = await supabase
          .from('transacao_bancaria')
          .select(`${COLUNAS}, conta:conta_bancaria(nome, tipo, numero, destino, space_id, conexao:conexao_bancaria(banco))`)
          .is('destino', null)
          .order('data', { ascending: false })
          .order('id')
          .range(desde, desde + PAGINA_DO_BANCO - 1)

        if (error) throw error
        const pagina = (data ?? []) as unknown as LinhaDaCaixa[]
        linhas.push(...pagina)
        if (pagina.length < PAGINA_DO_BANCO) return linhas
      }
    },
  })
}

/**
 * Quantas compras dos cartões do casal esperam destino, por pessoa, numa
 * competência — a de cada membro, não só a sua. Só a contagem: a lista
 * continua sendo de quem é o extrato (RPC `pendencias_do_espaco`).
 */
export function usePendenciasDoEspaco(espaco: MaybeRefOrGetter<string | null>, competencia: MaybeRefOrGetter<string>) {
  const supabase = useSupabaseClient()

  return useEspacoQuery(espaco, computed(() => ['caixa', 'pendencias', toValue(competencia)]), async (spaceId) => {
    const { data, error } = await supabase.rpc('pendencias_do_espaco', {
      p_space: spaceId,
      p_competencia: toValue(competencia),
    })

    if (error) throw error
    return (data ?? []) as Array<{ user_id: string, quantidade: number }>
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

/**
 * As metas ativas de todos os espaços da pessoa — o destino "Aporte em meta".
 *
 * O filtro por espaço não é redundante com a RLS. Desde a meta pessoal
 * compartilhável, a policy de `meta` também devolve a meta pessoal que o OUTRO
 * membro emprestou a um espaço em comum — legível, mas não aportável (a policy de
 * `meta_aporte` exige ser membro do espaço da meta). Sem o filtro, a caixa de
 * entrada ofereceria um destino cujo aporte a RLS recusa.
 */
export function useMetasAtivas() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()
  const store = useSpaceStore()
  const meusEspacos = computed(() => store.espacos.map(e => e.id))

  return useQuery({
    queryKey: [CHAVE, usuarioId, 'metas', meusEspacos],
    enabled: computed(() => !!usuarioId.value && meusEspacos.value.length > 0),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meta')
        .select('id, titulo, space_id, valor_alvo')
        .eq('estado', 'ativa')
        .in('space_id', meusEspacos.value)
        .order('titulo')

      if (error) throw error
      return data ?? []
    },
  })
}

/**
 * O que a classificação ensina ao auto-tag (`aprender_classificacao`): "da
 * próxima vez que vier deste estabelecimento, sugira isto".
 */
export interface Aprendizado {
  chave: string
  rotulo: string
  destino: DestinoDaRegra
  categoria: string | null
}

export type Classificacao = (
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
) & {
  /** Só Compartilhada, Pessoal e Ignorar ensinam — os outros destinos não são "deste estabelecimento". */
  aprender?: Aprendizado
}

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
      // `classificar_compra` devolve o id da compra criada — é o que o "Desfazer" apaga.
      const criada = c.tipo === 'compra' ? (resultado.data as unknown as string | null) : null

      /*
       * Aprender vem DEPOIS de classificar, e falhar aqui não desfaz nada: a
       * transação já tem destino, e uma regra a menos só quer dizer que a
       * próxima sugestão vem da marca ou da Pluggy. Fica no mutationFn (e não
       * num efeito à parte) para o `onSuccess` já recarregar as regras novas.
       */
      if (c.aprender?.chave.trim()) {
        try {
          const { error } = await supabase.rpc('aprender_classificacao', {
            p_chave: c.aprender.chave,
            p_rotulo: c.aprender.rotulo,
            p_destino: c.aprender.destino,
            ...(c.aprender.categoria ? { p_categoria_nome: c.aprender.categoria } : {}),
          })
          if (error) throw error
        }
        catch (e) {
          console.warn('[auto-tag] não deu para aprender a classificação', e)
        }
      }

      return criada
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: [CHAVE] }),
      // O que virou compra, salário ou aporte aparece nas telas de espaço, de
      // renda e de metas — que são cache de outras chaves.
      queryClient.invalidateQueries({ predicate: q => q.queryKey[0] === 'space' }),
      queryClient.invalidateQueries({ queryKey: ['renda'] }),
      queryClient.invalidateQueries({ queryKey: ['metas'] }),
    ]),
  })
}

// ---------------------------------------------------------------------------
// Regras aprendidas (auto-tag)
// ---------------------------------------------------------------------------

export type RegraClassificacao = RegraAprendida & { id: string, ultima_vez: string }

/**
 * O que o app aprendeu de cada estabelecimento — da pessoa logada (RLS
 * `user_id = auth.uid()`). Debaixo da chave da caixa: classificar invalida a
 * caixa inteira, e é isso que traz a regra que acabou de ser aprendida.
 */
export function useRegrasClassificacao() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: [CHAVE, usuarioId, 'regras'],
    enabled: computed(() => !!usuarioId.value),
    queryFn: async (): Promise<RegraClassificacao[]> => {
      const { data, error } = await supabase
        .from('regra_classificacao')
        .select('id, chave, rotulo, destino, categoria_nome, vezes, automatica, ultima_vez')
        .order('ultima_vez', { ascending: false })
        .limit(1000)

      if (error) throw error
      return (data ?? []) as RegraClassificacao[]
    },
  })
}

/** Ligar ou desligar "Classificar sozinha" — o check do banco só aceita no pessoal. */
export function useAutomatizarRegra() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, automatica }: { id: string, automatica: boolean }) => {
      const { error } = await supabase.from('regra_classificacao').update({ automatica }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CHAVE] }),
  })
}

/** Esquecer uma regra: a próxima transação daquele estabelecimento volta a vir sem sugestão aprendida. */
export function useApagarRegra() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('regra_classificacao').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CHAVE] }),
  })
}
