import { useQueryClient } from '@tanstack/vue-query'
import type { MaybeRefOrGetter } from 'vue'
import type { ItemDoEspaco, ItemParaAdicionar, StatusItem, TipoMidia } from '~/types/catalogo'
import type { Json } from '~/types/database.generated'
import { useSpaceQuery, useSpaceMutation } from '~/composables/useSpaceQuery'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'

const SELECT = `
  id,
  created_at,
  media:media_item!inner(id, tipo, titulo, titulo_original, ano, capa_url, sinopse, metadados),
  avaliacoes:rating(user_id, status, nota, resenha, planejado_para, visto_em, enviado_em)
`

/**
 * Itens do catálogo no espaço ativo, de um ou mais tipos.
 *
 * `useSpaceQuery` cuida do space_id e da chave de cache — este composable
 * serve igual para filmes, livros ou músicas; muda só `tipos`.
 */
export function useItens(tipos: MaybeRefOrGetter<TipoMidia[]>) {
  const supabase = useSupabaseClient()

  return useSpaceQuery(
    computed(() => ['catalogo', toValue(tipos).join(',')]),
    async (spaceId): Promise<ItemDoEspaco[]> => {
      const { data, error } = await supabase
        .from('entry')
        .select(SELECT)
        .eq('space_id', spaceId)
        .in('media.tipo', toValue(tipos))
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as unknown as ItemDoEspaco[]
    },
  )
}

export function useItem(entryId: MaybeRefOrGetter<string>) {
  const supabase = useSupabaseClient()

  return useSpaceQuery(
    computed(() => ['catalogo', 'item', toValue(entryId)]),
    async (): Promise<ItemDoEspaco> => {
      const { data, error } = await supabase
        .from('entry')
        .select(SELECT)
        .eq('id', toValue(entryId))
        .single()

      if (error) throw error
      return data as unknown as ItemDoEspaco
    },
    { enabled: computed(() => !!toValue(entryId)) },
  )
}

export function useAdicionarItem() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<ItemParaAdicionar, string>(
    async (spaceId, item) => {
      const { data, error } = await supabase.rpc('adicionar_item', {
        p_space: spaceId,
        // A RPC recebe jsonb; o tipo gerado é `Json`, que não aceita uma
        // interface diretamente (índice de assinatura ausente).
        p_item: item as unknown as Json,
      })
      if (error) throw error
      return data as unknown as string
    },
    [['catalogo']],
  )
}

interface AvaliacaoInput {
  entryId: string
  status?: StatusItem
  nota?: number | null
  resenha?: string | null
  planejado_para?: string | null
  visto_em?: string | null
  enviado_em?: string | null
}

export function useAvaliar() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()
  const queryClient = useQueryClient()
  const store = useSpaceStore()

  return useSpaceMutation<AvaliacaoInput, void>(
    async (_spaceId, { entryId, ...campos }) => {
      // Upsert por (entry_id, user_id): a RLS garante que você só escreve na sua
      // própria linha, então não há como sobrescrever a nota do par por acidente.
      const { error } = await supabase
        .from('rating')
        .upsert(
          { entry_id: entryId, user_id: usuarioId.value!, ...campos },
          { onConflict: 'entry_id,user_id' },
        )

      if (error) throw error

      await queryClient.invalidateQueries({
        queryKey: ['space', store.espacoAtivoId, 'catalogo', 'item', entryId],
      })
    },
    [['catalogo']],
  )
}

/**
 * Marcar "queremos ver" numa data — via RPC, e não pelo upsert direto, porque
 * o mesmo passo precisa convidar quem tinha interesse e ainda não datou nada.
 * Devolve quantas pessoas foram convidadas.
 */
export function usePlanejarFilme() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()
  const store = useSpaceStore()

  return useSpaceMutation<{ entryId: string, data: string }, number>(
    async (_spaceId, { entryId, data }) => {
      const { data: convidados, error } = await supabase.rpc('planejar_filme', {
        p_entry: entryId,
        p_data: data,
      })
      if (error) throw error

      await queryClient.invalidateQueries({
        queryKey: ['space', store.espacoAtivoId, 'catalogo', 'item', entryId],
      })
      return (convidados ?? 0) as number
    },
    [['catalogo'], ['convites-filme']],
  )
}

/**
 * Dono/admin marca quem assistiu junto, copiando a própria data.
 *
 * Via RPC porque escreve na avaliação de outra pessoa — a RLS de `rating` só
 * permite escrever na própria linha, e continua assim para o resto do app.
 */
export function useMarcarAssistiramComigo() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()
  const store = useSpaceStore()

  return useSpaceMutation<{ entryId: string, usuarios: string[] }, number>(
    async (_spaceId, { entryId, usuarios }) => {
      const { data, error } = await supabase.rpc('marcar_assistiram_comigo', {
        p_entry: entryId,
        p_usuarios: usuarios,
      })
      if (error) throw error

      await queryClient.invalidateQueries({
        queryKey: ['space', store.espacoAtivoId, 'catalogo', 'item', entryId],
      })
      return (data ?? 0) as number
    },
    [['catalogo']],
  )
}

export function useRemoverItem() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<string, void>(
    async (_spaceId, entryId) => {
      const { error } = await supabase.from('entry').delete().eq('id', entryId)
      if (error) throw error
    },
    [['catalogo']],
  )
}
