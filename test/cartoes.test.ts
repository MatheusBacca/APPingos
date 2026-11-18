/**
 * O ciclo da fatura, o uso do limite e o peso de cada cartão.
 *
 * O caso que motiva o arquivo: o cartão que fecha no dia 26 recebe no dia 27 uma
 * compra que é da fatura SEGUINTE. Somar o mês do calendário erraria as duas.
 */
import { describe, expect, it } from 'vitest'
import {
  cicloAtual,
  distribuicao,
  quandoFecha,
  seloDoBanco,
  totalDoCiclo,
  usoDoLimite,
} from '~/lib/cartoes'
import type { DadosDoCartao, LancamentoDoCartao } from '~/lib/cartoes'

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

describe('cicloAtual', () => {
  it('usa o fechamento do banco e começa no dia seguinte ao anterior', () => {
    const c = cicloAtual({ ...vazio, fecha_em: '2026-11-26', vence_em: '2026-12-05' }, '2026-11-17')
    expect(c).toEqual({ inicio: '2026-10-27', fechamento: '2026-11-26', vencimento: '2026-12-05', fonte: 'banco' })
  })

  it('fechamento do banco já passado: projeta o próximo no mesmo dia', () => {
    const c = cicloAtual({ ...vazio, fecha_em: '2026-11-10', vence_em: '2026-11-18' }, '2026-11-17')
    expect(c.fechamento).toBe('2026-12-10')
    expect(c.inicio).toBe('2026-11-11')
    expect(c.vencimento).toBe('2026-12-18')
  })

  it('o dia digitado pela pessoa ganha do banco', () => {
    const c = cicloAtual({ ...vazio, fecha_em: '2026-11-26', dia_fechamento_manual: 3, dia_vencimento_manual: 10 }, '2026-11-17')
    expect(c).toEqual({ inicio: '2026-11-04', fechamento: '2026-12-03', vencimento: '2026-12-10', fonte: 'manual' })
  })

  it('dia 31 em mês curto encosta no último dia', () => {
    const c = cicloAtual({ ...vazio, dia_fechamento_manual: 31 }, '2026-02-10')
    expect(c.fechamento).toBe('2026-02-28')
    expect(c.inicio).toBe('2026-02-01')
  })

  it('sem nada, cai no mês do calendário e diz isso', () => {
    const c = cicloAtual(vazio, '2026-11-17')
    expect(c).toEqual({ inicio: '2026-11-01', fechamento: '2026-11-30', vencimento: null, fonte: 'calendario' })
  })
})

describe('totalDoCiclo', () => {
  const ciclo = { inicio: '2026-10-27', fechamento: '2026-11-26', vencimento: null, fonte: 'banco' as const }
  const l = (data: string, valor: number, extra: Partial<LancamentoDoCartao> = {}): LancamentoDoCartao =>
    ({ conta_id: 'a', valor, sentido: 'saida', data, motivo_exclusao: null, ...extra })

  it('soma só o que está dentro do ciclo, desconta estorno e ignora o pagamento da fatura', () => {
    const total = totalDoCiclo([
      l('2026-10-26', 999), // fatura anterior
      l('2026-10-27', 100),
      l('2026-11-26', 50.5),
      l('2026-11-27', 999), // próxima fatura
      l('2026-11-10', 20, { sentido: 'entrada' }),
      l('2026-11-05', 3000, { motivo_exclusao: 'pagamento_fatura' }),
      l('2026-11-05', 70, { conta_id: 'b' }),
    ], 'a', ciclo)
    expect(total).toBe(130.5)
  })
})

describe('usoDoLimite', () => {
  it('com o disponível do banco, usa o que o banco diz', () => {
    const u = usoDoLimite({ ...vazio, limite: 8000, limite_disponivel: 4210.5 }, 1000)
    expect(u?.usado).toBeCloseTo(3789.5)
    expect(u?.faixa).toBe('tranquilo')
  })

  it('com limite digitado, aproxima pela fatura aberta', () => {
    const u = usoDoLimite({ ...vazio, limite: 8000, limite_disponivel: 7000, limite_manual: 1000 }, 850)
    expect(u).toEqual({ usado: 850, limite: 1000, fracao: 0.85, faixa: 'alerta' })
  })

  it('sem limite nenhum, não há barra', () => {
    expect(usoDoLimite(vazio, 500)).toBeNull()
  })

  it('faixas: 50% é atenção', () => {
    expect(usoDoLimite({ ...vazio, limite_manual: 1000 }, 500)?.faixa).toBe('atencao')
  })
})

describe('distribuicao', () => {
  it('ordena do maior para o menor e soma 1', () => {
    const d = distribuicao([{ id: 'a', valor: 100 }, { id: 'b', valor: 300 }, { id: 'c', valor: 0 }])
    expect(d.map(f => f.id)).toEqual(['b', 'a'])
    expect(d.reduce((s, f) => s + f.fracao, 0)).toBeCloseTo(1)
  })

  it('sem gasto, sem barra', () => {
    expect(distribuicao([{ id: 'a', valor: 0 }])).toEqual([])
  })
})

it('quandoFecha', () => {
  const ciclo = { inicio: '2026-10-27', fechamento: '2026-11-26', vencimento: null, fonte: 'banco' as const }
  expect(quandoFecha(ciclo, '2026-11-17')).toBe('fecha em 9 dias')
  expect(quandoFecha(ciclo, '2026-11-25')).toBe('fecha amanhã')
  expect(quandoFecha(ciclo, '2026-11-26')).toBe('fecha hoje')
})

it('seloDoBanco reconhece os grandes e cai num neutro', () => {
  expect(seloDoBanco('Itaú Unibanco').sigla).toBe('itaú')
  expect(seloDoBanco('Nu Pagamentos').cor).toBe('#820AD1')
  expect(seloDoBanco('Banco Qualquer').sigla).toBe('Ba')
})
