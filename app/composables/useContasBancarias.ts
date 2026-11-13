import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { useUsuarioId } from '~/composables/useUsuarioId'
import type { DestinoConta } from '~/lib/contas-bancarias'

export interface ContaBancaria {
  id: string
  tipo: 'conta' | 'cartao'
  nome: string
  numero: string | null
  destino: DestinoConta
  space_id: string | null
}

export interface ConexaoBancaria {
  id: string
  item_id: string
  banco: string
  banco_logo_url: string | null
  status: string
  consentimento_expira_em: string | null
  sincronizado_em: string | null
  erro_sincronizacao: string | null
  conectado_em: string
  contas: ContaBancaria[]
}

const CHAVE = 'conexoes-bancarias'

/**
 * As conexões de quem está logado, com as contas de cada uma.
 *
 * Não é `useSpaceQuery`: a conexão é da pessoa, não do espaço (mesmo caso do
 * perfil e do Spotify). E a RLS devolve só as suas — a do par nunca vem.
 */
export function useConexoesBancarias() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: [CHAVE, usuarioId],
    enabled: computed(() => !!usuarioId.value),
    queryFn: async (): Promise<ConexaoBancaria[]> => {
      const { data, error } = await supabase
        .from('conexao_bancaria')
        .select(`
          id, item_id, banco, banco_logo_url, status, consentimento_expira_em,
          sincronizado_em, erro_sincronizacao, conectado_em,
          contas:conta_bancaria(id, tipo, nome, numero, destino, space_id)
        `)
        .order('conectado_em', { ascending: true })

      if (error) throw error

      return ((data ?? []) as unknown as ConexaoBancaria[]).map(c => ({
        ...c,
        // Cartões primeiro: são eles que a pessoa vem aqui designar.
        contas: [...c.contas].sort((a, b) =>
          a.tipo === b.tipo ? a.nome.localeCompare(b.nome, 'pt-BR') : a.tipo === 'cartao' ? -1 : 1),
      }))
    },
  })
}

/** Se o servidor tem as chaves da Pluggy — sem elas a tela explica em vez de oferecer. */
export function usePluggyConfigurada() {
  return useQuery({
    queryKey: ['pluggy-configurada'],
    staleTime: Infinity,
    queryFn: () => $fetch<{ configurada: boolean }>('/api/pluggy/status').then(r => r.configurada),
  })
}

/**
 * Designar a conta: para onde vão as compras dela.
 *
 * UPDATE direto: a policy limita à própria conta, e o trigger
 * `validar_conta_bancaria` recusa um espaço que não é de casal ou do qual a
 * pessoa não é membro.
 */
export function useDesignarConta() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (v: { id: string, destino: DestinoConta, space_id: string | null }) => {
      const { error } = await supabase
        .from('conta_bancaria')
        .update({ destino: v.destino, space_id: v.space_id })
        .eq('id', v.id)

      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CHAVE] }),
  })
}

/**
 * Desconectar apaga a conexão e, em cascata, as contas e o extrato importado.
 * As compras que já nasceram dele ficam: elas são do espaço, não do extrato.
 *
 * O item continua existindo na Pluggy/MeuPluggy — quem revoga o consentimento
 * de verdade é o MeuPluggy ou o app do banco. O APPingos só para de ler.
 */
export function useDesconectarBanco() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('conexao_bancaria').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CHAVE] }),
  })
}

/** Cadastra (ou atualiza) um item pelo id — o que o widget devolve, ou um colado à mão. */
export function useRegistrarConexao() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (itemId: string) =>
      $fetch<{ id: string, contas: number }>('/api/pluggy/conexoes', { method: 'POST', body: { itemId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CHAVE] }),
  })
}

/**
 * Abre o widget da Pluggy. Com `itemId`, em modo de atualização daquele item.
 *
 * O SDK é carregado só aqui (import dinâmico): ele traz um iframe e um bocado
 * de JS que ninguém precisa até clicar em "Conectar".
 *
 * Resolve com o id do item conectado, ou `null` se a pessoa fechou o widget.
 */
export async function abrirWidgetPluggy(itemId?: string): Promise<string | null> {
  const { accessToken } = await $fetch<{ accessToken: string }>('/api/pluggy/connect-token', {
    method: 'POST',
    body: itemId ? { itemId } : {},
  })
  const { PluggyConnect } = await import('pluggy-connect-sdk')

  return await new Promise<string | null>((resolve, reject) => {
    let concluido = false
    const widget = new PluggyConnect({
      connectToken: accessToken,
      updateItem: itemId,
      language: 'pt',
      countries: ['BR'],
      onSuccess: ({ item }) => {
        concluido = true
        resolve((item as { id: string }).id)
      },
      onError: (erro) => {
        concluido = true
        reject(new Error(erro.message || 'A Pluggy não conseguiu concluir a conexão.'))
      },
      onClose: () => {
        if (!concluido) resolve(null)
      },
    })
    widget.init().catch(reject)
  })
}
