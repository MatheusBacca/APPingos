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

/*
 * Os dois bancos de produção em 25/11/2026, ciclo 05/11–04/12. O Nubank põe o
 * mês do vencimento (12) e o C6 o do início do ciclo (11) — e o C6 marca com o
 * mesmo 11 compras do fim do ciclo anterior que já estão na fatura fechada.
 */
describe('lancamentosDaFaturaAberta', () => {
  const ciclo = { inicio: '2026-11-05', fechamento: '2026-12-04', vencimento: null, fonte: 'fatura' as const }
  const l = (data: string, valor: number, extra: Partial<LancamentoDoCartao> = {}): LancamentoDoCartao =>
    ({ conta_id: 'a', valor, sentido: 'saida', data, motivo_exclusao: null, fatura_id: null, ...extra })

  it('a parcela de uma compra antiga entra: o banco diz em que fatura ela cai', () => {
    const total = totalDoCiclo([
      l('2026-11-20', 100, { fatura_prevista: '2026-12-01' }),
      l('2026-07-12', 80, { fatura_prevista: '2026-12-01' }), // parcela 5/10 de julho
      l('2026-10-20', 999, { fatura_prevista: '2026-11-01', fatura_id: 'fechada' }),
    ], 'a', ciclo)
    expect(total).toBe(180)
  })

  it('o C6: mesmo mês nas duas faturas, mas a fechada já tem fatura_id', () => {
    const total = totalDoCiclo([
      l('2026-11-02', 60, { fatura_prevista: '2026-11-01', fatura_id: 'fechada-0411' }),
      l('2026-11-22', 300, { fatura_prevista: '2026-11-01' }),
      l('2026-11-03', 40, { fatura_prevista: '2026-11-01' }), // antes do ciclo, sem fatura ainda: a do banco
    ], 'a', ciclo)
    expect(total).toBe(340)
  })

  it('compra solta de outro mês (fatura fechada que o banco ainda não ligou) fica de fora', () => {
    const total = totalDoCiclo([
      l('2026-11-10', 50, { fatura_prevista: '2026-12-01' }),
      l('2026-11-12', 30, { fatura_prevista: '2026-12-01' }),
      l('2026-11-02', 999, { fatura_prevista: '2026-11-01' }),
      l('2026-11-06', 1, { fatura_prevista: '2027-01-01' }), // parcela futura comprada no ciclo: perde a votação
    ], 'a', ciclo)
    expect(total).toBe(80)
  })

  it('sem compra no ciclo, vale o menor mês entre as soltas', () => {
    const total = totalDoCiclo([
      l('2026-06-01', 120, { fatura_prevista: '2026-12-01' }),
      l('2026-06-01', 120, { fatura_prevista: '2027-01-01' }),
    ], 'a', ciclo)
    expect(total).toBe(120)
  })

  it('sem fatura_prevista, segue as datas do ciclo como antes', () => {
    const total = totalDoCiclo([l('2026-11-20', 10), l('2026-11-04', 999), l('2026-12-05', 999)], 'a', ciclo)
    expect(total).toBe(10)
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
