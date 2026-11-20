/**
 * A organização da caixa de entrada na tela: dias, resumo, filtros e o
 * critério do botão "Aceitar".
 */
import { describe, expect, it } from 'vitest'
import {
  FILTRO_INICIAL,
  aceitavel,
  contagemPorDia,
  filtrarCaixa,
  gruposPorDia,
  mesDoItem,
  mesesDaCaixa,
  pendentesDoCasal,
  recortarPorData,
  resumoDaCaixa,
  rotuloDaConta,
} from '~/lib/caixa-lista'
import type { Sugestao } from '~/lib/auto-tag'
import type { ItemDaCaixa } from '~/lib/caixa-de-entrada'

function item(chave: string, data: string, valor: number, extra: { sentido?: 'saida' | 'entrada', conta?: string } = {}): ItemDaCaixa {
  const t = { id: chave, conta_id: extra.conta ?? 'itau', valor, data } as unknown as ItemDaCaixa['principal']
  return {
    chave,
    principal: t,
    transacoes: [t],
    plano: {} as ItemDaCaixa['plano'],
    sentido: extra.sentido ?? 'saida',
    pendente: false,
    data,
  }
}

const sugestao = (extra: Partial<Sugestao> = {}): Sugestao => ({
  destino: 'casal',
  categoriaNome: 'Mercado',
  categoriaBase: 'mercado',
  origem: 'regra',
  confianca: 'media',
  motivo: '',
  estabelecimento: null,
  chave: 'condor',
  ...extra,
})

describe('gruposPorDia', () => {
  it('junta por dia, na ordem, com Hoje e Ontem', () => {
    const g = gruposPorDia([
      item('a', '2026-11-17', 1),
      item('b', '2026-11-17', 2),
      item('c', '2026-11-16', 3),
      item('d', '2026-11-10', 4),
    ], '2026-11-17')
    expect(g.map(x => [x.rotulo, x.itens.length])).toEqual([
      ['Hoje', 2],
      ['Ontem', 1],
      ['10 de novembro', 1],
    ])
  })
})

describe('resumoDaCaixa', () => {
  it('soma só as saídas, mas conta todas', () => {
    const r = resumoDaCaixa([item('a', '2026-11-17', 100.1), item('b', '2026-11-17', 0.2), item('c', '2026-11-17', 5000, { sentido: 'entrada' })])
    expect(r.total).toBe(100.3)
    expect(r.quantidade).toBe(3)
    expect(r.texto.replace(/\s/g, ' ')).toBe('R$ 100,30 em 3 compras')
  })

  it('singular', () => {
    expect(resumoDaCaixa([item('a', '2026-11-17', 10)]).texto).toMatch(/em 1 compra$/)
  })
})

describe('aceitavel', () => {
  it('regra com destino de compra, categoria e confiança média ou alta', () => {
    expect(aceitavel(sugestao())).toBe(true)
    expect(aceitavel(sugestao({ confianca: 'alta', destino: 'pessoal' }))).toBe(true)
  })

  it('não aceita sem confiança, sem categoria, sem destino ou vindo só da marca', () => {
    expect(aceitavel(sugestao({ confianca: 'baixa' }))).toBe(false)
    expect(aceitavel(sugestao({ categoriaNome: null }))).toBe(false)
    expect(aceitavel(sugestao({ destino: null }))).toBe(false)
    expect(aceitavel(sugestao({ destino: 'ignorar' }))).toBe(false)
    expect(aceitavel(sugestao({ origem: 'estabelecimento' }))).toBe(false)
    expect(aceitavel(undefined)).toBe(false)
  })
})

describe('filtrarCaixa', () => {
  const itens = [item('a', '2026-11-17', 1, { conta: 'itau' }), item('b', '2026-11-17', 1, { conta: 'corrente' })]
  const tipo = (id: string) => (id === 'corrente' ? 'conta' as const : 'cartao' as const)

  it('por origem, por conta e só com sugestão', () => {
    const s = new Map([['a', sugestao()]])
    expect(filtrarCaixa(itens, FILTRO_INICIAL, tipo, s)).toHaveLength(2)
    expect(filtrarCaixa(itens, { ...FILTRO_INICIAL, origem: 'conta' }, tipo, s).map(i => i.chave)).toEqual(['b'])
    expect(filtrarCaixa(itens, { ...FILTRO_INICIAL, conta: 'itau' }, tipo, s).map(i => i.chave)).toEqual(['a'])
    expect(filtrarCaixa(itens, { ...FILTRO_INICIAL, soComSugestao: true }, tipo, s).map(i => i.chave)).toEqual(['a'])
  })
})

describe('rotuloDaConta — de onde veio o valor', () => {
  const nubank = {
    nome: 'platinum',
    tipo: 'cartao' as const,
    numero: '0025',
    destino: 'pessoal' as const,
    space_id: null,
    conexao: { banco: 'MeuPluggy', instituicao: 'nubank' },
    cartoes: [
      { final: '0025', apelido: null, destino: 'herdar', space_id: null },
      { final: '0750', apelido: 'Mercado', destino: 'casal', space_id: 'casal-1' },
      { final: '4079', apelido: null, destino: 'perguntar', space_id: null },
    ],
  }

  it('troca "MeuPluggy" pelo banco de verdade, com o ícone do destino', () => {
    expect(rotuloDaConta(nubank)).toBe('👤 Nubank •••• 0025')
    expect(rotuloDaConta(nubank, '0025')).toBe('👤 Nubank •••• 0025')
  })

  it('o cartão por final ganha da conta: destino e apelido', () => {
    expect(rotuloDaConta(nubank, '0750')).toBe('👥 Nubank "Mercado"')
    expect(rotuloDaConta(nubank, '4079')).toBe('🔀 Nubank •••• 4079')
  })

  it('o apelido da conta vale para o cartão principal, não para os outros finais', () => {
    const comApelido = { ...nubank, apelido: 'Roxinho' }
    expect(rotuloDaConta(comApelido, '0025')).toBe('👤 Nubank "Roxinho"')
    expect(rotuloDaConta(comApelido, '4079')).toBe('🔀 Nubank •••• 4079')
  })

  it('conta corrente: os 4 últimos dígitos, sem o hífen', () => {
    const c6 = { nome: 'C6 BANK', tipo: 'conta' as const, numero: '29190816-0', destino: 'perguntar' as const, conexao: { banco: 'MeuPluggy', instituicao: 'c6' } }
    expect(rotuloDaConta(c6)).toBe('🔀 C6 •••• 8160')
  })

  it('compartilhado sem espaço não existe: vira perguntar', () => {
    expect(rotuloDaConta({ ...nubank, destino: 'casal' as const, space_id: null })).toBe('🔀 Nubank •••• 0025')
  })

  it('sem instituição reconhecida, o conector (se não for agregador) ou o nome da conta', () => {
    expect(rotuloDaConta({ nome: 'Itaú Itaucard', numero: '1234', conexao: { banco: 'Itaú' } })).toBe('🔀 Itaú •••• 1234')
    expect(rotuloDaConta({ nome: 'Banco Xis', numero: '1234', conexao: { banco: 'MeuPluggy' } })).toBe('🔀 Banco Xis •••• 1234')
    expect(rotuloDaConta({ nome: 'Conta corrente', numero: null })).toBe('🔀 Conta corrente')
    expect(rotuloDaConta(null)).toBe('')
  })
})

describe('a página do mês', () => {
  const itens = [
    item('a', '2026-11-16', 50),
    item('b', '2026-11-16', 20),
    item('c', '2026-11-02', 40),
    item('d', '2026-10-30', 90),
    item('e', '2026-08-18', 10),
  ]

  it('conta os meses que têm algo, do mais novo para o mais antigo', () => {
    expect(mesesDaCaixa(itens)).toEqual([
      { mes: '2026-11-01', quantidade: 3 },
      { mes: '2026-10-01', quantidade: 1 },
      { mes: '2026-08-01', quantidade: 1 },
    ])
  })

  it('conta por dia só dentro do mês pedido', () => {
    const dias = contagemPorDia(itens, '2026-11-01')
    expect(Object.fromEntries(dias)).toEqual({ '2026-11-16': 2, '2026-11-02': 1 })
  })

  it('recorta pelo mês e, com um dia marcado, só por ele', () => {
    expect(recortarPorData(itens, '2026-11-01', null).map(i => i.chave)).toEqual(['a', 'b', 'c'])
    expect(recortarPorData(itens, '2026-11-01', '2026-11-16').map(i => i.chave)).toEqual(['a', 'b'])
    expect(recortarPorData(itens, '2026-09-01', null)).toEqual([])
  })

  it('a compra de 30/10 fica em outubro, mesmo caindo na fatura de novembro', () => {
    expect(mesDoItem(item('x', '2026-10-30', 1))).toBe('2026-10-01')
  })
})

describe('pendentesDoCasal', () => {
  const contas: Record<string, { destino: string, space_id: string | null }> = {
    platinum: { destino: 'casal', space_id: 'casal-1' },
    outro: { destino: 'casal', space_id: 'casal-2' },
    bandeirado: { destino: 'pessoal', space_id: null },
  }
  const contaDe = (id: string) => contas[id]

  function doCartao(chave: string, conta: string, competencia: string, extra: { sentido?: 'saida' | 'entrada', pendente?: boolean } = {}): ItemDaCaixa {
    const base = item(chave, '2026-11-04', 10, { conta, sentido: extra.sentido })
    const t = { ...base.principal, competencia, pendente: extra.pendente ?? false }
    return { ...base, principal: t, transacoes: [t], pendente: extra.pendente ?? false }
  }

  it('fica com os gastos lançados dos cartões deste espaço, nesta competência', () => {
    const itens = [
      doCartao('ok', 'platinum', '2026-11-01'),
      doCartao('outro-espaco', 'outro', '2026-11-01'),
      doCartao('pessoal', 'bandeirado', '2026-11-01'),
      doCartao('outra-fatura', 'platinum', '2026-12-01'),
      doCartao('estorno', 'platinum', '2026-11-01', { sentido: 'entrada' }),
      doCartao('no-banco', 'platinum', '2026-11-01', { pendente: true }),
    ]
    expect(pendentesDoCasal(itens, 'casal-1', '2026-11-01', contaDe).map(i => i.chave)).toEqual(['ok'])
  })

  it('a compra parcelada aparece na competência de qualquer parcela que trouxe', () => {
    const base = doCartao('airbnb', 'platinum', '2026-10-01')
    const nov = { ...base.principal, id: 'airbnb-4', competencia: '2026-11-01' }
    const parcelada = { ...base, transacoes: [base.principal, nov] }
    expect(pendentesDoCasal([parcelada], 'casal-1', '2026-11-01', contaDe)).toHaveLength(1)
    expect(pendentesDoCasal([parcelada], 'casal-1', '2026-10-01', contaDe)).toHaveLength(1)
  })
})
