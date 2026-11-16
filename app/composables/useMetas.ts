/**
 * Metas e aportes.
 *
 * Toda meta mora num espaço, e as consultas daqui são por espaço
 * (`useEspacoQuery`) — a meta pessoal só existe na gaveta pessoal, pela RLS de
 * membro, como as compras pessoais. Ver supabase/migrations/20261112120100_metas.sql.
 *
 * As chaves ficam sob `['space', id, 'metas', ...]`; registrar um aporte invalida
 * esse prefixo inteiro, porque o mesmo aporte muda a lista, o detalhe e a
 * projeção do mês no Planejamento.
 */
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import type { MaybeRefOrGetter } from 'vue'
import type { EstadoMeta, Meta, MetaAporte } from '~/types/meta'
import type { OrigemLancamento } from '~/types/planejamento'
import { useEspacoQuery } from '~/composables/useSpaceQuery'
import { useUsuarioId } from '~/composables/useUsuarioId'

type Espaco = MaybeRefOrGetter<string | null | undefined>

export interface AporteDoMes {
  user_id: string
  valor: number
}

/**
 * Os aportes (e resgates) que caem numa competência, em todas as metas do espaço.
 * É o que a projeção do mês subtrai — com sinal: o resgate devolve.
 */
export function useAportesDoMes(espaco: Espaco, competencia: MaybeRefOrGetter<string>) {
  const supabase = useSupabaseClient()

  return useEspacoQuery(
    espaco,
    computed(() => ['metas', 'aportes-do-mes', toValue(competencia)]),
    async (spaceId): Promise<AporteDoMes[]> => {
      const { data, error } = await supabase
        .from('meta_aporte')
        .select('user_id, valor, meta:meta!inner(space_id)')
        .eq('meta.space_id', spaceId)
        .eq('competencia', toValue(competencia))

      if (error) throw error
      return (data ?? []).map(a => ({ user_id: a.user_id, valor: Number(a.valor) }))
    },
  )
}

export interface MetaComAportes extends Meta {
  /** Do mais recente para o mais antigo. */
  aportes: MetaAporte[]
  /** Os espaços com que a meta pessoal foi compartilhada (só leitura lá). */
  compartilhamentos: string[]
  /** Quem comemorou a meta cumprida. */
  comemoracoes: string[]
}

const SELECT_META = `
  id, space_id, criado_por, titulo, valor_alvo, prazo, interesse_id, estado, cumprida_em, created_at,
  aportes:meta_aporte(id, meta_id, user_id, valor, data, competencia, origem),
  compartilhamentos:meta_compartilhamento(space_id),
  comemoracoes:meta_comemoracao(user_id)
`

type MetaCrua = Omit<MetaComAportes, 'compartilhamentos' | 'comemoracoes'> & {
  compartilhamentos: Array<{ space_id: string }> | null
  comemoracoes: Array<{ user_id: string }> | null
}

function normalizar(m: MetaCrua): MetaComAportes {
  return {
    ...m,
    estado: m.estado as EstadoMeta,
    valor_alvo: Number(m.valor_alvo),
    aportes: (m.aportes ?? [])
      .map(a => ({ ...a, valor: Number(a.valor), origem: a.origem as OrigemLancamento }))
      .sort((a, b) => b.data.localeCompare(a.data)),
    compartilhamentos: (m.compartilhamentos ?? []).map(c => c.space_id),
    comemoracoes: (m.comemoracoes ?? []).map(c => c.user_id),
  }
}

/**
 * As metas de um espaço, com os aportes de cada uma. Os aportes vêm juntos porque
 * o progresso é a soma deles, e uma meta sem o progresso não diz nada na lista.
 *
 * São as metas que MORAM no espaço (`space_id`). As emprestadas a ele por
 * compartilhamento vêm de `useMetasCompartilhadasCom`, à parte: elas são só
 * leitura, e misturá-las aqui faria toda tela que usa esta lista precisar lembrar
 * de não oferecer "Guardar" nelas.
 */
export function useMetas(espaco: Espaco) {
  const supabase = useSupabaseClient()

  return useEspacoQuery(espaco, ['metas', 'lista'], async (spaceId): Promise<MetaComAportes[]> => {
    const { data, error } = await supabase
      .from('meta')
      .select(SELECT_META)
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return ((data ?? []) as unknown as MetaCrua[]).map(normalizar)
  })
}

/**
 * As metas PESSOAIS que alguém compartilhou com este espaço — de qualquer membro,
 * inclusive as suas (a tela tira as suas, que já aparecem na gaveta pessoal).
 * A RLS (`meta_compartilhada_comigo`) é quem decide; aqui só se pergunta "quais
 * estão emprestadas a este espaço".
 */
export function useMetasCompartilhadasCom(espaco: Espaco) {
  const supabase = useSupabaseClient()

  return useEspacoQuery(espaco, ['metas', 'compartilhadas'], async (spaceId): Promise<MetaComAportes[]> => {
    const { data, error } = await supabase
      .from('meta_compartilhamento')
      .select(`meta:meta!inner(${SELECT_META})`)
      .eq('space_id', spaceId)

    if (error) throw error
    return ((data ?? []) as unknown as Array<{ meta: MetaCrua }>)
      .map(c => normalizar(c.meta))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  })
}

/** Limpa tudo o que é de metas na gaveta da meta — lista, aportes do mês, projeção. */
function invalidarMetas(queryClient: ReturnType<typeof useQueryClient>, spaceId: string) {
  return queryClient.invalidateQueries({ queryKey: ['space', spaceId, 'metas'] })
}

/** Compartilhar e comemorar mexem em mais de uma gaveta — limpa as metas de todas. */
function invalidarTodasAsMetas(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({
    predicate: q => q.queryKey[0] === 'space' && q.queryKey[2] === 'metas',
  })
}

/** Emprestar (ou deixar de emprestar) uma meta pessoal a um espaço conjunto. Só o dono. */
export function useCompartilharMeta() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ meta, spaceId, compartilhar }: {
      meta: Pick<Meta, 'id'>
      spaceId: string
      compartilhar: boolean
    }) => {
      const { error } = compartilhar
        ? await supabase.rpc('compartilhar_meta', { p_meta: meta.id, p_space: spaceId })
        : await supabase.rpc('descompartilhar_meta', { p_meta: meta.id, p_space: spaceId })
      if (error) throw error
    },
    onSuccess: () => invalidarTodasAsMetas(queryClient),
  })
}

/** "🎉" numa meta cumprida — a presença da linha é a comemoração. */
export function useComemorarMeta() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()
  const usuarioId = useUsuarioId()

  return useMutation({
    mutationFn: async ({ meta, comemorar }: { meta: Pick<Meta, 'id'>, comemorar: boolean }) => {
      if (!usuarioId.value) throw new Error('Não autenticado')
      const { error } = comemorar
        ? await supabase.from('meta_comemoracao').insert({ meta_id: meta.id, user_id: usuarioId.value })
        : await supabase.from('meta_comemoracao').delete().eq('meta_id', meta.id).eq('user_id', usuarioId.value)
      if (error) throw error
    },
    onSuccess: () => invalidarTodasAsMetas(queryClient),
  })
}

export interface NovaMeta {
  /** A gaveta: o espaço do casal ou o pessoal. */
  spaceId: string
  titulo: string
  valor_alvo: number
  prazo: string | null
  /** Veio de um interesse — a RPC marca a conversão nele na mesma transação. */
  interesseId?: string | null
}

export function useCriarMeta() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (meta: NovaMeta) => {
      const { data, error } = await supabase.rpc('criar_meta', {
        p_space: meta.spaceId,
        p_titulo: meta.titulo,
        p_valor_alvo: meta.valor_alvo,
        p_prazo: meta.prazo ?? undefined,
        p_interesse: meta.interesseId ?? undefined,
      })
      if (error) throw error
      return data as unknown as string
    },
    onSuccess: (_id, meta) => Promise.all([
      invalidarMetas(queryClient, meta.spaceId),
      // O interesse convertido sai da lista de abertos — cache único, sem espaço.
      meta.interesseId ? queryClient.invalidateQueries({ queryKey: ['interesses'] }) : null,
    ]),
  })
}

/**
 * Editar título, alvo, prazo ou estado. UPDATE direto: a policy já diz que
 * qualquer membro do espaço mexe na meta, e `cumprida_em` é carimbado pelo gatilho.
 */
export function useAtualizarMeta() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ meta, mudancas }: {
      meta: Pick<Meta, 'id' | 'space_id'>
      mudancas: Partial<Pick<Meta, 'titulo' | 'valor_alvo' | 'prazo' | 'estado'>>
    }) => {
      const { error } = await supabase.from('meta').update(mudancas).eq('id', meta.id)
      if (error) throw error
    },
    onSuccess: (_d, { meta }) => invalidarMetas(queryClient, meta.space_id),
  })
}

export function useRemoverMeta() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (meta: Pick<Meta, 'id' | 'space_id'>) => {
      const { error } = await supabase.from('meta').delete().eq('id', meta.id)
      if (error) throw error
    },
    onSuccess: (_d, meta) => invalidarMetas(queryClient, meta.space_id),
  })
}

/**
 * Guardar (valor positivo) ou resgatar (negativo). Pela RPC, que trava a meta,
 * recusa resgate maior que o guardado e cumpre a meta quando o alvo é alcançado.
 */
export function useRegistrarAporte() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ meta, valor, data }: { meta: Pick<Meta, 'id' | 'space_id'>, valor: number, data: string }) => {
      const { error } = await supabase.rpc('registrar_aporte', { p_meta: meta.id, p_valor: valor, p_data: data })
      if (error) throw error
    },
    onSuccess: (_d, { meta }) => invalidarMetas(queryClient, meta.space_id),
  })
}

/** Apagar um aporte errado. A policy só deixa apagar o próprio (ou ser admin). */
export function useRemoverAporte() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ aporte }: { aporte: Pick<MetaAporte, 'id'>, meta: Pick<Meta, 'space_id'> }) => {
      const { error } = await supabase.from('meta_aporte').delete().eq('id', aporte.id)
      if (error) throw error
    },
    onSuccess: (_d, { meta }) => invalidarMetas(queryClient, meta.space_id),
  })
}
