/**
 * "O que a gente quer, e quanto custaria" — as duas linhas do painel.
 *
 * Duas decisões carregam este arquivo:
 *
 * 1. O valor vem de `totalDosInteresses`, que conta UM produto por interesse (o
 *    que o representa), nunca todos. Somar os três sofás candidatos diria que a
 *    gente quer três sofás — e o número apareceria triplicado justamente nos
 *    interesses mais pesquisados.
 *
 * 2. Só os estados abertos entram. 'convertido' já virou outra coisa e seria
 *    contado duas vezes; 'arquivado' é decisão tomada, não vontade pendente. Um
 *    painel que somasse os quatro cresceria para sempre e pararia de significar
 *    algo depois do primeiro mês.
 *
 * Sem tom: querer algo não é dívida a favor nem contra — não há a quem dever.
 * Vermelho aqui inventaria uma cobrança que não existe.
 */
import { formatarDinheiro } from '@/lib/dinheiro'
import { ESTADOS_ABERTOS, totalDosInteresses } from '~/types/interesse'
import type { InteresseComProdutos } from '~/types/interesse'
import type { LinhaResumo, UsarResumo } from '~/types/resumo'
import { useInteresses } from '~/composables/useInteresses'

/**
 * As linhas, dado o que está em aberto. Pura e exportada para ser testável sem
 * subir o Nuxt — é o que a pessoa lê de relance, e o que mais tende a mudar.
 */
export function linhasDoResumo(interesses: InteresseComProdutos[]): LinhaResumo[] {
  const abertos = interesses.filter(i => ESTADOS_ABERTOS.includes(i.estado))
  if (!abertos.length) return []

  const linhas: LinhaResumo[] = [{
    chave: 'interesses-abertos',
    rotulo: abertos.length === 1 ? '1 interesse' : `${abertos.length} interesses`,
    nota: 'em aberto',
    tom: 'neutro',
  }]

  const total = totalDosInteresses(abertos)
  if (total > 0) {
    // Quantos ainda não têm preço, porque o total mente sem essa ressalva: cinco
    // interesses somando R$ 300 pode ser "tudo barato" ou "quatro sem preço".
    const semPreco = abertos.length - abertos.filter(i => i.produtos.length > 0).length

    linhas.push({
      chave: 'interesses-total',
      rotulo: 'Somando',
      nota: semPreco > 0 ? `${semPreco} sem preço ainda` : 'os escolhidos',
      valor: formatarDinheiro(total),
      valorDescrito: 'custo dos interesses em aberto',
      tom: 'neutro',
    })
  }

  return linhas
}

export const useResumoInteresses: UsarResumo = () => {
  const { data: interesses } = useInteresses()

  return computed<LinhaResumo[]>(() => linhasDoResumo(interesses.value ?? []))
}
