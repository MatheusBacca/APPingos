import type { MaybeRefOrGetter } from 'vue'
import { partesDaData, somarMeses, ultimoDiaDoMes } from '@/lib/datas'
import { parteDe } from '~/types/orcamento'
import type { CorCategoria } from '~/types/database.types'
import type { Json } from '~/types/database.generated'
import type { Categoria, CompraDoMes, NovaCompra, Participante } from '~/types/orcamento'
import { useSpaceQuery, useSpaceMutation } from '~/composables/useSpaceQuery'
import { useUsuarioId } from '~/composables/useUsuarioId'

const SELECT_COMPRA = `
  id, descricao, valor_total, data_compra, competencia_inicial, parcelas,
  pago_por, registrado_por,
  categoria:categoria(id, nome, cor),
  participantes:compra_participante(user_id, peso, informado_como)
`

/**
 * As compras que caem numa competência, já com a parcela daquele mês.
 *
 * São duas consultas de propósito. A view `parcela_mensal` sabe qual parcela e
 * quanto — é lá que vive o arredondamento —, mas o PostgREST não expõe embed
 * confiável de uma view para a tabela de origem. Buscar as parcelas do mês e
 * depois as compras daqueles ids mantém a matemática só no SQL, sem duplicar a
 * regra de arredondamento aqui em TypeScript.
 */
export function useComprasDoMes(competencia: MaybeRefOrGetter<string>) {
  const supabase = useSupabaseClient()

  return useSpaceQuery(
    computed(() => ['orcamento', 'mes', toValue(competencia)]),
    async (spaceId): Promise<CompraDoMes[]> => {
      const mes = toValue(competencia)

      const { data: parcelas, error: erroParcelas } = await supabase
        .from('parcela_mensal')
        .select('compra_id, numero, total, valor')
        .eq('space_id', spaceId)
        .eq('competencia', mes)

      if (erroParcelas) throw erroParcelas
      if (!parcelas?.length) return []

      const porCompra = new Map(
        parcelas
          .filter(p => p.compra_id)
          .map(p => [p.compra_id as string, { numero: p.numero ?? 1, valor: Number(p.valor ?? 0) }]),
      )

      const { data: compras, error: erroCompras } = await supabase
        .from('compra')
        .select(SELECT_COMPRA)
        .in('id', [...porCompra.keys()])

      if (erroCompras) throw erroCompras

      return ((compras ?? []) as unknown as Array<Omit<CompraDoMes, 'numero' | 'valor'> & {
        categoria: Categoria | null
        participantes: Participante[]
      }>)
        .map(c => ({
          ...c,
          valor_total: Number(c.valor_total),
          numero: porCompra.get(c.id)?.numero ?? 1,
          valor: porCompra.get(c.id)?.valor ?? 0,
        }))
        // A data da compra é a ordem que faz sentido para conferir com o extrato.
        .sort((a, b) => b.data_compra.localeCompare(a.data_compra))
    },
  )
}

export interface PontoMensal {
  competencia: string
  total: number
  /** Sua fatia daquele mês, pelo rateio. */
  minhaParte: number
}

/**
 * Série por competência, numa janela em torno do mês visível.
 *
 * A janela é limitada de propósito: sem ela, uma compra em 120x arrastaria dez
 * anos de barras para dentro do gráfico. Os meses futuros só têm o que já está
 * comprometido por parcelas em andamento — é essa a leitura da faixa clara.
 */
export function useSerieMensal(
  competencia: MaybeRefOrGetter<string>,
  janela: { antes: number, depois: number } = { antes: 5, depois: 6 },
) {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useSpaceQuery(
    computed(() => ['orcamento', 'serie', toValue(competencia)]),
    async (spaceId): Promise<PontoMensal[]> => {
      const centro = toValue(competencia)
      const inicio = somarMeses(centro, -janela.antes)
      const fim = somarMeses(centro, janela.depois)

      const { data: parcelas, error } = await supabase
        .from('parcela_mensal')
        .select('compra_id, competencia, valor')
        .eq('space_id', spaceId)
        .gte('competencia', inicio)
        .lte('competencia', fim)

      if (error) throw error

      // O rateio não está na view — só as compras envolvidas trazem os pesos.
      const ids = [...new Set((parcelas ?? []).map(p => p.compra_id).filter(Boolean))] as string[]
      const pesos = new Map<string, Participante[]>()

      if (ids.length) {
        const { data: compras, error: erroCompras } = await supabase
          .from('compra')
          .select('id, participantes:compra_participante(user_id, peso, informado_como)')
          .in('id', ids)

        if (erroCompras) throw erroCompras

        for (const c of (compras ?? []) as unknown as Array<{ id: string, participantes: Participante[] }>) {
          pesos.set(c.id, c.participantes ?? [])
        }
      }

      const acumulado = new Map<string, PontoMensal>()
      for (let i = -janela.antes; i <= janela.depois; i++) {
        const mes = somarMeses(centro, i)
        acumulado.set(mes, { competencia: mes, total: 0, minhaParte: 0 })
      }

      for (const parcela of parcelas ?? []) {
        const ponto = acumulado.get(parcela.competencia as string)
        if (!ponto) continue
        const valor = Number(parcela.valor ?? 0)
        ponto.total += valor
        ponto.minhaParte += parteDe(pesos.get(parcela.compra_id as string) ?? [], usuarioId.value ?? '', valor)
      }

      return [...acumulado.values()]
    },
  )
}

export interface PontoSemanal {
  chave: string
  inicio: string
  fim: string
  total: number
}

/**
 * Gasto por semana do mês, pela DATA DA COMPRA — não pela competência.
 *
 * A distinção é o ponto do gráfico: uma compra de 28/07 em 6x aparece inteira na
 * semana de 28/07 aqui, e espalhada por seis meses no gráfico de competência.
 * Um responde "quanto compramos nesta semana", o outro "quanto vai pesar em
 * cada mês".
 *
 * Blocos por dia do mês (1–7, 8–14, …) em vez de semana ISO: uma semana ISO
 * atravessa a virada do mês e traria gasto de fora do recorte visível.
 */
export function useSerieSemanal(competencia: MaybeRefOrGetter<string>) {
  const supabase = useSupabaseClient()

  return useSpaceQuery(
    computed(() => ['orcamento', 'semanal', toValue(competencia)]),
    async (spaceId): Promise<PontoSemanal[]> => {
      const mes = toValue(competencia)
      const fimDoMes = ultimoDiaDoMes(mes)

      const { data, error } = await supabase
        .from('compra')
        .select('valor_total, data_compra')
        .eq('space_id', spaceId)
        .gte('data_compra', mes)
        .lte('data_compra', fimDoMes)

      if (error) throw error

      const ultimoDia = partesDaData(fimDoMes).dia
      const blocos: PontoSemanal[] = []
      for (let inicio = 1; inicio <= ultimoDia; inicio += 7) {
        const fim = Math.min(inicio + 6, ultimoDia)
        blocos.push({
          chave: `${mes}-s${inicio}`,
          inicio: `${mes.slice(0, 8)}${String(inicio).padStart(2, '0')}`,
          fim: `${mes.slice(0, 8)}${String(fim).padStart(2, '0')}`,
          total: 0,
        })
      }

      for (const compra of data ?? []) {
        const dia = partesDaData(compra.data_compra as string).dia
        const bloco = blocos[Math.floor((dia - 1) / 7)]
        if (bloco) bloco.total += Number(compra.valor_total)
      }

      return blocos
    },
  )
}

export interface AcertoDoMes {
  /** Âncora do mês, YYYY-MM-01. */
  competencia: string
  pago_em: string
  pago_por: string
}

/**
 * Os meses já acertados no espaço — presença da linha é o "pago".
 *
 * Uma consulta só, sem filtro de competência: são doze linhas por ano, e uma
 * entrada de cache única serve tanto à tela de Orçamentos (que navega meses)
 * quanto ao painel de resumos. Filtrar por mês criaria uma chave por mês
 * visitado, e o painel refaria a consulta a cada navegação.
 */
export function useAcertos() {
  const supabase = useSupabaseClient()

  return useSpaceQuery(['orcamento', 'acertos'], async (spaceId): Promise<AcertoDoMes[]> => {
    const { data, error } = await supabase
      .from('acerto_mes')
      .select('competencia, pago_em, pago_por')
      .eq('space_id', spaceId)

    if (error) throw error
    return (data ?? []) as unknown as AcertoDoMes[]
  })
}

/**
 * Marcar ou desmarcar o acerto de um mês.
 *
 * Marcar é inserir, desmarcar é apagar — não há update, porque a única coisa
 * que um update poderia mudar é quem marcou e quando, e reescrever a autoria de
 * um fato já registrado não é uma operação que a tela deva oferecer.
 */
export function useMarcarAcerto() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useSpaceMutation<{ competencia: string, pago: boolean }, void>(
    async (spaceId, { competencia, pago }) => {
      if (pago) {
        const { error } = await supabase
          .from('acerto_mes')
          .insert({ space_id: spaceId, competencia, pago_por: usuarioId.value! })
        if (error) throw error
        return
      }

      const { error } = await supabase
        .from('acerto_mes')
        .delete()
        .eq('space_id', spaceId)
        .eq('competencia', competencia)
      if (error) throw error
    },
    [['orcamento', 'acertos']],
  )
}

/** Categorias já usadas no espaço — a lista que o campo oferece ao digitar. */
export function useCategorias() {
  const supabase = useSupabaseClient()

  return useSpaceQuery(['orcamento', 'categorias'], async (spaceId): Promise<Categoria[]> => {
    const { data, error } = await supabase
      .from('categoria')
      .select('id, nome, cor')
      .eq('space_id', spaceId)
      .order('nome')

    if (error) throw error
    return (data ?? []) as unknown as Categoria[]
  })
}

/**
 * Compra + rateio + categoria numa transação só.
 *
 * Via RPC, e não por três inserts: uma compra que gravasse sem participantes
 * dividiria por zero no rateio, em silêncio. A categoria é resolvida pelo nome
 * dentro da mesma chamada — é o que faz "Mercado" e "mercado" caírem na mesma
 * linha, independentemente de a pessoa ter escolhido da lista ou só digitado.
 */
export function useRegistrarCompra() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<NovaCompra, string>(
    async (spaceId, compra) => {
      const { data, error } = await supabase.rpc('registrar_compra', {
        p_space: spaceId,
        p_descricao: compra.descricao,
        p_valor_total: compra.valor_total,
        p_data_compra: compra.data_compra,
        p_competencia_inicial: compra.competencia_inicial,
        p_parcelas: compra.parcelas,
        p_pago_por: compra.pago_por,
        p_participantes: compra.participantes as unknown as Json,
        p_categoria_nome: compra.categoria_nome ?? undefined,
        p_categoria_cor: compra.categoria_cor ?? undefined,
      })
      if (error) throw error
      return data as unknown as string
    },
    [['orcamento']],
  )
}

/**
 * Editar uma compra, também numa transação só.
 *
 * Mudar `competencia_inicial` não exige nada além disto: as parcelas são
 * derivadas na view, então reexpandem sozinhas. Não há linha antiga para
 * consertar — foi para isso que o modelo evitou materializar parcela.
 */
export function useAtualizarCompra() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<NovaCompra & { id: string }, void>(
    async (_spaceId, compra) => {
      const { error } = await supabase.rpc('atualizar_compra', {
        p_compra: compra.id,
        p_descricao: compra.descricao,
        p_valor_total: compra.valor_total,
        p_data_compra: compra.data_compra,
        p_competencia_inicial: compra.competencia_inicial,
        p_parcelas: compra.parcelas,
        p_pago_por: compra.pago_por,
        p_participantes: compra.participantes as unknown as Json,
        p_categoria_nome: compra.categoria_nome ?? undefined,
        p_categoria_cor: compra.categoria_cor ?? undefined,
      })
      if (error) throw error
    },
    [['orcamento']],
  )
}

export function useRemoverCompra() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<string, void>(
    async (_spaceId, compraId) => {
      const { error } = await supabase.from('compra').delete().eq('id', compraId)
      if (error) throw error
    },
    [['orcamento']],
  )
}

/** Trocar a cor de uma categoria que já existe. */
export function useDefinirCorCategoria() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<{ id: string, cor: CorCategoria }, void>(
    async (_spaceId, { id, cor }) => {
      const { error } = await supabase.from('categoria').update({ cor }).eq('id', id)
      if (error) throw error
    },
    [['orcamento']],
  )
}
