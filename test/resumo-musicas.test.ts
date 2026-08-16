/**
 * O resumo de Músicas: o que o outro pôs na lista e você ainda não ouviu.
 *
 * A armadilha coberta aqui é a mesma do espaço de casal que já mordeu o resumo
 * de Filmes, com um detalhe a mais: quem adicionou NÃO está na leitura
 * (`entry.added_by` não vem no select), e a linha deduz isso de quem avaliou.
 * A dedução vale para duas pessoas e para de valer para três — é isso que os
 * testes travam.
 */
import { describe, expect, it } from 'vitest'
import { linhasDeMusicas } from '~/composables/useResumoMusicas'
import type { Membro } from '~/composables/useMembros'
import type { Avaliacao, ItemDoEspaco, StatusItem } from '~/types/catalogo'

const EU = 'eu'
const ELA = 'ela'
const OUTRO = 'outro'

const membros: Membro[] = [
  { user_id: EU, papel: 'dono', nome: 'Matheus Bacca', apelido: null, exibicao: 'Matheus Bacca', avatar_url: null },
  { user_id: ELA, papel: 'membro', nome: 'Ana Paula', apelido: null, exibicao: 'Ana Paula', avatar_url: null },
  { user_id: OUTRO, papel: 'membro', nome: 'Joana Dias', apelido: null, exibicao: 'Joana Dias', avatar_url: null },
]

function avaliacao(userId: string, status: StatusItem): Avaliacao {
  return {
    user_id: userId,
    status,
    nota: null,
    resenha: null,
    planejado_para: null,
    visto_em: null,
    enviado_em: null,
  }
}

function item(
  id: string,
  titulo: string,
  avaliacoes: Avaliacao[],
  artistas: string[] = ['Radiohead'],
): ItemDoEspaco {
  return {
    id,
    created_at: '2026-08-01T00:00:00Z',
    media: {
      id: `m-${id}`,
      tipo: 'musica',
      fonte: 'spotify',
      fonte_id: `sp-${id}`,
      titulo,
      titulo_original: null,
      ano: 2000,
      capa_url: null,
      sinopse: null,
      metadados: { artistas, formato: 'faixa' },
    },
    avaliacoes,
  }
}

describe('linhasDeMusicas', () => {
  it('põe o que espera você antes da sua fila, com destaque e só o primeiro nome', () => {
    const linhas = linhasDeMusicas(
      [
        item('e1', 'Na minha fila', [avaliacao(EU, 'quero')]),
        item('e2', 'Ela pôs', [avaliacao(ELA, 'quero')]),
      ],
      membros,
      EU,
    )

    expect(linhas[0]).toMatchObject({ rotulo: 'Ela pôs', nota: 'Ana adicionou', destaque: true })
    expect(linhas[1]).toMatchObject({ rotulo: 'Na minha fila', nota: 'Radiohead' })
    expect(linhas[1]?.destaque).toBeUndefined()
  })

  it('não nomeia ninguém quando há mais de um candidato a "quem adicionou"', () => {
    const linhas = linhasDeMusicas(
      [item('e1', 'De alguém', [avaliacao(ELA, 'quero'), avaliacao(OUTRO, 'visto')])],
      membros,
      EU,
    )

    expect(linhas[0]).toMatchObject({ rotulo: 'De alguém', nota: 'Esperando você', destaque: true })
  })

  it('só lista a SUA fila — o que o outro quer ouvir não é linha sua', () => {
    const linhas = linhasDeMusicas(
      [item('e1', 'Ela quer, eu já ouvi', [avaliacao(EU, 'visto'), avaliacao(ELA, 'quero')])],
      membros,
      EU,
    )

    expect(linhas).toEqual([])
  })

  it('ignora o que já saiu da fila: ouvindo, já ouvi e não curti', () => {
    const linhas = linhasDeMusicas(
      [
        item('e1', 'Ouvindo', [avaliacao(EU, 'vendo')]),
        item('e2', 'Já ouvi', [avaliacao(EU, 'visto')]),
        item('e3', 'Não curti', [avaliacao(EU, 'abandonei')]),
        item('e4', 'Quero ouvir', [avaliacao(EU, 'quero')]),
      ],
      membros,
      EU,
    )

    expect(linhas.map(l => l.rotulo)).toEqual(['Quero ouvir'])
  })

  it('para em três linhas, com o que espera você na frente', () => {
    const linhas = linhasDeMusicas(
      [
        item('e1', 'Fila 1', [avaliacao(EU, 'quero')]),
        item('e2', 'Fila 2', [avaliacao(EU, 'quero')]),
        item('e3', 'Espera 1', [avaliacao(ELA, 'quero')]),
        item('e4', 'Espera 2', [avaliacao(ELA, 'quero')]),
      ],
      membros,
      EU,
    )

    expect(linhas.map(l => l.rotulo)).toEqual(['Espera 1', 'Espera 2', 'Fila 1'])
  })

  it('omite os créditos quando a faixa não tem artista, em vez de escrever vazio', () => {
    const linhas = linhasDeMusicas(
      [item('e1', 'Sem artista', [avaliacao(EU, 'quero')], [])],
      membros,
      EU,
    )

    expect(linhas[0]?.nota).toBeUndefined()
  })

  it('sem sessão, nada é "seu" — tudo cai em esperando você', () => {
    const linhas = linhasDeMusicas([item('e1', 'Qualquer', [avaliacao(ELA, 'quero')])], membros, null)

    expect(linhas[0]).toMatchObject({ rotulo: 'Qualquer', destaque: true })
  })

  it('não inventa nada com a lista vazia', () => {
    expect(linhasDeMusicas([], membros, EU)).toEqual([])
  })
})
