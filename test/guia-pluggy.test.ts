/**
 * O guia da integração com a Pluggy: que estado a tela mostra e quem vê o setup
 * do administrador.
 */
import { describe, expect, it } from 'vitest'
import { estadoDoGuia, mostraSetupDoAdministrador } from '~/lib/guia-pluggy'

const HOJE = '2026-11-13'
const emDia = { status: 'UPDATED', consentimento_expira_em: '2027-10-01T00:00:00Z', erro_sincronizacao: null }

describe('estado do guia', () => {
  it('sem as chaves no servidor, explica em vez de oferecer', () => {
    expect(estadoDoGuia(false, [], HOJE)).toBe('nao-configurada')
  })

  it('configurada e sem conexão: apresentação e o passo a passo', () => {
    expect(estadoDoGuia(true, [], HOJE)).toBe('sem-conexao')
    // enquanto o status do servidor carrega, não afirma que falta configurar
    expect(estadoDoGuia(undefined, [], HOJE)).toBe('sem-conexao')
  })

  it('conectada e em dia', () => {
    expect(estadoDoGuia(true, [emDia], HOJE)).toBe('conectado')
  })

  it('consentimento perto de vencer em qualquer conexão pede renovação', () => {
    const vencendo = { ...emDia, consentimento_expira_em: '2026-11-20T00:00:00Z' }
    expect(estadoDoGuia(true, [emDia, vencendo], HOJE)).toBe('renovar')
  })

  it('banco pedindo login também', () => {
    expect(estadoDoGuia(true, [{ ...emDia, status: 'LOGIN_ERROR' }], HOJE)).toBe('renovar')
  })

  it('quem já conectou continua vendo as conexões mesmo se as chaves sumirem', () => {
    expect(estadoDoGuia(false, [emDia], HOJE)).toBe('conectado')
  })
})

describe('setup do administrador', () => {
  it('o dono do espaço de casal vê', () => {
    expect(mostraSetupDoAdministrador([
      { tipo: 'pessoal', papel: 'dono' },
      { tipo: 'casal', papel: 'dono' },
    ])).toBe(true)
  })

  it('o membro convidado não vê — ser dono do próprio espaço pessoal não conta', () => {
    expect(mostraSetupDoAdministrador([
      { tipo: 'pessoal', papel: 'dono' },
      { tipo: 'casal', papel: 'membro' },
    ])).toBe(false)
  })

  it('quem usa o app sozinho é o próprio administrador', () => {
    expect(mostraSetupDoAdministrador([{ tipo: 'pessoal', papel: 'dono' }])).toBe(true)
  })
})
