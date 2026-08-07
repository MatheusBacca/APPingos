import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { MaybeRefOrGetter } from 'vue'
import { useSpaceStore } from '~/stores/space'

/**
 * Query com escopo num espaço explícito.
 *
 * É a primitiva; quase todo o app quer o espaço ativo e usa `useSpaceQuery`
 * abaixo. Passar o espaço à mão só faz sentido para uma tela que mostra DOIS
 * espaços ao mesmo tempo — hoje só Orçamentos, quando "Gastos pessoais" está
 * ligado e o espaço pessoal aparece ao lado do compartilhado.
 *
 * `null` desliga a consulta em vez de estourar: é o estado normal enquanto os
 * espaços carregam, e também o jeito de o chamador dizer "agora não" sem
 * precisar de um `enabled` só para isso.
 */
export function useEspacoQuery<T>(
  espaco: MaybeRefOrGetter<string | null | undefined>,
  chave: MaybeRefOrGetter<unknown[]>,
  fn: (spaceId: string) => Promise<T>,
  opcoes: { enabled?: MaybeRefOrGetter<boolean> } = {},
) {
  return useQuery({
    queryKey: computed(() => ['space', toValue(espaco), ...toValue(chave)]),
    enabled: computed(() => !!toValue(espaco) && (toValue(opcoes.enabled) ?? true)),
    queryFn: () => fn(toValue(espaco)!),
  })
}

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

  return useEspacoQuery(computed(() => store.espacoAtivoId), chave, fn, opcoes)
}

/**
 * Mutation com escopo num espaço explícito, que invalida as queries daquele
 * espaço ao terminar.
 *
 * A invalidação é o motivo de a primitiva existir: lançar um gasto pessoal de
 * dentro do espaço do casal grava numa gaveta e precisa limpar o cache DA
 * GAVETA, não o do espaço ativo. Invalidar o ativo tem sintoma silencioso — a
 * compra é gravada e simplesmente não aparece na lista.
 */
export function useEspacoMutation<TVars, TData>(
  espaco: MaybeRefOrGetter<string | null | undefined>,
  fn: (spaceId: string, vars: TVars) => Promise<TData>,
  chavesParaInvalidar: unknown[][] = [],
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (vars: TVars) => {
      const alvo = toValue(espaco)
      if (!alvo) throw new Error('Nenhum espaço ativo')
      return fn(alvo, vars)
    },
    onSuccess: async () => {
      const alvos = chavesParaInvalidar.length ? chavesParaInvalidar : [[]]
      await Promise.all(alvos.map(chave =>
        queryClient.invalidateQueries({ queryKey: ['space', toValue(espaco), ...chave] }),
      ))
    },
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

  return useEspacoMutation(computed(() => store.espacoAtivoId), fn, chavesParaInvalidar)
}
