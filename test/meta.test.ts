/**
 * Metas: o progresso é a soma dos aportes, e o aporte sugerido divide o que falta
 * pelos meses até o prazo, contando o mês atual.
 */
import { describe, expect, it } from 'vitest'
import { aporteMensalSugerido, guardadoPorPessoa, progressoDaMeta, somaDosAportes } from '~/types/meta'

describe('somaDosAportes', () => {
  it('soma com sinal: resgate devolve', () => {
    expect(somaDosAportes([{ valor: 500 }, { valor: 300.1 }, { valor: -100 }])).toBe(700.1)
  })

  it('sem aportes, zero', () => {
    expect(somaDosAportes(undefined)).toBe(0)
  })
})

describe('progressoDaMeta', () => {
  it('guardado, falta e a fração da barra', () => {
    expect(progressoDaMeta({ valor_alvo: 1000 }, [{ valor: 250 }])).toEqual({
      guardado: 250,
      falta: 750,
      fracao: 0.25,
      alcancada: false,
    })
  })

  it('passar do alvo para a barra em 100% e zera o que falta', () => {
    expect(progressoDaMeta({ valor_alvo: 1000 }, [{ valor: 1200 }])).toMatchObject({
      falta: 0,
      fracao: 1,
      alcancada: true,
    })
  })
})

describe('aporteMensalSugerido', () => {
  it('conta o mês atual: de novembro a junho são oito meses', () => {
    expect(aporteMensalSugerido({ valor_alvo: 2400, prazo: '2027-06-30' }, 0, '2026-11-12'))
      .toEqual({ porMes: 300, meses: 8, vencido: false })
  })

  it('arredonda para cima, para guardar o sugerido bastar', () => {
    expect(aporteMensalSugerido({ valor_alvo: 1000, prazo: '2027-01-31' }, 0, '2026-11-12'))
      .toEqual({ porMes: 333.34, meses: 3, vencido: false })
  })

  it('prazo neste mês: tudo neste mês', () => {
    expect(aporteMensalSugerido({ valor_alvo: 1000, prazo: '2026-11-30' }, 400, '2026-11-12'))
      .toEqual({ porMes: 600, meses: 1, vencido: false })
  })

  it('prazo vencido devolve o que falta, sem dividir por mês negativo', () => {
    expect(aporteMensalSugerido({ valor_alvo: 1000, prazo: '2026-10-31' }, 400, '2026-11-12'))
      .toEqual({ porMes: 600, meses: 1, vencido: true })
  })

  it('vencido no mesmo mês, dias antes de hoje, também é vencido', () => {
    expect(aporteMensalSugerido({ valor_alvo: 1000, prazo: '2026-11-05' }, 0, '2026-11-12')?.vencido).toBe(true)
  })

  it('sem prazo, ou já alcançada, não há o que sugerir', () => {
    expect(aporteMensalSugerido({ valor_alvo: 1000, prazo: null }, 0, '2026-11-12')).toBeNull()
    expect(aporteMensalSugerido({ valor_alvo: 1000, prazo: '2027-06-30' }, 1000, '2026-11-12')).toBeNull()
  })
})

describe('guardadoPorPessoa', () => {
  it('soma por pessoa, com os resgates de cada um', () => {
    const porPessoa = guardadoPorPessoa([
      { user_id: 'ana', valor: 800 },
      { user_id: 'bia', valor: 1200 },
      { user_id: 'ana', valor: -300 },
    ])
    expect(porPessoa.get('ana')).toBe(500)
    expect(porPessoa.get('bia')).toBe(1200)
  })
})
