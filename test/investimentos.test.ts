import { describe, expect, it } from 'vitest'
import { movimentosRecentes, pareceInvestimento, resumoPorBanco, saldoDaCaixinha } from '~/lib/investimentos'

const mov = (valor: number, data: string, id = `${valor}-${data}`) =>
  ({ id, valor, data, transacao_id: null, meta_aporte_id: null, user_id: 'u' })

describe('caixinha', () => {
  it('saldo é aplicação menos resgate', () => {
    expect(saldoDaCaixinha({ movimentos: [mov(5000, '2026-11-06'), mov(-3090, '2026-11-10'), mov(0.1, '2026-11-11'), mov(0.2, '2026-11-12')] })).toBe(1910.3)
  })

  it('movimentos do mais novo para o mais velho', () => {
    const ms = movimentosRecentes({ movimentos: [mov(1, '2026-10-01'), mov(2, '2026-11-10'), mov(3, '2026-11-06')] }, 2)
    expect(ms.map(m => m.valor)).toEqual([2, 3])
  })
})

describe('resumoPorBanco', () => {
  const p = (banco: string, saldo: number | null, valor_original: number | null, vencimento: string | null, situacao = 'ACTIVE') =>
    ({ id: `${banco}${saldo}${vencimento}`, nome: 'CDB - NU FINANCEIRA S.A.', subtipo: 'CDB', saldo, valor_original, vencimento, situacao, banco })

  it('soma por banco, calcula o rendimento e ignora o que foi resgatado', () => {
    const r = resumoPorBanco([
      p('Nubank', 330.89, 300, '2027-12-19'),
      p('Nubank', 457.77, 400, '2027-09-08'),
      p('Nubank', 0, 0, '2026-01-02', 'TOTAL_WITHDRAWAL'),
      p('Nubank', 1581.68, 1500, null),
      p('C6', 1000, 990, '2028-01-01'),
    ])
    expect(r.map(b => b.banco)).toEqual(['Nubank', 'C6'])
    expect(r[0]!.ativas).toHaveLength(3)
    expect(r[0]!.saldo).toBe(2370.34)
    expect(r[0]!.aplicado).toBe(2200)
    expect(r[0]!.rendimento).toBe(170.34)
    expect(r[0]!.proximoVencimento).toBe('2027-09-08')
    // Sem vencimento vai para o fim.
    expect(r[0]!.ativas.at(-1)!.vencimento).toBeNull()
  })
})

describe('pareceInvestimento', () => {
  it('reconhece o que o Nubank e outros bancos escrevem', () => {
    expect(pareceInvestimento({ descricao: 'Aplicação RDB' })).toBe(true)
    expect(pareceInvestimento({ descricao: 'Resgate RDB' })).toBe(true)
    expect(pareceInvestimento({ descricao: 'Valor recebido de Investimento', categoria_pluggy: 'Third party transfers' })).toBe(true)
    expect(pareceInvestimento({ descricao: 'Qualquer coisa', categoria_pluggy: 'Investments' })).toBe(true)
    expect(pareceInvestimento({ descricao: 'Festval Shopping', categoria_pluggy: 'Groceries' })).toBe(false)
  })
})
