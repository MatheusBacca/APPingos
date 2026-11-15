import { describe, expect, it } from 'vitest'
import { categoriaPluggyEmPortugues } from '~/lib/categorias-pluggy'

describe('categoriaPluggyEmPortugues', () => {
  it('traduz as categorias comuns da Pluggy', () => {
    expect(categoriaPluggyEmPortugues('Groceries')).toBe('Mercado')
    expect(categoriaPluggyEmPortugues('Salary')).toBe('Salário')
    expect(categoriaPluggyEmPortugues('Transfer - PIX')).toBe('Pix')
    expect(categoriaPluggyEmPortugues('Taxi and ride-hailing')).toBe('Táxi e aplicativo')
    expect(categoriaPluggyEmPortugues('Credit card payment')).toBe('Pagamento de fatura')
  })

  it('ignora maiúsculas e espaços nas pontas', () => {
    expect(categoriaPluggyEmPortugues('  FOOD DELIVERY ')).toBe('Delivery')
  })

  it('categoria desconhecida aparece como veio, em vez de sumir', () => {
    expect(categoriaPluggyEmPortugues('Space tourism')).toBe('Space tourism')
  })

  it('vazio ou nulo não vira texto', () => {
    expect(categoriaPluggyEmPortugues(null)).toBeNull()
    expect(categoriaPluggyEmPortugues('  ')).toBeNull()
  })
})
