/**
 * "Ela liberou um roteiro" e "a próxima viagem é quando".
 *
 * A primeira linha é a razão de o painel existir para este módulo: um roteiro
 * que era segredo e deixou de ser não avisa ninguém sozinho — não há push nem
 * e-mail no app. O aviso é esta linha em destaque, e ela some quando a pessoa
 * abre o roteiro, que é o único sinal confiável de que a novidade chegou.
 *
 * A segunda é a pergunta que qualquer um faz olhando o painel: falta quanto.
 */
import { formatarDiaCurto, hojeIso } from '@/lib/datas'
import { MAX_LINHAS } from '~/types/resumo'
import type { LinhaResumo, UsarResumo } from '~/types/resumo'
import type { Roteiro } from '~/types/viagem'
import { proximaViagem, roteirosNovos } from '~/types/viagem'
import { useRoteiros, useRoteirosVistos } from '~/composables/useRoteiros'

/**
 * As linhas, dados os roteiros e o que já foi aberto.
 *
 * Pura e exportada para ser testável sem subir o Nuxt — ver test/resumo-viagens.test.ts.
 */
export function linhasDeViagens(
  roteiros: Roteiro[],
  vistos: string[],
  hoje: string,
): LinhaResumo[] {
  const novos = new Set(roteirosNovos(roteiros, vistos))

  const linhasNovas = roteiros
    .filter(r => novos.has(r.id))
    .map<LinhaResumo>(r => ({
      chave: `roteiro-novo-${r.id}`,
      rotulo: r.nome,
      valor: r.data_inicio ? formatarDiaCurto(r.data_inicio) : undefined,
      nota: 'Roteiro novo',
      destaque: true,
    }))

  /*
   * A próxima viagem não repete o que já apareceu como novidade acima. No espaço
   * de casal o roteiro recém-liberado costuma ser justamente o mais próximo, e
   * sem isto ele ocuparia duas das três linhas do painel dizendo a mesma coisa.
   */
  const proxima = proximaViagem(roteiros.filter(r => !novos.has(r.id)), hoje)

  const linhaProxima: LinhaResumo[] = proxima
    ? [{
        chave: `roteiro-proximo-${proxima.id}`,
        rotulo: proxima.nome,
        valor: formatarDiaCurto(proxima.data_inicio!),
        nota: 'Próxima viagem',
      }]
    : []

  return [...linhasNovas, ...linhaProxima].slice(0, MAX_LINHAS)
}

export const useResumoViagens: UsarResumo = () => {
  // Mesmas chaves de cache da tela de Viagens — a lista é buscada uma vez só.
  const { data: roteiros } = useRoteiros()
  const { data: vistos } = useRoteirosVistos()

  return computed<LinhaResumo[]>(() =>
    linhasDeViagens(roteiros.value ?? [], vistos.value ?? [], hojeIso()),
  )
}
