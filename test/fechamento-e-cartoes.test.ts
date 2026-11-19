/**
 * O fechamento do cartão tirado das faturas e a designação por final de cartão
 * (onda 1 de docs/plano-open-finance-campos-novos.md).
 */
import { describe, expect, it } from 'vitest'
import { cicloAtual, fechamentoPelasFaturas, totalDoCiclo } from '~/lib/cartoes'
import type { DadosDoCartao, LancamentoParaFechamento } from '~/lib/cartoes'
import { designacaoDoValor, mostraCartoesDaConta, rotuloDeHerdar, valorDoCartao } from '~/lib/contas-bancarias'

const vazio: DadosDoCartao = {
  limite: null,
  limite_disponivel: null,
  fecha_em: null,
  vence_em: null,
  pagamento_minimo: null,
  limite_manual: null,
  dia_fechamento_manual: null,
  dia_vencimento_manual: null,
}

/** Uma compra à vista por dia de `de` até `ate`, na fatura `fatura`. */
function compras(fatura: string, ...datas: string[]): LancamentoParaFechamento[] {
  return datas.map(data => ({ fatura_id: fatura, data, parcelas_total: null }))
}

describe('fechamentoPelasFaturas', () => {
  it('com o fechamento oficial da fatura, é o dia mais frequente dele', () => {
    const r = fechamentoPelasFaturas([
      { pluggy_bill_id: 'a', vencimento: '2026-09-10', fechamento: '2026-09-01' },
      { pluggy_bill_id: 'b', vencimento: '2026-10-10', fechamento: '2026-10-01' },
      { pluggy_bill_id: 'c', vencimento: '2026-11-10', fechamento: '2026-11-02' }, // empurrado para o dia útil
    ], [])
    expect(r).toEqual({ dia: 1, fonte: 'fatura' })
  })

  it('sem ele, estima pela véspera da primeira compra da fatura seguinte (o 1683 da produção)', () => {
    const faturas = [
      { pluggy_bill_id: 'set', vencimento: '2026-09-10', fechamento: null },
      { pluggy_bill_id: 'out', vencimento: '2026-10-10', fechamento: null },
      { pluggy_bill_id: 'nov', vencimento: '2026-11-10', fechamento: null },
    ]
    const lancamentos = [
      ...compras('set', '2026-08-18', '2026-09-01'),
      ...compras('out', '2026-09-03', '2026-10-01'),
      ...compras('nov', '2026-10-02', '2026-11-02'),
    ]
    expect(fechamentoPelasFaturas(faturas, lancamentos)).toEqual({ dia: 1, fonte: 'estimado' })
  })

  it('parcela não conta: a data dela é a da compra original', () => {
    const faturas = [
      { pluggy_bill_id: 'out', vencimento: '2026-10-13', fechamento: null },
      { pluggy_bill_id: 'nov', vencimento: '2026-11-11', fechamento: null },
    ]
    const lancamentos = [
      ...compras('out', '2026-09-04', '2026-09-28'),
      ...compras('nov', '2026-10-03', '2026-11-02'),
      { fatura_id: 'nov', data: '2026-06-15', parcelas_total: 6 },
    ]
    expect(fechamentoPelasFaturas(faturas, lancamentos)).toEqual({ dia: 2, fonte: 'estimado' })
  })

  it('sem duas faturas seguidas com compras, não inventa', () => {
    expect(fechamentoPelasFaturas([{ pluggy_bill_id: 'a', vencimento: '2026-10-10', fechamento: null }], compras('a', '2026-09-10'))).toBeNull()
    expect(fechamentoPelasFaturas([], [])).toBeNull()
  })
})

describe('o ciclo com o fechamento das faturas', () => {
  it('estimado: o ciclo usa o dia, e a fonte diz que é estimativa', () => {
    const c = cicloAtual({ ...vazio, fechamento_das_faturas: { dia: 1, fonte: 'estimado' } }, '2026-11-20')
    expect(c).toMatchObject({ inicio: '2026-11-02', fechamento: '2026-12-01', fonte: 'estimado' })
  })

  it('o manual e o do banco continuam ganhando', () => {
    const manual = cicloAtual({ ...vazio, dia_fechamento_manual: 5, fechamento_das_faturas: { dia: 1, fonte: 'fatura' } }, '2026-11-20')
    expect(manual.fonte).toBe('manual')
    const banco = cicloAtual({ ...vazio, fecha_em: '2026-11-26', fechamento_das_faturas: { dia: 1, fonte: 'fatura' } }, '2026-11-20')
    expect(banco.fonte).toBe('banco')
  })

  it('o que já está numa fatura fechada não soma na aberta, mesmo dentro das datas', () => {
    const ciclo = cicloAtual({ ...vazio, fechamento_das_faturas: { dia: 1, fonte: 'estimado' } }, '2026-11-20')
    const total = totalDoCiclo([
      { conta_id: 'c', valor: 100, sentido: 'saida', data: '2026-11-02', motivo_exclusao: null, fatura_id: 'nov' },
      { conta_id: 'c', valor: 40, sentido: 'saida', data: '2026-11-03', motivo_exclusao: null, fatura_id: null },
    ], 'c', ciclo)
    expect(total).toBe(40)
  })
})

describe('cartões por final', () => {
  const espacos = [{ id: 'sp', nome: 'SpacePingos' }]

  it('o destino vira um valor de select e volta igual', () => {
    for (const c of [
      { destino: 'herdar' as const, space_id: null },
      { destino: 'pessoal' as const, space_id: null },
      { destino: 'perguntar' as const, space_id: null },
      { destino: 'casal' as const, space_id: 'sp' },
    ]) {
      expect(designacaoDoValor(valorDoCartao(c))).toEqual(c)
    }
  })

  it('valor desconhecido volta a seguir a conta', () => {
    expect(designacaoDoValor('lixo')).toEqual({ destino: 'herdar', space_id: null })
  })

  it('"como a conta" diz para onde a conta manda', () => {
    expect(rotuloDeHerdar({ destino: 'casal', space_id: 'sp' }, espacos)).toBe('Como a conta (SpacePingos)')
    expect(rotuloDeHerdar({ destino: 'perguntar', space_id: null }, espacos)).toBe('Como a conta (perguntar)')
  })

  it('só mostra os cartões quando há o que separar', () => {
    const cartao = (final: string) => ({ id: final, final, apelido: null, destino: 'herdar' as const, space_id: null })
    expect(mostraCartoesDaConta({ numero: '0025' }, [cartao('0025')])).toBe(false)
    expect(mostraCartoesDaConta({ numero: '0025' }, [cartao('0025'), cartao('0750')])).toBe(true)
    expect(mostraCartoesDaConta({ numero: '0025' }, [cartao('0750')])).toBe(true)
    expect(mostraCartoesDaConta({ numero: '0025' }, [])).toBe(false)
  })
})
