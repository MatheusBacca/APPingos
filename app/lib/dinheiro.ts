/**
 * Dinheiro na tela.
 *
 * O banco guarda `numeric(12,2)` e o supabase-js entrega isso como `number` —
 * seguro nas faixas de um orçamento doméstico. O arredondamento acontece só
 * aqui, na exibição: arredondar a cada parcela e a cada pessoa faria os
 * centavos derivarem ao longo do mês.
 */

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export function formatarDinheiro(valor: number): string {
  return BRL.format(valor)
}

const PERCENTUAL = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 1,
})

export function formatarPercentual(fracao: number): string {
  return PERCENTUAL.format(fracao)
}

/**
 * O valor cru, para colar no app do banco ou na calculadora: `1200,99`.
 *
 * Sem símbolo, sem separador de milhar — os campos de valor de banco costumam
 * recusar o ponto, e "R$ 1.200,99" colado vira erro de digitação. A vírgula
 * fica porque é o separador decimal que esses campos esperam em pt-BR.
 */
export function valorParaCopiar(valor: number): string {
  return Math.abs(valor).toFixed(2).replace('.', ',')
}
