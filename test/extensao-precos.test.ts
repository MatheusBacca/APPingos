import { describe, expect, it } from 'vitest'
import {
  acharParcelado,
  acharPrecoPix,
  acharPrimeiroPreco,
  dinheiroBr,
} from '../extensao/lib/precos.js'

describe('dinheiroBr', () => {
  it('lê o formato brasileiro com milhar e centavos', () => {
    expect(dinheiroBr('R$ 1.234,56')).toBe(1234.56)
    expect(dinheiroBr('R$ 2.399,00')).toBe(2399)
    expect(dinheiroBr('R$ 12.999,90')).toBe(12999.9)
  })

  it('lê milhão, onde há dois pontos de milhar', () => {
    expect(dinheiroBr('R$ 1.234.567,89')).toBe(1234567.89)
  })

  it('lê sem símbolo e sem milhar', () => {
    expect(dinheiroBr('219,90')).toBe(219.9)
    expect(dinheiroBr('99')).toBe(99)
  })

  /*
   * O caso que motiva a ordem das substituições dentro da função: trocar a
   * vírgula antes de remover o ponto faria `1.234,56` virar `1.234.56` e o
   * resultado ser NaN — ou seja, todo produto acima de mil reais gravaria sem
   * preço, e só acima de mil.
   */
  it('não confunde ponto de milhar com decimal', () => {
    expect(dinheiroBr('R$ 1.500')).toBe(1500)
    expect(dinheiroBr('R$ 1.500,00')).toBe(1500)
  })

  it('aceita número já pronto', () => {
    expect(dinheiroBr(2399)).toBe(2399)
    expect(dinheiroBr(2399.5)).toBe(2399.5)
  })

  it('devolve null para o que não é preço', () => {
    expect(dinheiroBr('')).toBeNull()
    expect(dinheiroBr(null)).toBeNull()
    expect(dinheiroBr(undefined)).toBeNull()
    expect(dinheiroBr('grátis')).toBeNull()
    expect(dinheiroBr('R$ 0,00')).toBeNull()
  })
})

describe('acharPrecoPix', () => {
  it('acha o valor depois da palavra', () => {
    expect(acharPrecoPix('Pix: R$ 2.279,05')).toBe(2279.05)
    expect(acharPrecoPix('à vista R$ 1.899,00')).toBe(1899)
  })

  it('acha o valor antes da palavra', () => {
    expect(acharPrecoPix('R$ 2.279,05 no Pix')).toBe(2279.05)
    expect(acharPrecoPix('R$ 899,90 à vista no Pix')).toBe(899.9)
  })

  it('aceita "a vista" sem acento', () => {
    expect(acharPrecoPix('R$ 349,00 a vista')).toBe(349)
  })

  /*
   * O ponto da janela por distância: numa página de loja o texto em volta está
   * cheio de outros preços. O mais próximo da palavra é o melhor sinal que dá
   * para ter sem conhecer o HTML de cada loja.
   */
  it('fica com o valor mais próximo da palavra', () => {
    const texto = 'Frete R$ 19,90 — Preço no Pix R$ 2.279,05 — Parcelado R$ 2.399,00'
    expect(acharPrecoPix(texto)).toBe(2279.05)
  })

  it('devolve null quando não há menção a Pix', () => {
    expect(acharPrecoPix('R$ 2.399,00 em 12x')).toBeNull()
    expect(acharPrecoPix('')).toBeNull()
  })
})

describe('acharParcelado', () => {
  it('lê as formas que as lojas usam', () => {
    expect(acharParcelado('12x de R$ 219,90')).toEqual({ parcelas: 12, valorParcela: 219.9 })
    expect(acharParcelado('10x R$ 99,90')).toEqual({ parcelas: 10, valorParcela: 99.9 })
    expect(acharParcelado('6 x de R$149,00')).toEqual({ parcelas: 6, valorParcela: 149 })
    expect(acharParcelado('3 vezes de R$ 50,00')).toEqual({ parcelas: 3, valorParcela: 50 })
  })

  it('fica com o de mais parcelas quando a loja lista várias', () => {
    const texto = '3x de R$ 799,66 · 6x de R$ 399,83 · 12x de R$ 219,90 sem juros'
    expect(acharParcelado(texto)).toEqual({ parcelas: 12, valorParcela: 219.9 })
  })

  /*
   * Guardar um parcelado com juros como se fosse o normal inflaria o total do
   * interesse — e o número que a loja anuncia em destaque é sempre o sem juros.
   */
  it('ignora parcelamento marcado como com juros', () => {
    expect(acharParcelado('18x de R$ 180,00 com juros')).toBeNull()
    expect(acharParcelado('12x de R$ 219,90 sem juros ou 18x de R$ 180,00 com juros'))
      .toEqual({ parcelas: 12, valorParcela: 219.9 })
  })

  it('recusa número de parcelas impossível', () => {
    // 200 parcelas não passa pelo CHECK da tabela (1..120); melhor não gravar.
    expect(acharParcelado('200x de R$ 10,00')).toBeNull()
  })

  it('devolve null sem parcelamento', () => {
    expect(acharParcelado('R$ 2.399,00 à vista')).toBeNull()
    expect(acharParcelado('')).toBeNull()
  })
})

describe('acharPrimeiroPreco', () => {
  it('devolve o primeiro acima do piso', () => {
    expect(acharPrimeiroPreco('R$ 2.399,00 em 12x')).toBe(2399)
  })

  it('pula centavos de ruído', () => {
    expect(acharPrimeiroPreco('a partir de R$ 0,99 — produto R$ 149,00')).toBe(149)
  })

  it('devolve null sem preço nenhum', () => {
    expect(acharPrimeiroPreco('sem preço aqui')).toBeNull()
  })
})
