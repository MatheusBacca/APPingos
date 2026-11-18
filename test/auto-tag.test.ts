/**
 * A sugestão de destino e categoria da caixa de entrada.
 *
 * A ordem das fontes é o contrato: o que a pessoa escolheu ganha da marca
 * conhecida, que ganha da categoria da Pluggy. E o destino (casal, pessoal,
 * ignorar) só vem do que a pessoa escolheu — a marca não sabe de quem é o gasto.
 */
import { describe, expect, it } from 'vitest'
import { podeSerAutomatica, rotuloParaRegra, sugerirClassificacao } from '~/lib/auto-tag'
import type { RegraAprendida } from '~/lib/auto-tag'

function regra(extra: Partial<RegraAprendida> = {}): RegraAprendida {
  return {
    chave: 'ifood agencia',
    rotulo: 'iFood',
    destino: 'pessoal',
    categoria_nome: 'Delivery',
    vezes: 1,
    automatica: false,
    ...extra,
  }
}

const ESPACO = [{ nome: 'Supermercado' }, { nome: 'Comida' }, { nome: 'Uber/Táxi' }, { nome: 'Farmácia' }]

describe('sugerirClassificacao — regra aprendida', () => {
  it('a regra da mesma chave ganha de tudo, com o destino', () => {
    const s = sugerirClassificacao(
      { descricao: 'IFD*IFOOD.COM AGENCIA DE', categoria_pluggy: 'Groceries', categoria_pluggy_id: '10000000' },
      [regra({ destino: 'casal', categoria_nome: 'Comida', vezes: 2 })],
      ESPACO,
    )!
    expect(s.origem).toBe('regra')
    expect(s.destino).toBe('casal')
    expect(s.categoriaNome).toBe('Comida')
    expect(s.categoriaBase).toBe('restaurante')
    expect(s.estabelecimento?.id).toBe('ifood')
    expect(s.chave).toBe('ifood agencia')
  })

  it.each([
    [1, 'baixa', 'Como da última vez'],
    [2, 'media', 'Como nas últimas 2 vezes'],
    [3, 'alta', 'Como nas últimas 3 vezes'],
    [7, 'alta', 'Como nas últimas 7 vezes'],
  ] as const)('%i vez(es) → confiança %s', (vezes, confianca, motivo) => {
    const s = sugerirClassificacao({ descricao: 'IFD*IFOOD.COM AGENCIA DE' }, [regra({ vezes })], [])!
    expect(s.confianca).toBe(confianca)
    expect(s.motivo).toBe(motivo)
  })

  it('casa a regra mesmo em outra parcela e com a cidade no fim', () => {
    const regras = [regra({ chave: 'ton', rotulo: 'Ton', categoria_nome: 'Casa', vezes: 3 })]
    for (const descricao of ['PG *TON 02/10', 'PG *TON 03/10', 'PG *TON CURITIBA BR']) {
      const s = sugerirClassificacao({ descricao }, regras, [])
      expect(s?.origem, descricao).toBe('regra')
      expect(s?.categoriaNome).toBe('Casa')
    }
  })

  it('usa a grafia da categoria que o espaço tem', () => {
    const s = sugerirClassificacao(
      { descricao: 'PG *TON 02/10' },
      [regra({ chave: 'ton', categoria_nome: 'supermercado' })],
      ESPACO,
    )!
    expect(s.categoriaNome).toBe('Supermercado')
  })

  it('"ignorar" sugere ignorar, sem categoria', () => {
    const s = sugerirClassificacao(
      { descricao: 'NETFLIX.COM' },
      [regra({ chave: 'netflix', rotulo: 'Netflix', destino: 'ignorar', categoria_nome: null, vezes: 2 })],
      [],
    )!
    expect(s.destino).toBe('ignorar')
    expect(s.categoriaNome).toBeNull()
    expect(s.categoriaBase).toBeNull()
  })

  it('regra sem categoria ainda dá o destino', () => {
    const s = sugerirClassificacao(
      { descricao: 'PADARIA DO ZE' },
      [regra({ chave: 'padaria do ze', rotulo: 'Padaria do Ze', destino: 'casal', categoria_nome: null })],
      [],
    )!
    expect(s.destino).toBe('casal')
    expect(s.categoriaNome).toBeNull()
  })

  it('casa pelo nome do estabelecimento que a Pluggy mandou', () => {
    const s = sugerirClassificacao(
      { descricao: 'COMPRA 8812 XPTO', estabelecimento_nome: 'Padaria do Zé' },
      [regra({ chave: 'padaria do ze', rotulo: 'Padaria do Zé', destino: 'casal', categoria_nome: 'Padaria' })],
      [],
    )!
    expect(s.origem).toBe('regra')
    expect(s.categoriaNome).toBe('Padaria')
  })

  it('de outra loja da mesma marca, vale — mas nunca com confiança alta', () => {
    const s = sugerirClassificacao(
      { descricao: 'IFOOD *PIZZARIA BELLA' },
      [
        regra({ chave: 'restaurante x', rotulo: 'iFood', categoria_nome: 'Comida', vezes: 5 }),
        regra({ chave: 'outro', rotulo: 'iFood', categoria_nome: 'Delivery', vezes: 1 }),
      ],
      ESPACO,
    )!
    expect(s.origem).toBe('regra')
    expect(s.categoriaNome).toBe('Comida')
    expect(s.confianca).toBe('media')
    expect(s.motivo).toBe('Como nas outras compras em iFood')
  })

  it('a chave exata ganha da regra da marca', () => {
    const s = sugerirClassificacao(
      { descricao: 'IFD*IFOOD.COM AGENCIA DE' },
      [
        regra({ chave: 'pizzaria bella', rotulo: 'iFood', categoria_nome: 'Comida', vezes: 9 }),
        regra({ chave: 'ifood agencia', rotulo: 'iFood', categoria_nome: 'Delivery', vezes: 1 }),
      ],
      [],
    )!
    expect(s.categoriaNome).toBe('Delivery')
  })
})

describe('sugerirClassificacao — marca conhecida', () => {
  it('sem regra, a marca dá a categoria — e nunca o destino', () => {
    const s = sugerirClassificacao({ descricao: 'IFD*IFOOD.COM AGENCIA DE' }, [], [])!
    expect(s.origem).toBe('estabelecimento')
    expect(s.destino).toBeNull()
    expect(s.categoriaBase).toBe('delivery')
    expect(s.categoriaNome).toBe('Delivery')
    expect(s.motivo).toBe('iFood costuma ser Delivery')
    expect(s.confianca).toBe('media')
  })

  it('usa a categoria equivalente que o espaço já tem', () => {
    expect(sugerirClassificacao({ descricao: 'PAG*CondorSuperCentro CURITIBA BR' }, [], ESPACO)!.categoriaNome).toBe('Supermercado')
    expect(sugerirClassificacao({ descricao: 'UBER *TRIP HELP.UBER.COM' }, [], ESPACO)!.categoriaNome).toBe('Uber/Táxi')
    expect(sugerirClassificacao({ descricao: 'DROGASIL 1234 SAO PAULO' }, [], ESPACO)!.categoriaNome).toBe('Farmácia')
  })

  it('prefere a de nome padrão quando o espaço tem as duas', () => {
    const s = sugerirClassificacao({ descricao: 'NETFLIX.COM' }, [], [{ nome: 'Assinaturas' }, { nome: 'streaming' }])!
    expect(s.categoriaNome).toBe('streaming')
  })

  it('sem equivalente no espaço, o nome padrão (para criar ao confirmar)', () => {
    const s = sugerirClassificacao({ descricao: 'POSTO SHELL 123' }, [], ESPACO)!
    expect(s.categoriaNome).toBe('Combustível')
    expect(s.motivo).toBe('Shell costuma ser Combustível')
  })

  it('a marca ganha da categoria da Pluggy', () => {
    const s = sugerirClassificacao(
      { descricao: 'MERCADOLIVRE*3PRODUTOS', categoria_pluggy: 'Groceries', categoria_pluggy_id: '10000000' },
      [],
      [],
    )!
    expect(s.origem).toBe('estabelecimento')
    expect(s.categoriaBase).toBe('compras')
  })

  it('reconhece pelo nome do estabelecimento quando a descrição é genérica', () => {
    const s = sugerirClassificacao({ descricao: 'COMPRA 8812', estabelecimento_nome: 'RAIA DROGASIL S/A' }, [], [])!
    expect(s.estabelecimento?.id).toBe('drogasil')
  })
})

describe('sugerirClassificacao — categoria da Pluggy', () => {
  it('é o último recurso, com confiança baixa', () => {
    const s = sugerirClassificacao(
      { descricao: 'PADARIA DO ZE', categoria_pluggy: 'Groceries', categoria_pluggy_id: '10000000' },
      [],
      ESPACO,
    )!
    expect(s.origem).toBe('pluggy')
    expect(s.destino).toBeNull()
    expect(s.confianca).toBe('baixa')
    expect(s.categoriaNome).toBe('Supermercado')
    expect(s.motivo).toBe('Categoria do banco: Supermercado')
    expect(s.estabelecimento).toBeNull()
  })

  it('funciona só com o nome em inglês', () => {
    expect(sugerirClassificacao({ descricao: 'PG *TON 02/10', categoria_pluggy: 'Eating out' }, [], [])!.categoriaNome).toBe('Restaurantes')
  })

  it('sem nada reconhecível, não sugere', () => {
    expect(sugerirClassificacao({ descricao: 'PG *TON 02/10' }, [], ESPACO)).toBeNull()
    expect(sugerirClassificacao({ descricao: 'PG *TON 02/10', categoria_pluggy: 'Credit card payment' }, [], [])).toBeNull()
  })
})

describe('rotuloParaRegra', () => {
  it('a marca, quando conhecida', () => {
    expect(rotuloParaRegra({ descricao: 'IFD*IFOOD.COM AGENCIA DE' })).toBe('iFood')
  })

  it('o nome do estabelecimento da Pluggy, senão a chave capitalizada', () => {
    expect(rotuloParaRegra({ descricao: 'PG *PADARIA DO ZE 02/10', estabelecimento_nome: 'PADARIA DO ZÉ' })).toBe('Padaria do Zé')
    expect(rotuloParaRegra({ descricao: 'PG *PADARIA DO ZE 02/10' })).toBe('Padaria do Ze')
  })
})

describe('podeSerAutomatica', () => {
  it('só pessoal e só depois de três vezes iguais', () => {
    expect(podeSerAutomatica({ destino: 'pessoal', vezes: 3 })).toBe(true)
    expect(podeSerAutomatica({ destino: 'pessoal', vezes: 2 })).toBe(false)
    expect(podeSerAutomatica({ destino: 'casal', vezes: 10 })).toBe(false)
    expect(podeSerAutomatica({ destino: 'ignorar', vezes: 10 })).toBe(false)
  })
})
