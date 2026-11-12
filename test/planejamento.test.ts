/**
 * O valor central do casal e a contribuição em reais.
 *
 * As duas contas espelham a RPC `contribuicoes_do_espaco` — o arredondamento e o
 * tratamento do percentual sem salário precisam ser os mesmos, ou a tela de quem
 * digita mostraria um número e a do outro membro, outro.
 */
import { describe, expect, it } from 'vitest'
import { valorCentral, valorDaContribuicao } from '~/types/planejamento'

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
