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
import { FAIXAS_PADRAO, consumoDosOutrosEspacos, problemaNasFaixas, tomDoSalario } from '~/lib/painel-orcamentos'
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
