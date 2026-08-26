/**
 * A memória da viagem: o que a folha A4 aguenta, e que dias ainda cabem.
 *
 * A paginação é o alvo principal, e o motivo é o modo de errar dela: nada
 * quebra, nada aparece vermelho na tela — o PDF simplesmente sai com uma folha
 * em branco no meio, ou com o rótulo do sábado sozinho no rodapé da folha 2.
 * Só se descobre olhando o diálogo de impressão, que é tarde.
 *
 * As dimensões entram por parâmetro em todo teste que as usa. Com os números
 * reais do papel (`PAPEL`), qualquer ajuste de CSS quebraria a suíte inteira por
 * um motivo que não é o que ela testa.
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_DIAS_SUGERIDOS,
  alturaDoBloco,
  blocosDaMemoria,
  diasDaViagem,
  diasSemSecao,
  linhasDeTexto,
  paginar,
  rotuloDaData,
  rotuloDaSecao,
  secaoVazia,
} from '~/lib/memoria'
import type { DimensoesDoPapel, ItemDaMemoria, SecaoDaMemoria } from '~/lib/memoria'

/**
 * Um papel de conta redonda: a folha cabe 100, o cabeçalho come 20, e cada
 * unidade de conteúdo vale 10. Assim "cabem oito blocos na folha 1" é uma conta
 * que se confere de cabeça, e o teste fala sobre a regra em vez de sobre mm.
 */
const PAPEL_DE_TESTE: DimensoesDoPapel = {
  alturaUtil: 100,
  cabecalho: 20,
  rotulo: 10,
  linha: 10,
  colunas: 10,
  foto: 10,
  fotosPorLinha: 1,
  musica: 10,
  espaco: 0,
}

function secao(ordem: number, extra: Partial<SecaoDaMemoria> = {}): SecaoDaMemoria {
  return {
    id: `s${ordem}`,
    ordem,
    data: null,
    titulo: null,
    texto: null,
    nova_folha: false,
    ...extra,
  }
}

function item(id: string, extra: Partial<ItemDaMemoria> = {}): ItemDaMemoria {
  return {
    id,
    secao_id: null,
    ordem: 0,
    tipo: 'foto',
    foto_id: null,
    caminho: `fotos/${id}.jpg`,
    playlist_id: null,
    spotify_id: null,
    titulo: null,
    subtitulo: null,
    capa_url: null,
    url_spotify: null,
    legenda: null,
    ...extra,
  }
}

/** Uma seção de altura conhecida: só o rótulo, sem texto e sem itens. */
function bloco(ordem: number, extra: Partial<SecaoDaMemoria> = {}) {
  return { secao: secao(ordem, extra), itens: [] }
}

describe('rótulos', () => {
  it('o título escrito à mão ganha da data', () => {
    expect(rotuloDaSecao({ titulo: 'O dia da chuva', data: '2026-08-23' })).toBe('O dia da chuva')
  })

  it('sem título, o rótulo sai da data', () => {
    expect(rotuloDaSecao({ titulo: null, data: '2026-08-21' })).toBe('Sexta-feira, 21 de agosto')
  })

  it('título só de espaços não conta como título', () => {
    expect(rotuloDaSecao({ titulo: '   ', data: '2026-08-21' })).toBe('Sexta-feira, 21 de agosto')
  })

  it('sem título e sem data, a seção ainda tem nome', () => {
    expect(rotuloDaSecao({ titulo: null, data: null })).toBe('Sem data')
  })

  /*
    O bug clássico do repo, e o motivo de nada aqui passar por `new Date(iso)`:
    num fuso a oeste de Greenwich isso lê a data em UTC e devolve o dia anterior.
    Num documento impresso, a data errada não tem como ser corrigida depois.
  */
  it('lê o dia da própria string, sem cair no fuso', () => {
    expect(rotuloDaData('2026-01-01')).toBe('Quinta-feira, 1 de janeiro')
    expect(rotuloDaData('2026-12-31')).toBe('Quinta-feira, 31 de dezembro')
  })
})

describe('seção vazia', () => {
  it('sem texto, sem título e sem itens', () => {
    expect(secaoVazia({ titulo: null, texto: null })).toBe(true)
    expect(secaoVazia({ titulo: null, texto: '   ' })).toBe(true)
  })

  it('uma foto anexada já basta para a seção existir', () => {
    expect(secaoVazia({ titulo: null, texto: null }, [item('f1')])).toBe(false)
  })

  it('texto escrito basta', () => {
    expect(secaoVazia({ titulo: null, texto: 'choveu o dia inteiro' })).toBe(false)
  })
})

describe('os dias da viagem', () => {
  it('vai do início ao fim, inclusive nas duas pontas', () => {
    expect(diasDaViagem('2026-08-21', '2026-08-23')).toEqual([
      '2026-08-21',
      '2026-08-22',
      '2026-08-23',
    ])
  })

  it('sem data_fim, a viagem é de um dia só', () => {
    expect(diasDaViagem('2026-08-21', null)).toEqual(['2026-08-21'])
  })

  it('sem data_inicio não há dia a sugerir', () => {
    expect(diasDaViagem(null, '2026-08-23')).toEqual([])
  })

  it('atravessa a virada de mês e a de ano', () => {
    expect(diasDaViagem('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ])
  })

  /*
    "2036" digitado no lugar de "2026" pediria quatro mil sugestões e travaria a
    aba. O teto transforma o erro de digitação numa lista longa demais — visível,
    e sem travar nada.
  */
  it('para no teto quando a data_fim é absurda', () => {
    expect(diasDaViagem('2026-08-21', '2036-08-21')).toHaveLength(MAX_DIAS_SUGERIDOS)
  })

  it('oferece só os dias que ainda não viraram seção', () => {
    const secoes = [secao(0, { data: '2026-08-22' }), secao(1, { data: null })]

    expect(diasSemSecao(secoes, '2026-08-21', '2026-08-23')).toEqual([
      '2026-08-21',
      '2026-08-23',
    ])
  })
})

describe('blocos', () => {
  it('cada seção leva os itens dela, na ordem', () => {
    const secoes = [secao(1), secao(0)]
    const itens = [
      item('b', { secao_id: 's0', ordem: 1 }),
      item('a', { secao_id: 's0', ordem: 0 }),
      item('c', { secao_id: 's1', ordem: 0 }),
    ]

    const blocos = blocosDaMemoria(secoes, itens)

    expect(blocos.map(b => b.secao?.id)).toEqual(['s0', 's1'])
    expect(blocos[0]!.itens.map(i => i.id)).toEqual(['a', 'b'])
    expect(blocos[1]!.itens.map(i => i.id)).toEqual(['c'])
  })

  /*
    A playlist da viagem inteira não pertence a nenhuma tarde. Escondê-la até
    alguém escrever uma seção faria a pessoa anexar a playlist e não vê-la em
    lugar nenhum.
  */
  it('os itens soltos viram o último bloco, sem seção', () => {
    const blocos = blocosDaMemoria([secao(0)], [
      item('solto', { tipo: 'playlist', caminho: null, titulo: 'A trilha' }),
    ])

    expect(blocos).toHaveLength(2)
    expect(blocos[1]!.secao).toBeNull()
    expect(blocos[1]!.itens.map(i => i.id)).toEqual(['solto'])
  })

  it('sem itens soltos, não há bloco a mais', () => {
    expect(blocosDaMemoria([secao(0)], [])).toHaveLength(1)
  })
})

describe('linhas de texto', () => {
  it('conta as quebras que a pessoa digitou', () => {
    expect(linhasDeTexto('uma\noutra', 10)).toBe(2)
  })

  it('quebra o parágrafo que não cabe na largura', () => {
    expect(linhasDeTexto('x'.repeat(25), 10)).toBe(3)
  })

  /*
    A linha em branco entre dois parágrafos é espaço que o papel de fato gasta.
    Ignorá-la faria toda memória com respiro entre parágrafos estourar a folha.
  */
  it('a linha em branco também ocupa uma linha', () => {
    expect(linhasDeTexto('uma\n\noutra', 10)).toBe(3)
  })

  it('texto nulo não ocupa nada', () => {
    expect(linhasDeTexto(null, 10)).toBe(0)
  })
})

describe('paginação', () => {
  it('sem nada escrito, ainda existe uma folha', () => {
    const folhas = paginar([], PAPEL_DE_TESTE)

    expect(folhas).toHaveLength(1)
    expect(folhas[0]!.blocos).toEqual([])
  })

  /*
    A folha 1 é mais curta que as outras porque carrega o cabeçalho: 100 − 20 =
    80, e cada bloco vale 10. Oito na primeira, o resto na segunda — sem isto o
    primeiro dia transbordava sempre, e sempre por pouco.
  */
  it('a folha 1 cabe menos, porque leva o cabeçalho', () => {
    const folhas = paginar(Array.from({ length: 12 }, (_, i) => bloco(i)), PAPEL_DE_TESTE)

    expect(folhas.map(f => f.blocos.length)).toEqual([8, 4])
    expect(folhas.map(f => f.numero)).toEqual([1, 2])
  })

  it('a folha 2 em diante usa a altura inteira', () => {
    const folhas = paginar(Array.from({ length: 18 }, (_, i) => bloco(i)), PAPEL_DE_TESTE)

    expect(folhas.map(f => f.blocos.length)).toEqual([8, 10])
  })

  /*
    A válvula manual. Ela ganha da conta sempre: a estimativa não sabe que aquela
    foto é A foto do documento e merece abrir a página.
  */
  it('"começar em nova folha" vira a página mesmo com espaço de sobra', () => {
    const folhas = paginar(
      [bloco(0), bloco(1, { nova_folha: true }), bloco(2)],
      PAPEL_DE_TESTE,
    )

    expect(folhas.map(f => f.blocos.map(b => b.secao!.id))).toEqual([['s0'], ['s1', 's2']])
  })

  it('a marca na primeira seção não gera uma folha em branco antes dela', () => {
    const folhas = paginar([bloco(0, { nova_folha: true }), bloco(1)], PAPEL_DE_TESTE)

    expect(folhas).toHaveLength(1)
    expect(folhas[0]!.blocos).toHaveLength(2)
  })

  /*
    O dia em que se escreveu três páginas. Ele fica sozinho na folha dele e o
    navegador quebra por dentro (`break-inside: auto`); o que vem depois começa
    numa folha nova, porque a folha dele já está estourada por definição.
  */
  it('o bloco maior que a folha inteira fica sozinho', () => {
    const gigante = {
      secao: secao(1, { texto: 'x'.repeat(10 * 30) }),
      itens: [],
    }

    expect(alturaDoBloco(gigante, PAPEL_DE_TESTE)).toBeGreaterThan(PAPEL_DE_TESTE.alturaUtil)

    const folhas = paginar([bloco(0), gigante, bloco(2)], PAPEL_DE_TESTE)

    expect(folhas.map(f => f.blocos.map(b => b.secao!.id))).toEqual([['s0'], ['s1'], ['s2']])
  })

  it('as fotos ocupam por fileira, não por unidade', () => {
    const dim = { ...PAPEL_DE_TESTE, fotosPorLinha: 3, foto: 30, rotulo: 0 }
    const comFotos = {
      secao: secao(0),
      itens: Array.from({ length: 4 }, (_, i) => item(`f${i}`, { secao_id: 's0', ordem: i })),
    }

    // Quatro fotos são duas fileiras — a segunda com uma foto só.
    expect(alturaDoBloco(comFotos, dim)).toBe(60)
  })

  it('música conta por unidade, e não por fileira', () => {
    const dim = { ...PAPEL_DE_TESTE, rotulo: 0, musica: 25 }
    const comMusicas = {
      secao: secao(0),
      itens: [
        item('m1', { tipo: 'playlist', caminho: null, titulo: 'A trilha', secao_id: 's0' }),
        item('m2', { tipo: 'musica', caminho: null, titulo: 'A música', secao_id: 's0' }),
      ],
    }

    expect(alturaDoBloco(comMusicas, dim)).toBe(50)
  })
})
