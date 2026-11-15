import { describe, expect, it } from 'vitest'
import { intervaloDaJanela, proximaConsulta } from '~~/supabase/functions/_shared/pluggy-api'

describe('intervaloDaJanela', () => {
  it('cobre o dia inteiro de Brasília, em UTC', () => {
    expect(intervaloDaJanela('2026-08-17', '2026-11-15')).toEqual({
      dateFrom: '2026-08-17T03:00:00.000Z',
      dateTo: '2026-11-16T02:59:59.999Z',
    })
  })
})

describe('proximaConsulta', () => {
  it('fim da paginação', () => {
    expect(proximaConsulta(null)).toBeNull()
    expect(proximaConsulta('')).toBeNull()
  })

  it('query pronta, como a documentação descreve', () => {
    expect(proximaConsulta('?accountId=a&after=xyz')).toBe('?accountId=a&after=xyz')
  })

  it('aceita a query sem "?" e a URL inteira', () => {
    expect(proximaConsulta('accountId=a&after=xyz')).toBe('?accountId=a&after=xyz')
    expect(proximaConsulta('https://api.pluggy.ai/v2/transactions?accountId=a&after=xyz'))
      .toBe('?accountId=a&after=xyz')
  })
})
