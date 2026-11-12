/**
 * As regras da importação bancária (fase 1 do plano de Open Finance).
 *
 * Cada `describe` é uma pegadinha do plano, e cada uma é uma forma de errar em
 * silêncio: o saldo do mês fica errado sem ninguém saber. Os invariantes 2, 3 e
 * 5 do plano têm teste próprio aqui.
 */
import { describe, expect, it } from 'vitest'
import {
  agruparParcelas,
  chaveDaCompra,
  competenciaDaTransacao,
  contextoDasContas,
  dataLocal,
  descricaoDaCompra,
  janelaDeSincronizacao,
  linhasDaConta,
  deduplicar,
  normalizarDescricao,
  normalizarTransacao,
  normalizarValor,
  planoDaCompra,
  somarMesesCompetencia,
  tipoDaConta,
  vencimentosDasFaturas,
} from '~/lib/importacao-bancaria'
import type { ContextoImportacao, TransacaoNormalizada } from '~/lib/importacao-bancaria'
import {
  CARTAO,
  CONTA_CORRENTE,
  PAGAMENTO_FATURA_NA_CONTA,
  PAGAMENTO_RECEBIDO_NO_CARTAO,
  PIX_PARA_ELA,
  PIX_PARA_MIM,
  SALARIO,
  parcela,
  transacao,
} from './fixtures/pluggy'

const contexto: ContextoImportacao = contextoDasContas([CONTA_CORRENTE, CARTAO])
const NO_CARTAO = { pluggyId: CARTAO.id, tipo: 'cartao' as const }
const NA_CONTA = { pluggyId: CONTA_CORRENTE.id, tipo: 'conta' as const }

/** A expansão da view `parcela_mensal`: N−1 truncadas no centavo, a última com o resto. */
function expandirComoAView(valorTotal: number, parcelas: number): number[] {
  const base = Math.trunc((valorTotal / parcelas) * 100) / 100
  return Array.from({ length: parcelas }, (_, i) =>
    i < parcelas - 1 ? base : Math.round((valorTotal - base * (parcelas - 1)) * 100) / 100)
}

describe('fuso horário (pegadinha 6)', () => {
  it('22h de 31/08 em Brasília é 01/09 em UTC, e fica em 31/08', () => {
    expect(dataLocal('2026-09-01T01:00:00.000Z')).toBe('2026-08-31')
  })

  it('a mesma compra cai em agosto, não em setembro', () => {
    expect(competenciaDaTransacao(dataLocal('2026-09-01T01:00:00.000Z'))).toBe('2026-08-01')
  })

  it('meia-noite UTC exata é carimbo de "só a data", e não recua um dia', () => {
    expect(dataLocal('2026-09-01T00:00:00.000Z')).toBe('2026-09-01')
    expect(dataLocal('2026-09-01T00:00:00Z')).toBe('2026-09-01')
  })

  it('data sem hora passa como veio', () => {
    expect(dataLocal('2026-09-01')).toBe('2026-09-01')
  })

  it('horário com offset explícito também converte', () => {
    expect(dataLocal('2026-09-01T00:30:00-03:00')).toBe('2026-09-01')
    expect(dataLocal('2026-09-01T02:59:00+00:00')).toBe('2026-08-31')
  })

  it('recusa data que não é data, em vez de gravar lixo', () => {
    expect(() => dataLocal('ontem')).toThrow(/data inválida/)
  })
})

describe('competência', () => {
  it('anda meses atravessando a virada do ano, nos dois sentidos', () => {
    expect(somarMesesCompetencia('2026-11-01', 2)).toBe('2027-01-01')
    expect(somarMesesCompetencia('2026-01-01', -1)).toBe('2025-12-01')
    expect(somarMesesCompetencia('2026-03-01', -14)).toBe('2025-01-01')
  })

  it('com a fatura conhecida, é o mês do vencimento (pegadinha 7)', () => {
    // compra de 28/07 numa fatura que vence em 10/08 é gasto de agosto
    expect(competenciaDaTransacao('2026-07-28', '2026-08-10T00:00:00.000Z')).toBe('2026-08-01')
  })

  it('sem fatura, é o mês da data', () => {
    expect(competenciaDaTransacao('2026-07-28', null)).toBe('2026-07-01')
  })
})

describe('sinal do valor (pegadinha 5)', () => {
  it('no cartão, positivo é gasto e negativo é pagamento ou estorno', () => {
    expect(normalizarValor(89.9, 'DEBIT', 'cartao')).toEqual({ valor: 89.9, sentido: 'saida' })
    expect(normalizarValor(-89.9, 'CREDIT', 'cartao')).toEqual({ valor: 89.9, sentido: 'entrada' })
  })

  it('na conta, quem manda é o type', () => {
    expect(normalizarValor(-120, 'DEBIT', 'conta')).toEqual({ valor: 120, sentido: 'saida' })
    expect(normalizarValor(6500, 'CREDIT', 'conta')).toEqual({ valor: 6500, sentido: 'entrada' })
    // type manda mesmo contra o sinal
    expect(normalizarValor(120, 'DEBIT', 'conta').sentido).toBe('saida')
  })

  it('na conta sem type, negativo sai', () => {
    expect(normalizarValor(-10, undefined, 'conta').sentido).toBe('saida')
    expect(normalizarValor(10, undefined, 'conta').sentido).toBe('entrada')
  })

  it('o valor sai sempre positivo e no centavo', () => {
    expect(normalizarValor(-0.1 - 0.2, 'DEBIT', 'conta').valor).toBe(0.3)
  })

  it('o tipo da conta vem do type da Pluggy', () => {
    expect(tipoDaConta(CARTAO)).toBe('cartao')
    expect(tipoDaConta(CONTA_CORRENTE)).toBe('conta')
  })
})

describe('deduplicação por providerId (pegadinha 4, invariante 3)', () => {
  it('a chave é o providerId, não o id que muda', () => {
    const a = normalizarTransacao(transacao({ id: 'id-velho', providerId: 'P1' }), NO_CARTAO, contexto)
    const b = normalizarTransacao(transacao({ id: 'id-novo', providerId: 'P1' }), NO_CARTAO, contexto)
    expect(a.provider_id).toBe(b.provider_id)
    expect(deduplicar([a, b])).toHaveLength(1)
    expect(deduplicar([a, b])[0]!.pluggy_id).toBe('id-novo')
  })

  it('sem providerId, cai no id com prefixo — nunca em null', () => {
    const t = normalizarTransacao(transacao({ id: 'abc', providerId: null }), NO_CARTAO, contexto)
    expect(t.provider_id).toBe('pluggy:abc')
  })

  it('a lançada vence a pendente, venha na ordem que vier', () => {
    const pendente = normalizarTransacao(transacao({ providerId: 'P2', status: 'PENDING' }), NO_CARTAO, contexto)
    const lancada = normalizarTransacao(transacao({ providerId: 'P2', status: 'POSTED' }), NO_CARTAO, contexto)
    expect(deduplicar([pendente, lancada])[0]!.pendente).toBe(false)
    expect(deduplicar([lancada, pendente])[0]!.pendente).toBe(false)
  })

  it('reimportar o mesmo lote não muda nada', () => {
    const lote = [transacao(), transacao(), parcela(1, 3)].map(t => normalizarTransacao(t, NO_CARTAO, contexto))
    expect(deduplicar([...lote, ...lote])).toEqual(deduplicar(lote))
  })
})

describe('contagem dupla (pegadinha 3, invariante 5)', () => {
  it('pagamento de fatura na conta é ignorado pela categoria do trial', () => {
    expect(normalizarTransacao(PAGAMENTO_FATURA_NA_CONTA, NA_CONTA, contexto).motivo_exclusao)
      .toBe('pagamento_fatura')
  })

  it('e pela descrição, depois que a categoria deixa de vir', () => {
    const semCategoria = { ...PAGAMENTO_FATURA_NA_CONTA, category: null }
    expect(normalizarTransacao(semCategoria, NA_CONTA, contexto).motivo_exclusao).toBe('pagamento_fatura')

    for (const descricao of ['PGTO FATURA NUBANK', 'Pagto Cartão de Crédito', 'PAG FATURA']) {
      const t = { ...semCategoria, description: descricao }
      expect(normalizarTransacao(t, NA_CONTA, contexto).motivo_exclusao, descricao).toBe('pagamento_fatura')
    }
  })

  it('o crédito do pagamento na conta do cartão também', () => {
    expect(normalizarTransacao(PAGAMENTO_RECEBIDO_NO_CARTAO, NO_CARTAO, contexto).motivo_exclusao)
      .toBe('pagamento_fatura')
  })

  it('estorno no cartão NÃO é pagamento — fica para a pessoa decidir', () => {
    const estorno = transacao({ description: 'ESTORNO LOJA X', amount: -59.9 })
    const t = normalizarTransacao(estorno, NO_CARTAO, contexto)
    expect(t.sentido).toBe('entrada')
    expect(t.motivo_exclusao).toBeNull()
  })

  it('Pix para conta própria é reconhecido pelo CPF do titular, mesmo formatado', () => {
    expect(normalizarTransacao(PIX_PARA_MIM, NA_CONTA, contexto).motivo_exclusao).toBe('transferencia_propria')
  })

  it('e pelo nome, quando o documento vem mascarado', () => {
    const mascarado = {
      ...PIX_PARA_MIM,
      paymentData: {
        ...PIX_PARA_MIM.paymentData,
        receiver: { name: 'Matheus Exemplo', documentNumber: { type: 'CPF', value: '***.456.789-**' } },
      },
    }
    expect(normalizarTransacao(mascarado, NA_CONTA, contexto).motivo_exclusao).toBe('transferencia_propria')
  })

  it('Pix para a outra pessoa do casal NÃO é transferência própria — é o acerto', () => {
    const t = normalizarTransacao(PIX_PARA_ELA, NA_CONTA, contexto)
    expect(t.motivo_exclusao).toBeNull()
    expect(t.contraparte_documento).toBe('98765432100')
    expect(t.metodo).toBe('PIX')
  })

  it('salário entra na caixa de entrada', () => {
    const t = normalizarTransacao(SALARIO, NA_CONTA, contexto)
    expect(t.sentido).toBe('entrada')
    expect(t.motivo_exclusao).toBeNull()
  })

  it('compra comum não é excluída', () => {
    expect(normalizarTransacao(transacao({ description: 'PADARIA DO ZE' }), NO_CARTAO, contexto).motivo_exclusao)
      .toBeNull()
  })

  it('transação de valor zero é ignorada (compra exige valor > 0)', () => {
    expect(normalizarTransacao(transacao({ amount: 0 }), NO_CARTAO, contexto).motivo_exclusao).toBe('valor_zero')
  })
})

describe('parcelas (pegadinha 2, invariante 2)', () => {
  const vencimentos = {
    'bill-1': '2026-09-10T00:00:00.000Z',
    'bill-2': '2026-10-10T00:00:00.000Z',
    'bill-3': '2026-11-10T00:00:00.000Z',
  }
  const comFaturas: ContextoImportacao = { ...contexto, vencimentoDasFaturas: vencimentos }
  const norm = (n: number, total = 10) => normalizarTransacao(parcela(n, total), NO_CARTAO, comFaturas)

  it('a descrição sem o marcador de parcela é a mesma em todas', () => {
    expect(normalizarDescricao('MAGAZINE EXEMPLO PARC 02/10')).toBe('magazine exemplo')
    expect(normalizarDescricao('Magazine Exemplo - Parcela 3 de 10')).toBe('magazine exemplo')
    expect(normalizarDescricao('MAGAZINE ÉXEMPLO 10/10')).toBe('magazine exemplo')
  })

  it('a compra recebe a descrição sem o marcador do fim, na caixa original', () => {
    expect(descricaoDaCompra('MAGAZINE EXEMPLO PARC 02/10')).toBe('MAGAZINE EXEMPLO')
    expect(descricaoDaCompra('Loja Tal - Parcela 3 de 10')).toBe('Loja Tal')
    expect(descricaoDaCompra('Loja 3/10')).toBe('Loja')
    expect(descricaoDaCompra('10/10')).toBe('10/10')
  })

  it('as parcelas de uma compra têm a mesma chave', () => {
    expect(norm(1).chave_compra).not.toBeNull()
    expect(norm(1).chave_compra).toBe(norm(2).chave_compra)
    expect(norm(2).chave_compra).toBe(norm(3).chave_compra)
  })

  it('compras diferentes não se misturam', () => {
    const outra = normalizarTransacao(
      parcela(1, 10, { creditCardMetadata: { installmentNumber: 1, totalInstallments: 10, totalAmount: 999, purchaseDate: '2026-08-20' } }),
      NO_CARTAO,
      comFaturas,
    )
    expect(outra.chave_compra).not.toBe(norm(1).chave_compra)
    // a mesma compra em outro cartão também é outra
    expect(normalizarTransacao(parcela(1, 10), { pluggyId: 'outro-cartao', tipo: 'cartao' }, comFaturas).chave_compra)
      .not.toBe(norm(1).chave_compra)
  })

  it('compra à vista não tem chave', () => {
    expect(normalizarTransacao(transacao(), NO_CARTAO, contexto).chave_compra).toBeNull()
    expect(normalizarTransacao(parcela(1, 1), NO_CARTAO, contexto).chave_compra).toBeNull()
  })

  it('a primeira parcela vista cria a compra inteira, com o total do banco', () => {
    const plano = planoDaCompra(norm(1))
    expect(plano).toMatchObject({
      valor_total: 1000,
      parcelas: 10,
      data_compra: '2026-08-20',
      competencia_inicial: '2026-09-01',
      recuo_meses: 0,
    })
  })

  it('vista na parcela 3 de 10, a competência recua 2 meses', () => {
    const plano = planoDaCompra(norm(3))
    expect(plano.competencia_inicial).toBe('2026-09-01')
    expect(plano.recuo_meses).toBe(2)
    // e é a mesma compra que a parcela 1 criaria
    const { recuo_meses: _a, ...resto3 } = plano
    const { recuo_meses: _b, ...resto1 } = planoDaCompra(norm(1))
    expect(resto3).toEqual(resto1)
    expect(plano.descricao).toBe('MAGAZINE EXEMPLO')
  })

  it('a soma das parcelas na parcela_mensal bate com o totalAmount do banco', () => {
    for (const [total, n] of [[1000, 10], [100, 3], [1234.56, 7], [99.99, 12]] as const) {
      const t = normalizarTransacao(
        parcela(1, n, { creditCardMetadata: { installmentNumber: 1, totalInstallments: n, totalAmount: total, purchaseDate: '2026-08-20' } }),
        NO_CARTAO,
        contexto,
      )
      const parcelas = expandirComoAView(planoDaCompra(t).valor_total, planoDaCompra(t).parcelas)
      expect(Math.round(parcelas.reduce((s, v) => s + v, 0) * 100) / 100, `${total} em ${n}x`).toBe(total)
    }
  })

  it('sem totalAmount, o total é a parcela vezes N', () => {
    const t = normalizarTransacao(
      parcela(2, 4, { amount: 25.5, creditCardMetadata: { installmentNumber: 2, totalInstallments: 4 } }),
      NO_CARTAO,
      contexto,
    )
    expect(planoDaCompra(t).valor_total).toBe(102)
    expect(t.chave_compra).not.toBeNull()
  })

  it('sem purchaseDate, o mês da compra sai do recuo e as parcelas ainda se juntam', () => {
    const sem = (n: number) => normalizarTransacao(
      parcela(n, 10, { creditCardMetadata: { installmentNumber: n, totalInstallments: 10, totalAmount: 1000, billId: `bill-${n}` } }),
      NO_CARTAO,
      comFaturas,
    )
    expect(sem(1).chave_compra).toBe(sem(3).chave_compra)
  })

  it('agrupar devolve UMA compra para N parcelas, a partir da menor vista', () => {
    const lote = [norm(3), transacao({ description: 'PADARIA' }), norm(2)]
      .map(t => ('pluggy_id' in t ? t : normalizarTransacao(t, NO_CARTAO, contexto))) as TransacaoNormalizada[]

    const { compras, avulsas } = agruparParcelas(lote)
    expect(compras).toHaveLength(1)
    expect(avulsas).toHaveLength(1)
    expect(compras[0]!.transacoes.map(t => t.parcela_numero)).toEqual([2, 3])
    expect(compras[0]!.plano.recuo_meses).toBe(1)
    expect(compras[0]!.plano.competencia_inicial).toBe('2026-09-01')
  })

  it('chave só existe em gasto, e só com mais de uma parcela', () => {
    expect(chaveDaCompra({
      conta_pluggy_id: 'c',
      parcela_numero: 1,
      parcelas_total: 1,
      valor_total_compra: 10,
      data_compra: '2026-01-01',
      descricao: 'x',
      competencia: '2026-01-01',
    })).toBeNull()
  })
})

describe('contexto da pessoa', () => {
  it('junta documentos e nomes dos titulares, sem repetir', () => {
    expect(contexto.documentosProprios).toEqual(['12345678901'])
    expect(contexto.nomesProprios).toEqual(['matheus exemplo'])
  })

  it('documento mascarado não entra (casaria por acidente)', () => {
    expect(contextoDasContas([{ owner: null, taxNumber: '***.456.789-**' }]).documentosProprios).toEqual([])
  })
})

describe('janela de sincronização', () => {
  it('na primeira vez, busca 90 dias para trás', () => {
    expect(janelaDeSincronizacao(null, '2026-11-12')).toEqual({ de: '2026-08-14', ate: '2026-11-12' })
  })

  it('depois, sobrepõe 10 dias à última sincronização — em data de Brasília', () => {
    // 01h UTC de 05/11 é 22h de 04/11 em Brasília
    expect(janelaDeSincronizacao('2026-11-05T01:00:00.000Z', '2026-11-12')).toEqual({ de: '2026-10-25', ate: '2026-11-12' })
  })

  it('atravessa a virada do ano', () => {
    expect(janelaDeSincronizacao('2027-01-03T15:00:00Z', '2027-01-04').de).toBe('2026-12-24')
  })
})

describe('o lote de uma conta', () => {
  it('normaliza, deduplica e leva a competência da fatura', () => {
    const vencimentos = vencimentosDasFaturas([{ id: 'bill-2', dueDate: '2026-10-10T00:00:00.000Z' }])
    const lote = linhasDaConta(
      [parcela(2, 10), parcela(2, 10), transacao({ providerId: 'X', status: 'PENDING' }), transacao({ providerId: 'X' })],
      NO_CARTAO,
      { ...contexto, vencimentoDasFaturas: vencimentos },
    )
    expect(lote).toHaveLength(2)
    expect(lote.find(t => t.parcela_numero === 2)!.competencia).toBe('2026-10-01')
    expect(lote.find(t => t.provider_id === 'X')!.pendente).toBe(false)
  })
})
