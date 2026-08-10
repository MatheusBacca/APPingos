/**
 * "Que filme a gente marcou para sábado" — o outro resumo que motivou o painel.
 *
 * Um convite pendente vale mais que a listagem: é algo que espera resposta, não
 * só informação. Por isso vem antes e com destaque, e o item que já é convite
 * não repete embaixo como "próximo" — no espaço de casal seria o mesmo filme
 * duas vezes na mesma caixa de três linhas.
 */
import { formatarDiaCurto, hojeIso } from '@/lib/datas'
import { MAX_LINHAS } from '~/types/resumo'
import type { LinhaResumo, UsarResumo } from '~/types/resumo'
import type { ItemDoEspaco } from '~/types/catalogo'
import type { ConviteFilme } from '~/composables/useConvitesFilme'
import type { Membro } from '~/composables/useMembros'
import { useItens } from '~/composables/useCatalogo'
import { useConvitesFilme } from '~/composables/useConvitesFilme'
import { useMembros } from '~/composables/useMembros'

/**
 * As linhas, dados os convites, o catálogo e os membros.
 *
 * Pura e exportada para ser testável sem subir o Nuxt — ver test/resumo-filmes.test.ts.
 */
export function linhasDeFilmes(
  convites: ConviteFilme[],
  itens: ItemDoEspaco[],
  membros: Membro[],
  hoje: string,
): LinhaResumo[] {
  /*
   * Só o primeiro nome. Na sidebar sobram ~110px para o texto da linha depois
   * da data, e "Ana Paula chamou para assistir junto" comeria o título do
   * filme, que é a informação que a pessoa está procurando ali.
   */
  const nomeDe = (id: string) => {
    const nome = membros.find(m => m.user_id === id)?.exibicao ?? 'Alguém'
    return nome.split(' ')[0] || nome
  }

  const linhasConvite = convites.map<LinhaResumo>(convite => ({
    chave: `convite-${convite.id}`,
    rotulo: convite.entry?.media?.titulo ?? 'Um filme',
    valor: formatarDiaCurto(convite.data_proposta),
    nota: `${nomeDe(convite.de_user_id)} convidou`,
    destaque: true,
  }))

  /*
   * Uma data por item, a mais próxima. A data é por pessoa no banco, e no
   * espaço de casal as duas marcam o mesmo filme — sem isto, "sábado" apareceria
   * em duplicata e comeria as três linhas do painel com um filme só.
   */
  const jaEhConvite = new Set(convites.map(c => c.entry_id))
  const proximos = new Map<string, { titulo: string, data: string }>()

  for (const item of itens) {
    if (jaEhConvite.has(item.id)) continue

    for (const avaliacao of item.avaliacoes ?? []) {
      const data = avaliacao.planejado_para
      if (!data || data < hoje) continue

      const atual = proximos.get(item.id)
      if (!atual || data < atual.data) {
        proximos.set(item.id, { titulo: item.media.titulo, data })
      }
    }
  }

  const linhasProximos = [...proximos.entries()]
    .sort(([, a], [, b]) => a.data.localeCompare(b.data))
    .map<LinhaResumo>(([entryId, proximo]) => ({
      chave: `proximo-${entryId}`,
      rotulo: proximo.titulo,
      valor: formatarDiaCurto(proximo.data),
    }))

  return [...linhasConvite, ...linhasProximos].slice(0, MAX_LINHAS)
}

export const useResumoFilmes: UsarResumo = () => {
  const { data: convites } = useConvitesFilme()
  // Mesma chave de cache da tela de Filmes — a lista é buscada uma vez só.
  const { data: itens } = useItens(['filme', 'serie'])
  const { data: membros } = useMembros()

  return computed<LinhaResumo[]>(() =>
    linhasDeFilmes(convites.value ?? [], itens.value ?? [], membros.value ?? [], hojeIso()),
  )
}
