/**
 * O aviso que substitui a notificação que não existe.
 *
 * Sem push e sem e-mail, esta linha é o único jeito de alguém descobrir que o
 * outro liberou um roteiro que era segredo. Duas propriedades a sustentam: ela
 * aparece em destaque enquanto o roteiro não foi aberto, e ela some depois —
 * um aviso que não some vira ruído e para de ser lido.
 */
import { describe, expect, it } from 'vitest'
import { linhasDeViagens } from '~/composables/useResumoViagens'
import type { Roteiro } from '~/types/viagem'

const HOJE = '2026-08-09'

function roteiro(extra: Partial<Roteiro> = {}): Roteiro {
  return {
    id: 'r1',
    space_id: 'casal',
    nome: 'Litoral',
    descricao: null,
    modo_transporte: 'driving',
    data_inicio: null,
    data_fim: null,
    visibilidade: 'compartilhado',
    liberado_em: '2026-08-01T12:00:00Z',
    criado_por: 'ela',
    created_at: '2026-08-01T12:00:00Z',
    updated_at: '2026-08-01T12:00:00Z',
    ...extra,
  }
}

describe('linhasDeViagens', () => {
  it('destaca o roteiro liberado que ainda não foi aberto', () => {
    const linhas = linhasDeViagens([roteiro({ id: 'novo', nome: 'Surpresa' })], [], HOJE)

    expect(linhas).toHaveLength(1)
    expect(linhas[0]!.rotulo).toBe('Surpresa')
    expect(linhas[0]!.nota).toBe('Roteiro novo')
    expect(linhas[0]!.destaque).toBe(true)
  })

  it('some com o aviso depois que a pessoa abre', () => {
    const lista = [roteiro({ id: 'novo', nome: 'Surpresa' })]

    expect(linhasDeViagens(lista, ['novo'], HOJE)).toEqual([])
  })

  it('não anuncia roteiro secreto — ele não existe para o outro', () => {
    const lista = [roteiro({ id: 'seg', visibilidade: 'segredo', liberado_em: null })]

    expect(linhasDeViagens(lista, [], HOJE)).toEqual([])
  })

  it('mostra a próxima viagem quando não há novidade', () => {
    const lista = [
      roteiro({ id: 'perto', nome: 'Serra', data_inicio: '2026-09-05' }),
      roteiro({ id: 'longe', nome: 'Praia', data_inicio: '2026-12-20' }),
    ]

    const linhas = linhasDeViagens(lista, ['perto', 'longe'], HOJE)

    expect(linhas).toHaveLength(1)
    expect(linhas[0]!.rotulo).toBe('Serra')
    expect(linhas[0]!.nota).toBe('Próxima viagem')
  })

  it('não repete o mesmo roteiro como novidade e como próxima viagem', () => {
    const lista = [roteiro({ id: 'unico', nome: 'Serra', data_inicio: '2026-09-05' })]

    const linhas = linhasDeViagens(lista, [], HOJE)

    expect(linhas).toHaveLength(1)
    expect(linhas[0]!.nota).toBe('Roteiro novo')
  })

  it('ignora viagem que já passou', () => {
    const lista = [
      roteiro({ id: 'velha', data_inicio: '2026-01-10', data_fim: '2026-01-15' }),
    ]

    expect(linhasDeViagens(lista, ['velha'], HOJE)).toEqual([])
  })

  it('não passa do teto de linhas do painel', () => {
    const lista = Array.from({ length: 5 }, (_, i) => roteiro({ id: `r${i}`, nome: `Roteiro ${i}` }))

    expect(linhasDeViagens(lista, [], HOJE)).toHaveLength(3)
  })
})
