/**
 * Interesses — o único módulo cujo cache NÃO é por espaço, e o motivo importa.
 *
 * Todo o resto do app guarda uma query por espaço (`useSpaceQuery`), porque um
 * gasto do casal e um gasto pessoal são linhas diferentes em gavetas diferentes. Um
 * interesse não: a MESMA linha é vista de dois lugares — da casa dela, do espaço em
 * que foi compartilhada, e do espaço pessoal de quem a criou ou assumiu. Um cache
 * por espaço guardaria três cópias da mesma linha, e compartilhar de dentro de um
 * espaço deixaria os outros dois desatualizados por até um minuto (o `staleTime`
 * global) — com sintoma silencioso: a pessoa compartilha, troca de espaço e não
 * encontra nada.
 *
 * Então há um cache só, `['interesses']`, com tudo o que a RLS alcança, e o recorte
 * "o que aparece AQUI" é decidido na hora por `interessesDaVista` — puro e testado
 * em `test/interesse.test.ts`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { MaybeRefOrGetter } from 'vue'
import type { Json } from '~/types/database.generated'
import type {
  EstadoInteresse,
  InteresseComAgrupamentos,
  NovoInteresse,
  ProdutoParaSalvar,
} from '~/types/interesse'
import { interesseNaVista, interessesDaVista } from '~/types/interesse'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'

const CAMPOS = `
  id, space_id, criado_por, titulo, destino, estado,
  para_quem, para_quem_user_id, observacao,
  assumido_por, assumido_em,
  convertido_em, convertido_tipo, convertido_ref_id,
  created_at, updated_at
`

const CAMPOS_PRODUTO = `
  id, interesse_id, agrupamento_id, nome, url, loja, imagem_url,
  preco, preco_pix, parcelas, valor_parcela,
  origem, capturado_em, verificado_em, falhas_seguidas, created_at
`

/**
 * O embed é aninhado em dois níveis: agrupamento traz seus produtos.
 *
 * Vem tudo na mesma consulta, e não sob demanda, porque a lista já mostra o preço
 * de cada interesse — e o preço é a soma dos produtos do agrupamento favorito.
 * Buscar depois renderizaria a lista inteira sem valor e faria N consultas.
 */
const EMBUTIDOS = `
  agrupamentos:interesse_agrupamento(
    id, interesse_id, nome, escolhido, created_at,
    produtos:interesse_produto(${CAMPOS_PRODUTO})
  ),
  compartilhamentos:interesse_compartilhamento(
    interesse_id, space_id, compartilhado_por, created_at
  )
`

/**
 * Tudo o que a RLS deixa esta pessoa ver, sem recorte de espaço.
 *
 * Sem `.eq('space_id', ...)` de propósito: um interesse compartilhado mora num
 * espaço e é visto de outro, e filtrar por `space_id` na consulta esconderia
 * exatamente esse caso. Quem decide o recorte é a vista.
 *
 * Sem filtro de estado, também: quem filtra é a tela, sobre o mesmo cache. Um
 * `.in('estado', ...)` daria uma chave de cache por filtro, e trocar de aba refaria
 * a busca em vez de recortar o que já está em mão.
 */
export function useTodosOsInteresses() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useQuery({
    // O usuário na chave, como em `useEspacos`: sem ele, sair e entrar com outra
    // conta na mesma aba mostraria os interesses de quem saiu até o cache expirar.
    queryKey: ['interesses', usuarioId],
    enabled: computed(() => !!usuarioId.value),
    queryFn: async (): Promise<InteresseComAgrupamentos[]> => {
      const { data, error } = await supabase
        .from('interesse')
        .select(`${CAMPOS}, ${EMBUTIDOS}`)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as unknown as InteresseComAgrupamentos[]
    },
  })
}

/** A vista atual: em que espaço estou e se ele é o meu pessoal. */
export function useVista() {
  const store = useSpaceStore()
  const userId = useUsuarioId()

  return computed(() => ({
    spaceId: store.espacoAtivoId ?? '',
    pessoal: store.espacoAtivo?.tipo === 'pessoal',
    userId: userId.value,
  }))
}

/**
 * Os interesses que o espaço ativo mostra.
 *
 * Devolve a query inteira (com `isPending`, `error` e companhia) e só troca `data`
 * pelo recorte, para as telas seguirem usando `const { data, isPending } = ...`.
 */
export function useInteresses() {
  const query = useTodosOsInteresses()
  const vista = useVista()

  return {
    ...query,
    data: computed(() => interessesDaVista(query.data.value ?? [], vista.value)),
  }
}

/**
 * Um interesse, ou `null` quando ele não existe para quem está pedindo.
 *
 * Sai do mesmo cache da lista em vez de fazer a própria consulta: o link da
 * extensão cai direto aqui, e com a lista já em mão a tela abre sem esperar rede.
 * Quando o cache ainda está vazio (recarregar a página nesta url), a query da lista
 * está carregando e `isPending` cobre a espera.
 *
 * O `null` também é a resposta para um interesse que a RLS torna invisível, e para
 * um que existe mas não pertence a esta vista — abrir pelo link um interesse de
 * outro espaço mostra "não encontrado", que é honesto: ele não está aqui.
 */
export function useInteresse(id: MaybeRefOrGetter<string>) {
  const query = useTodosOsInteresses()
  const vista = useVista()

  const data = computed<InteresseComAgrupamentos | null>(() => {
    const achado = (query.data.value ?? []).find(i => i.id === toValue(id))
    if (!achado) return null

    return interesseNaVista(achado, vista.value) ? achado : null
  })

  return { ...query, data }
}

/**
 * Toda escrita de interesse invalida o cache único.
 *
 * Um helper local, e não `useSpaceMutation`, porque aquele invalida
 * `['space', <ativo>, ...]` — e uma escrita feita aqui pode afetar o que OUTRO
 * espaço mostra (compartilhar, assumir, criar no casal aparecendo no pessoal).
 */
function useMutacaoDeInteresse<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['interesses'] }),
  })
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
  const store = useSpaceStore()

  return useMutacaoDeInteresse<NovoInteresse & { produto?: ProdutoParaSalvar | null }, string>(
    async ({ produto, ...campos }) => {
      if (!store.espacoAtivoId) throw new Error('Nenhum espaço ativo')

      const { data, error } = await supabase.rpc('registrar_interesse', {
        p_space: store.espacoAtivoId,
        p_titulo: campos.titulo,
        p_destino: campos.destino,
        p_para_quem: campos.para_quem ?? undefined,
        p_para_quem_user_id: campos.para_quem_user_id ?? undefined,
        p_observacao: campos.observacao ?? undefined,
        p_produto: (produto ?? null) as unknown as Json,
      })

      if (error) throw error
      return data as unknown as string
    },
  )
}

/**
 * Título, destino, estado, para quem, observação.
 *
 * Update solto (não RPC) porque é uma linha só e o banco já diz quem pode o quê: a
 * policy libera a linha para quem alcança o interesse, e o trigger
 * `interesse_intencao_protegida` recusa quem não é o dono mexendo na INTENÇÃO
 * (título, destino, para quem, observação). Quem só tem visibilidade emprestada
 * pode mexer no estado — mover no "kanban" é coordenação, não reescrita do desejo.
 */
export function useAtualizarInteresse() {
  const supabase = useSupabaseClient()

  return useMutacaoDeInteresse<
    Partial<NovoInteresse> & { id: string, estado?: EstadoInteresse },
    void
  >(async ({ id, ...campos }) => {
    const { error } = await supabase.from('interesse').update(campos).eq('id', id)
    if (error) throw error
  })
}

export function useApagarInteresse() {
  const supabase = useSupabaseClient()

  return useMutacaoDeInteresse<string, void>(async (id) => {
    const { error } = await supabase.from('interesse').delete().eq('id', id)
    if (error) throw error
  })
}

// ----------------------------------------------------------------------------
// Compartilhar e assumir
// ----------------------------------------------------------------------------

/**
 * Empresta a visibilidade do interesse a um espaço.
 *
 * Via RPC porque a regra ("só o dono, e só em espaço de que ele participa") merece
 * uma mensagem legível; a policy de `interesse_compartilhamento` diz a mesma coisa
 * e é ela que de fato barra.
 */
export function useCompartilharInteresse() {
  const supabase = useSupabaseClient()

  return useMutacaoDeInteresse<{ interesseId: string, spaceId: string }, void>(
    async ({ interesseId, spaceId }) => {
      const { error } = await supabase.rpc('compartilhar_interesse', {
        p_interesse: interesseId,
        p_space: spaceId,
      })
      if (error) throw error
    },
  )
}

export function useDescompartilharInteresse() {
  const supabase = useSupabaseClient()

  return useMutacaoDeInteresse<{ interesseId: string, spaceId: string }, void>(
    async ({ interesseId, spaceId }) => {
      const { error } = await supabase.rpc('descompartilhar_interesse', {
        p_interesse: interesseId,
        p_space: spaceId,
      })
      if (error) throw error
    },
  )
}

/** "Darei de presente para ele." Ninguém assume o próprio interesse — o banco recusa. */
export function useAssumirInteresse() {
  const supabase = useSupabaseClient()

  return useMutacaoDeInteresse<string, void>(async (interesseId) => {
    const { error } = await supabase.rpc('assumir_interesse', { p_interesse: interesseId })
    if (error) throw error
  })
}

/** Devolve a responsabilidade. Quem assumiu libera, e o dono também. */
export function useLiberarInteresse() {
  const supabase = useSupabaseClient()

  return useMutacaoDeInteresse<string, void>(async (interesseId) => {
    const { error } = await supabase.rpc('liberar_interesse', { p_interesse: interesseId })
    if (error) throw error
  })
}

// ----------------------------------------------------------------------------
// Agrupamentos e produtos
// ----------------------------------------------------------------------------

/**
 * Um agrupamento novo, já com o primeiro produto.
 *
 * Duas chamadas em vez de uma RPC nova: `criar_agrupamento` devolve o id e
 * `adicionar_produto_ao_agrupamento` o consome. O risco de parar no meio é um
 * agrupamento vazio na tela — visível, batizável e removível — e não um dado
 * perdido, então não vale uma transação a mais no banco.
 */
export function useCriarAgrupamento() {
  const supabase = useSupabaseClient()

  return useMutacaoDeInteresse<
    { interesseId: string, nome?: string | null, produto?: ProdutoParaSalvar | null },
    string
  >(async ({ interesseId, nome, produto }) => {
    const { data, error } = await supabase.rpc('criar_agrupamento', {
      p_interesse: interesseId,
      p_nome: nome ?? undefined,
    })
    if (error) throw error

    const agrupamentoId = data as unknown as string

    if (produto) {
      const { error: erroProduto } = await supabase.rpc('adicionar_produto_ao_agrupamento', {
        p_agrupamento: agrupamentoId,
        p_produto: { origem: 'manual', ...produto } as unknown as Json,
      })
      if (erroProduto) throw erroProduto
    }

    return agrupamentoId
  })
}

/** Renomear ou apagar o agrupamento — o "e também preciso de" ganhando nome. */
export function useRenomearAgrupamento() {
  const supabase = useSupabaseClient()

  return useMutacaoDeInteresse<{ id: string, nome: string | null }, void>(
    async ({ id, nome }) => {
      const { error } = await supabase
        .from('interesse_agrupamento')
        .update({ nome: nome?.trim() || null })
        .eq('id', id)
      if (error) throw error
    },
  )
}

/**
 * Apaga o agrupamento e, em cascata, os produtos dele.
 *
 * A cascata é do banco (`on delete cascade`), então a tela não precisa apagar
 * produto por produto — e não há como sobrar produto órfão se a rede cair no meio.
 */
export function useRemoverAgrupamento() {
  const supabase = useSupabaseClient()

  return useMutacaoDeInteresse<string, void>(async (id) => {
    const { error } = await supabase.from('interesse_agrupamento').delete().eq('id', id)
    if (error) throw error
  })
}

/**
 * Marca qual agrupamento representa o interesse.
 *
 * Via RPC porque são duas escritas — desmarcar o antigo e marcar o novo — e o
 * índice único parcial `interesse_agrupamento_escolhido_idx` recusa a ordem
 * inversa. Um update solto daqui falharia em "duplicate key" sempre que já houvesse
 * um escolhido, ou seja, sempre.
 */
export function useEscolherAgrupamento() {
  const supabase = useSupabaseClient()

  return useMutacaoDeInteresse<string, void>(async (agrupamentoId) => {
    const { error } = await supabase.rpc('escolher_agrupamento', {
      p_agrupamento: agrupamentoId,
    })
    if (error) throw error
  })
}

/** Acrescenta um produto a um agrupamento que já existe. */
export function useAdicionarProduto() {
  const supabase = useSupabaseClient()

  return useMutacaoDeInteresse<
    { agrupamentoId: string, produto: ProdutoParaSalvar },
    string
  >(async ({ agrupamentoId, produto }) => {
    const { data, error } = await supabase.rpc('adicionar_produto_ao_agrupamento', {
      p_agrupamento: agrupamentoId,
      p_produto: { origem: 'manual', ...produto } as unknown as Json,
    })

    if (error) throw error
    return data as unknown as string
  })
}

/**
 * Edita um produto pelo modal do card.
 *
 * `url` fica de fora do tipo de propósito, e é a decisão que o pedido pediu: é por
 * ela que a extensão reabre a página para reler o preço. Trocar a url à mão faria a
 * rechecagem seguinte ler outro produto e sobrescrever o histórico deste com o
 * preço de outra coisa — sem erro visível, e sem como descobrir depois. Produto
 * errado se remove e captura de novo.
 */
export function useAtualizarProduto() {
  const supabase = useSupabaseClient()

  return useMutacaoDeInteresse<
    Omit<Partial<ProdutoParaSalvar>, 'url'> & { id: string },
    void
  >(async ({ id, ...campos }) => {
    const { error } = await supabase.from('interesse_produto').update(campos).eq('id', id)
    if (error) throw error
  })
}

/**
 * Remove o produto, e o agrupamento junto quando ele ficaria vazio.
 *
 * Sem isso, tirar o único produto de um agrupamento deixaria um cartão vazio que
 * não custa nada e ainda concorre a favorito. Quem chama diz quantos irmãos havia,
 * porque a tela já tem essa informação em mão.
 */
export function useRemoverProduto() {
  const supabase = useSupabaseClient()

  return useMutacaoDeInteresse<{ id: string, agrupamentoId: string, ultimo: boolean }, void>(
    async ({ id, agrupamentoId, ultimo }) => {
      if (ultimo) {
        const { error } = await supabase
          .from('interesse_agrupamento')
          .delete()
          .eq('id', agrupamentoId)
        if (error) throw error
        return
      }

      const { error } = await supabase.from('interesse_produto').delete().eq('id', id)
      if (error) throw error
    },
  )
}

/**
 * Move um produto para outro agrupamento — o "na verdade este suporte vai com o
 * monitor de 24".
 */
export function useMoverProduto() {
  const supabase = useSupabaseClient()

  return useMutacaoDeInteresse<{ id: string, agrupamentoId: string }, void>(
    async ({ id, agrupamentoId }) => {
      const { error } = await supabase
        .from('interesse_produto')
        .update({ agrupamento_id: agrupamentoId })
        .eq('id', id)
      if (error) throw error
    },
  )
}
