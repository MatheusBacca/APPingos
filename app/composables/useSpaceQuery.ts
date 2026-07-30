import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { MaybeRefOrGetter } from 'vue'

/**
 * Query com escopo no espaço ativo.
 *
 * Existe para que nenhum módulo precise saber que multi-tenancy existe: o
 * `space_id` entra na chave de cache (trocar de espaço refaz a busca em vez de
 * mostrar dado do outro) e chega pronto na função. A query só dispara quando há
 * espaço ativo, evitando um flash de "vazio" no primeiro carregamento.
 */
export function useSpaceQuery<T>(
  chave: MaybeRefOrGetter<unknown[]>,
  fn: (spaceId: string) => Promise<T>,
  opcoes: { enabled?: MaybeRefOrGetter<boolean> } = {},
) {
  const store = useSpaceStore()

  return useQuery({
    queryKey: computed(() => ['space', store.espacoAtivoId, ...toValue(chave)]),
    enabled: computed(() => !!store.espacoAtivoId && (toValue(opcoes.enabled) ?? true)),
    queryFn: () => fn(store.espacoAtivoId!),
  })
}

/**
 * Mutation com escopo no espaço ativo, que invalida as queries daquele espaço
 * ao terminar. `chavesParaInvalidar` são relativas ao espaço, como em useSpaceQuery.
 */
export function useSpaceMutation<TVars, TData>(
  fn: (spaceId: string, vars: TVars) => Promise<TData>,
  chavesParaInvalidar: unknown[][] = [],
) {
  const store = useSpaceStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (vars: TVars) => {
      if (!store.espacoAtivoId) throw new Error('Nenhum espaço ativo')
      return fn(store.espacoAtivoId, vars)
    },
    onSuccess: async () => {
      const alvos = chavesParaInvalidar.length ? chavesParaInvalidar : [[]]
      await Promise.all(alvos.map(chave =>
        queryClient.invalidateQueries({ queryKey: ['space', store.espacoAtivoId, ...chave] }),
      ))
    },
  })
}
