import type { MaybeRefOrGetter } from 'vue'
import type { Json } from '~/types/database.generated'
import type {
  EstadoInteresse,
  InteresseComProdutos,
  NovoInteresse,
  ProdutoParaSalvar,
} from '~/types/interesse'
import { useSpaceQuery, useSpaceMutation } from '~/composables/useSpaceQuery'

const CAMPOS = `
  id, space_id, criado_por, titulo, destino, estado,
  para_quem, observacao,
  convertido_em, convertido_tipo, convertido_ref_id,
  created_at, updated_at
`

const CAMPOS_PRODUTO = `
  id, interesse_id, nome, url, loja, imagem_url,
  preco, preco_pix, parcelas, valor_parcela,
  escolhido, origem, capturado_em, verificado_em, falhas_seguidas, created_at
`

/**
 * Os interesses do espaço ativo, com os produtos embutidos.
 *
 * Os produtos vêm na mesma consulta, e não sob demanda ao abrir cada um, porque a
 * lista já mostra o preço de cada interesse — e o preço mora no produto. Buscar
 * depois renderia a lista inteira sem valor e faria N consultas para preenchê-la.
 *
 * Sem filtro de estado aqui: quem filtra é a tela, sobre o mesmo cache. Um
 * `.in('estado', ...)` nesta consulta daria uma chave de cache por filtro, e
 * trocar de aba refaria a busca em vez de recortar o que já está em mão.
 */
export function useInteresses() {
  const supabase = useSupabaseClient()

  return useSpaceQuery(['interesses'], async (spaceId): Promise<InteresseComProdutos[]> => {
    const { data, error } = await supabase
      .from('interesse')
      .select(`${CAMPOS}, produtos:interesse_produto(${CAMPOS_PRODUTO})`)
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []) as unknown as InteresseComProdutos[]
  })
}

/**
 * Um interesse, ou `null` quando ele não existe para quem está pedindo.
 *
 * `maybeSingle` pelo mesmo motivo de `useRoteiro`: um interesse de outro espaço é
 * invisível pela RLS, e com `single` isso chegava à tela como o erro cru do
 * PostgREST em vez de "não encontrado". A extensão manda link direto para cá, o
 * que torna o caso comum, não a borda.
 */
export function useInteresse(id: MaybeRefOrGetter<string>) {
  const supabase = useSupabaseClient()

  return useSpaceQuery(
    computed(() => ['interesse', toValue(id)]),
    async (): Promise<InteresseComProdutos | null> => {
      const { data, error } = await supabase
        .from('interesse')
        .select(`${CAMPOS}, produtos:interesse_produto(${CAMPOS_PRODUTO})`)
        .eq('id', toValue(id))
        .maybeSingle()

      if (error) throw error
      return (data as unknown as InteresseComProdutos) ?? null
    },
    { enabled: computed(() => !!toValue(id)) },
  )
}

/**
 * Cria o interesse, opcionalmente já com o primeiro produto.
 *
 * Via RPC, e não por dois inserts, pelo mesmo motivo de `useRegistrarCompra`: sem
 * a transação existiria o estado "interesse gravado, produto não" — um título sem
 * preço nem link, que é exatamente o que a captura vinha registrar. E é a mesma
 * função que a extensão do Chrome chama, então há um caminho só a manter.
 */
export function useRegistrarInteresse() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<NovoInteresse & { produto?: ProdutoParaSalvar | null }, string>(
    async (spaceId, { produto, ...campos }) => {
      const { data, error } = await supabase.rpc('registrar_interesse', {
        p_space: spaceId,
        p_titulo: campos.titulo,
        p_destino: campos.destino,
        p_para_quem: campos.para_quem ?? undefined,
        p_observacao: campos.observacao ?? undefined,
        p_produto: (produto ?? null) as unknown as Json,
      })

      if (error) throw error
      return data as unknown as string
    },
    [['interesses']],
  )
}

/**
 * Título, destino, estado, para quem, observação.
 *
 * Update solto (não RPC) porque é uma linha só e as policies já dizem quem pode:
 * membro do espaço edita, inclusive a ideia do outro — amadurecer e arquivar
 * junto é o uso normal de uma lista de casal.
 */
export function useAtualizarInteresse() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<Partial<NovoInteresse> & { id: string, estado?: EstadoInteresse }, void>(
    async (_spaceId, { id, ...campos }) => {
      const { error } = await supabase.from('interesse').update(campos).eq('id', id)
      if (error) throw error
    },
    [['interesses'], ['interesse']],
  )
}

export function useApagarInteresse() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<string, void>(
    async (_spaceId, id) => {
      const { error } = await supabase.from('interesse').delete().eq('id', id)
      if (error) throw error
    },
    [['interesses'], ['interesse']],
  )
}

/**
 * Acrescenta um candidato a um interesse que já existe.
 *
 * Via RPC porque o primeiro produto de um interesse precisa entrar já escolhido —
 * com um candidato só ele É o valor do interesse — e essa regra tem que valer
 * igual para a tela e para a extensão. Um insert daqui deixaria a decisão na mão
 * de quem chama, e os dois chamadores divergiriam.
 */
export function useAdicionarProduto() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<{ interesseId: string, produto: ProdutoParaSalvar }, string>(
    async (_spaceId, { interesseId, produto }) => {
      const { data, error } = await supabase.rpc('adicionar_produto', {
        p_interesse: interesseId,
        p_produto: { origem: 'manual', ...produto } as unknown as Json,
      })

      if (error) throw error
      return data as unknown as string
    },
    [['interesses'], ['interesse']],
  )
}

export function useAtualizarProduto() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<Partial<ProdutoParaSalvar> & { id: string }, void>(
    async (_spaceId, { id, ...campos }) => {
      const { error } = await supabase.from('interesse_produto').update(campos).eq('id', id)
      if (error) throw error
    },
    [['interesses'], ['interesse']],
  )
}

export function useRemoverProduto() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<string, void>(
    async (_spaceId, id) => {
      const { error } = await supabase.from('interesse_produto').delete().eq('id', id)
      if (error) throw error
    },
    [['interesses'], ['interesse']],
  )
}

/**
 * Marca qual candidato representa o interesse.
 *
 * Via RPC porque são duas escritas — desmarcar o antigo e marcar o novo — e o
 * índice único parcial `interesse_produto_escolhido_idx` recusa a ordem inversa.
 * Um update solto daqui falharia em "duplicate key" sempre que já houvesse um
 * escolhido, ou seja, sempre.
 */
export function useEscolherProduto() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<string, void>(
    async (_spaceId, produtoId) => {
      const { error } = await supabase.rpc('escolher_produto', { p_produto: produtoId })
      if (error) throw error
    },
    [['interesses'], ['interesse']],
  )
}
