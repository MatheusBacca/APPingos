/**
 * A caixa de entrada (fase 5 do plano de Open Finance), sobre o contrato da
 * Frente A: o salário casa pela data prevista, o 50/50 é `rateioIgual`, e o
 * recuo das parcelas avisa quando mexe em mês já acertado.
 */
import { describe, expect, it } from 'vitest'
import {
  avisoDeMesAcertado,
  candidatasJaLancei,
  competenciaDoSalario,
  itensDaCaixa,
  participantesDaDivisao,
} from '~/lib/caixa-de-entrada'
import type { TransacaoDaCaixa } from '~/lib/caixa-de-entrada'
import { comprasParaLancar, normalizarTransacao } from '~/lib/importacao-bancaria'
import { CARTAO, parcela, transacao } from './fixtures/pluggy'

let seq = 0
function linha(extra: Partial<TransacaoDaCaixa> = {}): TransacaoDaCaixa {
  seq++
  return {
    id: `id-${seq}`,
    conta_id: 'conta-1',
    provider_id: `P${seq}`,
    pluggy_id: `t${seq}`,
    descricao: 'PADARIA',
    valor: 10,
    sentido: 'saida',
    data: '2026-11-05',
    competencia: '2026-11-01',
    pendente: false,
    parcela_numero: null,
    parcelas_total: null,
    valor_total_compra: null,
    data_compra: null,
    fatura_id: null,
    chave_compra: null,
    contraparte_nome: null,
    contraparte_documento: null,
    metodo: null,
    categoria_pluggy: null,
    motivo_exclusao: null,
    destino: null,
    compra_id: null,
    classificada_em: null,
    ...extra,
  }
}

const parcelaDaCaixa = (n: number, extra: Partial<TransacaoDaCaixa> = {}) => linha({
  descricao: `LOJA PARC 0${n}/03`,
  valor: 100,
  data: `2026-${String(9 + n).padStart(2, '0')}-07`,
  competencia: `2026-${String(9 + n).padStart(2, '0')}-01`,
  parcela_numero: n,
  parcelas_total: 3,
  valor_total_compra: 300,
  data_compra: '2026-09-07',
  chave_compra: 'K1',
  ...extra,
})

describe('itens da caixa', () => {
  it('as parcelas de uma compra são UM item, com o plano recuado', () => {
    const itens = itensDaCaixa([parcelaDaCaixa(2), linha(), parcelaDaCaixa(3)])
    expect(itens).toHaveLength(2)

    const loja = itens.find(i => i.transacoes.length === 2)!
    expect(loja.plano).toMatchObject({ descricao: 'LOJA', valor_total: 300, parcelas: 3, recuo_meses: 1, competencia_inicial: '2026-10-01' })
    expect(loja.principal.parcela_numero).toBe(2)
  })

  it('ordena pela data mais recente do item', () => {
    const itens = itensDaCaixa([linha({ data: '2026-11-01' }), linha({ data: '2026-11-20' }), parcelaDaCaixa(2)])
    expect(itens.map(i => i.data)).toEqual(['2026-11-20', '2026-11-07', '2026-11-01'])
  })

  it('a principal é a primeira parcela já lançada; tudo pendente trava o item', () => {
    const itens = itensDaCaixa([parcelaDaCaixa(2, { pendente: true }), parcelaDaCaixa(3)])
    expect(itens[0]!.principal.parcela_numero).toBe(3)
    expect(itens[0]!.pendente).toBe(false)
    expect(itensDaCaixa([linha({ pendente: true })])[0]!.pendente).toBe(true)
  })

  it('valor numérico vindo do PostgREST como texto não quebra o plano', () => {
    const [item] = itensDaCaixa([linha({ valor: '12.50' as unknown as number })])
    expect(item!.plano.valor_total).toBe(12.5)
  })
})

describe('já lancei', () => {
  const compras = [
    { id: 'a', space_id: 's', descricao: 'Padaria', valor_total: 12.5, data_compra: '2026-11-04' },
    { id: 'b', space_id: 's', descricao: 'Padaria de novo', valor_total: 12.5, data_compra: '2026-11-10' },
    { id: 'c', space_id: 's', descricao: 'Outra', valor_total: 13, data_compra: '2026-11-05' },
    { id: 'd', space_id: 's', descricao: 'Longe', valor_total: 12.5, data_compra: '2026-10-01' },
  ]

  it('mesmo valor e data perto, da mais próxima para a mais longe', () => {
    expect(candidatasJaLancei({ valor_total: 12.5, data_compra: '2026-11-05' }, compras).map(c => c.id)).toEqual(['a', 'b'])
  })

  it('valor diferente ou fora da janela não entra', () => {
    expect(candidatasJaLancei({ valor_total: 99, data_compra: '2026-11-05' }, compras)).toEqual([])
  })
})

describe('salário', () => {
  const quintoDiaUtil = { recebimento_tipo: 'dia_util' as const, recebimento_dia: 5 }

  it('crédito perto do 5º dia útil é daquele mês', () => {
    // 5º dia útil de novembro/2026: 06/11 (02/11 é Finados)
    expect(competenciaDoSalario('2026-11-06', quintoDiaUtil)).toBe('2026-11-01')
  })

  it('crédito adiantado no fim do mês é do mês seguinte', () => {
    expect(competenciaDoSalario('2026-11-30', quintoDiaUtil)).toBe('2026-12-01')
  })

  it('dia fixo atrasado no começo do mês continua do mês anterior', () => {
    expect(competenciaDoSalario('2026-12-01', { recebimento_tipo: 'dia_fixo', recebimento_dia: 28 })).toBe('2026-11-01')
  })

  it('sem salário cadastrado, é o mês do crédito', () => {
    expect(competenciaDoSalario('2026-11-30', null)).toBe('2026-11-01')
  })
})

describe('divisão rápida', () => {
  const casal = ['eu', 'ela']

  it('igual é o rateioIgual da Frente A: percentual 50/50', () => {
    expect(participantesDaDivisao('igual', 'eu', casal)).toEqual([
      { user_id: 'eu', peso: 50, informado_como: 'percentual' },
      { user_id: 'ela', peso: 50, informado_como: 'percentual' },
    ])
  })

  it('só eu, e só o outro (pagar uma conta em nome dele)', () => {
    expect(participantesDaDivisao('so-eu', 'eu', casal)).toEqual([{ user_id: 'eu', peso: 100, informado_como: 'percentual' }])
    expect(participantesDaDivisao('so-outro', 'eu', casal)).toEqual([{ user_id: 'ela', peso: 100, informado_como: 'percentual' }])
  })

  it('"só o outro" sem outro membro cai em só eu, nunca num rateio vazio', () => {
    expect(participantesDaDivisao('so-outro', 'eu', ['eu'])).toEqual([{ user_id: 'eu', peso: 100, informado_como: 'percentual' }])
  })
})

describe('aviso de mês acertado', () => {
  const plano = { competencia_inicial: '2026-09-01', parcelas: 3 }

  it('nomeia o mês acertado que a compra toca', () => {
    expect(avisoDeMesAcertado(plano, [{ competencia: '2026-09-01' }])).toMatch(/setembro.*já foi acertado/i)
  })

  it('vários meses, no plural', () => {
    expect(avisoDeMesAcertado(plano, [{ competencia: '2026-09-01' }, { competencia: '2026-10-01' }]))
      .toMatch(/setembro.* e .*outubro.*já foram acertados/i)
  })

  it('mês acertado fora do alcance da compra não avisa', () => {
    expect(avisoDeMesAcertado(plano, [{ competencia: '2026-08-01' }, { competencia: '2026-12-01' }])).toBeNull()
  })
})

describe('cartão designado — o que entra sozinho', () => {
  const conta = { pluggyId: CARTAO.id, tipo: 'cartao' as const }
  const ctx = { documentosProprios: [], nomesProprios: [] }

  it('parcelas viram UMA compra; pendente, estorno e contagem dupla ficam de fora', () => {
    const linhas = [
      parcela(2, 3), parcela(3, 3),
      transacao({ description: 'MERCADO', amount: 200 }),
      transacao({ description: 'PENDENTE', status: 'PENDING' }),
      transacao({ description: 'ESTORNO', amount: -20 }),
      transacao({ description: 'Pagamento recebido', amount: -500 }),
    ].map(t => normalizarTransacao(t, conta, ctx))

    const compras = comprasParaLancar(linhas)
    expect(compras).toHaveLength(2)
    const loja = compras.find(c => c.parcelas === 3)!
    expect(loja.provider_ids).toHaveLength(2)
    expect(loja.descricao).toBe('MAGAZINE EXEMPLO')
    expect(compras.find(c => c.parcelas === 1)).toMatchObject({ descricao: 'MERCADO', valor_total: 200 })
  })
})
