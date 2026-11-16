/**
 * O Pix copia e cola do acerto (fase 6 do plano de Open Finance).
 *
 * Um BR Code com um caractere errado não dá erro na tela do APPingos — dá erro
 * no app do banco de quem paga, na hora de pagar. Por isso o teste confere
 * contra o exemplo do próprio manual do Bacen, e não só contra si mesmo.
 */
import { describe, expect, it } from 'vitest'
import { brCodePix, crc16Pix, normalizarChavePix, problemaNaChavePix, txidDoAcerto } from '~/lib/pix'

/** Lê os campos TLV do primeiro nível. */
function campos(codigo: string): Record<string, string> {
  const saida: Record<string, string> = {}
  let i = 0
  while (i < codigo.length) {
    const id = codigo.slice(i, i + 2)
    const tamanho = Number(codigo.slice(i + 2, i + 4))
    saida[id] = codigo.slice(i + 4, i + 4 + tamanho)
    i += 4 + tamanho
  }
  return saida
}

describe('CRC16-CCITT', () => {
  it('bate com o valor de referência do algoritmo (CCITT-FALSE)', () => {
    expect(crc16Pix('123456789')).toBe('29B1')
  })

  it('sempre com 4 dígitos maiúsculos', () => {
    expect(crc16Pix('')).toBe('FFFF')
    expect(crc16Pix('a')).toMatch(/^[0-9A-F]{4}$/)
  })
})

describe('BR Code estático', () => {
  it('reproduz o exemplo do manual de iniciação do Pix do Bacen', () => {
    expect(brCodePix({
      chave: '123e4567-e12b-12d1-a456-426655440000',
      nome: 'Fulano de Tal',
      cidade: 'BRASILIA',
    })).toBe(
      '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR'
      + '5913Fulano de Tal6008BRASILIA62070503***63041D3D',
    )
  })

  it('leva o valor com duas casas e a mensagem dentro da conta do recebedor', () => {
    const codigo = brCodePix({
      chave: 'ana@exemplo.com',
      nome: 'Ana Exemplo',
      valor: 412.3,
      txid: 'ACERTO202611',
      mensagem: 'Acerto de novembro',
    })
    const c = campos(codigo)
    expect(c['54']).toBe('412.30')
    expect(c['53']).toBe('986')
    expect(c['58']).toBe('BR')
    expect(campos(c['26']!)).toEqual({ '00': 'br.gov.bcb.pix', '01': 'ana@exemplo.com', '02': 'Acerto de novembro' })
    expect(campos(c['62']!)).toEqual({ '05': 'ACERTO202611' })
  })

  it('o CRC do fim confere com o resto do código', () => {
    const codigo = brCodePix({ chave: '+5541999998888', nome: 'José Ávila', valor: 10 })
    expect(codigo.slice(-8, -4)).toBe('6304')
    expect(codigo.slice(-4)).toBe(crc16Pix(codigo.slice(0, -4)))
  })

  it('tira acento e corta nome e cidade nos limites do padrão', () => {
    const c = campos(brCodePix({ chave: 'x', nome: 'Conceição Aparecida dos Santos Albuquerque', cidade: 'São José dos Campos' }))
    expect(c['59']).toBe('Conceicao Aparecida dos S')
    expect(c['59']!.length).toBeLessThanOrEqual(25)
    expect(c['60']).toBe('Sao Jose dos Ca')
  })

  it('sem valor, o campo 54 não existe — quem paga digita', () => {
    expect(campos(brCodePix({ chave: 'x', nome: 'A' }))).not.toHaveProperty('54')
    expect(campos(brCodePix({ chave: 'x', nome: 'A', valor: 0 }))).not.toHaveProperty('54')
  })

  it('txid fica só com letras e números, e vira *** quando vazio', () => {
    expect(campos(campos(brCodePix({ chave: 'x', nome: 'A', txid: 'acerto-2026/11!' }))['62']!)['05']).toBe('acerto202611')
    expect(campos(campos(brCodePix({ chave: 'x', nome: 'A', txid: '' }))['62']!)['05']).toBe('***')
  })

  it('valor em centavos quebrados arredonda no centavo', () => {
    expect(campos(brCodePix({ chave: 'x', nome: 'A', valor: 0.1 + 0.2 }))['54']).toBe('0.30')
  })

  it('mensagem longa é cortada para o campo 26 caber em 99', () => {
    const codigo = brCodePix({ chave: 'a'.repeat(60), nome: 'A', mensagem: 'm'.repeat(200) })
    expect(campos(codigo)['26']!.length).toBeLessThanOrEqual(99)
  })

  it('com a chave mais longa (e-mail de 77), a mensagem sai em vez de estourar', () => {
    const chave = `${'a'.repeat(65)}@exemplo.com`
    const conta = campos(campos(brCodePix({ chave, nome: 'A', mensagem: 'Acerto' }))['26']!)
    expect(conta['01']).toBe(chave)
    expect(conta).not.toHaveProperty('02')
  })

  it('recusa chave vazia', () => {
    expect(() => brCodePix({ chave: '  ', nome: 'A' })).toThrow()
  })

  it('o txid do acerto é o mês', () => {
    expect(txidDoAcerto('2026-11-01')).toBe('ACERTO202611')
  })
})

describe('chave Pix', () => {
  it('normaliza no formato do DICT', () => {
    expect(normalizarChavePix('cpf', '123.456.789-09')).toBe('12345678909')
    expect(normalizarChavePix('email', ' Ana@Exemplo.COM ')).toBe('ana@exemplo.com')
    expect(normalizarChavePix('telefone', '(41) 99999-8888')).toBe('+5541999998888')
    expect(normalizarChavePix('telefone', '+55 41 99999-8888')).toBe('+5541999998888')
    expect(normalizarChavePix('aleatoria', '123E4567-E12B-12D1-A456-426655440000')).toBe('123e4567-e12b-12d1-a456-426655440000')
  })

  it('confere os dígitos do CPF e do CNPJ', () => {
    expect(problemaNaChavePix('cpf', '12345678909')).toBeNull()
    expect(problemaNaChavePix('cpf', '12345678900')).not.toBeNull()
    expect(problemaNaChavePix('cpf', '11111111111')).not.toBeNull()
    expect(problemaNaChavePix('cnpj', '11222333000181')).toBeNull()
    expect(problemaNaChavePix('cnpj', '11222333000180')).not.toBeNull()
  })

  it('e-mail, celular e aleatória', () => {
    expect(problemaNaChavePix('email', 'ana@exemplo.com')).toBeNull()
    expect(problemaNaChavePix('email', 'ana@')).not.toBeNull()
    expect(problemaNaChavePix('telefone', '+5541999998888')).toBeNull()
    expect(problemaNaChavePix('telefone', '+55419999')).not.toBeNull()
    expect(problemaNaChavePix('aleatoria', '123e4567-e12b-12d1-a456-426655440000')).toBeNull()
    expect(problemaNaChavePix('aleatoria', 'abc')).not.toBeNull()
  })
})
