/**
 * Os marcadores do calendário de Filmes.
 *
 * A regra inteira é uma frase — uma bolinha por item e por tom, não por pessoa —
 * e mesmo assim ela tem quatro jeitos de dar errado, que são os quatro casos
 * abaixo: o casal que viu junto, o mesmo filme em dias diferentes, o mesmo filme
 * planejado E assistido, e o rótulo de leitor de tela que antes repetia o título
 * uma vez por membro.
 */
import { describe, expect, it } from 'vitest'
import { marcadoresDoCalendario } from '~/types/catalogo'
import type { Avaliacao, ItemDoEspaco } from '~/types/catalogo'

const EU = 'eu'
const ELA = 'ela'

const NOMES: Record<string, string> = { [EU]: 'Matheus', [ELA]: 'Ana' }
const nomeDe = (id: string) => NOMES[id] ?? 'Alguém'

function avaliacao(extra: Partial<Avaliacao> & { user_id: string }): Avaliacao {
  return {
    status: 'quero',
    nota: null,
    resenha: null,
    planejado_para: null,
    visto_em: null,
    pagina_atual: null,
    enviado_em: null,
    ...extra,
  }
}

function item(id: string, titulo: string, avaliacoes: Avaliacao[]): ItemDoEspaco {
  return {
    id,
    created_at: '2026-09-01T00:00:00Z',
    media: {
      id: `m-${id}`,
      tipo: 'filme',
      fonte: 'tmdb',
      fonte_id: id,
      titulo,
      titulo_original: null,
      ano: 2020,
      capa_url: null,
      sinopse: null,
      metadados: {},
    },
    avaliacoes,
  }
}

describe('marcadoresDoCalendario', () => {
  it('duas pessoas no mesmo filme e no mesmo dia dão UMA bolinha', () => {
    const filme = item('f1', 'Duna', [
      avaliacao({ user_id: EU, status: 'visto', visto_em: '2026-09-10' }),
      avaliacao({ user_id: ELA, status: 'visto', visto_em: '2026-09-10' }),
    ])

    const marcadores = marcadoresDoCalendario([filme], nomeDe)

    expect(marcadores).toHaveLength(1)
    expect(marcadores[0]!.tom).toBe('visto')
    expect(marcadores[0]!.quem).toBe('Matheus e Ana')
  })

  it('dois filmes marcados no mesmo dia continuam sendo duas bolinhas', () => {
    const marcadores = marcadoresDoCalendario([
      item('f1', 'Duna', [avaliacao({ user_id: EU, planejado_para: '2026-09-12' })]),
      item('f2', 'Arrival', [avaliacao({ user_id: ELA, planejado_para: '2026-09-12' })]),
    ], nomeDe)

    expect(marcadores).toHaveLength(2)
    expect(marcadores.every(m => m.tom === 'planejado')).toBe(true)
  })

  it('o mesmo filme visto em dias diferentes marca os dois dias', () => {
    const filme = item('f1', 'Duna', [
      avaliacao({ user_id: EU, status: 'visto', visto_em: '2026-09-10' }),
      avaliacao({ user_id: ELA, status: 'visto', visto_em: '2026-09-11' }),
    ])

    expect(marcadoresDoCalendario([filme], nomeDe).map(m => m.data).sort())
      .toEqual(['2026-09-10', '2026-09-11'])
  })

  /*
   * Planejado e assistido são tons diferentes no mesmo dia — a bolinha azul e a
   * verde contam coisas distintas, e reuni-las apagaria "combinamos e vimos".
   */
  it('planejado e visto no mesmo dia são duas bolinhas de tons diferentes', () => {
    const filme = item('f1', 'Duna', [
      avaliacao({ user_id: EU, status: 'visto', planejado_para: '2026-09-10', visto_em: '2026-09-10' }),
    ])

    expect(marcadoresDoCalendario([filme], nomeDe).map(m => m.tom).sort())
      .toEqual(['planejado', 'visto'])
  })

  it('a mesma pessoa não aparece duas vezes em "quem"', () => {
    const filme = item('f1', 'Duna', [
      avaliacao({ user_id: EU, planejado_para: '2026-09-12' }),
    ])

    expect(marcadoresDoCalendario([filme], nomeDe)[0]!.quem).toBe('Matheus')
  })

  it('quem não datou nada não vira marcador', () => {
    const filme = item('f1', 'Duna', [avaliacao({ user_id: EU, status: 'quero' })])

    expect(marcadoresDoCalendario([filme], nomeDe)).toEqual([])
  })
})
