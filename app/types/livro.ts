/**
 * A estante — as prateleiras e a meta de leitura.
 *
 * Tudo aqui é função pura sobre `ItemDoEspaco`, o mesmo tipo que Filmes e
 * Músicas usam: livro não tem tabela própria, é o terceiro tipo do motor de
 * catálogo. Ver a migration 20260908024210_livros.sql.
 *
 * Puro e separado da tela para o teste alcançar (test/livro.test.ts) — a regra
 * de "quantos li este ano" é a coisa mais fácil de errar do módulo e a mais
 * chata de conferir clicando.
 */
import type { Avaliacao, ItemDoEspaco, StatusItem } from '~/types/catalogo'

/**
 * As quatro prateleiras, na ordem em que a estante é lida.
 *
 * São os mesmos quatro status do banco, com o verbo de quem lê — o mesmo
 * recurso que Músicas usa para não dizer "Assistido" para um disco. A ordem
 * conta uma história: o que você quer, o que está na mão, o que terminou, e por
 * último o que não deu.
 */
export const PRATELEIRAS: { valor: StatusItem, rotulo: string, vazio: string }[] = [
  { valor: 'quero', rotulo: 'Quero ler', vazio: 'Nada na fila ainda — busque um livro acima.' },
  { valor: 'vendo', rotulo: 'Lendo', vazio: 'Nenhum livro em andamento.' },
  { valor: 'visto', rotulo: 'Lido', vazio: 'Nenhum livro terminado ainda.' },
  { valor: 'abandonei', rotulo: 'Larguei', vazio: 'Nada largado — por enquanto.' },
]

export const STATUS_ROTULO_LIVRO: Record<StatusItem, string> = {
  quero: 'Quero ler',
  vendo: 'Lendo',
  visto: 'Lido',
  abandonei: 'Larguei',
}

export function rotuloDaPrateleira(status: StatusItem): string {
  return STATUS_ROTULO_LIVRO[status]
}

/** A avaliação de uma pessoa neste item, se ela tiver alguma. */
export function avaliacaoDe(item: ItemDoEspaco, userId: string | null): Avaliacao | undefined {
  if (!userId) return undefined
  return item.avaliacoes.find(a => a.user_id === userId)
}

/**
 * Em que prateleira o livro está PARA VOCÊ.
 *
 * `null` quer dizer "está no espaço, mas você não disse nada" — que é um estado
 * de verdade e não um erro: o outro adicionou, e para você o livro ainda é só
 * uma sugestão. A tela mostra esses numa faixa à parte, e não sumidos.
 */
export function prateleiraDe(item: ItemDoEspaco, userId: string | null): StatusItem | null {
  return avaliacaoDe(item, userId)?.status ?? null
}

/**
 * Os itens de cada prateleira, para uma pessoa.
 *
 * Devolve as quatro chaves sempre, mesmo vazias: a tela desenha as quatro
 * prateleiras fixas, e uma estante em que a seção "Lendo" some quando você
 * termina o livro seria uma estante que muda de forma a cada leitura.
 */
export function porPrateleira(
  itens: ItemDoEspaco[],
  userId: string | null,
): Record<StatusItem, ItemDoEspaco[]> {
  const grupos: Record<StatusItem, ItemDoEspaco[]> = {
    quero: [],
    vendo: [],
    visto: [],
    abandonei: [],
  }

  for (const item of itens) {
    const prateleira = prateleiraDe(item, userId)
    if (prateleira) grupos[prateleira].push(item)
  }

  return grupos
}

/** Os que estão no espaço e você ainda não classificou — sugestões do outro. */
export function semPrateleira(itens: ItemDoEspaco[], userId: string | null): ItemDoEspaco[] {
  return itens.filter(item => prateleiraDe(item, userId) === null)
}

// ---------------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------------

/** Total de páginas do livro, quando o Google Books informou. */
export function paginasDoLivro(item: ItemDoEspaco): number | null {
  const bruto = (item.media.metadados as { paginas?: unknown } | null)?.paginas
  return typeof bruto === 'number' && bruto > 0 ? bruto : null
}

/**
 * O quanto já foi lido, de 0 a 100 — ou `null` quando não dá para saber.
 *
 * Precisa das duas pontas: a página em que a pessoa está e o total do livro.
 * Faltando qualquer uma, a tela mostra "página 80" sem barra, em vez de uma
 * barra inventada.
 *
 * O teto é 100 de propósito. Edição com numeração diferente da que o Google
 * registrou é comum (bolso vs. capa dura), e uma barra de 130% pareceria bug —
 * a pessoa anotou a página certa do livro que tem na mão.
 */
export function progressoDaLeitura(item: ItemDoEspaco, userId: string | null): number | null {
  const pagina = avaliacaoDe(item, userId)?.pagina_atual
  const total = paginasDoLivro(item)

  if (typeof pagina !== 'number' || !total) return null
  return Math.min(100, Math.round((pagina / total) * 100))
}

// ---------------------------------------------------------------------------
// A meta do ano
// ---------------------------------------------------------------------------

export interface MetaLeitura {
  user_id: string
  ano: number
  alvo: number
}

export interface ProgressoDaMeta {
  alvo: number
  lidos: number
  /** 0 a 100, limitado — ler o dobro da meta não desenha barra de 200%. */
  percentual: number
  /** Quantos faltam; zero quando a meta foi batida. */
  faltam: number
  cumprida: boolean
}

/**
 * Quantos livros a pessoa terminou num ano.
 *
 * O ano vem de `visto_em`, e não de `created_at` do item: o que a meta conta é
 * quando você TERMINOU de ler, não quando o livro entrou na estante. Um livro
 * adicionado em dezembro e terminado em janeiro conta para o ano novo — que é o
 * que qualquer pessoa responderia se perguntada.
 *
 * Terminado sem data não entra em ano nenhum. É a mesma regra do "não lembro"
 * de Filmes: sem data não há ano a que pertencer, e chutar o ano corrente
 * inflaria a meta de quem cadastrou a estante velha de uma vez.
 */
export function lidosNoAno(itens: ItemDoEspaco[], userId: string | null, ano: number): number {
  if (!userId) return 0

  return itens.filter(item =>
    item.avaliacoes.some(av =>
      av.user_id === userId
      && av.status === 'visto'
      && av.visto_em
      && Number.parseInt(av.visto_em.slice(0, 4), 10) === ano,
    ),
  ).length
}

/** O progresso pronto para a barra, ou `null` quando não há meta definida. */
export function progressoDaMeta(
  itens: ItemDoEspaco[],
  userId: string | null,
  meta: MetaLeitura | null | undefined,
): ProgressoDaMeta | null {
  if (!meta || meta.alvo <= 0) return null

  const lidos = lidosNoAno(itens, userId, meta.ano)

  return {
    alvo: meta.alvo,
    lidos,
    percentual: Math.min(100, Math.round((lidos / meta.alvo) * 100)),
    faltam: Math.max(0, meta.alvo - lidos),
    cumprida: lidos >= meta.alvo,
  }
}

/**
 * "3 de 12 · faltam 9", ou "12 de 12 · meta batida!".
 *
 * Montado aqui e não no template porque é a frase que aparece em dois lugares
 * (a estante e o resumo do painel) — duas cópias divergiriam na primeira vez
 * que alguém mudasse o texto.
 */
export function fraseDaMeta(progresso: ProgressoDaMeta): string {
  const base = `${progresso.lidos} de ${progresso.alvo}`
  return progresso.cumprida
    ? `${base} · meta batida!`
    : `${base} · ${progresso.faltam === 1 ? 'falta 1' : `faltam ${progresso.faltam}`}`
}
