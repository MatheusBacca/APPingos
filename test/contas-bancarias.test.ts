/**
 * Contas conectadas (fase 3 do plano de Open Finance): o mapeamento do que vem
 * da Pluggy, a designação do cartão e os avisos da conexão.
 */
import { describe, expect, it } from 'vitest'
import {
  designacaoAoMarcar,
  designacaoParaEspaco,
  designacaoPrivada,
  diasEntre,
  estaCompartilhada,
  situacaoDaConexao,
} from '~/lib/contas-bancarias'
import { camposDaConexao, camposDaConta } from '~/lib/importacao-bancaria'
import { itemPodeSerDe } from '~~/server/utils/pluggy'
import { CARTAO, CONTA_CORRENTE } from './fixtures/pluggy'

const conexao = (extra: Partial<Parameters<typeof situacaoDaConexao>[0]> = {}) => ({
  status: 'UPDATED',
  consentimento_expira_em: null,
  erro_sincronizacao: null,
  ...extra,
})

describe('situação da conexão', () => {
  const HOJE = '2026-11-12'

  it('conectada e em dia', () => {
    expect(situacaoDaConexao(conexao(), HOJE)).toMatchObject({ tom: 'ok', reconectar: false })
  })

  it('consentimento vencendo em até 30 dias vira aviso, com a contagem', () => {
    const s = situacaoDaConexao(conexao({ consentimento_expira_em: '2026-11-24T12:00:00Z' }), HOJE)
    expect(s).toMatchObject({ tom: 'aviso', reconectar: true })
    expect(s.texto).toContain('em 12 dias')
  })

  it('vence hoje e amanhã têm nome', () => {
    expect(situacaoDaConexao(conexao({ consentimento_expira_em: '2026-11-12T20:00:00Z' }), HOJE).texto).toContain('hoje')
    expect(situacaoDaConexao(conexao({ consentimento_expira_em: '2026-11-13T20:00:00Z' }), HOJE).texto).toContain('amanhã')
  })

  it('consentimento vencido ganha de tudo, até de status UPDATED', () => {
    expect(situacaoDaConexao(conexao({ consentimento_expira_em: '2026-11-01T12:00:00Z' }), HOJE))
      .toMatchObject({ tom: 'erro', reconectar: true })
  })

  it('consentimento longe não avisa', () => {
    expect(situacaoDaConexao(conexao({ consentimento_expira_em: '2027-10-01T12:00:00Z' }), HOJE).tom).toBe('ok')
  })

  it('erro de login pede reconexão', () => {
    expect(situacaoDaConexao(conexao({ status: 'LOGIN_ERROR' }), HOJE)).toMatchObject({ tom: 'erro', reconectar: true })
  })

  it('sincronização que falhou avisa sem pedir reconexão', () => {
    expect(situacaoDaConexao(conexao({ erro_sincronizacao: 'timeout' }), HOJE))
      .toMatchObject({ tom: 'aviso', reconectar: false })
  })

  it('dias entre datas atravessa mês e ano', () => {
    expect(diasEntre('2026-12-31', '2027-01-01')).toBe(1)
    expect(diasEntre('2026-11-12', '2026-11-01')).toBe(-11)
  })
})

describe('compartilhar é opt-in, cartão a cartão', () => {
  const casais = [{ id: 'nos' }, { id: 'familia' }]
  const privada = { destino: 'perguntar' as const, space_id: null }

  it('marcar leva ao primeiro espaço de casal', () => {
    expect(designacaoAoMarcar(true, privada, casais)).toEqual({ destino: 'casal', space_id: 'nos' })
  })

  it('remarcar mantém o espaço que o cartão já apontava', () => {
    expect(designacaoAoMarcar(true, { destino: 'casal', space_id: 'familia' }, casais))
      .toEqual({ destino: 'casal', space_id: 'familia' })
  })

  it('desmarcar volta a ser privado, perguntando a cada compra', () => {
    expect(designacaoAoMarcar(false, { destino: 'casal', space_id: 'nos' }, casais)).toEqual(privada)
  })

  it('sem espaço de casal não há o que marcar — nunca vira casal sem espaço', () => {
    expect(designacaoAoMarcar(true, privada, [])).toEqual(privada)
  })

  it('cada cartão escolhe o próprio espaço, e o privado escolhe o próprio modo', () => {
    expect(designacaoParaEspaco('familia')).toEqual({ destino: 'casal', space_id: 'familia' })
    expect(designacaoPrivada('pessoal')).toEqual({ destino: 'pessoal', space_id: null })
  })

  it('compartilhada só com destino casal E espaço', () => {
    expect(estaCompartilhada({ destino: 'casal', space_id: 'nos' })).toBe(true)
    expect(estaCompartilhada({ destino: 'casal', space_id: null })).toBe(false)
    expect(estaCompartilhada({ destino: 'pessoal', space_id: null })).toBe(false)
  })
})

describe('mapeamento da Pluggy', () => {
  it('cartão guarda só o fim do número e o titular', () => {
    expect(camposDaConta({ ...CARTAO, number: '5162 **** **** 4321' })).toEqual({
      pluggy_account_id: 'acc-cartao',
      tipo: 'cartao',
      nome: 'Cartão Platinum',
      numero: '4321',
      titular_nome: 'Matheus Exemplo',
      titular_documento: '123.456.789-01',
    })
  })

  it('conta guarda o número inteiro e prefere o nome comercial', () => {
    const c = camposDaConta({ ...CONTA_CORRENTE, marketingName: 'Conta Ultravioleta' })
    expect(c).toMatchObject({ tipo: 'conta', nome: 'Conta Ultravioleta', numero: '0001/12345-0' })
  })

  it('o destino NUNCA vem da Pluggy — a sincronização não pode desfazer a escolha', () => {
    expect(camposDaConta(CARTAO)).not.toHaveProperty('destino')
    expect(camposDaConta(CARTAO)).not.toHaveProperty('space_id')
  })

  it('a conexão leva banco, logo, status e consentimento', () => {
    expect(camposDaConexao({
      id: 'item-1',
      connector: { id: 200, name: 'MeuPluggy', imageUrl: 'https://cdn/logo.svg' },
      status: 'UPDATED',
      consentExpiresAt: '2027-11-01T00:00:00.000Z',
    })).toEqual({
      item_id: 'item-1',
      banco: 'MeuPluggy',
      banco_logo_url: 'https://cdn/logo.svg',
      status: 'UPDATED',
      consentimento_expira_em: '2027-11-01T00:00:00.000Z',
    })
  })
})

describe('dono do item', () => {
  it('o item criado pelo widget só é de quem pediu o connect token', () => {
    expect(itemPodeSerDe({ clientUserId: 'eu' }, 'eu')).toBe(true)
    expect(itemPodeSerDe({ clientUserId: 'ela' }, 'eu')).toBe(false)
  })

  it('item sem dono declarado (copiado do dashboard) é aceito', () => {
    expect(itemPodeSerDe({ clientUserId: null }, 'eu')).toBe(true)
    expect(itemPodeSerDe({}, 'eu')).toBe(true)
  })
})

describe('conexão apagada na Pluggy', () => {
  it('diz o que fazer em vez de oferecer um reconectar que não funcionaria', () => {
    expect(situacaoDaConexao(conexao({ status: 'DELETED' }), '2026-11-12')).toMatchObject({ tom: 'erro', reconectar: false })
  })
})
