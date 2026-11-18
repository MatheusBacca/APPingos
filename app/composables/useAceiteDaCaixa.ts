import { useQueryClient } from '@tanstack/vue-query'
import type { Database } from '~/types/database.generated'
import { toast } from 'vue-sonner'
import { mensagemDeErro } from '@/lib/utils'
import { rotuloParaRegra } from '~/lib/auto-tag'
import type { Sugestao } from '~/lib/auto-tag'
import { participantesDaDivisao } from '~/lib/caixa-de-entrada'
import type { ItemDaCaixa } from '~/lib/caixa-de-entrada'
import { chaveDoEstabelecimento } from '~/lib/estabelecimentos'
import { rateioIgual } from '~/types/orcamento'
import { useClassificar } from '~/composables/useCaixaDeEntrada'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'

/**
 * As ações de um toque da caixa de entrada — Aceitar a sugestão e Ignorar —
 * sempre com um "Desfazer" no aviso.
 *
 * Aceitar faz exatamente o que o diálogo faria com os campos que ele mesmo
 * preencheria: a descrição ("iFood"), a categoria e o destino da regra, com o
 * rateio igual no casal. O toque no botão É o toque humano que o plano exige
 * para algo entrar no espaço do casal — a diferença para o diálogo é só não
 * ter a tela do meio.
 *
 * Desfazer o Aceitar apaga a compra criada: o gatilho `voltar_para_caixa`
 * devolve a transação sozinho. Desfazer o Ignorar é o `devolver_para_caixa`
 * de cada transação do item (as parcelas vão juntas).
 */
/** O padrão do aviso (4 s) some antes de a pessoa achar o botão. */
const DURACAO_COM_DESFAZER = 8000

export function useAceiteDaCaixa() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()
  const store = useSpaceStore()
  const usuarioId = useUsuarioId()
  const classificar = useClassificar()

  /** O espaço de casal da compra: o ativo, se for de casal; senão o primeiro. */
  const espacoCasal = computed(() => {
    const ativo = store.espacoAtivo
    return ativo?.tipo === 'casal' ? ativo : (store.espacos.find(e => e.tipo === 'casal') ?? null)
  })
  const espacoPessoal = computed(() => store.espacos.find(e => e.tipo === 'pessoal') ?? null)

  function aprendizado(item: ItemDaCaixa, s: Sugestao | null | undefined, destino: 'casal' | 'pessoal' | 'ignorar', categoria: string | null) {
    if (item.sentido !== 'saida') return undefined
    return {
      chave: s?.chave ?? chaveDoEstabelecimento(item.principal.descricao),
      rotulo: rotuloParaRegra(item.principal),
      destino,
      categoria,
    }
  }

  async function lancar(item: ItemDaCaixa, s: Sugestao & { destino: 'casal' | 'pessoal' }): Promise<string | null> {
    const eu = usuarioId.value
    if (!eu) throw new Error('Sessão expirada.')
    const casal = s.destino === 'casal'
    const espaco = casal ? espacoCasal.value : espacoPessoal.value
    if (!espaco) throw new Error(casal ? 'Você não está em nenhum espaço de casal.' : 'Espaço pessoal não encontrado.')

    let participantes = rateioIgual([eu])
    if (casal) {
      const { data, error } = await supabase.from('membership').select('user_id').eq('space_id', espaco.id)
      if (error) throw error
      participantes = participantesDaDivisao('igual', eu, (data ?? []).map(m => m.user_id))
    }

    return classificar.mutateAsync({
      tipo: 'compra',
      transacao: item.principal.id,
      space: espaco.id,
      descricao: rotuloParaRegra(item.principal),
      plano: item.plano,
      participantes,
      categoria: s.categoriaNome,
      aprender: aprendizado(item, s, s.destino, s.categoriaNome),
    })
  }

  /*
   * Desfazer também desaprende. Sem isto, aceitar e desfazer contava como "mais
   * uma vez igual" na regra — e a sugestão ficava mais confiante justamente
   * quando a pessoa tinha dito que não. Guarda-se a regra como estava ANTES
   * (ou a ausência dela) e o Desfazer põe de volta.
   */
  type LinhaDaRegra = Pick<Database['public']['Tables']['regra_classificacao']['Row'], 'chave' | 'rotulo' | 'destino' | 'categoria_nome' | 'vezes' | 'automatica' | 'ultima_vez'>
  type FotoDaRegra = { chave: string, linha: LinhaDaRegra | null }

  async function fotografar(chave: string | undefined): Promise<FotoDaRegra | null> {
    if (!chave) return null
    const { data } = await supabase
      .from('regra_classificacao')
      .select('chave, rotulo, destino, categoria_nome, vezes, automatica, ultima_vez')
      .eq('chave', chave)
      .maybeSingle()
    return { chave, linha: data ?? null }
  }

  async function restaurar(foto: FotoDaRegra | null) {
    if (!foto) return
    const consulta = foto.linha
      ? supabase.from('regra_classificacao').update(foto.linha).eq('chave', foto.chave)
      : supabase.from('regra_classificacao').delete().eq('chave', foto.chave)
    const { error } = await consulta
    if (error) console.warn('[auto-tag] não deu para desaprender', error)
    await queryClient.invalidateQueries({ queryKey: ['caixa-de-entrada'] })
  }

  async function apagarCompra(compraId: string) {
    const { error } = await supabase.from('compra').delete().eq('id', compraId)
    if (error) throw error
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['caixa-de-entrada'] }),
      queryClient.invalidateQueries({ predicate: q => q.queryKey[0] === 'space' }),
    ])
  }

  async function devolver(ids: string[]) {
    for (const id of ids) await classificar.mutateAsync({ tipo: 'devolver', transacao: id })
  }

  /** Um item, com o aviso e o Desfazer. */
  async function aceitar(item: ItemDaCaixa, s: Sugestao & { destino: 'casal' | 'pessoal' }) {
    try {
      const foto = await fotografar(aprendizado(item, s, s.destino, s.categoriaNome)?.chave)
      const compra = await lancar(item, s)
      const onde = s.destino === 'casal' ? (espacoCasal.value?.nome ?? 'casal') : 'pessoal'
      toast.success(`${rotuloParaRegra(item.principal)} → ${onde} · ${s.categoriaNome}`, {
        duration: DURACAO_COM_DESFAZER,
        action: compra
          ? {
              label: 'Desfazer',
              onClick: () => apagarCompra(compra).then(() => restaurar(foto)).catch(e => toast.error(mensagemDeErro(e, 'Não deu para desfazer.'))),
            }
          : undefined,
      })
    }
    catch (e) {
      toast.error(mensagemDeErro(e, 'Não deu para aceitar.'))
    }
  }

  /** Vários de uma vez — a lista de conferência já foi o toque humano. */
  async function aceitarTodos(pares: Array<{ item: ItemDaCaixa, sugestao: Sugestao & { destino: 'casal' | 'pessoal' } }>) {
    const criadas: string[] = []
    // A foto de cada regra antes da PRIMEIRA compra dela no lote (Uber duas vezes = uma foto).
    const fotos = new Map<string, FotoDaRegra | null>()
    let falhas = 0
    for (const { item, sugestao } of pares) {
      try {
        const chave = aprendizado(item, sugestao, sugestao.destino, sugestao.categoriaNome)?.chave
        if (chave && !fotos.has(chave)) fotos.set(chave, await fotografar(chave))
        const compra = await lancar(item, sugestao)
        if (compra) criadas.push(compra)
      }
      catch (e) {
        falhas++
        console.warn('[caixa] não deu para aceitar', item.chave, e)
      }
    }
    const texto = criadas.length === 1 ? '1 compra lançada.' : `${criadas.length} compras lançadas.`
    toast.success(falhas ? `${texto} ${falhas} ficaram na caixa.` : texto, {
      duration: DURACAO_COM_DESFAZER,
      action: criadas.length
        ? {
            label: 'Desfazer',
            onClick: async () => {
              try {
                for (const id of criadas) await apagarCompra(id)
                for (const foto of fotos.values()) await restaurar(foto)
              }
              catch (e) {
                toast.error(mensagemDeErro(e, 'Não deu para desfazer tudo.'))
              }
            },
          }
        : undefined,
    })
  }

  async function ignorar(item: ItemDaCaixa, s?: Sugestao | null) {
    const ids = item.transacoes.map(t => t.id)
    try {
      const foto = await fotografar(aprendizado(item, s, 'ignorar', null)?.chave)
      await classificar.mutateAsync({ tipo: 'ignorar', transacoes: ids, aprender: aprendizado(item, s, 'ignorar', null) })
      toast.success(`${rotuloParaRegra(item.principal)} ignorada.`, {
        duration: DURACAO_COM_DESFAZER,
        action: {
          label: 'Desfazer',
          onClick: () => devolver(ids).then(() => restaurar(foto)).catch(e => toast.error(mensagemDeErro(e, 'Não deu para desfazer.'))),
        },
      })
    }
    catch (e) {
      toast.error(mensagemDeErro(e, 'Não deu para ignorar.'))
    }
  }

  return { aceitar, aceitarTodos, ignorar, ocupado: classificar.isPending, espacoCasal }
}
