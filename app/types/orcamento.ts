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
  /**
   * A que espaço a compra pertence. Vem junto porque a tela de Orçamentos pode
   * mostrar duas gavetas ao mesmo tempo — o espaço ativo e o pessoal — e daí em
   * diante é este campo que diz de qual delas a linha veio: qual selo mostrar,
   * que cache invalidar ao editar, e o que fica de fora do acerto do mês.
   */
  space_id: string
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

/** Arredonda para centavo. Só na borda — nunca no meio de uma soma. */
const centavos = (v: number) => Math.round(v * 100) / 100

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

/** O que o mês custou, somando as parcelas que caem nele. */
export function totalDoMes(compras: CompraDoMes[]): number {
  return Math.round(compras.reduce((t, c) => t + c.valor, 0) * 100) / 100
}

/**
 * "Quanto EU gastei no mês" — a sua parte do que é dividido, mais o que é só seu.
 *
 * É um número diferente do gasto do espaço, e os dois não se somam: metade do
 * gasto do espaço é dívida da outra pessoa. Mostrar um "total" único misturando
 * as duas coisas produziria um número que não responde a pergunta nenhuma, e é
 * exatamente o erro que a tela evita ao exibir as duas leituras lado a lado.
 *
 * As compras pessoais entram inteiras: no espaço pessoal você é o único membro,
 * então não há rateio a aplicar.
 */
export function meuBolso(
  compartilhadas: CompraDoMes[],
  pessoais: CompraDoMes[],
  eu: string | null,
): number {
  if (!eu) return totalDoMes(pessoais)

  const minhaParte = compartilhadas.reduce(
    (t, c) => t + parteDe(c.participantes, eu, c.valor),
    0,
  )

  return Math.round((minhaParte + pessoais.reduce((t, c) => t + c.valor, 0)) * 100) / 100
}

// ---- Gasto por categoria ----------------------------------------------------

/** Chave da fatia que junta tudo o que ninguém categorizou. */
export const SEM_CATEGORIA = 'sem-categoria'

/** Uma categoria vista de dentro de um mês: o que ela pesou e do que é feita. */
export interface FatiaCategoria {
  /** Nome normalizado, ou `SEM_CATEGORIA` no fallback. */
  chave: string
  nome: string
  /** `null` no fallback — "Não categorizado" não é uma linha da tabela. */
  cor: CorCategoria | null
  total: number
  /** As compras da fatia, da maior para a menor. */
  compras: CompraDoMes[]
  /** Fatia do total do período, de 0 a 1. */
  fracao: number
}

/**
 * O gasto do período repartido por categoria — a leitura que o gráfico mostra.
 *
 * Agrupa pelo nome normalizado, e não pelo id: cada espaço tem a sua tabela de
 * categorias, então "Mercado" do casal e "Mercado" do pessoal são duas linhas
 * com ids diferentes. Pelo id, a tela mostraria duas barras "Mercado" — o que
 * seria fiel ao banco e mentiroso para quem lê. É a mesma normalização que a
 * coluna gerada `nome_norm` usa para unificar "Mercado" e "mercado".
 *
 * Ordena pelo peso, com "Não categorizado" sempre por último: ele não compete
 * com as categorias de verdade, é o resto que sobrou de fora delas.
 */
export function gastoPorCategoria(compras: CompraDoMes[]): FatiaCategoria[] {
  const fatias = new Map<string, FatiaCategoria>()

  for (const compra of compras) {
    const chave = compra.categoria ? normalizarCategoria(compra.categoria.nome) : SEM_CATEGORIA

    let fatia = fatias.get(chave)
    if (!fatia) {
      fatia = {
        chave,
        nome: compra.categoria?.nome ?? 'Não categorizado',
        cor: compra.categoria?.cor ?? null,
        total: 0,
        compras: [],
        fracao: 0,
      }
      fatias.set(chave, fatia)
    }

    fatia.total += compra.valor
    fatia.compras.push(compra)
  }

  const total = compras.reduce((t, c) => t + c.valor, 0)

  return [...fatias.values()]
    .map(fatia => ({
      ...fatia,
      total: centavos(fatia.total),
      // Da fração crua, não do total já arredondado: as frações precisam fechar em 1.
      fracao: total > 0 ? fatia.total / total : 0,
      compras: [...fatia.compras].sort((a, b) => b.valor - a.valor),
    }))
    .sort((a, b) => {
      if (a.chave === SEM_CATEGORIA) return 1
      if (b.chave === SEM_CATEGORIA) return -1
      return b.total - a.total
    })
}

/** Quanto uma compra pesa dentro da própria categoria, de 0 a 1. */
export function fracaoNaFatia(fatia: FatiaCategoria, compra: CompraDoMes): number {
  if (fatia.total <= 0) return 0
  return compra.valor / fatia.total
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

/**
 * A mesma paleta, em preenchimento sólido, para a barra do gráfico.
 *
 * O par de `CLASSE_COR` não serve aqui: ele é feito para um selo com texto por
 * cima, e num tom claro o suficiente para isso a barra some contra o cartão. A
 * barra não tem texto dentro, então pode ser o tom cheio — e continua trazendo
 * o par claro/escuro, pela mesma razão de sempre.
 */
export const CLASSE_BARRA: Record<CorCategoria, string> = {
  cinza: 'bg-slate-400 dark:bg-slate-500',
  marrom: 'bg-amber-600 dark:bg-amber-700',
  laranja: 'bg-orange-400 dark:bg-orange-500',
  amarelo: 'bg-yellow-400 dark:bg-yellow-500',
  verde: 'bg-emerald-400 dark:bg-emerald-500',
  azul: 'bg-sky-400 dark:bg-sky-500',
  roxo: 'bg-violet-400 dark:bg-violet-500',
  rosa: 'bg-pink-400 dark:bg-pink-500',
  vermelho: 'bg-red-400 dark:bg-red-500',
}

/** O fallback não é uma cor da paleta — é a ausência de uma escolha. */
export const CLASSE_BARRA_SEM_CATEGORIA = 'bg-muted-foreground/40'

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
