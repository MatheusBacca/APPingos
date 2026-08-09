import type { MaybeRefOrGetter } from 'vue'
import type { Json } from '~/types/database.generated'
import type { ModoTransporte, Parada, ParadaParaSalvar, Roteiro, RoteiroComParadas } from '~/types/viagem'
import { useSpaceQuery, useSpaceMutation } from '~/composables/useSpaceQuery'
import { useUsuarioId } from '~/composables/useUsuarioId'

const CAMPOS = `
  id, space_id, nome, descricao, modo_transporte,
  data_inicio, data_fim, visibilidade, liberado_em,
  criado_por, created_at, updated_at
`

const CAMPOS_PARADA = 'id, ordem, google_place_id, nome, endereco, dia, anotacao'

/** Roteiro da grade: sem as paradas inteiras, só quantas são. */
export interface RoteiroNaLista extends Roteiro {
  paradas: { id: string }[]
}

/**
 * Os roteiros do espaço ativo.
 *
 * Nenhum filtro de visibilidade aqui, e isso é intencional: quem esconde um
 * roteiro secreto é a policy de RLS. Um `.neq('visibilidade', 'segredo')` neste
 * arquivo seria uma segunda regra dizendo a mesma coisa — e no dia em que as
 * duas divergissem, a do banco continuaria valendo enquanto a tela mentiria.
 */
export function useRoteiros() {
  const supabase = useSupabaseClient()

  return useSpaceQuery(['roteiros'], async (spaceId): Promise<RoteiroNaLista[]> => {
    const { data, error } = await supabase
      .from('roteiro')
      .select(`${CAMPOS}, paradas:parada(id)`)
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []) as unknown as RoteiroNaLista[]
  })
}

export function useRoteiro(id: MaybeRefOrGetter<string>) {
  const supabase = useSupabaseClient()

  return useSpaceQuery(
    computed(() => ['roteiro', toValue(id)]),
    async (): Promise<RoteiroComParadas> => {
      const { data, error } = await supabase
        .from('roteiro')
        .select(`${CAMPOS}, paradas:parada(${CAMPOS_PARADA})`)
        .eq('id', toValue(id))
        .single()

      if (error) throw error
      return data as unknown as RoteiroComParadas
    },
    { enabled: computed(() => !!toValue(id)) },
  )
}

/**
 * Os roteiros que EU já abri, neste espaço.
 *
 * O `!inner` no roteiro existe só para recortar por espaço — `roteiro_visto` não
 * tem `space_id`, e sem o recorte a chave de cache diria "deste espaço" enquanto
 * o dado seria de todos.
 */
export function useRoteirosVistos() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useSpaceQuery(
    ['roteiros', 'vistos'],
    async (spaceId): Promise<string[]> => {
      const { data, error } = await supabase
        .from('roteiro_visto')
        .select('roteiro_id, roteiro!inner(space_id)')
        .eq('roteiro.space_id', spaceId)

      if (error) throw error
      return (data ?? []).map(v => v.roteiro_id)
    },
    { enabled: computed(() => !!usuarioId.value) },
  )
}

export interface RoteiroParaSalvar {
  nome: string
  descricao: string | null
  modo_transporte: ModoTransporte
  data_inicio: string | null
  data_fim: string | null
  /** Só na criação — depois disso, quem muda visibilidade é `liberar_roteiro`. */
  secreto?: boolean
}

/**
 * Cria o roteiro e devolve o id, para a tela já navegar para ele.
 *
 * `liberado_em` não é mandado: o trigger carimba. Se o client pudesse escrevê-lo,
 * poderia criar um roteiro que já nasce "visto por ninguém e nunca novo", e o
 * aviso do painel deixaria de ser confiável.
 */
export function useCriarRoteiro() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useSpaceMutation<RoteiroParaSalvar, string>(
    async (spaceId, { secreto, ...campos }) => {
      const { data, error } = await supabase
        .from('roteiro')
        .insert({
          ...campos,
          space_id: spaceId,
          criado_por: usuarioId.value!,
          visibilidade: secreto ? 'segredo' : 'compartilhado',
        })
        .select('id')
        .single()

      if (error) throw error
      return data.id
    },
    [['roteiros']],
  )
}

export function useAtualizarRoteiro() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<{ id: string, campos: Omit<RoteiroParaSalvar, 'secreto'> }, void>(
    async (_spaceId, { id, campos }) => {
      const { error } = await supabase.from('roteiro').update(campos).eq('id', id)
      if (error) throw error
    },
    [['roteiros'], ['roteiro']],
  )
}

export function useApagarRoteiro() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<string, void>(
    async (_spaceId, id) => {
      const { error } = await supabase.from('roteiro').delete().eq('id', id)
      if (error) throw error
    },
    [['roteiros']],
  )
}

/**
 * Grava a lista inteira de paradas, na ordem em que estão na tela.
 *
 * A RPC substitui tudo e reescreve `ordem` pela posição no array — por isso a
 * tela manda a lista completa a cada mexida, e não um "moveu a parada 3 para a
 * 1". O que se vê é o que fica gravado.
 */
export function useSalvarParadas() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<{ roteiroId: string, paradas: ParadaParaSalvar[] }, number>(
    async (_spaceId, { roteiroId, paradas }) => {
      const { data, error } = await supabase.rpc('salvar_paradas', {
        p_roteiro: roteiroId,
        // A RPC recebe jsonb; o tipo gerado é `Json`, que não aceita uma
        // interface diretamente (índice de assinatura ausente).
        p_paradas: paradas as unknown as Json,
      })
      if (error) throw error
      return data ?? 0
    },
    [['roteiros'], ['roteiro']],
  )
}

export function useLiberarRoteiro() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<string, void>(
    async (_spaceId, roteiroId) => {
      const { error } = await supabase.rpc('liberar_roteiro', { p_roteiro: roteiroId })
      if (error) throw error
    },
    [['roteiros'], ['roteiro']],
  )
}

/**
 * "Já vi este" — o que apaga o selo "Novo" e a linha do painel, só para mim.
 *
 * Falha em silêncio de propósito: isto dispara ao abrir a tela, e um erro aqui
 * não tem o que dizer a quem só queria ler o roteiro. O pior caso é o selo
 * continuar aparecendo, que é o estado de antes.
 */
export function useMarcarRoteiroVisto() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<string, void>(
    async (_spaceId, roteiroId) => {
      await supabase.rpc('marcar_roteiro_visto', { p_roteiro: roteiroId })
    },
    [['roteiros', 'vistos']],
  )
}

/** As paradas de um roteiro no formato que a RPC espera. */
export function paraSalvar(paradas: Parada[]): ParadaParaSalvar[] {
  return paradas.map(p => ({
    google_place_id: p.google_place_id,
    nome: p.nome,
    endereco: p.endereco,
    dia: p.dia,
    anotacao: p.anotacao,
  }))
}
