/**
 * As linhas dos Pins no painel.
 *
 * Duas decisões carregam o arquivo, e as duas são sobre o que um app de CASAL
 * deve mostrar: a sua linha vem primeiro mesmo quando você está perdendo, e a
 * sequência só aparece quando existe — "0 dias seguidos" é cobrança, não
 * informação.
 */
import { describe, expect, it } from 'vitest'
import type { Membro } from '~/composables/useMembros'
import { linhasDePins } from '~/composables/useResumoPins'
import type { SaldoDePins } from '~/types/pin'

const HOJE = '2026-09-07'

const MEMBROS: Membro[] = [
  { user_id: 'eu', papel: 'dono', nome: 'Matheus', apelido: null, exibicao: 'Matheus', avatar_url: null },
  { user_id: 'ela', papel: 'membro', nome: 'Ana Paula', apelido: 'Ana', exibicao: 'Ana', avatar_url: null },
]

function saldo(user_id: string, pontos: number, conquistas = 3): SaldoDePins {
  return { user_id, pontos, conquistas, ultimo: '2026-09-07T15:00:00Z' }
}

/** Meio-dia local, para o Pin cair no dia pedido em qualquer fuso a oeste. */
function pinEm(dia: string) {
  const [ano, mes, d] = dia.split('-').map(Number)
  return { created_at: new Date(ano!, mes! - 1, d!, 12, 0, 0).toISOString() }
}

describe('linhasDePins', () => {
  it('sem saldo nenhum, não desenha caixa vazia', () => {
    expect(linhasDePins([], MEMBROS, 'eu', [], HOJE)).toEqual([])
  })

  it('põe a sua linha primeiro mesmo quando você está perdendo', () => {
    const linhas = linhasDePins(
      [saldo('ela', 500), saldo('eu', 40)],
      MEMBROS,
      'eu',
      [],
      HOJE,
    )

    expect(linhas[0]!.rotulo).toBe('Seus Pins')
    expect(linhas[0]!.valor).toBe('40')
    expect(linhas[1]!.rotulo).toBe('Ana')
    expect(linhas[1]!.valor).toBe('500')
  })

  it('chama a outra pessoa pelo apelido, como o resto do app', () => {
    const linhas = linhasDePins([saldo('ela', 10)], MEMBROS, 'eu', [], HOJE)

    expect(linhas[0]!.rotulo).toBe('Ana')
  })

  it('mostra a sequência quando ela existe', () => {
    const linhas = linhasDePins(
      [saldo('eu', 40)],
      MEMBROS,
      'eu',
      [pinEm('2026-09-07'), pinEm('2026-09-06')],
      HOJE,
    )

    const sequencia = linhas.find(l => l.chave === 'pins-sequencia')
    expect(sequencia?.valor).toBe('2')
    expect(sequencia?.nota).toBe('dias seguidos')
  })

  it('some com a sequência quando ela quebrou', () => {
    const linhas = linhasDePins(
      [saldo('eu', 40)],
      MEMBROS,
      'eu',
      [pinEm('2026-09-01')],
      HOJE,
    )

    expect(linhas.find(l => l.chave === 'pins-sequencia')).toBeUndefined()
  })

  it('concorda em número no singular', () => {
    const linhas = linhasDePins(
      [saldo('eu', 3, 1)],
      MEMBROS,
      'eu',
      [pinEm('2026-09-07')],
      HOJE,
    )

    expect(linhas[0]!.nota).toBe('1 conquista')
    expect(linhas.find(l => l.chave === 'pins-sequencia')!.nota).toBe('dia seguido')
  })

  it('respeita o teto de três linhas do painel', () => {
    const muitos = ['eu', 'ela', 'c', 'd', 'e'].map(id => saldo(id, 10))

    const linhas = linhasDePins(muitos, MEMBROS, 'eu', [pinEm('2026-09-07')], HOJE)

    expect(linhas).toHaveLength(3)
  })

  /*
    O valor visível é só o número — a cor e a posição dizem o resto. Quem usa
    leitor de tela precisa da unidade, e é para isso que `valorDescrito` existe.
  */
  it('descreve a unidade para quem não vê a linha', () => {
    const linhas = linhasDePins([saldo('eu', 1)], MEMBROS, 'eu', [], HOJE)

    expect(linhas[0]!.valorDescrito).toBe('1 Pin')
  })
})
