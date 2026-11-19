/**
 * Os campos que a sincronização passou a guardar (onda 1 de
 * docs/plano-open-finance-campos-novos.md). Fixtures pela documentação da
 * Pluggy — a amostra real (`amostra_pluggy`) confirma depois o que o Nubank
 * manda de fato.
 */
import { describe, expect, it } from 'vitest'
import {
  amostraDeTransacoes,
  camposDaConexao,
  camposExtrasDaTransacao,
  contaParaAtualizar,
  contextoDasContas,
  emprestimoParaLinha,
  finaisDosCartoes,
  finalDoCartao,
  investimentoParaLinha,
  movimentoParaLinha,
  normalizarTransacao,
} from '~/lib/importacao-bancaria'
import { CARTAO, CONTA_CORRENTE, transacao } from './fixtures/pluggy'

const contexto = contextoDasContas([CONTA_CORRENTE, CARTAO])
const NO_CARTAO = { pluggyId: CARTAO.id, tipo: 'cartao' as const }

describe('final do cartão', () => {
  it('pega os 4 últimos dígitos, venha mascarado como vier', () => {
    expect(finalDoCartao('0750')).toBe('0750')
    expect(finalDoCartao('**** 0750')).toBe('0750')
    expect(finalDoCartao('5162 92** **** 0025')).toBe('0025')
    expect(finalDoCartao('12')).toBeNull()
    expect(finalDoCartao(null)).toBeNull()
  })

  it('a transação do virtual leva o final dele, não o da conta', () => {
    const t = normalizarTransacao(transacao({ creditCardMetadata: { cardNumber: '**** 0750' } }), NO_CARTAO, contexto)
    expect(t.cartao_final).toBe('0750')
  })

  it('os cartões da conta: o dela, os adicionais e os vistos nas transações, sem repetir', () => {
    const conta = { ...CARTAO, number: '0025', creditData: { ...CARTAO.creditData, additionalCards: [{ number: '0750' }, { number: null }] } }
    expect(finaisDosCartoes(conta, [{ cartao_final: '0750' }, { cartao_final: '9999' }, { cartao_final: null }]))
      .toEqual(['0025', '0750', '9999'])
  })
})

describe('campos extras da transação', () => {
  it('MCC, cobrança, hora, fatura prevista e data na fatura', () => {
    const extras = camposExtrasDaTransacao(transacao({
      creditCardMetadata: {
        payeeMCC: 5411,
        paymentType: 'INSTALLMENT',
        transactionDateTime: '2026-11-03T22:15:00.000Z',
        billForecastDate: '2026-12',
        billPostDate: '2026-11-04',
      },
    }))
    expect(extras).toMatchObject({
      mcc: 5411,
      tipo_cobranca: 'parcelada',
      data_hora: '2026-11-03T22:15:00.000Z',
      fatura_prevista: '2026-12-01',
      lancada_na_fatura_em: '2026-11-04',
    })
  })

  it('MCC fora de 0–9999 e hora inválida viram null', () => {
    const extras = camposExtrasDaTransacao(transacao({ creditCardMetadata: { payeeMCC: 123456, transactionDateTime: 'lixo' } }))
    expect(extras.mcc).toBeNull()
    expect(extras.data_hora).toBeNull()
  })

  it('compra em dólar: o valor é o em reais, e a moeda original fica guardada', () => {
    const t = normalizarTransacao(
      transacao({ amount: 20, currencyCode: 'USD', amountInAccountCurrency: 110.37, description: 'Anthropic* Claude Sub' }),
      NO_CARTAO,
      contexto,
    )
    expect(t.valor).toBe(110.37)
    expect(t.moeda).toBe('USD')
    expect(t.valor_moeda_original).toBe(20)
  })

  it('em real, nada de moeda', () => {
    const t = normalizarTransacao(transacao({ amount: 50, currencyCode: 'BRL' }), NO_CARTAO, contexto)
    expect(t.moeda).toBeNull()
    expect(t.valor_moeda_original).toBeNull()
  })

  it('a mensagem do Pix', () => {
    const extras = camposExtrasDaTransacao(transacao({ paymentData: { paymentMethod: 'PIX', reason: '  acerto out ' } }))
    expect(extras.mensagem).toBe('acerto out')
  })

  it('boleto pago com multa e juros', () => {
    const extras = camposExtrasDaTransacao(transacao({
      boletoMetadata: { baseAmount: 200, penaltyAmount: 4, interestAmount: 1.33, discountAmount: null },
    }))
    expect(extras.boleto).toEqual({ valor_original: 200, multa: 4, juros: 1.33, desconto: null })
  })

  it('tarifa e crédito contratado no cartão', () => {
    const extras = camposExtrasDaTransacao(transacao({ creditCardMetadata: { feeType: 'ANNUAL_FEE', otherCreditsType: 'REVOLVING_CREDIT' } }))
    expect(extras).toMatchObject({ tarifa_tipo: 'ANNUAL_FEE', credito_tipo: 'REVOLVING_CREDIT' })
  })
})

describe('conta e conexão', () => {
  it('saldo e conta corrente; só o que veio', () => {
    const agora = '2026-11-20T10:00:00.000Z'
    expect(contaParaAtualizar({
      ...CONTA_CORRENTE,
      balance: 1520.45,
      bankData: { closingBalance: 1500, automaticallyInvestedBalance: 300, overdraftContractedLimit: 1000, overdraftUsedLimit: 0 },
    }, agora)).toEqual({
      saldo: 1520.45,
      saldo_atualizado_em: agora,
      saldo_com_pendentes: 1500,
      saldo_aplicado_automatico: 300,
      cheque_especial_limite: 1000,
      cheque_especial_usado: 0,
    })
  })

  it('perfil do cartão: bandeira, nível, situação, titularidade', () => {
    expect(contaParaAtualizar({
      ...CARTAO,
      creditData: { ...CARTAO.creditData, status: 'BLOCKED', holderType: 'MAIN', isLimitFlexible: false },
    }, 'x')).toMatchObject({
      bandeira: 'VISA',
      nivel: 'PLATINUM',
      situacao_cartao: 'BLOCKED',
      titularidade: 'MAIN',
      limite_flexivel: false,
      limite: 8000,
    })
  })

  it('situação desconhecida do cartão não entra (a coluna recusaria)', () => {
    expect(contaParaAtualizar({ ...CARTAO, creditData: { status: 'SUSPENSO' } }, 'x').situacao_cartao).toBeUndefined()
  })

  it('a conexão guarda quando a Pluggy atualizou e a situação por produto', () => {
    const campos = camposDaConexao({
      id: 'item',
      connector: { id: 1, name: 'MeuPluggy' },
      status: 'UPDATED',
      executionStatus: 'PARTIAL_SUCCESS',
      lastUpdatedAt: '2026-11-20T06:00:00.000Z',
      statusDetail: { creditCards: { isUpdated: false, warnings: [{ code: '001' }] } },
    })
    expect(campos).toMatchObject({
      atualizada_na_pluggy_em: '2026-11-20T06:00:00.000Z',
      situacao_execucao: 'PARTIAL_SUCCESS',
      situacao_produtos: { creditCards: { isUpdated: false } },
    })
  })
})

describe('investimentos e empréstimos', () => {
  it('a caixinha vira a linha de investimento', () => {
    expect(investimentoParaLinha({
      id: 'inv-1',
      name: 'Caixinha Viagem',
      type: 'FIXED_INCOME',
      subtype: 'CDB',
      balance: 1203.55,
      amount: 1210,
      amountOriginal: 1200,
      taxes: 4,
      taxes2: 2.45,
      date: '2026-11-19T00:00:00.000Z',
      status: 'ACTIVE',
    })).toMatchObject({
      pluggy_investment_id: 'inv-1',
      nome: 'Caixinha Viagem',
      subtipo: 'CDB',
      saldo: 1203.55,
      valor_original: 1200,
      impostos: 6.45,
      data_referencia: '2026-11-19',
      situacao: 'ACTIVE',
    })
  })

  it('aplicação entra, resgate e imposto saem', () => {
    expect(movimentoParaLinha({ id: 'm1', type: 'BUY', amount: 200, date: '2026-11-01T00:00:00.000Z' })?.sentido).toBe('entrada')
    expect(movimentoParaLinha({ id: 'm2', type: 'SELL', amount: -50, date: '2026-11-02T00:00:00.000Z' })).toMatchObject({ sentido: 'saida', valor: 50 })
    expect(movimentoParaLinha({ id: 'm3', type: 'TAX', movementType: 'DEBIT', amount: 1, date: '2026-11-02T00:00:00.000Z' })?.sentido).toBe('saida')
    expect(movimentoParaLinha({ id: 'm4', date: '2026-11-02T00:00:00.000Z' })?.sentido).toBeNull()
    expect(movimentoParaLinha({ id: 'm5', date: '' })).toBeNull()
  })

  it('o empréstimo guarda contrato, CET e as parcelas como vieram', () => {
    expect(emprestimoParaLinha({
      id: 'loan-1',
      productName: 'Financiamento de veículo',
      contractAmount: 30000,
      CET: 0.0189,
      installments: { totalNumberOfInstallments: 48 },
    })).toMatchObject({ pluggy_loan_id: 'loan-1', valor_contratado: 30000, cet: 0.0189, parcelas: { totalNumberOfInstallments: 48 } })
  })
})

describe('amostra para estudo', () => {
  it('prefere um exemplo de cada cartão e método antes de completar o limite', () => {
    const lote = [
      ...Array.from({ length: 10 }, () => transacao({ creditCardMetadata: { cardNumber: '0025' } })),
      transacao({ creditCardMetadata: { cardNumber: '0750' } }),
      transacao({ currencyCode: 'USD' }),
    ]
    const amostra = amostraDeTransacoes(lote, 3)
    expect(amostra).toHaveLength(3)
    expect(amostra.map(t => t.creditCardMetadata?.cardNumber ?? t.currencyCode)).toEqual(['0025', '0750', 'USD'])
  })
})
