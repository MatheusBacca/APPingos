/**
 * A meta de leitura do ano — ler, definir e apagar.
 *
 * A ESTANTE EM SI NÃO TEM COMPOSABLE PRÓPRIO, e isso é o desenho funcionando:
 * livro é o terceiro tipo do motor de catálogo, então `useItens(['livro'])`,
 * `useAdicionarItem` e `useAvaliar` de `useCatalogo.ts` servem sem uma linha de
 * código nova. O que sobra aqui é o único pedaço que Filmes e Músicas não têm.
 */
import type { MaybeRefOrGetter } from 'vue'
import type { MetaLeitura } from '~/types/livro'
import { useSpaceQuery, useSpaceMutation } from '~/composables/useSpaceQuery'
import { useUsuarioId } from '~/composables/useUsuarioId'

/**
 * As metas do ano, de todo mundo do espaço.
 *
 * Traz as duas pessoas de propósito: ver a barra de quem lê com você é metade
 * da graça de ter a estante compartilhada. A tela separa "a sua" da "dela" pelo
 * `user_id`.
 */
export function useMetasDeLeitura(ano: MaybeRefOrGetter<number>) {
  const supabase = useSupabaseClient()

  return useSpaceQuery(
    computed(() => ['livros', 'metas', toValue(ano)]),
    async (spaceId): Promise<MetaLeitura[]> => {
      const { data, error } = await supabase
        .from('meta_leitura')
        .select('user_id, ano, alvo')
        .eq('space_id', spaceId)
        .eq('ano', toValue(ano))

      if (error) throw error
      return (data ?? []) as MetaLeitura[]
    },
  )
}

/**
 * Define (ou muda) a sua meta do ano.
 *
 * `upsert` com a chave inteira porque a operação é a mesma nos dois casos —
 * "minha meta de 2026 é 12" não muda de natureza se já existia uma. A RLS
 * garante que só a sua linha é escrita.
 */
export function useDefinirMeta() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useSpaceMutation<{ ano: number, alvo: number }, void>(
    async (spaceId, { ano, alvo }) => {
      const { error } = await supabase
        .from('meta_leitura')
        .upsert(
          { user_id: usuarioId.value!, space_id: spaceId, ano, alvo },
          { onConflict: 'user_id,space_id,ano' },
        )

      if (error) throw error
    },
    [['livros', 'metas']],
  )
}

/** Tira a meta do ano — quem não quer mais ser cobrado por número. */
export function useApagarMeta() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useSpaceMutation<{ ano: number }, void>(
    async (spaceId, { ano }) => {
      const { error } = await supabase
        .from('meta_leitura')
        .delete()
        .eq('user_id', usuarioId.value!)
        .eq('space_id', spaceId)
        .eq('ano', ano)

      if (error) throw error
    },
    [['livros', 'metas']],
  )
}
