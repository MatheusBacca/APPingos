import { describe, expect, it } from 'vitest'
import { fundoDaCapa, matizDoTitulo } from '../app/lib/capa'

describe('matizDoTitulo', () => {
  /*
   * A propriedade que sustenta a ideia: o mesmo livro tem sempre a mesma cor.
   * Cor instável destruiria a memória visual que faz a estante funcionar — "o
   * azul é o Caibalion" só vale se ele for azul amanhã também.
   */
  it('é estável para o mesmo título', () => {
    expect(matizDoTitulo('O Caibalion')).toBe(matizDoTitulo('O Caibalion'))
  })

  it('tende a separar títulos diferentes', () => {
    const titulos = ['O Caibalion', 'Torto Arado', 'A Hora da Estrela', 'Quarto de Despejo', 'Dom Casmurro']
    const matizes = new Set(titulos.map(matizDoTitulo))
    expect(matizes.size).toBe(titulos.length)
  })

  /*
   * Caso real: buscar "caibalion" devolve três livros DIFERENTES com o título
   * "O Caibalion", de autores diferentes. Por isso `PosterCard` semeia a cor
   * com título + legenda — só o título pintaria os três de igual, que é o
   * oposto do que a capa composta serve para fazer.
   */
  it('separa livros de mesmo título quando o autor entra na semente', () => {
    const a = matizDoTitulo('O CaibalionRafael Arrais')
    const b = matizDoTitulo('O CaibalionSylvio Jacome')
    const c = matizDoTitulo('O CaibalionJonathan C. Young')

    expect(new Set([a, b, c]).size).toBe(3)
  })

  /*
   * O hash estoura para negativo depois de algumas letras, e matiz negativo é
   * cor inválida em CSS — o cartão sairia transparente, sem erro nenhum no
   * console. Títulos longos são o caso que expõe isso.
   */
  it('fica na faixa 0–359 mesmo com título longo', () => {
    const longo = 'O Caibalion: Um estudo da filosofia hermética do Antigo Egito e da Grécia - Edição especial'
    for (const titulo of [longo, '', 'a', longo.repeat(4)]) {
      const matiz = matizDoTitulo(titulo)
      expect(matiz).toBeGreaterThanOrEqual(0)
      expect(matiz).toBeLessThan(360)
      expect(Number.isInteger(matiz)).toBe(true)
    }
  })
})

describe('fundoDaCapa', () => {
  it('monta um gradiente com as duas pontas na faixa válida', () => {
    const fundo = fundoDaCapa('Torto Arado')
    expect(fundo).toMatch(/^linear-gradient\(155deg, oklch\([\d.]+ [\d.]+ \d+\), oklch\([\d.]+ [\d.]+ \d+\)\)$/)

    const matizes = [...fundo.matchAll(/oklch\([\d.]+ [\d.]+ (\d+)\)/g)].map(m => Number(m[1]))
    expect(matizes).toHaveLength(2)
    for (const matiz of matizes) expect(matiz).toBeLessThan(360)
  })

  it('dá o mesmo fundo para o mesmo título', () => {
    expect(fundoDaCapa('Dom Casmurro')).toBe(fundoDaCapa('Dom Casmurro'))
  })
})
