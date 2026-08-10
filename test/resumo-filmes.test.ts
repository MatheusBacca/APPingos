/**
 * O resumo de Filmes: convite primeiro, e um filme por linha.
 *
 * As duas armadilhas estão cobertas aqui, e as duas vêm do espaço de casal: o
 * mesmo filme marcado pelas duas pessoas (data por usuário no banco) e o filme
 * que é convite pendente e também tem data. Sem os dois cortes, um único filme
 * ocupa as três linhas do painel.
 */
import { describe, expect, it } from 'vitest'
import { linhasDeFilmes } from '~/composables/useResumoFilmes'
import type { ConviteFilme } from '~/composables/useConvitesFilme'
import type { Membro } from '~/composables/useMembros'
import type { ItemDoEspaco } from '~/types/catalogo'

const HOJE = '2026-08-05'
const EU = 'eu'
const ELA = 'ela'

const membros: Membro[] = [
  { user_id: EU, papel: 'dono', nome: 'Matheus Bacca', apelido: null, exibicao: 'Matheus Bacca', avatar_url: null },
  { user_id: ELA, papel: 'membro', nome: 'Ana Paula', apelido: null, exibicao: 'Ana Paula', avatar_url: null },
]

function item(id: string, titulo: string, datas: Array<[string, string | null]>): ItemDoEspaco {
  return {
    id,
    created_at: '2026-07-01T00:00:00Z',
    media: {
      id: `m-${id}`,
      tipo: 'filme',
      titulo,
      titulo_original: null,
      ano: 2026,
      capa_url: null,
      sinopse: null,
      metadados: {},
    },
    avaliacoes: datas.map(([user_id, planejado_para]) => ({
      user_id,
      status: 'quero' as const,
      nota: null,
      resenha: null,
      planejado_para,
      visto_em: null,
      enviado_em: null,
    })),
  }
}

function convite(id: string, entryId: string, titulo: string, data: string): ConviteFilme {
  return {
    id,
    entry_id: entryId,
    de_user_id: ELA,
    data_proposta: data,
    entry: { media: { titulo, capa_url: null } },
  }
}

describe('linhasDeFilmes', () => {
  it('põe o convite pendente antes da listagem, com destaque e só o primeiro nome', () => {
    const linhas = linhasDeFilmes(
      [convite('cv1', 'e1', 'Interestelar', '2026-08-08')],
      [item('e2', 'Duna', [[EU, '2026-08-06']])],
      membros,
      HOJE,
    )

    expect(linhas[0]).toMatchObject({ rotulo: 'Interestelar', nota: 'Ana convidou', destaque: true })
    expect(linhas[1]).toMatchObject({ rotulo: 'Duna' })
  })

  it('não repete como "próximo" o filme que já é convite', () => {
    const linhas = linhasDeFilmes(
      [convite('cv1', 'e1', 'Interestelar', '2026-08-08')],
      [item('e1', 'Interestelar', [[ELA, '2026-08-08']])],
      membros,
      HOJE,
    )

    expect(linhas).toHaveLength(1)
  })

  it('junta as duas pessoas num filme só, pela data mais próxima', () => {
    const linhas = linhasDeFilmes(
      [],
      [item('e1', 'Duna', [[EU, '2026-08-20'], [ELA, '2026-08-09']])],
      membros,
      HOJE,
    )

    expect(linhas).toHaveLength(1)
    expect(linhas[0]?.valor).toContain('9 de ago')
  })

  it('ignora data passada e avaliação sem data', () => {
    const linhas = linhasDeFilmes(
      [],
      [
        item('e1', 'Já foi', [[EU, '2026-08-04']]),
        item('e2', 'Sem data', [[EU, null]]),
        item('e3', 'É hoje', [[EU, HOJE]]),
      ],
      membros,
      HOJE,
    )

    expect(linhas.map(l => l.rotulo)).toEqual(['É hoje'])
  })

  it('ordena por data e para em três linhas', () => {
    const linhas = linhasDeFilmes(
      [],
      [
        item('e1', 'Quarto', [[EU, '2026-09-01']]),
        item('e2', 'Primeiro', [[EU, '2026-08-06']]),
        item('e3', 'Terceiro', [[EU, '2026-08-20']]),
        item('e4', 'Segundo', [[EU, '2026-08-10']]),
      ],
      membros,
      HOJE,
    )

    expect(linhas.map(l => l.rotulo)).toEqual(['Primeiro', 'Segundo', 'Terceiro'])
  })

  it('não inventa nada quando não há convite nem data marcada', () => {
    expect(linhasDeFilmes([], [item('e1', 'Duna', [[EU, null]])], membros, HOJE)).toEqual([])
    expect(linhasDeFilmes([], [], membros, HOJE)).toEqual([])
  })
})
