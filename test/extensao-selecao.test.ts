/**
 * A escolha de quais preços reler.
 *
 * A regra que este arquivo protege é a do "só os favoritos": ela decide o que a
 * extensão vai abrir numa aba, e errar para o lado do excesso significa quinze abas
 * e um minuto de espera para quem só queria saber do sofá. Errar para o outro lado é
 * pior — a pessoa pede para atualizar e o preço fica velho em silêncio.
 */
import { describe, expect, it } from 'vitest'
import {
  blocosPorInteresse,
  idsParaMarcar,
  rotuloDeRodar,
} from '../extensao/lib/selecao.js'

interface Rechecavel {
  id: string
  nome?: string
  interesse_id: string
  interesse_titulo?: string
  favorito?: boolean
}

function produto(id: string, interesse: string, favorito = false): Rechecavel {
  return {
    id,
    nome: `Produto ${id}`,
    interesse_id: interesse,
    interesse_titulo: `Interesse ${interesse}`,
    favorito,
  }
}

describe('idsParaMarcar', () => {
  it('sem "só favoritos", marca todos', () => {
    const produtos = [produto('a', 'i1', true), produto('b', 'i1'), produto('c', 'i2')]
    expect([...idsParaMarcar(produtos, false)]).toEqual(['a', 'b', 'c'])
  })

  it('com "só favoritos", marca um por interesse', () => {
    const produtos = [
      produto('monitor', 'i1', true),
      produto('braco', 'i1', true),
      produto('monitor-24', 'i1'),
      produto('sofa', 'i2', true),
      produto('sofa-outro', 'i2'),
    ]
    // Os dois do agrupamento favorito de i1 entram: eles são o conjunto favorito.
    expect([...idsParaMarcar(produtos, true)]).toEqual(['monitor', 'braco', 'sofa'])
  })

  /*
   * Interesse sem favorito nenhum fica de fora inteiro. É o certo: a pessoa pediu os
   * favoritos, e ali não há um. Marcar tudo "para não deixar de fora" abriria as abas
   * que ela acabou de dizer que não queria.
   */
  it('interesse sem favorito não entra', () => {
    const produtos = [produto('a', 'i1'), produto('b', 'i1'), produto('c', 'i2', true)]
    expect([...idsParaMarcar(produtos, true)]).toEqual(['c'])
  })

  /* `favorito` ausente (embed que faltou) não pode contar como favorito. */
  it('trata favorito indefinido como não-favorito', () => {
    const produtos = [{ id: 'a', interesse_id: 'i1' }]
    expect(idsParaMarcar(produtos, true).size).toBe(0)
    expect(idsParaMarcar(produtos, false).size).toBe(1)
  })

  it('lista vazia não marca nada', () => {
    expect(idsParaMarcar([], false).size).toBe(0)
  })
})

describe('blocosPorInteresse', () => {
  it('um bloco por interesse, na ordem de aparição', () => {
    const produtos = [produto('c', 'i2'), produto('a', 'i1'), produto('b', 'i1')]
    const blocos = blocosPorInteresse(produtos)

    expect(blocos.map(b => b.interesse_id)).toEqual(['i2', 'i1'])
    expect(blocos[1]!.produtos.map(p => p.id)).toEqual(['a', 'b'])
  })

  /*
   * A lista vem ordenada por `verificado_em`, não por interesse — então produtos do
   * mesmo interesse chegam separados. Dois cabeçalhos "Monitor novo" na tela
   * pareceriam dois interesses homônimos.
   */
  it('produtos do mesmo interesse separados caem no mesmo bloco', () => {
    const produtos = [produto('a', 'i1'), produto('c', 'i2'), produto('b', 'i1')]
    const blocos = blocosPorInteresse(produtos)

    expect(blocos).toHaveLength(2)
    expect(blocos[0]!.produtos.map(p => p.id)).toEqual(['a', 'b'])
  })

  it('cai num título neutro quando o embed não trouxe o interesse', () => {
    const blocos = blocosPorInteresse([{ id: 'a', interesse_id: 'i1' }])
    expect(blocos[0]!.titulo).toBe('Sem título')
  })

  it('lista vazia não gera bloco', () => {
    expect(blocosPorInteresse([])).toEqual([])
  })
})

describe('rotuloDeRodar', () => {
  it('diz "todos" quando é tudo', () => {
    expect(rotuloDeRodar(5, 5)).toBe('Reler todos os preços')
  })

  /* O número existe para a seleção não parecer ignorada. */
  it('mostra a contagem num recorte', () => {
    expect(rotuloDeRodar(3, 15)).toBe('Reler 3 preços')
    expect(rotuloDeRodar(1, 15)).toBe('Reler 1 preço')
  })

  it('diz que nada está marcado em vez de "reler 0"', () => {
    expect(rotuloDeRodar(0, 15)).toBe('Nada marcado')
  })
})
