/**
 * O arredondamento do acerto do mês.
 *
 * `saldoDoMes` é a única fonte do "quem deve quanto" — a tela de Orçamentos e o
 * painel de resumos leem daqui. As duas propriedades abaixo são o contrato:
 * a soma das partes bate com o gasto do mês, e a soma dos saldos é zero. Sem
 * elas aparece o clássico "você tem +1.150,61 e ela −1.150,62", sem explicação.
 */
import { describe, expect, it } from 'vitest'
import { saldoDoMes } from '~/types/orcamento'
import type { CompraDoMes } from '~/types/orcamento'

const EU = 'eu'
const ELA = 'ela'

function compra(valor: number, pagoPor: string, pesos: Record<string, number>): CompraDoMes {
  return {
    id: `c-${valor}-${pagoPor}`,
    descricao: 'Compra',
    valor_total: valor,
    data_compra: '2026-08-01',
    competencia_inicial: '2026-08-01',
    parcelas: 1,
    pago_por: pagoPor,
    registrado_por: pagoPor,
    categoria: null,
    participantes: Object.entries(pesos).map(([user_id, peso]) => ({
      user_id,
      peso,
      informado_como: 'percentual' as const,
    })),
    numero: 1,
    valor,
  }
}

const soma = (ns: number[]) => Math.round(ns.reduce((t, n) => t + n, 0) * 100) / 100

describe('saldoDoMes', () => {
  it('divide meio a meio e deixa quem pagou como credor', () => {
    const saldos = saldoDoMes([compra(100, EU, { [EU]: 1, [ELA]: 1 })], [EU, ELA])

    expect(saldos).toEqual([
      { user_id: EU, pago: 100, devido: 50, saldo: 50 },
      { user_id: ELA, pago: 0, devido: 50, saldo: -50 },
    ])
  })

  it('respeita o rateio por peso, sem normalizar antes da hora', () => {
    // "R$ 500 de R$ 1.500" — peso 500 contra 1000, e não 33,33%.
    const saldos = saldoDoMes([compra(1500, ELA, { [EU]: 500, [ELA]: 1000 })], [EU, ELA])

    expect(saldos.find(s => s.user_id === EU)?.devido).toBe(500)
    expect(saldos.find(s => s.user_id === ELA)?.devido).toBe(1000)
  })

  /*
   * Os valores abaixo caem em meio centavo quando divididos, que é o caso em
   * que arredondar cada parte por conta própria estoura o total.
   */
  it.each([0.15, 0.05, 1000.01, 33.33, 1500, 1234.57])(
    'mantém as duas propriedades com R$ %s',
    (valor) => {
      const compras = [
        compra(valor, EU, { [EU]: 1, [ELA]: 1 }),
        compra(valor, ELA, { [EU]: 1, [ELA]: 2 }),
      ]
      const saldos = saldoDoMes(compras, [EU, ELA])

      expect(soma(saldos.map(s => s.devido))).toBe(soma(compras.map(c => c.valor)))
      expect(soma(saldos.map(s => s.saldo))).toBe(0)
    },
  )

  it('devolve zeros para um mês sem compras', () => {
    expect(saldoDoMes([], [EU, ELA])).toEqual([
      { user_id: EU, pago: 0, devido: 0, saldo: 0 },
      { user_id: ELA, pago: 0, devido: 0, saldo: 0 },
    ])
  })
})
