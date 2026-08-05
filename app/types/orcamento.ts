/**
 * Domínio de Orçamentos.
 *
 * Ver supabase/migrations/20260804180000_orcamento_compras.sql para o schema e
 * o porquê de o rateio ser peso, e não percentual.
 */
import type { CorCategoria, InformadoComo } from './database.types'

export interface Categoria {
  id: string
  nome: string
  cor: CorCategoria
}

export interface Participante {
  user_id: string
  peso: number
  informado_como: InformadoComo
}

/** Uma compra vista de dentro de um mês: a parcela daquele mês, não o total. */
export interface CompraDoMes {
  id: string
  descricao: string
  valor_total: number
  data_compra: string
  competencia_inicial: string
  parcelas: number
  pago_por: string
  registrado_por: string
  categoria: Categoria | null
  participantes: Participante[]
  /** Qual parcela cai neste mês (1-based) e quanto ela vale. Vêm da view. */
  numero: number
  valor: number
}

export interface NovaCompra {
  descricao: string
  valor_total: number
  data_compra: string
  competencia_inicial: string
  parcelas: number
  pago_por: string
  participantes: Array<{ user_id: string, peso: number, informado_como: InformadoComo }>
  categoria_nome: string | null
  categoria_cor: CorCategoria | null
}

// ---- Rateio ----------------------------------------------------------------

/**
 * Que fração da compra é de alguém.
 *
 * O peso não é normalizado no banco de propósito: "R$ 500 de R$ 1.500" fica
 * como 500 contra 1000, e a divisão só acontece aqui. Guardar 33,33% já
 * arredondado devolveria R$ 499,95 onde a pessoa digitou R$ 500,00.
 */
export function fracaoDe(participantes: Participante[], userId: string): number {
  const soma = participantes.reduce((t, p) => t + Number(p.peso), 0)
  if (soma <= 0) return 0
  const meu = participantes.find(p => p.user_id === userId)
  return meu ? Number(meu.peso) / soma : 0
}

/** Quanto do valor cabe a alguém. Sem arredondar — quem arredonda é a tela. */
export function parteDe(participantes: Participante[], userId: string, valor: number): number {
  return valor * fracaoDe(participantes, userId)
}

export interface SaldoMembro {
  user_id: string
  /** Quanto essa pessoa desembolsou no mês. */
  pago: number
  /** Quanto do gasto do mês é dela, pelo rateio. */
  devido: number
  /** Positivo = os outros devem a ela. */
  saldo: number
}

/**
 * O acerto de contas do mês — a conta que hoje é feita à mão no WhatsApp.
 *
 * Arredonda uma vez só, no fim. Arredondar a fatia de cada pessoa em cada
 * parcela faria os centavos derivarem ao longo do mês, e o total das partes
 * deixaria de bater com o total gasto.
 */
export function saldoDoMes(compras: CompraDoMes[], membrosIds: string[]): SaldoMembro[] {
  const pago = new Map<string, number>(membrosIds.map(id => [id, 0]))
  const devido = new Map<string, number>(membrosIds.map(id => [id, 0]))

  for (const compra of compras) {
    pago.set(compra.pago_por, (pago.get(compra.pago_por) ?? 0) + compra.valor)

    for (const participante of compra.participantes) {
      const parte = parteDe(compra.participantes, participante.user_id, compra.valor)
      devido.set(participante.user_id, (devido.get(participante.user_id) ?? 0) + parte)
    }
  }

  const centavos = (v: number) => Math.round(v * 100) / 100

  /*
   * A parte de cada um pode cair em meio centavo — 1/3 de R$ 1.500 arredonda
   * para cima nos dois lados e a soma das partes passa do total gasto. Quando
   * isso acontece, o resto vai para a maior parte (onde o ajuste pesa menos em
   * termos relativos), e só então o saldo é calculado.
   *
   * Fazer nessa ordem é o que garante as duas propriedades que a tela promete:
   * a soma das partes bate com o gasto do mês, e a soma dos saldos é zero. Se o
   * saldo fosse arredondado por conta própria, um "você tem +1.150,61 e ela
   * -1.150,62" apareceria sem explicação.
   */
  const partes = membrosIds.map(id => ({ id, valor: centavos(devido.get(id) ?? 0) }))
  const totalGasto = centavos(compras.reduce((t, c) => t + c.valor, 0))
  const residuo = centavos(partes.reduce((t, p) => t + p.valor, 0) - totalGasto)

  if (residuo !== 0 && partes.length) {
    const maior = partes.reduce((a, b) => (Math.abs(b.valor) > Math.abs(a.valor) ? b : a))
    maior.valor = centavos(maior.valor - residuo)
  }

  return membrosIds.map((user_id, i) => {
    const p = centavos(pago.get(user_id) ?? 0)
    const d = partes[i]!.valor
    return { user_id, pago: p, devido: d, saldo: centavos(p - d) }
  })
}

// ---- Cores das categorias --------------------------------------------------

/**
 * Paleta fixa, no espírito das tags do Notion. Cada cor traz o par claro/escuro
 * porque o app tem alternador de tema — uma cor escolhida só para o claro
 * costuma ficar ilegível no escuro.
 */
export const CLASSE_COR: Record<CorCategoria, string> = {
  cinza: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100',
  marrom: 'bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
  laranja: 'bg-orange-200 text-orange-900 dark:bg-orange-900 dark:text-orange-100',
  amarelo: 'bg-yellow-200 text-yellow-900 dark:bg-yellow-800 dark:text-yellow-100',
  verde: 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
  azul: 'bg-sky-200 text-sky-900 dark:bg-sky-900 dark:text-sky-100',
  roxo: 'bg-violet-200 text-violet-900 dark:bg-violet-900 dark:text-violet-100',
  rosa: 'bg-pink-200 text-pink-900 dark:bg-pink-900 dark:text-pink-100',
  vermelho: 'bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100',
}

export const ROTULO_COR: Record<CorCategoria, string> = {
  cinza: 'Cinza',
  marrom: 'Marrom',
  laranja: 'Laranja',
  amarelo: 'Amarelo',
  verde: 'Verde',
  azul: 'Azul',
  roxo: 'Roxo',
  rosa: 'Rosa',
  vermelho: 'Vermelho',
}

/** Normalização que espelha a coluna gerada `nome_norm` no banco. */
export function normalizarCategoria(nome: string): string {
  return nome.trim().toLowerCase()
}
