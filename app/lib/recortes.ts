import type { Avaliacao, ItemDoEspaco } from '~/types/catalogo'

/**
 * Os três recortes da tela de Filmes, na ordem em que aparecem.
 *
 * Compartilhado entre a Agenda e a Nossa lista para as duas contarem a mesma
 * história — antes cada tela tinha a sua ideia de "onde este filme está".
 */
export type Recorte = 'planejado' | 'vendo' | 'visto' | 'disponivel'

/** Na ordem do ciclo: vai ver → está vendo → viu → só interesse. */
export const RECORTES: Recorte[] = ['planejado', 'vendo', 'visto', 'disponivel']

export const RECORTE_ROTULO: Record<Recorte, string> = {
  planejado: 'Queremos ver',
  vendo: 'Assistindo',
  visto: 'Assistidos',
  disponivel: 'Disponível',
}

export const RECORTE_DESCRICAO: Record<Recorte, string> = {
  planejado: 'Com data marcada.',
  vendo: 'Em andamento — séries que levam dias.',
  visto: 'Já assistidos — com ou sem data.',
  disponivel: 'Interesse registrado, ainda sem data.',
}

/** Recortes sem data própria: não entram no filtro de mês do calendário. */
export function recorteTemData(recorte: Recorte): boolean {
  return recorte === 'planejado' || recorte === 'visto'
}

export function ehRecorte(valor: unknown): valor is Recorte {
  return typeof valor === 'string' && (RECORTES as string[]).includes(valor)
}

/**
 * Onde a avaliação de UMA pessoa coloca o item.
 *
 * `null` quer dizer "esta pessoa não demonstrou interesse": não ter linha em
 * `rating` é diferente de estar em "disponível". É o que impede a tela de
 * presumir que todo mundo do espaço quer ver tudo que foi adicionado.
 *
 * "Assistido" aceita não ter data — o `status` basta, para quem não lembra
 * quando viu. "Assistindo" nunca tem data: é um intervalo, não um dia.
 *
 * A ordem das checagens é o ciclo ao contrário: quem já viu não está vendo, e
 * quem está vendo não está mais esperando a data que marcou.
 */
export function recorteDa(av: Avaliacao | undefined | null): Recorte | null {
  if (!av) return null
  if (av.status === 'visto' || av.visto_em) return 'visto'
  if (av.status === 'vendo') return 'vendo'
  if (av.planejado_para) return 'planejado'
  return 'disponivel'
}

export function avaliacaoDe(item: ItemDoEspaco, userId: string | null): Avaliacao | undefined {
  if (!userId) return undefined
  return item.avaliacoes.find(a => a.user_id === userId)
}

/** Um item está num recorte se QUALQUER pessoa do espaço o colocou lá. */
export function itemNoRecorte(item: ItemDoEspaco, recorte: Recorte): boolean {
  return item.avaliacoes.some(av => recorteDa(av) === recorte)
}

/** A data que a pessoa marcou naquele recorte, se houver. */
export function dataDoRecorte(av: Avaliacao, recorte: Recorte): string | null {
  if (recorte === 'visto') return av.visto_em
  if (recorte === 'planejado') return av.planejado_para
  return null
}
