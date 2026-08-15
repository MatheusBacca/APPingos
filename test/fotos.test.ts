/**
 * As regras de Fotos que valem sem o Vue.
 *
 * A que mais importa é `situacaoDaFoto`: "aprovada" é uma contagem comparada com o
 * tamanho do espaço, e não o número 2. O teste do espaço de três existe para que
 * ninguém possa trocar a comparação por `>= 2` e ver a suíte passar — foi essa a
 * simplificação que o módulo escolheu não fazer.
 *
 * O resto protege o caminho do arquivo até o bucket: o que é recusado antes de
 * subir e qual extensão o arquivo ganha lá dentro.
 */
import { describe, expect, it } from 'vitest'
import type { Foto, TipoMidia } from '~/types/foto'
import {
  TAMANHO_MAXIMO,
  agruparPorLote,
  agruparPorSituacao,
  contarPorSituacao,
  esperandoPorMim,
  euCurti,
  extensaoDoMime,
  faltamCurtir,
  formatarTamanho,
  motivoParaRecusar,
  nomeParaBaixar,
  situacaoDaFoto,
  temPrevia,
  tipoDoMime,
} from '~/types/foto'

function foto(
  id: string,
  quemCurtiu: string[],
  extras: Partial<Foto> = {},
): Foto {
  return {
    id,
    space_id: 's1',
    enviada_por: 'ana',
    caminho: `s1/${id}.jpg`,
    // Um lote por foto, salvo quando o teste diz o contrário: é o que o default
    // da coluna faz, e o que mantém os testes de situação alheios ao lote.
    lote_id: `lote-${id}`,
    tipo: 'imagem' as TipoMidia,
    mime: 'image/jpeg',
    tamanho: 1024,
    nome_original: null,
    legenda: null,
    aprovada_em: null,
    postada_em: null,
    created_at: '2026-08-15T12:00:00Z',
    updated_at: '2026-08-15T12:00:00Z',
    curtidas: quemCurtiu.map(user_id => ({
      foto_id: id,
      user_id,
      created_at: '2026-08-15T12:00:00Z',
    })),
    ...extras,
  }
}

describe('situacaoDaFoto', () => {
  it('espera enquanto falta alguém do espaço curtir', () => {
    expect(situacaoDaFoto(foto('f1', ['ana']), 2)).toBe('esperando')
  })

  it('libera quando todo mundo do espaço curtiu', () => {
    expect(situacaoDaFoto(foto('f1', ['ana', 'bruno']), 2)).toBe('liberada')
  })

  it('no espaço pessoal a curtida automática de quem enviou já libera', () => {
    expect(situacaoDaFoto(foto('f1', ['ana']), 1)).toBe('liberada')
  })

  /*
    O teste que impede a simplificação. Duas curtidas num espaço de três não é
    "os dois curtiram" — é maioria, e maioria não foi o combinado.
  */
  it('num espaço de três, duas curtidas ainda não liberam', () => {
    expect(situacaoDaFoto(foto('f1', ['ana', 'bruno']), 3)).toBe('esperando')
    expect(situacaoDaFoto(foto('f1', ['ana', 'bruno', 'caio']), 3)).toBe('liberada')
  })

  it('postada ganha das outras duas, mesmo com todos os corações', () => {
    const postada = foto('f1', ['ana', 'bruno'], { postada_em: '2026-08-15T18:00:00Z' })
    expect(situacaoDaFoto(postada, 2)).toBe('postada')
  })

  /*
    Enquanto `useMembros` carrega, o total chega como 0. Sem esta guarda, a
    comparação `curtidas.length >= 0` seria sempre verdadeira e a galeria inteira
    piscaria "pode postar" antes de os membros chegarem — a pior mentira possível
    para um módulo cuja única promessa é essa.
  */
  it('não libera nada enquanto o total de membros é desconhecido', () => {
    expect(situacaoDaFoto(foto('f1', []), 0)).toBe('esperando')
    expect(situacaoDaFoto(foto('f1', ['ana', 'bruno']), 0)).toBe('esperando')
  })
})

describe('euCurti e faltamCurtir', () => {
  const membros = [{ user_id: 'ana' }, { user_id: 'bruno' }]

  it('reconhece a própria curtida', () => {
    expect(euCurti(foto('f1', ['ana']), 'ana')).toBe(true)
    expect(euCurti(foto('f1', ['ana']), 'bruno')).toBe(false)
  })

  it('sem sessão, ninguém curtiu', () => {
    expect(euCurti(foto('f1', ['ana']), null)).toBe(false)
  })

  it('diz de quem se espera', () => {
    expect(faltamCurtir(foto('f1', ['ana']), membros)).toEqual(['bruno'])
    expect(faltamCurtir(foto('f1', ['ana', 'bruno']), membros)).toEqual([])
  })
})

describe('esperandoPorMim', () => {
  /*
    A distinção que a função existe para fazer: uma foto que EU já curti continua
    "esperando", mas não é pendência minha. Contá-la mandaria a pessoa procurar um
    botão que ela já apertou.
  */
  it('deixa de fora o que eu já curti', () => {
    const fotos = [foto('f1', ['ana']), foto('f2', ['bruno']), foto('f3', ['ana', 'bruno'])]
    expect(esperandoPorMim(fotos, 'ana', 2).map(f => f.id)).toEqual(['f2'])
  })

  it('sem sessão, nada é pendência', () => {
    expect(esperandoPorMim([foto('f1', ['ana'])], null, 2)).toEqual([])
  })
})

describe('agruparPorSituacao', () => {
  const fotos = [
    foto('f1', ['ana']),
    foto('f2', ['ana', 'bruno']),
    foto('f3', ['ana', 'bruno'], { postada_em: '2026-08-15T18:00:00Z' }),
  ]

  it('agrupa na ordem em que as situações importam', () => {
    expect(agruparPorSituacao(fotos, 2).map(g => g.situacao))
      .toEqual(['esperando', 'liberada', 'postada'])
  })

  it('some com o grupo vazio em vez de desenhar um cabeçalho sozinho', () => {
    const grupos = agruparPorSituacao([foto('f1', ['ana'])], 2)
    expect(grupos).toHaveLength(1)
    expect(grupos[0]!.situacao).toBe('esperando')
  })

  it('conta cada situação', () => {
    expect(contarPorSituacao(fotos, 2)).toEqual({ esperando: 1, liberada: 1, postada: 1 })
  })
})

describe('agruparPorLote', () => {
  /** Três fotos do mesmo envio, na ordem em que a consulta as devolve. */
  const doSabado = [
    foto('f1', ['ana'], { lote_id: 'sabado', legenda: 'praia' }),
    foto('f2', ['ana'], { lote_id: 'sabado', legenda: 'praia' }),
    foto('f3', ['ana'], { lote_id: 'sabado', legenda: 'praia' }),
  ]

  it('junta o envio numa faixa só', () => {
    const grupos = agruparPorLote(doSabado)

    expect(grupos).toHaveLength(1)
    expect(grupos[0]!.itens.map(f => f.id)).toEqual(['f1', 'f2', 'f3'])
    expect(grupos[0]!.legenda).toBe('praia')
  })

  it('separa envios diferentes', () => {
    const grupos = agruparPorLote([
      ...doSabado,
      foto('f4', ['ana'], { lote_id: 'domingo' }),
    ])

    expect(grupos.map(g => g.loteId)).toEqual(['sabado', 'domingo'])
    expect(grupos.map(g => g.itens.length)).toEqual([3, 1])
  })

  /*
    A consulta já chega em `created_at desc`, e o agrupamento respeita essa ordem
    em vez de reordenar: o lote mais recente aparece primeiro porque a primeira
    foto que ele encontra é a mais recente.
  */
  it('mantém a ordem em que as fotos chegaram', () => {
    const grupos = agruparPorLote([
      foto('novo', ['ana'], { lote_id: 'b' }),
      foto('velho', ['ana'], { lote_id: 'a' }),
    ])

    expect(grupos.map(g => g.loteId)).toEqual(['b', 'a'])
  })

  /*
    O envio grava a mesma legenda em todas, mas editar UMA delas depois é o caso
    normal. Se a legenda do lote saísse da primeira foto, editar justamente a de
    cima apagaria o título da faixa inteira.
  */
  it('a legenda do lote é a primeira preenchida, não a da primeira foto', () => {
    const grupos = agruparPorLote([
      foto('f1', ['ana'], { lote_id: 'x', legenda: null }),
      foto('f2', ['ana'], { lote_id: 'x', legenda: 'praia' }),
    ])

    expect(grupos[0]!.legenda).toBe('praia')
  })

  it('guarda quem mandou e quando, para o cabeçalho da faixa', () => {
    const grupos = agruparPorLote(doSabado)

    expect(grupos[0]!.enviadaPor).toBe('ana')
    expect(grupos[0]!.quando).toBe('2026-08-15T12:00:00Z')
  })

  it('sem fotos, sem faixas', () => {
    expect(agruparPorLote([])).toEqual([])
  })
})

describe('nomeParaBaixar', () => {
  it('usa o nome que o arquivo tinha no aparelho', () => {
    expect(nomeParaBaixar(foto('f1', [], { nome_original: 'IMG_0042.HEIC' })))
      .toBe('IMG_0042.HEIC')
  })

  /*
    O nome vai para o `Content-Disposition` da URL assinada. Barra, contrabarra e
    aspas saem porque são o que transformaria um nome de arquivo em um caminho ou
    num segundo cabeçalho.
  */
  it('tira o que não pode ir num cabeçalho nem num caminho', () => {
    expect(nomeParaBaixar(foto('f1', [], { nome_original: '../../etc/passwd' })))
      .toBe('....etcpasswd')
    expect(nomeParaBaixar(foto('f1', [], { nome_original: 'foto".jpg' })))
      .toBe('foto.jpg')
  })

  it('sem nome guardado, gera um a partir da data', () => {
    expect(nomeParaBaixar(foto('f1', []), 0)).toBe('appingos-2026-08-15-1.jpg')
    expect(nomeParaBaixar(foto('f2', [], { mime: 'video/mp4' }), 2))
      .toBe('appingos-2026-08-15-3.mp4')
  })

  /*
    Um nome que vira string vazia depois da limpeza cai no gerado — devolvê-lo
    daria um download sem nome nenhum.
  */
  it('nome que sobra vazio cai no gerado', () => {
    expect(nomeParaBaixar(foto('f1', [], { nome_original: '///' })))
      .toBe('appingos-2026-08-15-1.jpg')
  })
})

describe('motivoParaRecusar', () => {
  it('aceita o que o bucket aceita', () => {
    expect(motivoParaRecusar({ name: 'a.jpg', type: 'image/jpeg', size: 1000 })).toBeNull()
    expect(motivoParaRecusar({ name: 'a.mov', type: 'video/quicktime', size: 1000 })).toBeNull()
  })

  it('recusa formato de fora da lista', () => {
    expect(motivoParaRecusar({ name: 'a.pdf', type: 'application/pdf', size: 1000 }))
      .toContain('formato não aceito')
  })

  it('recusa o que passa do teto, antes de gastar a subida', () => {
    expect(motivoParaRecusar({ name: 'a.mp4', type: 'video/mp4', size: TAMANHO_MAXIMO + 1 }))
      .toContain('passa de')
    expect(motivoParaRecusar({ name: 'a.mp4', type: 'video/mp4', size: TAMANHO_MAXIMO })).toBeNull()
  })

  it('recusa arquivo vazio', () => {
    expect(motivoParaRecusar({ name: 'a.jpg', type: 'image/jpeg', size: 0 }))
      .toContain('arquivo vazio')
  })

  it('a frase sempre diz de qual arquivo se trata', () => {
    expect(motivoParaRecusar({ name: 'praia.pdf', type: 'application/pdf', size: 1 }))
      .toContain('praia.pdf')
  })
})

describe('extensaoDoMime', () => {
  /*
    A extensão sai do MIME e nunca do nome que veio do aparelho: esse nome é
    entrada de fora e entra num caminho de Storage montado por template.
  */
  it('traduz os formatos aceitos', () => {
    expect(extensaoDoMime('image/jpeg')).toBe('jpg')
    expect(extensaoDoMime('video/quicktime')).toBe('mov')
    expect(extensaoDoMime('image/heic')).toBe('heic')
  })

  it('desconhecido vira .bin em vez de string vazia', () => {
    expect(extensaoDoMime('application/octet-stream')).toBe('bin')
  })
})

describe('tipoDoMime e temPrevia', () => {
  it('separa vídeo de imagem', () => {
    expect(tipoDoMime('video/mp4')).toBe('video')
    expect(tipoDoMime('image/png')).toBe('imagem')
  })

  /*
    HEIC é guardado e não é desenhado. As duas coisas ao mesmo tempo: o iPhone
    grava nesse formato por padrão, e recusá-lo seria recusar o caso mais comum.
  */
  it('marca o que o navegador não desenha', () => {
    expect(temPrevia('image/jpeg')).toBe(true)
    expect(temPrevia('image/heic')).toBe(false)
    expect(temPrevia('image/HEIF')).toBe(false)
  })
})

describe('formatarTamanho', () => {
  it('usa KB abaixo de um mega e MB acima', () => {
    expect(formatarTamanho(2048)).toBe('2 KB')
    expect(formatarTamanho(1024 * 1024 * 3)).toBe('3,0 MB')
  })

  it('nada a dizer sobre tamanho ausente', () => {
    expect(formatarTamanho(null)).toBe('')
    expect(formatarTamanho(0)).toBe('')
  })
})
