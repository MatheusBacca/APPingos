/**
 * Investimentos no Planejamento: as caixinhas que a pessoa cadastra (com as
 * aplicações e resgates do extrato ligados a elas) e as posições que a Pluggy
 * traz de cada banco.
 *
 * Por que as duas coisas: a Pluggy não traz o nome da caixinha (as 74 posições
 * do Nubank vinham todas como "CDB - NU FINANCEIRA S.A.") e atrasa os movimentos,
 * mas dá o saldo de verdade por banco. A caixinha dá o "para quê"; a posição, o
 * quanto rende. Ver supabase/migrations/20261121120000_caixinhas.sql.
 */

export interface MovimentoDaCaixinha {
  id: string
  valor: number
  data: string
  transacao_id: string | null
  meta_aporte_id: string | null
  user_id: string
}

export interface Caixinha {
  id: string
  space_id: string
  criado_por: string
  nome: string
  instituicao: string | null
  meta_id: string | null
  arquivada: boolean
  meta: { id: string, titulo: string, valor_alvo: number } | null
  movimentos: MovimentoDaCaixinha[]
}

/** O saldo da caixinha: aplicações menos resgates. */
export function saldoDaCaixinha(c: Pick<Caixinha, 'movimentos'>): number {
  return Math.round(c.movimentos.reduce((s, m) => s + Number(m.valor), 0) * 100) / 100
}

/** Os movimentos, o mais novo primeiro. */
export function movimentosRecentes(c: Pick<Caixinha, 'movimentos'>, quantos = 4): MovimentoDaCaixinha[] {
  return [...c.movimentos].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0)).slice(0, quantos)
}

export interface PosicaoDoBanco {
  id: string
  nome: string
  subtipo: string | null
  saldo: number | null
  valor_original: number | null
  vencimento: string | null
  situacao: string | null
  /** O banco da conexão (`conexao_bancaria.instituicao`, ou o nome). */
  banco: string
}

export interface ResumoDoBanco {
  banco: string
  /** As posições com saldo, por vencimento (as sem vencimento no fim). */
  ativas: PosicaoDoBanco[]
  saldo: number
  aplicado: number
  /**
   * Saldo menos o aplicado. A Pluggy manda `amountProfit` nulo para o Nubank
   * (amostra de 20/11/2026), então o rendimento é calculado — e é bruto de IR.
   */
  rendimento: number
  proximoVencimento: string | null
}

/** Agrupa as posições por banco, só as que ainda têm saldo (o resgate total sai). */
export function resumoPorBanco(posicoes: ReadonlyArray<PosicaoDoBanco>): ResumoDoBanco[] {
  const grupos = new Map<string, PosicaoDoBanco[]>()
  for (const p of posicoes) {
    if (!p.saldo || p.saldo <= 0 || p.situacao === 'TOTAL_WITHDRAWAL') continue
    grupos.set(p.banco, [...(grupos.get(p.banco) ?? []), p])
  }
  return [...grupos].map(([banco, ativas]) => {
    const ordenadas = [...ativas].sort((a, b) => (a.vencimento ?? '9999') < (b.vencimento ?? '9999') ? -1 : 1)
    const saldo = ativas.reduce((s, p) => s + Number(p.saldo ?? 0), 0)
    const aplicado = ativas.reduce((s, p) => s + Number(p.valor_original ?? p.saldo ?? 0), 0)
    const redondo = (n: number) => Math.round(n * 100) / 100
    return {
      banco,
      ativas: ordenadas,
      saldo: redondo(saldo),
      aplicado: redondo(aplicado),
      rendimento: redondo(saldo - aplicado),
      proximoVencimento: ordenadas.find(p => p.vencimento)?.vencimento ?? null,
    }
  }).sort((a, b) => b.saldo - a.saldo)
}

/**
 * Se a transação da caixa parece aplicação ou resgate — é o que põe
 * "Investimento" em primeiro na lista de destinos. Não classifica nada sozinha.
 */
export function pareceInvestimento(t: { descricao: string, categoria_pluggy?: string | null }): boolean {
  if (/^investments?$/i.test(t.categoria_pluggy ?? '')) return true
  return /\b(aplica[cç][aã]o|resgate|rdb|cdb|caixinha|investimento|tesouro|lci|lca)\b/i.test(t.descricao)
}

export interface TotalInvestido {
  total: number
  /** Saldo menos o aplicado; `null` quando o total vem das caixinhas (não há aplicado). */
  rendimento: number | null
  origem: 'bancos' | 'caixinhas'
}

/**
 * O total investido. As posições dos bancos são o saldo de verdade; as caixinhas
 * são rótulos sobre esse mesmo dinheiro ("para quê"), então somar as duas
 * contaria duas vezes. Só sem banco conectado é que a soma das caixinhas vale.
 */
export function totalInvestido(
  bancos: ReadonlyArray<Pick<ResumoDoBanco, 'saldo' | 'aplicado'>>,
  caixinhas: ReadonlyArray<Pick<Caixinha, 'movimentos'>>,
): TotalInvestido | null {
  if (bancos.length) {
    const saldo = bancos.reduce((s, b) => s + b.saldo, 0)
    const aplicado = bancos.reduce((s, b) => s + b.aplicado, 0)
    return { total: saldo, rendimento: saldo - aplicado, origem: 'bancos' }
  }
  if (caixinhas.length) return { total: caixinhas.reduce((s, c) => s + saldoDaCaixinha(c), 0), rendimento: null, origem: 'caixinhas' }
  return null
}
