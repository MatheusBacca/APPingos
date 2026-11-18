import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErroPluggy, intervaloDaJanela, listarFaturas, proximaConsulta } from '~~/supabase/functions/_shared/pluggy-api'
import { FATURA_OUTUBRO } from './fixtures/pluggy'

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

describe('listarFaturas', () => {
  const responder = (status: number, corpo: unknown) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(corpo), { status })))

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('devolve as faturas com os campos opcionais como vieram', async () => {
    responder(200, { total: 1, totalPages: 1, page: 1, results: [FATURA_OUTUBRO] })
    const faturas = await listarFaturas('chave', 'acc-cartao')
    expect(faturas).toEqual([FATURA_OUTUBRO])
    expect(faturas[0]!.minimumPaymentAmount).toBe(352.56)
  })

  it('conexão sem faturas (não regulada) volta vazia', async () => {
    responder(404, { message: 'not found' })
    expect(await listarFaturas('chave', 'acc-cartao')).toEqual([])
  })

  it('chave vencida (401) sobe', async () => {
    responder(401, { message: 'unauthorized' })
    await expect(listarFaturas('chave', 'acc-cartao')).rejects.toBeInstanceOf(ErroPluggy)
  })
})
