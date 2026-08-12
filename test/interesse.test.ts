import { describe, expect, it } from 'vitest'
import {
  agruparPorDestino,
  economiaPossivel,
  lojaDaUrl,
  precoEfetivo,
  produtoDoInteresse,
  totalDosInteresses,
  totalParcelado,
  valorDoInteresse,
} from '~/types/interesse'
import type { InteresseComProdutos, InteresseProduto } from '~/types/interesse'

function produto(campos: Partial<InteresseProduto> = {}): InteresseProduto {
  return {
    id: campos.id ?? 'p1',
    interesse_id: 'i1',
    nome: 'Sofá',
    url: 'https://loja.com.br/sofa',
    loja: 'loja.com.br',
    imagem_url: null,
    preco: null,
    preco_pix: null,
    parcelas: null,
    valor_parcela: null,
    escolhido: false,
    origem: 'extensao',
    capturado_em: '2026-08-12T12:00:00Z',
    created_at: '2026-08-12T12:00:00Z',
    ...campos,
  }
}

function interesse(campos: Partial<InteresseComProdutos> = {}): InteresseComProdutos {
  return {
    id: 'i1',
    space_id: 's1',
    criado_por: 'u1',
    titulo: 'Trocar o sofá',
    destino: 'compra',
    estado: 'rascunho',
    para_quem: null,
    observacao: null,
    convertido_em: null,
    convertido_tipo: null,
    convertido_ref_id: null,
    created_at: '2026-08-12T12:00:00Z',
    updated_at: '2026-08-12T12:00:00Z',
    produtos: [],
    ...campos,
  }
}

describe('precoEfetivo', () => {
  /*
   * Pix ganha do preço cheio porque é o que se paga à vista — a loja anuncia o
   * cheio para o parcelamento parecer menor.
   */
  it('prefere o Pix ao preço cheio', () => {
    expect(precoEfetivo(produto({ preco: 2399, preco_pix: 2279.05 }))).toBe(2279.05)
  })

  it('cai no preço cheio sem Pix', () => {
    expect(precoEfetivo(produto({ preco: 2399 }))).toBe(2399)
  })

  /*
   * `null`, e não zero: zero diria "de graça" a quem só tem o link, e a tela
   * precisa distinguir "não sei o preço" de "é barato".
   */
  it('devolve null quando não há preço nenhum', () => {
    expect(precoEfetivo(produto())).toBeNull()
  })
})

describe('totalParcelado', () => {
  it('multiplica parcelas pelo valor da parcela', () => {
    expect(totalParcelado(produto({ parcelas: 12, valor_parcela: 219.9 }))).toBeCloseTo(2638.8, 2)
  })

  it('devolve null sem os dois campos', () => {
    expect(totalParcelado(produto({ parcelas: 12 }))).toBeNull()
    expect(totalParcelado(produto({ valor_parcela: 219.9 }))).toBeNull()
  })
})

describe('produtoDoInteresse', () => {
  /*
   * O escolhido manda sempre — é decisão humana. O mais barato não é
   * necessariamente o que se quer: o sofá certo pode ser o caro.
   */
  it('respeita o escolhido mesmo sendo o mais caro', () => {
    const produtos = [
      produto({ id: 'barato', preco: 1899 }),
      produto({ id: 'caro', preco: 2999, escolhido: true }),
    ]
    expect(produtoDoInteresse(produtos)?.id).toBe('caro')
  })

  it('sem escolhido, pega o mais barato com preço', () => {
    const produtos = [
      produto({ id: 'caro', preco: 2999 }),
      produto({ id: 'barato', preco: 1899 }),
      produto({ id: 'sem-preco' }),
    ]
    expect(produtoDoInteresse(produtos)?.id).toBe('barato')
  })

  it('compara pelo preço efetivo, não pelo cheio', () => {
    const produtos = [
      produto({ id: 'a', preco: 2000 }),
      produto({ id: 'b', preco: 2100, preco_pix: 1900 }),
    ]
    expect(produtoDoInteresse(produtos)?.id).toBe('b')
  })

  it('sem preço nenhum, pega o primeiro (tem nome e link)', () => {
    const produtos = [produto({ id: 'primeiro' }), produto({ id: 'segundo' })]
    expect(produtoDoInteresse(produtos)?.id).toBe('primeiro')
  })

  it('devolve null sem produtos', () => {
    expect(produtoDoInteresse([])).toBeNull()
  })
})

describe('valorDoInteresse', () => {
  it('é o preço efetivo do produto que representa', () => {
    expect(valorDoInteresse([produto({ preco: 2399, preco_pix: 2279.05 })])).toBe(2279.05)
  })

  it('null sem produtos e sem preços', () => {
    expect(valorDoInteresse([])).toBeNull()
    expect(valorDoInteresse([produto()])).toBeNull()
  })
})

describe('economiaPossivel', () => {
  it('diz quanto o escolhido custa a mais que o mais barato', () => {
    const produtos = [
      produto({ id: 'barato', preco: 1899 }),
      produto({ id: 'caro', preco: 2399, escolhido: true }),
    ]
    expect(economiaPossivel(produtos)).toBe(500)
  })

  /*
   * Sem nada a dizer, a tela some com a linha em vez de mostrar "R$ 0,00 a mais".
   */
  it('null quando o escolhido já é o mais barato', () => {
    const produtos = [
      produto({ id: 'barato', preco: 1899, escolhido: true }),
      produto({ id: 'caro', preco: 2399 }),
    ]
    expect(economiaPossivel(produtos)).toBeNull()
  })

  it('null com menos de dois preços para comparar', () => {
    expect(economiaPossivel([produto({ preco: 1899 })])).toBeNull()
    expect(economiaPossivel([produto({ preco: 1899 }), produto()])).toBeNull()
  })
})

describe('totalDosInteresses', () => {
  /*
   * Um produto por interesse, não todos: somar os três sofás candidatos diria
   * que a gente quer três sofás — e o número inflaria justamente nos interesses
   * mais pesquisados.
   */
  it('conta um produto por interesse', () => {
    const lista = [
      interesse({
        id: 'sofa',
        produtos: [
          produto({ id: 'a', preco: 2399, escolhido: true }),
          produto({ id: 'b', preco: 1899 }),
          produto({ id: 'c', preco: 3200 }),
        ],
      }),
      interesse({ id: 'fone', produtos: [produto({ id: 'd', preco: 800 })] }),
    ]
    expect(totalDosInteresses(lista)).toBe(3199)
  })

  it('interesse sem preço soma zero em vez de virar NaN', () => {
    const lista = [
      interesse({ id: 'com', produtos: [produto({ preco: 500 })] }),
      interesse({ id: 'sem', produtos: [] }),
    ]
    expect(totalDosInteresses(lista)).toBe(500)
  })

  it('lista vazia soma zero', () => {
    expect(totalDosInteresses([])).toBe(0)
  })
})

describe('agruparPorDestino', () => {
  it('devolve só os grupos com conteúdo, na ordem de DESTINOS', () => {
    const lista = [
      interesse({ id: '1', destino: 'viagem' }),
      interesse({ id: '2', destino: 'compra' }),
      interesse({ id: '3', destino: 'compra' }),
    ]

    const grupos = agruparPorDestino(lista)

    // 'compra' vem antes de 'viagem' em DESTINOS, independente da ordem da lista.
    expect(grupos.map(g => g.destino)).toEqual(['compra', 'viagem'])
    expect(grupos[0]!.itens).toHaveLength(2)
    expect(grupos[1]!.itens).toHaveLength(1)
  })

  it('lista vazia não gera cabeçalho nenhum', () => {
    expect(agruparPorDestino([])).toEqual([])
  })
})

describe('lojaDaUrl', () => {
  it('tira o www', () => {
    expect(lojaDaUrl('https://www.kabum.com.br/produto/123')).toBe('kabum.com.br')
    expect(lojaDaUrl('https://mercadolivre.com.br/p/MLB123')).toBe('mercadolivre.com.br')
  })

  /*
   * Tolerante de propósito: o campo é digitável na tela de detalhe, e uma url
   * meio digitada não pode derrubar a lista inteira.
   */
  it('devolve null para url inválida em vez de lançar', () => {
    expect(lojaDaUrl('não é url')).toBeNull()
    expect(lojaDaUrl('')).toBeNull()
  })
})
