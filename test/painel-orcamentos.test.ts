/**
 * As contas próprias do painel de Orçamentos.
 *
 * O resto do painel reaproveita funções que já têm teste (`totalDoMes`,
 * `projecaoPessoal`, `saldoDoMes`); aqui fica o que só o painel calcula.
 */
import { describe, expect, it } from 'vitest'
import { aplicadoNasCaixinhas, competenciaDaUrl, corDeDado, etiquetaDaMovimentacao, fracaoDoMes, mesNaUrl, quandoFoi, repartirSalario, ritmoDoMes, saldoDasContas, semanasDoPlanejado, variacaoEntre } from '~/lib/painel-orcamentos'
import type { ConexaoBancaria, ContaBancaria } from '~/composables/useContasBancarias'

function conta(parcial: Partial<ContaBancaria>): ContaBancaria {
  return {
    id: 'c1',
    tipo: 'conta',
    nome: 'Conta Corrente',
    numero: null,
    apelido: null,
    destino: 'pessoal' as ContaBancaria['destino'],
    space_id: null,
    saldo: 0,
    saldo_atualizado_em: null,
    bandeira: null,
    nivel: null,
    cartoes: [],
    ...parcial,
  }
}

function conexao(banco: string, contas: ContaBancaria[]): ConexaoBancaria {
  return {
    id: banco,
    item_id: banco,
    banco,
    instituicao: null,
    banco_logo_url: null,
    status: 'UPDATED',
    consentimento_expira_em: null,
    sincronizado_em: null,
    erro_sincronizacao: null,
    conectado_em: '2026-11-01T00:00:00Z',
    contas,
  }
}

describe('variacaoEntre', () => {
  it('é a fração sobre o anterior', () => {
    expect(variacaoEntre(110, 100)).toBeCloseTo(0.1)
    expect(variacaoEntre(90, 100)).toBeCloseTo(-0.1)
  })

  it('não inventa variação sem anterior ou com anterior zero', () => {
    expect(variacaoEntre(100, 0)).toBeNull()
    expect(variacaoEntre(100, undefined)).toBeNull()
    expect(variacaoEntre(100, null)).toBeNull()
  })
})

describe('fracaoDoMes', () => {
  it('conta os dias corridos do mês de hoje', () => {
    expect(fracaoDoMes('2026-11-01', '2026-11-15')).toBeCloseTo(0.5)
    expect(fracaoDoMes('2026-11-01', '2026-11-30')).toBe(1)
  })

  it('é 1 no mês fechado e 0 no futuro', () => {
    expect(fracaoDoMes('2026-10-01', '2026-11-15')).toBe(1)
    expect(fracaoDoMes('2026-12-01', '2026-11-15')).toBe(0)
  })
})

describe('ritmoDoMes', () => {
  it('tolera dez pontos para cada lado', () => {
    expect(ritmoDoMes(0.55, 0.5)).toBe('no-ritmo')
    expect(ritmoDoMes(0.45, 0.5)).toBe('no-ritmo')
  })

  it('separa o folgado do acima', () => {
    expect(ritmoDoMes(0.2, 0.5)).toBe('folgado')
    expect(ritmoDoMes(0.8, 0.5)).toBe('acima')
  })
})

describe('saldoDasContas', () => {
  it('soma só as contas correntes, da maior para a menor', () => {
    const r = saldoDasContas([
      conexao('Itaú', [
        conta({ id: 'a', saldo: 100, saldo_atualizado_em: '2026-11-20T10:00:00Z' }),
        conta({ id: 'cartao', tipo: 'cartao', saldo: 999 }),
      ]),
      conexao('Caixa', [conta({ id: 'b', saldo: 250.5, apelido: 'Salário', saldo_atualizado_em: '2026-11-18T10:00:00Z' })]),
    ])

    expect(r?.total).toBe(350.5)
    expect(r?.contas.map(c => c.id)).toEqual(['b', 'a'])
    expect(r?.contas[0]?.nome).toBe('Salário')
    // A idade do total é a da conta mais desatualizada.
    expect(r?.atualizadoEm).toBe('2026-11-18T10:00:00Z')
  })

  it('é null sem conta corrente — o cartão vira convite, não R$ 0', () => {
    expect(saldoDasContas([])).toBeNull()
    expect(saldoDasContas([conexao('Nubank', [conta({ tipo: 'cartao', saldo: 10 })])])).toBeNull()
    expect(saldoDasContas([conexao('Nubank', [conta({ saldo: null })])])).toBeNull()
  })
})

describe('mês na URL', () => {
  it('vai e volta', () => {
    expect(mesNaUrl('2026-11-01')).toBe('2026-11')
    expect(competenciaDaUrl('2026-11')).toBe('2026-11-01')
  })

  it('ignora o que não é mês', () => {
    expect(competenciaDaUrl('2026-13')).toBeNull()
    expect(competenciaDaUrl('ontem')).toBeNull()
    expect(competenciaDaUrl(undefined)).toBeNull()
    expect(competenciaDaUrl(['2026-11'])).toBeNull()
  })
})

describe('corDeDado', () => {
  it('mantém a cor do banco quando ela aparece nos dois temas', () => {
    expect(corDeDado('#820AD1')).toBe('#820AD1')
  })

  it('devolve null para preto e branco, que somem num dos temas', () => {
    expect(corDeDado('#000000')).toBeNull()
    expect(corDeDado('#121212')).toBeNull()
    expect(corDeDado('#FFFFFF')).toBeNull()
    expect(corDeDado('azul')).toBeNull()
  })
})

describe('repartirSalario', () => {
  it('divide o salário em faturas, investido e livre', () => {
    const r = repartirSalario({ salario: 10000, faturas: 3000, investido: 1000 })!
    expect(r.fatias.map(f => [f.chave, f.valor, f.fracao])).toEqual([
      ['faturas', 3000, 0.3],
      ['investido', 1000, 0.1],
      ['livre', 6000, 0.6],
    ])
    expect(r.estouro).toBe(0)
  })

  it('zera o livre e guarda o estouro quando passa do salário', () => {
    const r = repartirSalario({ salario: 1000, faturas: 1200, investido: 300 })!
    expect(r.fatias.find(f => f.chave === 'livre')?.valor).toBe(0)
    expect(r.estouro).toBe(500)
    expect(r.fatias.reduce((s, f) => s + f.fracao, 0)).toBeCloseTo(1)
  })

  it('não reparte sem salário', () => {
    expect(repartirSalario({ salario: 0, faturas: 10, investido: 0 })).toBeNull()
  })

  it('resgate maior que o aporte não vira fatia negativa', () => {
    const r = repartirSalario({ salario: 1000, faturas: 0, investido: -200 })!
    expect(r.fatias.find(f => f.chave === 'investido')?.valor).toBe(0)
    expect(r.fatias.find(f => f.chave === 'livre')?.valor).toBe(1000)
  })
})

describe('aplicadoNasCaixinhas', () => {
  const mov = (valor: number, data: string, user_id = 'eu', meta_aporte_id: string | null = null) => ({ valor, data, user_id, meta_aporte_id })

  it('soma os movimentos do mês feitos pela pessoa, com resgates', () => {
    const caixinhas = [
      { movimentos: [mov(500, '2026-11-03'), mov(-100, '2026-11-20'), mov(999, '2026-10-30')] },
      { movimentos: [mov(50, '2026-11-10', 'outra')] },
    ]
    expect(aplicadoNasCaixinhas(caixinhas, '2026-11-01', 'eu')).toBe(400)
  })

  it('deixa de fora o que já entrou como aporte de meta', () => {
    const caixinhas = [{ movimentos: [mov(300, '2026-11-03', 'eu', 'aporte-1'), mov(200, '2026-11-04')] }]
    expect(aplicadoNasCaixinhas(caixinhas, '2026-11-01', 'eu')).toBe(200)
  })
})

describe('etiquetaDaMovimentacao', () => {
  it('a exclusão automática vem antes do destino', () => {
    expect(etiquetaDaMovimentacao({ sentido: 'entrada', destino: null, motivo_exclusao: 'pagamento_fatura' })).toBe('Pagamento de fatura')
    expect(etiquetaDaMovimentacao({ sentido: 'saida', destino: null, motivo_exclusao: 'transferencia_propria' })).toBe('Entre suas contas')
  })

  it('diz o que foi feito da linha', () => {
    expect(etiquetaDaMovimentacao({ sentido: 'entrada', destino: 'renda', motivo_exclusao: null })).toBe('Receita')
    expect(etiquetaDaMovimentacao({ sentido: 'saida', destino: 'compra', motivo_exclusao: null })).toBe('Lançada')
    expect(etiquetaDaMovimentacao({ sentido: 'saida', destino: null, motivo_exclusao: null })).toBe('Esperando destino')
    expect(etiquetaDaMovimentacao({ sentido: 'entrada', destino: null, motivo_exclusao: null })).toBe('Entrada')
  })
})

describe('quandoFoi', () => {
  it('fala hoje e ontem, e data curta no resto', () => {
    expect(quandoFoi('2026-11-24', '2026-11-24')).toBe('Hoje')
    expect(quandoFoi('2026-11-23', '2026-11-24')).toBe('Ontem')
    expect(quandoFoi('2026-10-31', '2026-11-01')).toBe('Ontem')
    expect(quandoFoi('2026-11-21', '2026-11-24')).toBe('21/11')
  })
})

describe('semanasDoPlanejado', () => {
  const base = { competencia: '2026-11-01', planejado: 3000, mesCurto: 'nov', hoje: '2026-11-17' }

  it('reparte em quatro blocos, a última semana até o fim do mês', () => {
    const s = semanasDoPlanejado({ ...base, lancamentos: [] })
    expect(s.map(x => x.rotulo)).toEqual(['1–7 nov', '8–14 nov', '15–21 nov', '22–30 nov'])
    // A cota é proporcional aos dias: 7/30 e 9/30 de R$ 3.000.
    expect(s[0]!.cota).toBe(700)
    expect(s[3]!.cota).toBe(900)
  })

  it('mede o gasto de cada semana contra a cota dela', () => {
    const s = semanasDoPlanejado({
      ...base,
      lancamentos: [
        { valor: 476, data: '2026-11-03' },
        { valor: 574, data: '2026-11-10' },
        { valor: 200, data: '2026-11-16' },
      ],
    })
    expect(s[0]!.fracao).toBeCloseTo(0.68)
    expect(s[1]!.fracao).toBeCloseTo(0.82)
    expect(s[3]!.fracao).toBe(0)
  })

  it('marca a semana de hoje e as que ainda não chegaram', () => {
    const s = semanasDoPlanejado({ ...base, lancamentos: [] })
    expect(s.map(x => x.atual)).toEqual([false, false, true, false])
    expect(s.map(x => x.futura)).toEqual([false, false, false, true])
  })

  it('parcela de compra antiga cai na primeira semana', () => {
    const s = semanasDoPlanejado({ ...base, lancamentos: [{ valor: 100, data: '2026-08-15' }] })
    expect(s[0]!.gasto).toBe(100)
  })

  it('sem planejado não há cota nem fração', () => {
    const s = semanasDoPlanejado({ ...base, planejado: 0, lancamentos: [{ valor: 100, data: '2026-11-03' }] })
    expect(s[0]!.fracao).toBe(0)
  })
})
