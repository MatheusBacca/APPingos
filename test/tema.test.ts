import { describe, expect, it } from 'vitest'
import {
  ACENTOS,
  ACENTO_PADRAO,
  MODOS,
  acentoPorValor,
  acentoValido,
  corDaAmostra,
} from '../app/lib/tema'

describe('acentoValido', () => {
  it('aceita os acentos que existem', () => {
    for (const acento of ACENTOS) {
      expect(acentoValido(acento.valor)).toBe(acento.valor)
    }
  })

  /*
   * O caso que importa de verdade: o localStorage sobrevive a deploys, então um
   * acento removido volta como string velha na próxima visita. Sem esta guarda,
   * `data-acento` apontaria para um bloco de CSS inexistente, `--matiz` ficaria
   * sem valor e a interface inteira perderia a cor.
   */
  it('cai no padrão diante de valor desconhecido, nulo ou vazio', () => {
    expect(acentoValido('turquesa-de-2024')).toBe(ACENTO_PADRAO)
    expect(acentoValido(null)).toBe(ACENTO_PADRAO)
    expect(acentoValido(undefined)).toBe(ACENTO_PADRAO)
    expect(acentoValido('')).toBe(ACENTO_PADRAO)
  })
})

describe('acentoPorValor', () => {
  it('encontra o acento pelo valor', () => {
    expect(acentoPorValor('rosa').rotulo).toBe('Rosa')
  })

  it('devolve o primeiro quando não encontra', () => {
    expect(acentoPorValor('nao-existe')).toBe(ACENTOS[0])
  })
})

describe('o registro de acentos', () => {
  it('tem o padrão dentro da lista', () => {
    expect(ACENTOS.some(a => a.valor === ACENTO_PADRAO)).toBe(true)
  })

  it('não repete valor nem rótulo', () => {
    expect(new Set(ACENTOS.map(a => a.valor)).size).toBe(ACENTOS.length)
    expect(new Set(ACENTOS.map(a => a.rotulo)).size).toBe(ACENTOS.length)
  })

  /*
   * Matiz fora de 0–360 e croma alto não quebram o build: o navegador aceita o
   * `oklch()` e simplesmente pinta errado — um acento fluorescente, ou cinza.
   * Só a tela montada denunciaria, então a checagem mora aqui.
   */
  it('mantém matiz e croma dentro da faixa que o desenho pressupõe', () => {
    for (const acento of ACENTOS) {
      expect(acento.matiz).toBeGreaterThanOrEqual(0)
      expect(acento.matiz).toBeLessThan(360)
      expect(acento.croma).toBeGreaterThan(0)
      expect(acento.croma).toBeLessThanOrEqual(0.2)
    }
  })
})

describe('corDaAmostra', () => {
  it('monta um oklch com o matiz e o croma do acento', () => {
    expect(corDaAmostra({ valor: 'rosa', rotulo: 'Rosa', matiz: 350, croma: 0.13 }))
      .toBe('oklch(0.68 0.13 350)')
  })
})

describe('MODOS', () => {
  it('oferece claro, escuro e automático', () => {
    expect(MODOS.map(m => m.valor)).toEqual(['light', 'dark', 'auto'])
  })
})
