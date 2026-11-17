import { describe, expect, it } from 'vitest'
import {
  chamadaDeServico,
  chaveParaOBanco,
  chaveRecebida,
  chavesDeServico,
  tokenBearer,
} from '~~/supabase/functions/_shared/chaves-supabase'

const ambiente = (vars: Record<string, string>) => (nome: string) => vars[nome]
const LEGADA = 'eyJlegada.service.role'
const NOVA = 'sb_secret_nova123'

describe('chavesDeServico', () => {
  it('junta a legada e todas as novas', () => {
    const ler = ambiente({
      SUPABASE_SERVICE_ROLE_KEY: LEGADA,
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: NOVA, cron: 'sb_secret_cron' }),
    })
    expect(chavesDeServico(ler)).toEqual([LEGADA, NOVA, 'sb_secret_cron'])
  })

  it('JSON inválido nas novas não derruba: fica a legada', () => {
    expect(chavesDeServico(ambiente({ SUPABASE_SERVICE_ROLE_KEY: LEGADA, SUPABASE_SECRET_KEYS: '{x' })))
      .toEqual([LEGADA])
  })
})

describe('chaveRecebida', () => {
  it('prefere o header apikey', () => {
    expect(chaveRecebida(new Headers({ apikey: NOVA, Authorization: `Bearer ${LEGADA}` }))).toBe(NOVA)
  })

  it('aceita o Bearer quando não há apikey', () => {
    expect(chaveRecebida(new Headers({ Authorization: `Bearer ${LEGADA}` }))).toBe(LEGADA)
  })

  it('sem nada, nada', () => {
    expect(chaveRecebida(new Headers())).toBeNull()
  })
})

describe('chamadaDeServico', () => {
  const ler = ambiente({ SUPABASE_SERVICE_ROLE_KEY: LEGADA, SUPABASE_SECRET_KEYS: JSON.stringify({ default: NOVA }) })

  it('chave nova no apikey: autorizada (era recusada antes)', () => {
    expect(chamadaDeServico(new Headers({ apikey: NOVA }), ler)).toBe(true)
  })

  it('chave nova no Bearer: autorizada', () => {
    expect(chamadaDeServico(new Headers({ Authorization: `Bearer ${NOVA}` }), ler)).toBe(true)
  })

  it('legada no Bearer: continua autorizada', () => {
    expect(chamadaDeServico(new Headers({ Authorization: `Bearer ${LEGADA}` }), ler)).toBe(true)
  })

  it('a anon (ou qualquer outra) não passa', () => {
    expect(chamadaDeServico(new Headers({ Authorization: 'Bearer eyJanon' }), ler)).toBe(false)
  })

  it('projeto sem chave nenhuma configurada recusa tudo', () => {
    expect(chamadaDeServico(new Headers({ apikey: NOVA }), ambiente({}))).toBe(false)
  })
})

describe('chaveParaOBanco', () => {
  it('usa a nova default quando existe', () => {
    expect(chaveParaOBanco(ambiente({ SUPABASE_SERVICE_ROLE_KEY: LEGADA, SUPABASE_SECRET_KEYS: JSON.stringify({ default: NOVA }) })))
      .toBe(NOVA)
  })

  it('cai para a legada', () => {
    expect(chaveParaOBanco(ambiente({ SUPABASE_SERVICE_ROLE_KEY: LEGADA }))).toBe(LEGADA)
  })
})

describe('tokenBearer', () => {
  it('lê o Bearer mesmo com a chave pública em apikey', () => {
    const headers = new Headers({ apikey: 'sb_publishable_x', Authorization: 'Bearer eyJsessao' })
    expect(tokenBearer(headers)).toBe('eyJsessao')
  })

  it('sem Authorization, null', () => {
    expect(tokenBearer(new Headers({ apikey: 'sb_publishable_x' }))).toBeNull()
  })
})
