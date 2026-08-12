/**
 * O arredondamento do acerto do mês.
 *
 * `saldoDoMes` é a única fonte do "quem deve quanto" — a tela de Orçamentos e o
 * painel de resumos leem daqui. As duas propriedades abaixo são o contrato:
 * a soma das partes bate com o gasto do mês, e a soma dos saldos é zero. Sem
 * elas aparece o clássico "você tem +1.150,61 e ela −1.150,62", sem explicação.
 */
import { describe, expect, it } from 'vitest'
import { fracaoNaFatia, gastoPorCategoria, meuBolso, saldoDoMes, totalDoMes } from '~/types/orcamento'
import type { CompraDoMes } from '~/types/orcamento'

const EU = 'eu'
const ELA = 'ela'

function compra(valor: number, pagoPor: string, pesos: Record<string, number>): CompraDoMes {
  return {
    id: `c-${valor}-${pagoPor}`,
    space_id: 'casal',
    descricao: 'Compra',
    valor_total: valor,
    data_compra: '2026-08-01',
    competencia_inicial: '2026-08-01',
    parcelas: 1,
    pago_por: pagoPor,
    registrado_por: pagoPor,
    categoria: null,
    participantes: Object.entries(pesos).map(([user_id, peso]) => ({
      user_id,
      peso,
      informado_como: 'percentual' as const,
    })),
    numero: 1,
    valor,
  }
}

const soma = (ns: number[]) => Math.round(ns.reduce((t, n) => t + n, 0) * 100) / 100

describe('saldoDoMes', () => {
  it('divide meio a meio e deixa quem pagou como credor', () => {
    const saldos = saldoDoMes([compra(100, EU, { [EU]: 1, [ELA]: 1 })], [EU, ELA])

    expect(saldos).toEqual([
      { user_id: EU, pago: 100, devido: 50, saldo: 50 },
      { user_id: ELA, pago: 0, devido: 50, saldo: -50 },
    ])
  })

  it('respeita o rateio por peso, sem normalizar antes da hora', () => {
    // "R$ 500 de R$ 1.500" — peso 500 contra 1000, e não 33,33%.
    const saldos = saldoDoMes([compra(1500, ELA, { [EU]: 500, [ELA]: 1000 })], [EU, ELA])

    expect(saldos.find(s => s.user_id === EU)?.devido).toBe(500)
    expect(saldos.find(s => s.user_id === ELA)?.devido).toBe(1000)
  })

  /*
   * Os valores abaixo caem em meio centavo quando divididos, que é o caso em
   * que arredondar cada parte por conta própria estoura o total.
   */
  it.each([0.15, 0.05, 1000.01, 33.33, 1500, 1234.57])(
    'mantém as duas propriedades com R$ %s',
    (valor) => {
      const compras = [
        compra(valor, EU, { [EU]: 1, [ELA]: 1 }),
        compra(valor, ELA, { [EU]: 1, [ELA]: 2 }),
      ]
      const saldos = saldoDoMes(compras, [EU, ELA])

      expect(soma(saldos.map(s => s.devido))).toBe(soma(compras.map(c => c.valor)))
      expect(soma(saldos.map(s => s.saldo))).toBe(0)
    },
  )

  it('devolve zeros para um mês sem compras', () => {
    expect(saldoDoMes([], [EU, ELA])).toEqual([
      { user_id: EU, pago: 0, devido: 0, saldo: 0 },
      { user_id: ELA, pago: 0, devido: 0, saldo: 0 },
    ])
  })

  /*
   * A invariante que sustenta a privacidade dos gastos pessoais: eles NUNCA são
   * passados para cá pela tela, mas se um dia forem, o teste registra o que
   * aconteceria — a outra pessoa passaria a "dever" parte de um gasto que ela
   * nem consegue ver. Daí o acerto do mês ler `compras`, e não a lista visível.
   */
  it('conta qualquer compra que receba — filtrar o pessoal é papel de quem chama', () => {
    const pessoal = { ...compra(80, EU, { [EU]: 1 }), space_id: 'pessoal' }
    const saldos = saldoDoMes([pessoal], [EU, ELA])

    expect(saldos.find(s => s.user_id === ELA)?.devido).toBe(0)
    expect(saldos.find(s => s.user_id === EU)?.saldo).toBe(0)
  })
})

describe('meuBolso', () => {
  const pessoal = (valor: number): CompraDoMes => ({
    ...compra(valor, EU, { [EU]: 1 }),
    id: `p-${valor}`,
    space_id: 'pessoal',
  })

  it('soma a sua parte do compartilhado com os pessoais inteiros', () => {
    // 50 (metade de 100) + 30 = 80
    const bolso = meuBolso([compra(100, ELA, { [EU]: 1, [ELA]: 1 })], [pessoal(30)], EU)

    expect(bolso).toBe(80)
  })

  it('não é o gasto do espaço — os dois números não se somam', () => {
    const compartilhadas = [compra(100, ELA, { [EU]: 1, [ELA]: 1 })]

    expect(totalDoMes(compartilhadas)).toBe(100)
    expect(meuBolso(compartilhadas, [], EU)).toBe(50)
  })

  it('ignora o rateio de quem não é você', () => {
    const bolso = meuBolso([compra(1500, ELA, { [EU]: 500, [ELA]: 1000 })], [], EU)

    expect(bolso).toBe(500)
  })

  it('sem usuário conhecido, sobra o que é indiscutivelmente seu', () => {
    expect(meuBolso([compra(100, ELA, { [EU]: 1, [ELA]: 1 })], [pessoal(30)], null)).toBe(30)
  })

  it('arredonda uma vez só, no fim', () => {
    // 1/3 de 100 = 33,333… — a soma com o pessoal fecha em centavos.
    const bolso = meuBolso([compra(100, ELA, { [EU]: 1, [ELA]: 2 })], [pessoal(0.01)], EU)

    expect(bolso).toBe(33.34)
  })
})

/**
 * O gráfico "Em que foi" da tela de Orçamentos.
 *
 * As duas propriedades que a tela promete e que só existem aqui: as frações
 * somam 1, e "Não categorizado" nunca disputa posição com uma categoria de
 * verdade — ele é o resto, e resto fica por último.
 */
describe('gastoPorCategoria', () => {
  const categorizada = (
    valor: number,
    nome: string | null,
    id = nome ?? 'sem',
  ): CompraDoMes => ({
    ...compra(valor, EU, { [EU]: 1, [ELA]: 1 }),
    id: `${id}-${valor}`,
    descricao: nome ?? 'Avulsa',
    categoria: nome ? { id, nome, cor: 'verde' as const } : null,
  })

  it('junta por categoria, do maior para o menor', () => {
    const fatias = gastoPorCategoria([
      categorizada(30, 'Lazer'),
      categorizada(100, 'Mercado'),
      categorizada(50, 'Mercado'),
    ])

    expect(fatias.map(f => [f.nome, f.total])).toEqual([
      ['Mercado', 150],
      ['Lazer', 30],
    ])
    expect(fatias[0]!.compras).toHaveLength(2)
  })

  it('deixa "Não categorizado" por último, mesmo sendo o maior', () => {
    const fatias = gastoPorCategoria([
      categorizada(1000, null),
      categorizada(10, 'Lazer'),
    ])

    expect(fatias.map(f => f.nome)).toEqual(['Lazer', 'Não categorizado'])
    expect(fatias[1]!.cor).toBeNull()
  })

  /*
   * Cada espaço tem a sua tabela de categorias, então "Mercado" do casal e
   * "Mercado" do pessoal têm ids diferentes. Agrupar por id mostraria duas
   * barras "Mercado" — fiel ao banco, e mentiroso para quem lê.
   */
  it('unifica o mesmo nome vindo de espaços diferentes, e a caixa não importa', () => {
    const fatias = gastoPorCategoria([
      categorizada(100, 'Mercado', 'cat-casal'),
      { ...categorizada(40, 'mercado', 'cat-pessoal'), space_id: 'pessoal' },
    ])

    expect(fatias).toHaveLength(1)
    expect(fatias[0]!.total).toBe(140)
  })

  it('as frações somam o período inteiro', () => {
    const fatias = gastoPorCategoria([
      categorizada(33.33, 'Mercado'),
      categorizada(66.67, 'Lazer'),
      categorizada(0.01, null),
    ])

    expect(soma(fatias.map(f => f.fracao))).toBe(1)
  })

  it('ordena as compras da fatia pela maior, que é o que puxou o número', () => {
    const fatias = gastoPorCategoria([
      categorizada(10, 'Mercado'),
      categorizada(200, 'Mercado'),
      categorizada(50, 'Mercado'),
    ])

    expect(fatias[0]!.compras.map(c => c.valor)).toEqual([200, 50, 10])
    expect(fracaoNaFatia(fatias[0]!, fatias[0]!.compras[0]!)).toBeCloseTo(200 / 260)
  })

  it('não divide por zero num mês sem compras', () => {
    expect(gastoPorCategoria([])).toEqual([])
  })
})
