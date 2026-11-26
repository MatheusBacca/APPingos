/**
 * O painel de Orçamentos separado por espaço: a fatura aberta repartida pelo
 * final do cartão, quanto os outros espaços consomem do mês da pessoa e as
 * faixas da barra "A pagar do salário".
 *
 * O caso que motiva o arquivo: o Nubank fatura numa conta só o virtual do casal
 * e os finais da pessoa — só o final diz de que espaço é cada compra.
 */
import { describe, expect, it } from 'vitest'
import { destinoEfetivo, faturaPorDestino } from '~/lib/cartoes'
import type { FinalDoCartao, LancamentoDoCartao } from '~/lib/cartoes'
import { FAIXAS_PADRAO, acertoAPagar, consumoDosOutrosEspacos, problemaNasFaixas, repartirSalario, saldosNosAcertos, somarAcertos, tomDoSalario } from '~/lib/painel-orcamentos'
import { saldoDoMes } from '~/types/orcamento'
import { formatarDinheiro } from '@/lib/dinheiro'
import { VALOR_OCULTO, mascararMantendoSinal, useValoresOcultos } from '~/composables/useValoresOcultos'
import type { CompraDoMes } from '~/types/orcamento'

const CASAL = 'space-casal'
const ciclo = { inicio: '2026-10-05', fechamento: '2026-11-04', vencimento: null, fonte: 'banco' as const }

type Lanc = LancamentoDoCartao & { cartao_final?: string | null }
const l = (valor: number, final: string | null, extra: Partial<Lanc> = {}): Lanc =>
  ({ conta_id: 'nubank', valor, sentido: 'saida', data: '2026-10-20', motivo_exclusao: null, cartao_final: final, ...extra })

const final = (f: string, destino: string, space_id: string | null = null): FinalDoCartao =>
  ({ conta_id: 'nubank', final: f, destino, space_id })

describe('destinoEfetivo', () => {
  it('o final manda, a menos que siga a conta', () => {
    const conta = { destino: 'pessoal', space_id: null }
    expect(destinoEfetivo(conta, { destino: 'casal', space_id: CASAL })).toBe(CASAL)
    expect(destinoEfetivo(conta, { destino: 'herdar', space_id: null })).toBe('pessoal')
    expect(destinoEfetivo({ destino: 'casal', space_id: CASAL })).toBe(CASAL)
  })

  it('"perguntar" e casal sem espaço contam como da pessoa', () => {
    expect(destinoEfetivo({ destino: 'perguntar', space_id: null })).toBe('pessoal')
    expect(destinoEfetivo({ destino: 'casal', space_id: null })).toBe('pessoal')
  })
})

describe('faturaPorDestino', () => {
  const conta = { id: 'nubank', destino: 'perguntar', space_id: null }
  const finais = [final('0750', 'casal', CASAL), final('0025', 'herdar')]

  it('separa o virtual do casal dos finais da pessoa na mesma conta', () => {
    const partes = faturaPorDestino([
      l(100, '0750'),
      l(40, '0750', { sentido: 'entrada' }), // estorno do casal
      l(200, '0025'),
      l(30, '4079'), // final sem cadastro: segue a conta
      l(10, null), // sem final: segue a conta
      l(999, '0750', { data: '2026-11-05' }), // próxima fatura
      l(999, '0025', { motivo_exclusao: 'pagamento_fatura' }),
      l(999, '0750', { fatura_id: 'fechada' }),
      l(999, '0750', { conta_id: 'outra' }),
    ], conta, finais, ciclo)

    expect(partes).toEqual([
      { destino: 'pessoal', valor: 240, finais: ['0025', '4079'] },
      { destino: CASAL, valor: 60, finais: ['0750'] },
    ])
  })

  it('a soma das partes é a fatura aberta', () => {
    const partes = faturaPorDestino([l(100, '0750'), l(50.55, '0025')], conta, finais, ciclo)
    expect(partes.reduce((s, p) => s + p.valor, 0)).toBeCloseTo(150.55)
  })

  it('cartão sem nada no ciclo continua no grupo da conta, zerado', () => {
    expect(faturaPorDestino([], { id: 'itau', destino: 'casal', space_id: CASAL }, [], ciclo))
      .toEqual([{ destino: CASAL, valor: 0, finais: [] }])
  })

  it('parte que só tem estorno some em vez de ficar negativa', () => {
    const partes = faturaPorDestino([l(100, '0025'), l(30, '0750', { sentido: 'entrada' })], conta, finais, ciclo)
    expect(partes).toEqual([{ destino: 'pessoal', valor: 100, finais: ['0025'] }])
  })
})

const EU = 'eu'
const ELA = 'ela'
function compra(space_id: string, valor: number, pesos: Record<string, number>): CompraDoMes {
  return {
    id: `${space_id}-${valor}`,
    space_id,
    descricao: 'Compra',
    valor_total: valor,
    data_compra: '2026-11-01',
    competencia_inicial: '2026-11-01',
    parcelas: 1,
    pago_por: EU,
    registrado_por: EU,
    categoria: null,
    participantes: Object.entries(pesos).map(([user_id, peso]) => ({ user_id, peso, informado_como: 'percentual' as const })),
    numero: 1,
    valor,
  }
}

describe('consumoDosOutrosEspacos', () => {
  const espacos = [
    { id: 'pessoal', nome: 'Pessoal', tipo: 'pessoal' },
    { id: CASAL, nome: 'SpacePingos', tipo: 'casal' },
    { id: 'familia', nome: 'Família', tipo: 'familia' },
  ]
  const compras = new Map<string, CompraDoMes[]>([
    ['pessoal', [compra('pessoal', 80, { [EU]: 1 })]],
    [CASAL, [compra(CASAL, 100, { [EU]: 1, [ELA]: 1 }), compra(CASAL, 30, { [ELA]: 1 })]],
  ])

  it('no pessoal: a sua parte em cada espaço compartilhado, sem o próprio pessoal', () => {
    expect(consumoDosOutrosEspacos({ ativo: 'pessoal', espacos, compras, eu: EU })).toEqual([
      { spaceId: CASAL, nome: 'SpacePingos', pessoal: false, valor: 50 },
      { spaceId: 'familia', nome: 'Família', pessoal: false, valor: 0 },
    ])
  })

  it('num compartilhado: a gaveta pessoal inteira e a sua parte nos demais', () => {
    expect(consumoDosOutrosEspacos({ ativo: CASAL, espacos, compras, eu: EU })).toEqual([
      { spaceId: 'pessoal', nome: 'Pessoal', pessoal: true, valor: 80 },
      { spaceId: 'familia', nome: 'Família', pessoal: false, valor: 0 },
    ])
  })
})

describe('faixas do salário', () => {
  it('verde abaixo da atenção, âmbar a partir dela, vermelho a partir do alerta', () => {
    expect(tomDoSalario(0.69)).toBe('tranquilo')
    expect(tomDoSalario(0.7)).toBe('atencao')
    expect(tomDoSalario(1)).toBe('alerta')
    expect(tomDoSalario(Infinity)).toBe('alerta')
  })

  it('respeita as faixas da pessoa', () => {
    const faixas = { atencao: 0.4, alerta: 0.6 }
    expect(tomDoSalario(0.3, faixas)).toBe('tranquilo')
    expect(tomDoSalario(0.5, faixas)).toBe('atencao')
    expect(tomDoSalario(0.6, faixas)).toBe('alerta')
  })

  it('o padrão espelha o default da migration', () => {
    expect(FAIXAS_PADRAO).toEqual({ atencao: 0.7, alerta: 1 })
  })

  it('confere as faixas digitadas como o CHECK do banco', () => {
    expect(problemaNasFaixas(70, 100)).toBeNull()
    expect(problemaNasFaixas(0, 100)).toMatch(/maior que 0/)
    expect(problemaNasFaixas(100, 100)).toMatch(/abaixo da de alerta/)
    expect(problemaNasFaixas(50, 301)).toMatch(/300%/)
    expect(problemaNasFaixas(Number.NaN, 100)).toMatch(/Preencha/)
  })
})

describe('saldosNosAcertos', () => {
  const espacos = [
    { id: 'pessoal', nome: 'Pessoal', tipo: 'pessoal' },
    { id: CASAL, nome: 'SpacePingos', tipo: 'casal' },
    { id: 'viagem', nome: 'Viagem', tipo: 'casal' },
    { id: 'familia', nome: 'Família', tipo: 'casal' },
  ]
  const membros = new Map<string, string[]>([
    [CASAL, [EU, ELA]],
    ['viagem', [EU, ELA]],
    ['familia', [EU, ELA, 'outro']],
  ])
  // Eu paguei 100 dividido meio a meio (ela me deve 50); ela pagou 30 só meu (eu devo 30).
  const pagoPor = (c: CompraDoMes, quem: string) => ({ ...c, pago_por: quem })
  const compras = new Map<string, CompraDoMes[]>([
    ['pessoal', [compra('pessoal', 999, { [EU]: 1 })]],
    [CASAL, [compra(CASAL, 100, { [EU]: 1, [ELA]: 1 }), pagoPor(compra(CASAL, 30, { [EU]: 1 }), ELA)]],
    ['viagem', [pagoPor(compra('viagem', 80, { [EU]: 1, [ELA]: 1 }), ELA)]],
    ['familia', [pagoPor(compra('familia', 90, { [EU]: 1, [ELA]: 1, outro: 1 }), ELA)]],
  ])
  const base = { espacos, compras, membros, eu: EU }

  it('soma o seu saldo nos espaços de duas pessoas, sem o pessoal', () => {
    const r = saldosNosAcertos({ ...base, acertados: new Set() })
    expect(r.porEspaco).toEqual([
      { spaceId: CASAL, saldo: 20 }, // me devem 50, eu devo 30
      { spaceId: 'viagem', saldo: -40 }, // devo metade de 80
    ])
    expect(r.total).toBe(-20)
  })

  it('espaço de três pessoas fica de fora, como no cartão Acerto do mês', () => {
    const r = saldosNosAcertos({ ...base, acertados: new Set() })
    expect(r.porEspaco.some(p => p.spaceId === 'familia')).toBe(false)
  })

  it('usa os membros de verdade, não os que aparecem nas compras', () => {
    const r = saldosNosAcertos({ ...base, membros: new Map([[CASAL, [EU, ELA]]]), acertados: new Set() })
    expect(r.porEspaco.map(p => p.spaceId)).toEqual([CASAL]) // viagem sem membros carregados não conta
  })

  it('mês já acertado não conta: o dinheiro já trocou de mãos', () => {
    expect(saldosNosAcertos({ ...base, acertados: new Set([CASAL]) }).total).toBe(-40)
  })

  it('bate com o saldo do cartão Acerto do mês', () => {
    const doCartao = saldoDoMes(compras.get(CASAL)!, [EU, ELA]).find(s => s.user_id === EU)!.saldo
    expect(saldosNosAcertos({ ...base, acertados: new Set(['viagem']) }).total).toBe(doCartao)
  })

  it('sem usuário, não há acerto', () => {
    expect(saldosNosAcertos({ ...base, acertados: new Set(), eu: null })).toEqual({ total: 0, porEspaco: [] })
  })
})

describe('somarAcertos', () => {
  it('junta o mês aberto com o anterior pendente, por espaço', () => {
    const aberto = { total: 30, porEspaco: [{ spaceId: CASAL, saldo: 50 }, { spaceId: 'viagem', saldo: -20 }] }
    const anterior = { total: -30, porEspaco: [{ spaceId: CASAL, saldo: -30 }] }
    expect(somarAcertos(aberto, anterior)).toEqual({
      total: 0,
      porEspaco: [{ spaceId: CASAL, saldo: 20 }, { spaceId: 'viagem', saldo: -20 }],
    })
  })

  it('espaço que zera na soma sai da lista', () => {
    const r = somarAcertos({ total: 10, porEspaco: [{ spaceId: CASAL, saldo: 10 }] }, { total: -10, porEspaco: [{ spaceId: CASAL, saldo: -10 }] })
    expect(r).toEqual({ total: 0, porEspaco: [] })
  })
})

describe('o acerto no salário', () => {
  it('o que te devem abate as faturas; o que você deve soma', () => {
    expect(acertoAPagar(1000, 300)).toBe(700)
    expect(acertoAPagar(1000, -300)).toBe(1300)
    expect(acertoAPagar(200, 500)).toBe(0)
  })

  it('a pizza usa as faturas com o acerto e guarda as do banco', () => {
    const r = repartirSalario({ salario: 5000, faturas: 3000, investido: 0, acerto: 900 })!
    expect(r.fatias.find(f => f.chave === 'faturas')?.valor).toBe(2100)
    expect(r.fatias.find(f => f.chave === 'livre')?.valor).toBe(2900)
    expect(r.faturasDoBanco).toBe(3000)
    expect(r.acerto).toBe(900)
  })

  it('dever no acerto pode estourar o salário', () => {
    const r = repartirSalario({ salario: 1000, faturas: 900, investido: 0, acerto: -200 })!
    expect(r.estouro).toBe(100)
  })
})

describe('useValoresOcultos', () => {
  it('esconde o dinheiro e volta a mostrar', () => {
    const { ocultos, alternar, dinheiro } = useValoresOcultos()
    ocultos.value = false
    expect(dinheiro(1234.5)).toBe(formatarDinheiro(1234.5))
    alternar()
    expect(dinheiro(1234.5)).toBe(VALOR_OCULTO)
    alternar()
    expect(ocultos.value).toBe(false)
  })
})

describe('mascararMantendoSinal', () => {
  it('mantém o sinal que diz quem deve', () => {
    expect(mascararMantendoSinal('+R$ 366,15')).toBe(`+${VALOR_OCULTO}`)
    expect(mascararMantendoSinal('−R$ 10,00')).toBe(`−${VALOR_OCULTO}`)
    expect(mascararMantendoSinal('R$ 10,00')).toBe(VALOR_OCULTO)
  })
})
