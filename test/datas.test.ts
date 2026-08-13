/**
 * "verificado há 3 horas" — o texto que diz se um preço na tela ainda vale.
 *
 * `agora` é parâmetro, e não `Date.now()` lá dentro, justamente para estes testes
 * existirem: com o relógio real eles seriam do tipo que falha sozinho de vez em
 * quando, no minuto errado.
 */
import { describe, expect, it } from 'vitest'
import { tempoRelativo } from '~/lib/datas'

/** Um instante fixo, e tudo medido a partir dele. */
const AGORA = new Date('2026-08-13T12:00:00Z').getTime()

/** `n` unidades atrás de AGORA, em ISO. */
function atras(quantidade: number, unidade: 'seg' | 'min' | 'hora' | 'dia'): string {
  const ms = { seg: 1000, min: 60_000, hora: 3_600_000, dia: 86_400_000 }[unidade]
  return new Date(AGORA - quantidade * ms).toISOString()
}

describe('tempoRelativo', () => {
  it('menos de um minuto é "agora há pouco"', () => {
    expect(tempoRelativo(atras(0, 'seg'), AGORA)).toBe('agora há pouco')
    expect(tempoRelativo(atras(59, 'seg'), AGORA)).toBe('agora há pouco')
  })

  it('minutos, com singular', () => {
    expect(tempoRelativo(atras(1, 'min'), AGORA)).toBe('há 1 minuto')
    expect(tempoRelativo(atras(45, 'min'), AGORA)).toBe('há 45 minutos')
  })

  it('horas, com singular', () => {
    expect(tempoRelativo(atras(1, 'hora'), AGORA)).toBe('há 1 hora')
    expect(tempoRelativo(atras(5, 'hora'), AGORA)).toBe('há 5 horas')
    expect(tempoRelativo(atras(23, 'hora'), AGORA)).toBe('há 23 horas')
  })

  it('um dia é "ontem", e não "há 1 dia"', () => {
    expect(tempoRelativo(atras(24, 'hora'), AGORA)).toBe('ontem')
    expect(tempoRelativo(atras(47, 'hora'), AGORA)).toBe('ontem')
  })

  it('até uma semana conta em dias', () => {
    expect(tempoRelativo(atras(2, 'dia'), AGORA)).toBe('há 2 dias')
    expect(tempoRelativo(atras(7, 'dia'), AGORA)).toBe('há 7 dias')
  })

  /*
   * Acima de uma semana quem chama mostra a data absoluta: "há 43 dias" é pior que
   * "12 de agosto" para julgar se um preço ainda vale — a pessoa pensa em datas.
   */
  it('acima de uma semana devolve null', () => {
    expect(tempoRelativo(atras(8, 'dia'), AGORA)).toBeNull()
    expect(tempoRelativo(atras(300, 'dia'), AGORA)).toBeNull()
  })

  /*
   * Relógio da máquina atrasado faz um carimbo do servidor cair no futuro.
   * "há -2 horas" é pior que arredondar para "agora há pouco".
   */
  it('data no futuro não vira tempo negativo', () => {
    const daquiAPouco = new Date(AGORA + 3_600_000).toISOString()
    expect(tempoRelativo(daquiAPouco, AGORA)).toBe('agora há pouco')
  })
})
