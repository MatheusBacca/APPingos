/**
 * "O que eu estou lendo, e quanto falta da meta."
 *
 * A ordem responde à pergunta que traz alguém ao painel: primeiro o livro na
 * mão (com a página, quando anotada), depois a meta do ano. Um livro em
 * andamento é o que se quer retomar; a meta é contexto, não chamado.
 */
import { MAX_LINHAS } from '~/types/resumo'
import type { LinhaResumo, UsarResumo, UsarSelo } from '~/types/resumo'
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
    /*
     * SEM `valor`, e a ausência é deliberada: a porcentagem agora é o selo do
     * canto do cartão (ver `useSeloLivros`), e mantê-la aqui a colocaria duas
     * vezes na mesma caixa, a quarenta pixels de distância uma da outra.
     *
     * Nada se perde: `fraseDaMeta` já diz "0 de 3 · faltam 3", que é a mesma
     * informação em contagem — e na sidebar, onde não há canto de cartão, a
     * contagem é a leitura mais útil das duas.
     */
    linhas.push({
      chave: `meta-${ano}`,
      rotulo: `Meta de ${ano}`,
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

/**
 * O selo do canto do cartão: quanto da meta de leitura do ano já foi.
 *
 * Só o número — o contexto ("faltam 3 livros") continua na linha de resumo logo
 * abaixo, que é onde ele cabe. `null` sem meta definida: um "0%" para quem nunca
 * pôs meta seria cobrar uma promessa que a pessoa não fez.
 *
 * A meta é a SUA, como todo o resumo de Livros: no espaço de casal a prateleira
 * é compartilhada, mas a meta do ano é de cada um.
 */
export const useSeloLivros: UsarSelo = () => {
  const ano = new Date().getFullYear()
  const { data: itens } = useItens(['livro'])
  const { data: metas } = useMetasDeLeitura(ano)
  const usuarioId = useUsuarioId()

  return computed<string | null>(() => {
    const meta = (metas.value ?? []).find(m => m.user_id === usuarioId.value && m.ano === ano)
    const progresso = progressoDaMeta(itens.value ?? [], usuarioId.value ?? null, meta)
    return progresso ? `${progresso.percentual}%` : null
  })
}
