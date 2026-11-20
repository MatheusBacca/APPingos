import { describe, expect, it } from 'vitest'
import { documentosDe, transferenciaEntrePessoas } from '~/lib/contrapartes'
import { contraparteEhParceiro } from '~/lib/conciliacao-pix'
import { cpfValido, formatarCpf } from '~/lib/pix'

const bixo = { user_id: 'bixo', exibicao: 'Bixo Pingo' }
const pinga = { user_id: 'pinga', exibicao: 'Pinga Fogo' }
const membros = [bixo, pinga]
// O que a RPC `contrapartes_reconhecidas` devolve: documento do MEU extrato → membro.
const contrapartes = new Map([['52998224725', 'pinga']])

describe('transferenciaEntrePessoas', () => {
  it('entrada vinda dela: ela transferiu para mim', () => {
    const t = { sentido: 'entrada' as const, contraparte_documento: '529.982.247-25', metodo: 'PIX' }
    expect(transferenciaEntrePessoas(t, contrapartes, bixo, membros)?.frase).toBe('Pinga Fogo transferiu para Bixo Pingo')
  })

  it('saída para ela: eu transferi para ela', () => {
    const t = { sentido: 'saida' as const, contraparte_documento: '52998224725', metodo: 'PIX' }
    const r = transferenciaEntrePessoas(t, contrapartes, bixo, membros)
    expect(r?.de.user_id).toBe('bixo')
    expect(r?.para.user_id).toBe('pinga')
  })

  it('boleto é "pagou"', () => {
    const t = { sentido: 'entrada' as const, contraparte_documento: '52998224725', metodo: 'BOLETO' }
    expect(transferenciaEntrePessoas(t, contrapartes, bixo, membros)?.frase).toBe('Pinga Fogo pagou Bixo Pingo')
  })

  it('contraparte que não é ninguém dos meus espaços: nada', () => {
    const t = { sentido: 'entrada' as const, contraparte_documento: '11144477735', metodo: 'PIX' }
    expect(transferenciaEntrePessoas(t, contrapartes, bixo, membros)).toBeNull()
    expect(transferenciaEntrePessoas({ ...t, contraparte_documento: null }, contrapartes, bixo, membros)).toBeNull()
  })

  it('sem saber quem sou eu, ou sem reconhecimento, nada', () => {
    const t = { sentido: 'entrada' as const, contraparte_documento: '52998224725' }
    expect(transferenciaEntrePessoas(t, contrapartes, null, membros)).toBeNull()
    expect(transferenciaEntrePessoas(t, new Map(), bixo, membros)).toBeNull()
  })
})

describe('a conciliação do acerto usa o CPF reconhecido', () => {
  const parceiro = { user_id: 'pinga', nome: 'Pinga', chave_pix: 'pinga@exemplo.com', chave_pix_tipo: 'email', documentos: documentosDe(contrapartes, 'pinga') }

  it('casa pelo documento mesmo com o nome do banco diferente do cadastro', () => {
    expect(contraparteEhParceiro({ contraparte_nome: 'Daiane Babicz', contraparte_documento: '529.982.247-25' }, parceiro)).toBe(true)
  })

  it('sem o documento, continua valendo o nome', () => {
    expect(contraparteEhParceiro({ contraparte_nome: 'Fulano', contraparte_documento: '11144477735' }, parceiro)).toBe(false)
  })
})

it('CPF: dígitos verificadores e máscara', () => {
  expect(cpfValido('52998224725')).toBe(true)
  expect(cpfValido('11122233344')).toBe(false)
  expect(cpfValido('11111111111')).toBe(false)
  expect(formatarCpf('52998224725')).toBe('529.982.247-25')
})
