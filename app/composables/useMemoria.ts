/**
 * A memória da viagem: ler, escrever, fechar e reabrir.
 *
 * Duas coisas moldam este arquivo:
 *
 * 1. A MEMÓRIA É UMA SÓ POR VIAGEM, escrita a quatro mãos (ver a migration
 *    20260826010605_viagens_memoria.sql). Então não há "a minha memória" — a
 *    query é pelo `roteiro_id`, e `maybeSingle` porque a viagem que ainda não
 *    ganhou documento é o estado normal, não um erro.
 *
 * 2. TEXTO E ITENS SEGUEM CAMINHOS DIFERENTES. O texto das seções é digitado, e
 *    por isso passa por `salvar_secoes` com atraso (autosave). Anexar uma foto
 *    ou uma playlist é um gesto discreto, com diálogo e confirmação, e vai
 *    direto para `memoria_item` pelo PostgREST. Misturar os dois faria cada
 *    tecla reescrever a lista de anexos.
 */
import type { MaybeRefOrGetter } from 'vue'
import type { Json } from '~/types/database.generated'
import type { ItemDaMemoria, MemoriaCompleta, SecaoDaMemoria, SecaoParaSalvar } from '~/lib/memoria'
import { useSpaceMutation, useSpaceQuery } from '~/composables/useSpaceQuery'
import { useUsuarioId } from '~/composables/useUsuarioId'

const CAMPOS = 'id, roteiro_id, nota, concluida_em, criada_por, created_at, updated_at'
const CAMPOS_SECAO = 'id, ordem, data, titulo, texto, nova_folha'
const CAMPOS_ITEM = `
  id, secao_id, ordem, tipo, foto_id, caminho,
  playlist_id, spotify_id, titulo, subtitulo, capa_url, url_spotify, legenda
`

/**
 * A memória de um roteiro, ou `null` quando ela ainda não existe.
 *
 * Sem filtro de visibilidade nenhum: quem esconde a memória de um roteiro
 * secreto é `pode_ver_memoria` na RLS, e repetir a regra aqui criaria uma
 * segunda que um dia divergiria da primeira — a mesma escolha de `useRoteiros`.
 */
export function useMemoria(roteiroId: MaybeRefOrGetter<string>) {
  const supabase = useSupabaseClient()

  return useSpaceQuery(
    computed(() => ['memoria', toValue(roteiroId)]),
    async (): Promise<MemoriaCompleta | null> => {
      const { data, error } = await supabase
        .from('memoria')
        .select(`${CAMPOS}, secoes:memoria_secao(${CAMPOS_SECAO}), itens:memoria_item(${CAMPOS_ITEM})`)
        .eq('roteiro_id', toValue(roteiroId))
        .maybeSingle()

      if (error) throw error
      return (data as unknown as MemoriaCompleta) ?? null
    },
    { enabled: computed(() => !!toValue(roteiroId)) },
  )
}

/** A viagem, a memória dela e se já está fechada — para o selo da lista. */
export interface MemoriaNaLista {
  id: string
  roteiro_id: string
  concluida_em: string | null
  nome: string
}

/**
 * As memórias do espaço ativo, sem seções nem itens.
 *
 * O `!inner` no roteiro existe para recortar por espaço: `memoria` não tem
 * `space_id` de propósito (o espaço já está no roteiro), e sem o recorte a chave
 * de cache diria "deste espaço" enquanto o dado seria de todos.
 */
export function useMemoriasDoEspaco() {
  const supabase = useSupabaseClient()

  return useSpaceQuery(['memorias'], async (spaceId): Promise<MemoriaNaLista[]> => {
    const { data, error } = await supabase
      .from('memoria')
      .select('id, roteiro_id, concluida_em, roteiro!inner(nome, space_id)')
      .eq('roteiro.space_id', spaceId)

    if (error) throw error

    return (data ?? []).map(m => ({
      id: m.id,
      roteiro_id: m.roteiro_id,
      concluida_em: m.concluida_em,
      nome: (m.roteiro as unknown as { nome: string }).nome,
    }))
  })
}

/**
 * Cria a memória e devolve o id.
 *
 * `criada_por` é exigido pela policy de insert e registra quem começou — não
 * quem pode editar. Editar acompanha ver o roteiro, e isso é regra do banco.
 */
export function useCriarMemoria() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useSpaceMutation<string, string>(
    async (_spaceId, roteiroId) => {
      const { data, error } = await supabase
        .from('memoria')
        .insert({ roteiro_id: roteiroId, criada_por: usuarioId.value! })
        .select('id')
        .single()

      if (error) throw error
      return data.id
    },
    [['memoria'], ['memorias']],
  )
}

/**
 * Grava a lista inteira de seções, na ordem em que estão na tela.
 *
 * O `id` de cada seção vai junto, e isso NÃO é detalhe: a RPC reconcilia por id
 * em vez de apagar e reinserir, porque `memoria_item.secao_id` é
 * `on delete cascade` — um delete+insert levaria todas as fotos e músicas junto,
 * a cada salvamento automático. O id de uma seção nova nasce na tela
 * (`crypto.randomUUID()`), justamente para que ele exista antes do primeiro
 * salvamento.
 */
export function useSalvarSecoes() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<{ memoriaId: string, secoes: SecaoParaSalvar[] }, number>(
    async (_spaceId, { memoriaId, secoes }) => {
      const { data, error } = await supabase.rpc('salvar_secoes', {
        p_memoria: memoriaId,
        // A RPC recebe jsonb; o tipo gerado é `Json`, que não aceita uma
        // interface diretamente (índice de assinatura ausente).
        p_secoes: secoes as unknown as Json,
      })
      if (error) throw error
      return data ?? 0
    },
    [['memoria']],
  )
}

/** A nota da viagem — um campo do documento, não uma entidade à parte. */
export function useDefinirNota() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<{ memoriaId: string, nota: number | null }, void>(
    async (_spaceId, { memoriaId, nota }) => {
      const { error } = await supabase.from('memoria').update({ nota }).eq('id', memoriaId)
      if (error) throw error
    },
    [['memoria']],
  )
}

/**
 * Fecha o documento — e é isto que dispara `memoria_pronta` para o resto do
 * espaço. Por RPC, e não por `update`, para o gatilho ter um evento limpo em que
 * se pendurar; ver a migration.
 */
export function useConcluirMemoria() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<string, void>(
    async (_spaceId, memoriaId) => {
      const { error } = await supabase.rpc('concluir_memoria', { p_memoria: memoriaId })
      if (error) throw error
    },
    [['memoria'], ['memorias']],
  )
}

/** Concluir não tranca para sempre: a lembrança que faltava aparece depois. */
export function useReabrirMemoria() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<string, void>(
    async (_spaceId, memoriaId) => {
      const { error } = await supabase.rpc('reabrir_memoria', { p_memoria: memoriaId })
      if (error) throw error
    },
    [['memoria'], ['memorias']],
  )
}

/** Um item novo, antes de ter id e posição. */
export type ItemNovo = Omit<ItemDaMemoria, 'id' | 'ordem'>

/**
 * O que os seletores emitem: o item sem saber a que seção vai.
 *
 * O diálogo de fotos não sabe (nem deve saber) de que seção foi aberto — quem
 * abriu é a página, e é ela que sabe onde o item cai. Sem este recorte, todo
 * seletor precisaria receber a seção como prop só para devolvê-la intacta.
 */
export type ItemAnexavel = Omit<ItemNovo, 'secao_id'>

/**
 * Anexa itens a uma seção (ou soltos, com `secao_id` nulo).
 *
 * `ordem` sai daqui, e não do banco: o insert já sabe quantos itens a seção tem,
 * e um default do Postgres daria zero para todos — o que faria a ordem da faixa
 * de anexos depender do acaso do `select`.
 */
export function useAdicionarItens() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<{ memoriaId: string, itens: ItemNovo[], aPartirDe: number }, number>(
    async (_spaceId, { memoriaId, itens, aPartirDe }) => {
      if (!itens.length) return 0

      const linhas = itens.map((item, i) => ({
        ...item,
        memoria_id: memoriaId,
        ordem: aPartirDe + i,
      }))

      const { error } = await supabase.from('memoria_item').insert(linhas)
      if (error) throw error
      return linhas.length
    },
    [['memoria']],
  )
}

/*
  `useRemoverItemDaMemoria`, e não `useRemoverItem`: o catálogo já tem um com
  esse nome, e o registro de auto-import do Nuxt é um mapa plano — o segundo
  simplesmente engole o primeiro, com um WARN que passa despercebido no meio do
  build. Ver o cabeçalho de `scripts/verificar-imports.mjs`.
*/
export function useRemoverItemDaMemoria() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<string, void>(
    async (_spaceId, itemId) => {
      const { error } = await supabase.from('memoria_item').delete().eq('id', itemId)
      if (error) throw error
    },
    [['memoria']],
  )
}

export function useAtualizarItem() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<{ id: string, legenda: string | null }, void>(
    async (_spaceId, { id, legenda }) => {
      const { error } = await supabase.from('memoria_item').update({ legenda }).eq('id', id)
      if (error) throw error
    },
    [['memoria']],
  )
}

/**
 * Que fotos do mural estão dentro de alguma memória, e de que viagem.
 *
 * Existe para a guarda de remoção: `useApagarFoto` apaga a linha E o arquivo do
 * bucket, e o item da memória ficaria com `foto_id` nulo e um `caminho` que não
 * resolve mais — um PDF já entregue virando mentira. Antes de apagar, a tela
 * nomeia a viagem e pede confirmação.
 *
 * Uma consulta para todas as fotos da galeria, e não uma por card: são trinta
 * cards, e trinta perguntas ao abrir a tela é o mesmo erro que `useUrlsDasFotos`
 * evita ao assinar em lote.
 *
 * Duas idas em vez de um join aninhado de propósito. `memoria_item` → `memoria`
 * → `roteiro` → `space_id` é um filtro de três níveis no PostgREST, e ele falha
 * de um jeito silencioso (devolve tudo, ou nada) quando a relação fica ambígua.
 * Aqui a primeira ida já é uma consulta que a lista de viagens também faz.
 */
export function useFotosEmMemorias() {
  const supabase = useSupabaseClient()

  return useSpaceQuery(['memorias', 'fotos'], async (spaceId): Promise<Map<string, string[]>> => {
    const { data: memorias, error: erroMemorias } = await supabase
      .from('memoria')
      .select('id, roteiro!inner(nome, space_id)')
      .eq('roteiro.space_id', spaceId)

    if (erroMemorias) throw erroMemorias
    if (!memorias?.length) return new Map()

    const nomePorMemoria = new Map(
      memorias.map(m => [m.id, (m.roteiro as unknown as { nome: string }).nome]),
    )

    const { data: itens, error } = await supabase
      .from('memoria_item')
      .select('foto_id, memoria_id')
      .in('memoria_id', [...nomePorMemoria.keys()])
      .not('foto_id', 'is', null)

    if (error) throw error

    const porFoto = new Map<string, string[]>()

    for (const item of itens ?? []) {
      if (!item.foto_id) continue
      const nome = nomePorMemoria.get(item.memoria_id)
      if (!nome) continue

      const jaTem = porFoto.get(item.foto_id) ?? []
      // A mesma foto pode estar duas vezes na mesma memória (em dois dias). A
      // frase de aviso nomeia a viagem uma vez só.
      if (!jaTem.includes(nome)) porFoto.set(item.foto_id, [...jaTem, nome])
    }

    return porFoto
  })
}

/** As seções no formato que a RPC espera — sem `ordem`, que sai da posição. */
export function secoesParaSalvar(secoes: SecaoDaMemoria[]): SecaoParaSalvar[] {
  return secoes.map(s => ({
    id: s.id,
    data: s.data,
    titulo: s.titulo,
    texto: s.texto,
    nova_folha: s.nova_folha,
  }))
}
