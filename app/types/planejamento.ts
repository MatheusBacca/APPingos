/**
 * Domínio do Planejamento financeiro: o salário e a contribuição ao casal.
 *
 * Schema e RLS em supabase/migrations/20261112120000_planejamento_renda.sql; o
 * contrato com a Frente B (Pluggy) em docs/contrato-planejamento-open-finance.md.
 *
 * As uniões abaixo espelham os CHECKs à mão, como em `database.types.ts`: o
 * gerador entrega texto com CHECK como `string`.
 */
import type { RecebimentoTipo } from '@/lib/salario'

export type { RecebimentoTipo }

/** De onde veio um fato de dinheiro: digitado aqui, ou lido do extrato pela Pluggy. */
export type OrigemLancamento = 'manual' | 'pluggy'

/**
 * O salário de uma pessoa — líquido, mensal, uma linha só.
 *
 * Quem lê a linha de OUTRA pessoa só a recebe se ela compartilhou o salário num
 * espaço em comum (`renda_compartilhamento`). Na ausência, a consulta volta
 * vazia, e a tela trata "sem salário" e "salário privado" do mesmo jeito: nada a
 * mostrar.
 */
export interface Renda {
  user_id: string
  valor_liquido: number
  recebimento_tipo: RecebimentoTipo
  recebimento_dia: number
  updated_at: string
}

/**
 * O maior dia que a regra aceita — espelha o CHECK `renda_recebimento_dia_valido`.
 * Um mês tem no máximo 23 dias de segunda a sexta; acima disso o "N-ésimo dia
 * útil" nunca existiria.
 */
export function diaMaximoDoRecebimento(tipo: RecebimentoTipo): number {
  return tipo === 'dia_fixo' ? 31 : 23
}

/** A regra que o banco aceitaria — para o formulário barrar antes do erro de constraint. */
export function recebimentoValido(tipo: RecebimentoTipo, dia: number): boolean {
  return Number.isInteger(dia) && dia >= 1 && dia <= diaMaximoDoRecebimento(tipo)
}

/** "O salário de novembro caiu." A presença da linha é o fato. */
export interface RendaRecebida {
  user_id: string
  /** Âncora do mês, YYYY-MM-01. */
  competencia: string
  valor: number
  recebido_em: string
  origem: OrigemLancamento
  transacao_id: string | null
}

export type ModoContribuicao = 'valor' | 'percentual'

/** A linha crua da contribuição — só a própria pessoa a lê. */
export interface Contribuicao {
  space_id: string
  user_id: string
  modo: ModoContribuicao
  /** Reais no modo 'valor'; de 0 a 100 no modo 'percentual'. */
  valor: number
}

/**
 * Uma contribuição vista pelo espaço, como `contribuicoes_do_espaco` devolve.
 *
 * `valor_efetivo` é sempre em reais; `null` quando a pessoa contribui em
 * percentual e não tem salário cadastrado (não há base para a conta).
 * `percentual` só vem para você mesmo ou quando o salário daquela pessoa está
 * compartilhado no espaço — senão o salário seria dedutível por regra de três.
 */
export interface ContribuicaoDoEspaco {
  user_id: string
  modo: ModoContribuicao
  valor_efetivo: number | null
  percentual: number | null
}

const centavos = (v: number) => Math.round(v * 100) / 100

/**
 * O valor central do casal: a soma do que cada um declarou pôr nas contas.
 *
 * As contribuições sem valor efetivo (percentual sem salário) ficam de fora — a
 * mesma régua do `sum` do SQL, que ignora nulos. Somá-las como zero daria o
 * mesmo número, mas a tela precisa saber que falta uma base para avisar.
 */
export function valorCentral(contribuicoes: ReadonlyArray<Pick<ContribuicaoDoEspaco, 'valor_efetivo'>>): number {
  return centavos(contribuicoes.reduce((t, c) => t + (c.valor_efetivo ?? 0), 0))
}

/**
 * Quanto uma contribuição vale em reais, do lado de quem a declarou — o mesmo
 * arredondamento da RPC (`round(salário × % / 100, 2)`).
 *
 * Existe para o formulário mostrar "30% = R$ 1.500,00" enquanto a pessoa digita,
 * sem ida ao banco. `null` no modo percentual sem salário.
 */
export function valorDaContribuicao(
  contribuicao: Pick<Contribuicao, 'modo' | 'valor'>,
  salario: number | null | undefined,
): number | null {
  if (contribuicao.modo === 'valor') return centavos(contribuicao.valor)
  if (!salario) return null
  return centavos((salario * contribuicao.valor) / 100)
}
