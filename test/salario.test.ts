/**
 * Quando o salário deve cair.
 *
 * `dataPrevistaDoSalario` é a data que a projeção do mês espera e que a Frente B
 * (Pluggy) usa como centro da janela de conciliação do crédito. Um feriado móvel
 * errado desloca o "5º dia útil" — e o app passaria a cobrar um salário que ainda
 * nem tinha como ter caído.
 */
import { describe, expect, it } from 'vitest'
import { dataPrevistaDoSalario, descreverRecebimento, ehDiaUtil, feriadosNacionais, pascoa } from '~/lib/salario'

describe('pascoa', () => {
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2038, '2038-04-25'], // a mais tardia possível
  ])('%i → %s', (ano, esperado) => {
    expect(pascoa(ano)).toBe(esperado)
  })
})

describe('feriadosNacionais', () => {
  it('deriva Carnaval, Sexta-feira Santa e Corpus Christi da Páscoa', () => {
    const datas = feriadosNacionais(2026).map(f => f.data)
    expect(datas).toContain('2026-02-16')
    expect(datas).toContain('2026-02-17')
    expect(datas).toContain('2026-04-03')
    expect(datas).toContain('2026-06-04')
  })

  it('só conta a Consciência Negra a partir de 2024, quando virou nacional', () => {
    expect(feriadosNacionais(2023).map(f => f.data)).not.toContain('2023-11-20')
    expect(feriadosNacionais(2024).map(f => f.data)).toContain('2024-11-20')
  })

  it('vem em ordem de data', () => {
    const datas = feriadosNacionais(2026).map(f => f.data)
    expect(datas).toEqual([...datas].sort())
  })
})

describe('ehDiaUtil', () => {
  it('fim de semana não é dia útil', () => {
    expect(ehDiaUtil('2026-11-14')).toBe(false) // sábado
    expect(ehDiaUtil('2026-11-15')).toBe(false) // domingo
  })

  it('feriado nacional numa sexta não é dia útil', () => {
    expect(ehDiaUtil('2026-11-20')).toBe(false)
  })

  it('dia de semana comum é', () => {
    expect(ehDiaUtil('2026-11-12')).toBe(true)
  })
})

describe('dataPrevistaDoSalario — dia útil', () => {
  it('pula Finados ao contar o 5º dia útil de novembro', () => {
    // 01 é domingo e 02 é feriado: 3, 4, 5, 6, 9.
    expect(dataPrevistaDoSalario('2026-11-01', 'dia_util', 5)).toBe('2026-11-09')
  })

  it('pula o 1º de janeiro', () => {
    expect(dataPrevistaDoSalario('2026-01-01', 'dia_util', 5)).toBe('2026-01-08')
  })

  it('pula a Sexta-feira Santa', () => {
    expect(dataPrevistaDoSalario('2026-04-01', 'dia_util', 5)).toBe('2026-04-08')
  })

  it('pula os dois dias de Carnaval', () => {
    expect(dataPrevistaDoSalario('2026-02-01', 'dia_util', 10)).toBe('2026-02-13')
    expect(dataPrevistaDoSalario('2026-02-01', 'dia_util', 11)).toBe('2026-02-18')
  })

  it('N maior que os dias úteis do mês vira o último dia útil, nunca o mês seguinte', () => {
    // Fevereiro de 2026: 20 dias de semana, menos o Carnaval = 18.
    expect(dataPrevistaDoSalario('2026-02-01', 'dia_util', 23)).toBe('2026-02-27')
  })

  it('o 1º dia útil pode ser o próprio dia 1', () => {
    expect(dataPrevistaDoSalario('2026-12-01', 'dia_util', 1)).toBe('2026-12-01')
  })

  it('aceita qualquer data do mês como competência', () => {
    expect(dataPrevistaDoSalario('2026-11-23', 'dia_util', 5)).toBe('2026-11-09')
  })
})

describe('dataPrevistaDoSalario — dia fixo', () => {
  it('é o dia declarado, mesmo caindo num fim de semana', () => {
    expect(dataPrevistaDoSalario('2026-11-01', 'dia_fixo', 15)).toBe('2026-11-15')
  })

  it('num mês sem aquele dia, vale o último', () => {
    expect(dataPrevistaDoSalario('2026-04-01', 'dia_fixo', 31)).toBe('2026-04-30')
    expect(dataPrevistaDoSalario('2026-02-01', 'dia_fixo', 30)).toBe('2026-02-28')
    expect(dataPrevistaDoSalario('2028-02-01', 'dia_fixo', 31)).toBe('2028-02-29')
  })
})

describe('descreverRecebimento', () => {
  it('fala a regra como a pessoa fala', () => {
    expect(descreverRecebimento('dia_fixo', 5)).toBe('todo dia 5')
    expect(descreverRecebimento('dia_util', 5)).toBe('até o 5º dia útil')
  })
})
