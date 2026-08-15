/**
 * "O que puseram para eu ouvir" — a pergunta que o painel responde por Músicas.
 *
 * O módulo não tem data nem agenda: nada nele vence, e um resumo de "quantas
 * faixas temos" seria número sem consequência. O que de fato espera alguém é o
 * que o outro adicionou e você ainda não ouviu — por isso essas linhas vêm
 * primeiro e com destaque, no mesmo critério dos convites em Filmes.
 */
import { artistasDe, creditos } from '@/lib/musica'
import { avaliacaoDe } from '@/lib/recortes'
import { MAX_LINHAS } from '~/types/resumo'
import type { LinhaResumo, UsarResumo } from '~/types/resumo'
import type { ItemDoEspaco } from '~/types/catalogo'
import type { Membro } from '~/composables/useMembros'
import { useItens } from '~/composables/useCatalogo'
import { useMembros } from '~/composables/useMembros'
import { useUsuarioId } from '~/composables/useUsuarioId'

/**
 * As linhas, dado o catálogo de músicas do espaço e quem é você.
 *
 * Pura e exportada para ser testável sem subir o Nuxt — ver test/resumo-musicas.test.ts.
 */
export function linhasDeMusicas(
  itens: ItemDoEspaco[],
  membros: Membro[],
  euId: string | null,
): LinhaResumo[] {
  // Só o primeiro nome, pelo mesmo motivo do resumo de Filmes: na sidebar o
  // nome inteiro comeria o título da faixa, que é o que a pessoa procura ali.
  const nomeDe = (id: string) => {
    const nome = membros.find(m => m.user_id === id)?.exibicao ?? 'Alguém'
    return nome.split(' ')[0] || nome
  }

  const esperando: LinhaResumo[] = []
  const fila: LinhaResumo[] = []

  for (const item of itens) {
    const minha = avaliacaoDe(item, euId)
    const artistas = creditos(artistasDe(item.media.metadados))

    if (!minha) {
      /*
       * Quem adicionou não está na leitura (`entry.added_by` não vem no select),
       * mas no espaço de casal quem avaliou é quem adicionou — a RPC marca
       * "quero" para ele. Com mais de uma pessoa isso deixa de ser certo, e aí
       * a linha prefere não nomear ninguém a nomear errado.
       */
      const outros = item.avaliacoes.filter(av => av.user_id !== euId)
      const quem = outros.length === 1 ? nomeDe(outros[0]!.user_id) : null

      esperando.push({
        chave: `esperando-${item.id}`,
        rotulo: item.media.titulo,
        nota: quem ? `${quem} adicionou` : 'Esperando você',
        destaque: true,
      })
    }
    else if (minha.status === 'quero') {
      fila.push({
        chave: `fila-${item.id}`,
        rotulo: item.media.titulo,
        nota: artistas || undefined,
      })
    }
  }

  return [...esperando, ...fila].slice(0, MAX_LINHAS)
}

export const useResumoMusicas: UsarResumo = () => {
  // Mesma chave de cache da tela de Músicas — a lista é buscada uma vez só.
  const { data: itens } = useItens(['musica'])
  const { data: membros } = useMembros()
  const euId = useUsuarioId()

  return computed<LinhaResumo[]>(() =>
    linhasDeMusicas(itens.value ?? [], membros.value ?? [], euId.value),
  )
}
