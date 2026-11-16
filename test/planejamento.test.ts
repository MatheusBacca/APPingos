/**
 * O valor central do casal e a contribuição em reais.
 *
 * As duas contas espelham a RPC `contribuicoes_do_espaco` — o arredondamento e o
 * tratamento do percentual sem salário precisam ser os mesmos, ou a tela de quem
 * digita mostraria um número e a do outro membro, outro.
 */
import { describe, expect, it } from 'vitest'
import {
  diaMaximoDoRecebimento,
  projecaoDoCasal,
  projecaoPessoal,
  recebimentoValido,
  valorCentral,
  valorDaContribuicao,
} from '~/types/planejamento'

describe('valorCentral', () => {
  it('é a soma do valor efetivo de cada um', () => {
    expect(valorCentral([{ valor_efetivo: 1500 }, { valor_efetivo: 1200.1 }])).toBe(2700.1)
  })

  it('ignora quem contribui em percentual sem salário cadastrado', () => {
    expect(valorCentral([{ valor_efetivo: 1500 }, { valor_efetivo: null }])).toBe(1500)
  })

  it('sem contribuições, zero', () => {
    expect(valorCentral([])).toBe(0)
  })
})

describe('valorDaContribuicao', () => {
  it('no modo valor, é o próprio valor', () => {
    expect(valorDaContribuicao({ modo: 'valor', valor: 800 }, null)).toBe(800)
  })

  it('no modo percentual, aplica sobre o salário com o arredondamento da RPC', () => {
    expect(valorDaContribuicao({ modo: 'percentual', valor: 30 }, 5000)).toBe(1500)
    expect(valorDaContribuicao({ modo: 'percentual', valor: 33.33 }, 4321.09)).toBe(1440.22)
  })

  it('percentual sem salário não tem base', () => {
    expect(valorDaContribuicao({ modo: 'percentual', valor: 30 }, null)).toBeNull()
  })
})

describe('recebimentoValido', () => {
  it('dia fixo vai de 1 a 31', () => {
    expect(recebimentoValido('dia_fixo', 31)).toBe(true)
    expect(recebimentoValido('dia_fixo', 32)).toBe(false)
    expect(recebimentoValido('dia_fixo', 0)).toBe(false)
  })

  it('dia útil vai de 1 a 23 — um mês nunca tem mais que isso', () => {
    expect(recebimentoValido('dia_util', 23)).toBe(true)
    expect(recebimentoValido('dia_util', 24)).toBe(false)
    expect(diaMaximoDoRecebimento('dia_util')).toBe(23)
  })

  it('recusa dia quebrado', () => {
    expect(recebimentoValido('dia_fixo', 5.5)).toBe(false)
  })
})

describe('projecaoPessoal', () => {
  it('salário − contribuição − gastos pessoais − aportes', () => {
    const p = projecaoPessoal({
      salario: 5000,
      contribuicoes: [1500],
      gastosPessoais: 820.5,
      aportesPessoais: 300,
    })
    expect(p).toMatchObject({
      salario: 5000,
      contribuicao: 1500,
      planejado: 3500,
      realizado: 1120.5,
      sobra: 2379.5,
    })
    expect(p!.uso).toBeCloseTo(1120.5 / 3500)
  })

  it('soma as contribuições de mais de um espaço e ignora as sem base', () => {
    const p = projecaoPessoal({ salario: 5000, contribuicoes: [1000, 500, null], gastosPessoais: 0, aportesPessoais: 0 })
    expect(p?.contribuicao).toBe(1500)
    expect(p?.planejado).toBe(3500)
  })

  it('resgate devolve dinheiro ao mês', () => {
    const p = projecaoPessoal({ salario: 1000, contribuicoes: [], gastosPessoais: 200, aportesPessoais: -100 })
    expect(p?.realizado).toBe(100)
    expect(p?.sobra).toBe(900)
  })

  it('sobra negativa quando o mês passa do plano', () => {
    const p = projecaoPessoal({ salario: 1000, contribuicoes: [800], gastosPessoais: 300, aportesPessoais: 0 })
    expect(p?.sobra).toBe(-100)
    expect(p!.uso).toBeGreaterThan(1)
  })

  it('sem salário, não há projeção', () => {
    expect(projecaoPessoal({ salario: null, contribuicoes: [], gastosPessoais: 100, aportesPessoais: 0 })).toBeNull()
  })
})

describe('projecaoDoCasal', () => {
  it('valor central − parcelas − aportes do casal', () => {
    expect(projecaoDoCasal({ valorCentral: 2700, parcelas: 1900, aportes: 200 })).toMatchObject({
      planejado: 2700,
      realizado: 2100,
      sobra: 600,
    })
  })

  it('sem contribuição declarada, mostra o mês sem plano para cobrir', () => {
    const p = projecaoDoCasal({ valorCentral: 0, parcelas: 500, aportes: 0 })
    expect(p.sobra).toBe(-500)
    expect(p.uso).toBe(Infinity)
  })

  it('mês vazio e sem plano não estoura nada', () => {
    expect(projecaoDoCasal({ valorCentral: 0, parcelas: 0, aportes: 0 }).uso).toBe(0)
  })
})
