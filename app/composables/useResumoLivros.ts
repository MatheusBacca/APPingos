/**
 * "O que eu estou lendo, e quanto falta da meta."
 *
 * A ordem responde à pergunta que traz alguém ao painel: primeiro o livro na
 * mão (com a página, quando anotada), depois a meta do ano. Um livro em
 * andamento é o que se quer retomar; a meta é contexto, não chamado.
 */
import { MAX_LINHAS } from '~/types/resumo'
import type { LinhaResumo, UsarResumo } from '~/types/resumo'
import type { ItemDoEspaco } from '~/types/catalogo'
import type { MetaLeitura } from '~/types/livro'
import { fraseDaMeta, porPrateleira, progressoDaLeitura, progressoDaMeta } from '~/types/livro'
import { useItens } from '~/composables/useCatalogo'
import { useMetasDeLeitura } from '~/composables/useLivros'
import { useUsuarioId } from '~/composables/useUsuarioId'

/**
 * As linhas, dados a estante, as metas e quem está olhando.
 *
 * Pura e exportada para ser testável sem subir o Nuxt — ver
 * test/resumo-livros.test.ts.
 */
export function linhasDeLivros(
  itens: ItemDoEspaco[],
  metas: MetaLeitura[],
  userId: string | null,
  ano: number,
): LinhaResumo[] {
  const linhas: LinhaResumo[] = []

  /*
   * Só os SEUS livros em andamento.
   *
   * O painel é pessoal ("o que eu estou lendo"), e no espaço de casal misturar
   * os dois faria a caixa de três linhas mostrar o livro do outro em vez do
   * seu. A estante compartilhada continua na tela do módulo.
   */
  const lendo = porPrateleira(itens, userId).vendo

  for (const item of lendo) {
    const progresso = progressoDaLeitura(item, userId)
    const pagina = item.avaliacoes.find(a => a.user_id === userId)?.pagina_atual

    linhas.push({
      chave: `lendo-${item.id}`,
      rotulo: item.media.titulo,
      // A porcentagem só aparece quando dá para calculá-la; sem o total de
      // páginas, "pág. 80" já diz onde você parou.
      valor: progresso !== null ? `${progresso}%` : (pagina ? `pág. ${pagina}` : undefined),
      nota: 'lendo',
    })
  }

  const meta = metas.find(m => m.user_id === userId && m.ano === ano)
  const progresso = progressoDaMeta(itens, userId, meta)

  if (progresso) {
    linhas.push({
      chave: `meta-${ano}`,
      rotulo: `Meta de ${ano}`,
      valor: `${progresso.percentual}%`,
      nota: fraseDaMeta(progresso),
      // Meta batida é a única coisa aqui que merece um empurrão visual.
      destaque: progresso.cumprida,
    })
  }

  return linhas.slice(0, MAX_LINHAS)
}

export const useResumoLivros: UsarResumo = () => {
  const ano = new Date().getFullYear()
  const { data: itens } = useItens(['livro'])
  const { data: metas } = useMetasDeLeitura(ano)
  const usuarioId = useUsuarioId()

  return computed(() => linhasDeLivros(
    itens.value ?? [],
    metas.value ?? [],
    usuarioId.value ?? null,
    ano,
  ))
}
