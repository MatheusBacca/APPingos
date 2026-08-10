/**
 * Os limites do Google, que são três e não batem entre si.
 *
 * A lista da tela mostra todas as paradas. O mapa embutido aguenta 22 pontos. O
 * link que abre o app do Maps aguenta 5 no celular e 11 no desktop. Um roteiro
 * de 12 paradas atravessa os três de forma diferente, e o modo de errar é
 * silencioso: o link simplesmente ignora o que não coube, sem erro nenhum, e o
 * passeio some do celular de quem foi dirigindo.
 *
 * Por isso o fatiamento é testado nos dois limites e na emenda entre trechos —
 * um trecho que não começa onde o anterior terminou deixa um pedaço do caminho
 * sem link nenhum, que é o mesmo bug com outra cara.
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_PONTOS_EMBED,
  MAX_PONTOS_LINK_DESKTOP,
  MAX_PONTOS_LINK_MOBILE,
  aberturaNoMaps,
  aberturasPorDia,
  agruparPorDia,
  dataDoDia,
  embedTruncado,
  paradasNaRota,
  paradasOrdenadas,
  proximaViagem,
  roteirosNovos,
  rotuloDoDia,
  separarPorTempo,
  trechosDoMaps,
  urlDoEmbed,
  urlDoLugar,
  urlDoTrecho,
} from '~/types/viagem'
import type { Parada, Roteiro } from '~/types/viagem'

const CHAVE = 'chave-de-teste'
const HOJE = '2026-08-09'

function parada(ordem: number, extra: Partial<Parada> = {}): Parada {
  return {
    id: `p${ordem}`,
    ordem,
    google_place_id: `place-${ordem}`,
    nome: `Parada ${ordem}`,
    endereco: null,
    dia: null,
    anotacao: null,
    ...extra,
  }
}

/** N paradas em sequência, todas roteáveis. */
function paradas(n: number): Parada[] {
  return Array.from({ length: n }, (_, i) => parada(i))
}

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
    criado_por: 'eu',
    created_at: '2026-08-01T12:00:00Z',
    updated_at: '2026-08-01T12:00:00Z',
    ...extra,
  }
}

describe('paradasOrdenadas', () => {
  it('ordena por `ordem`, não pela ordem em que o banco devolveu', () => {
    const fora = [parada(2), parada(0), parada(1)]

    expect(paradasOrdenadas(fora).map(p => p.ordem)).toEqual([0, 1, 2])
  })

  it('não muda o array recebido', () => {
    const original = [parada(2), parada(0)]
    paradasOrdenadas(original)

    expect(original.map(p => p.ordem)).toEqual([2, 0])
  })
})

describe('paradasNaRota', () => {
  it('deixa de fora a parada escrita à mão, mantendo a ordem das demais', () => {
    const lista = [
      parada(0),
      parada(1, { google_place_id: null, nome: 'Casa da vó' }),
      parada(2),
    ]

    expect(paradasNaRota(lista).map(p => p.ordem)).toEqual([0, 2])
  })

  it('devolve vazio quando nenhuma parada é do Maps', () => {
    expect(paradasNaRota([parada(0, { google_place_id: null })])).toEqual([])
  })
})

describe('trechosDoMaps', () => {
  it('devolve um trecho só quando tudo cabe num link', () => {
    const trechos = trechosDoMaps(paradas(4), MAX_PONTOS_LINK_MOBILE)

    expect(trechos).toHaveLength(1)
    expect(trechos[0]).toHaveLength(4)
  })

  it('quebra 12 paradas em 3 trechos no celular', () => {
    const trechos = trechosDoMaps(paradas(12), MAX_PONTOS_LINK_MOBILE)

    expect(trechos).toHaveLength(3)
    expect(trechos.every(t => t.length <= MAX_PONTOS_LINK_MOBILE)).toBe(true)
  })

  it('quebra as mesmas 12 paradas em 2 trechos no desktop', () => {
    const trechos = trechosDoMaps(paradas(12), MAX_PONTOS_LINK_DESKTOP)

    expect(trechos).toHaveLength(2)
    expect(trechos.every(t => t.length <= MAX_PONTOS_LINK_DESKTOP)).toBe(true)
  })

  it('emenda os trechos: o fim de um é o começo do seguinte', () => {
    const trechos = trechosDoMaps(paradas(12), MAX_PONTOS_LINK_MOBILE)

    for (let i = 1; i < trechos.length; i++) {
      const anterior = trechos[i - 1]!
      expect(trechos[i]![0]).toBe(anterior[anterior.length - 1])
    }
  })

  it('não perde nenhuma parada pelo caminho', () => {
    const trechos = trechosDoMaps(paradas(12), MAX_PONTOS_LINK_MOBILE)
    const cobertas = new Set(trechos.flat().map(p => p.id))

    expect(cobertas.size).toBe(12)
  })

  it('ignora as paradas de texto livre ao montar os trechos', () => {
    const lista = [
      parada(0),
      parada(1, { google_place_id: null }),
      parada(2),
      parada(3),
    ]

    expect(trechosDoMaps(lista, MAX_PONTOS_LINK_MOBILE)[0]!.map(p => p.ordem))
      .toEqual([0, 2, 3])
  })

  /*
   * Uma parada só não é rota: sem destino, o link do Maps não tem para onde ir.
   * Devolver um trecho de um ponto fazia a tela desenhar um botão morto no
   * primeiro lugar adicionado a um roteiro novo — que é o momento mais comum
   * do módulo.
   */
  it('não gera trecho quando não há dois pontos para ligar', () => {
    expect(trechosDoMaps([], MAX_PONTOS_LINK_MOBILE)).toEqual([])
    expect(trechosDoMaps(paradas(1), MAX_PONTOS_LINK_MOBILE)).toEqual([])
    expect(trechosDoMaps([parada(0, { google_place_id: null })], MAX_PONTOS_LINK_MOBILE)).toEqual([])
  })
})

describe('urlDoTrecho', () => {
  it('manda nome e place_id de origem, destino e paradas do meio', () => {
    const url = urlDoTrecho(paradas(3), 'driving')!
    const params = new URL(url).searchParams

    expect(params.get('origin_place_id')).toBe('place-0')
    expect(params.get('destination_place_id')).toBe('place-2')
    expect(params.get('waypoint_place_ids')).toBe('place-1')
    expect(params.get('origin')).toBe('Parada 0')
    expect(params.get('travelmode')).toBe('driving')
  })

  it('omite waypoints quando o trecho é só origem e destino', () => {
    const params = new URL(urlDoTrecho(paradas(2), 'transit')!).searchParams

    expect(params.has('waypoints')).toBe(false)
    expect(params.get('travelmode')).toBe('transit')
  })

  it('não inventa link para um ponto só', () => {
    expect(urlDoTrecho(paradas(1), 'driving')).toBeNull()
  })
})

describe('urlDoEmbed', () => {
  it('usa /place com uma parada e /directions a partir de duas', () => {
    expect(urlDoEmbed(paradas(1), 'driving', CHAVE)).toContain('/embed/v1/place?')
    expect(urlDoEmbed(paradas(2), 'driving', CHAVE)).toContain('/embed/v1/directions?')
  })

  it('prefixa os pontos com place_id:', () => {
    const params = new URL(urlDoEmbed(paradas(3), 'walking', CHAVE)!).searchParams

    expect(params.get('origin')).toBe('place_id:place-0')
    expect(params.get('waypoints')).toBe('place_id:place-1')
    expect(params.get('mode')).toBe('walking')
  })

  it('não monta nada sem chave nem sem parada roteável', () => {
    expect(urlDoEmbed(paradas(2), 'driving', '')).toBeNull()
    expect(urlDoEmbed([parada(0, { google_place_id: null })], 'driving', CHAVE)).toBeNull()
  })

  it('corta no limite do Embed em vez de mandar uma URL que o Google recusa', () => {
    const muitas = paradas(MAX_PONTOS_EMBED + 5)
    const params = new URL(urlDoEmbed(muitas, 'driving', CHAVE)!).searchParams

    expect(params.get('destination')).toBe(`place_id:place-${MAX_PONTOS_EMBED - 1}`)
    expect(embedTruncado(muitas)).toBe(true)
    expect(embedTruncado(paradas(MAX_PONTOS_EMBED))).toBe(false)
  })
})

describe('agruparPorDia', () => {
  it('agrupa na ordem dos dias e joga o que não tem dia para o fim', () => {
    const lista = [
      parada(0, { dia: 2 }),
      parada(1, { dia: null }),
      parada(2, { dia: 1 }),
      parada(3, { dia: 2 }),
    ]

    expect(agruparPorDia(lista).map(g => g.dia)).toEqual([1, 2, null])
  })

  /*
   * "O que a gente faz no sábado" é a pergunta que o recorte por dia responde —
   * não "o que está entre a parada 3 e a 7". Um dia interrompido no meio da
   * lista continua sendo um dia só.
   */
  it('junta paradas do mesmo dia mesmo separadas na lista, mantendo a ordem', () => {
    const lista = [
      parada(0, { dia: 2 }),
      parada(1, { dia: 1 }),
      parada(2, { dia: 2 }),
    ]

    const dia2 = agruparPorDia(lista).find(g => g.dia === 2)!

    expect(dia2.paradas.map(p => p.ordem)).toEqual([0, 2])
  })
})

describe('urlDoLugar', () => {
  it('abre o lugar por id, com o texto que a API exige junto', () => {
    const params = new URL(urlDoLugar(parada(0))!).searchParams

    expect(params.get('query_place_id')).toBe('place-0')
    expect(params.get('query')).toBe('Parada 0')
  })

  it('não monta link para parada escrita à mão', () => {
    expect(urlDoLugar(parada(0, { google_place_id: null }))).toBeNull()
  })
})

describe('aberturaNoMaps', () => {
  it('devolve os trechos quando há rota', () => {
    const abertura = aberturaNoMaps(paradas(3), MAX_PONTOS_LINK_MOBILE)

    expect(abertura.trechos).toHaveLength(1)
    expect(abertura.lugarUnico).toBeNull()
    expect(abertura.foraDaRota).toBe(0)
  })

  /*
   * Um recorte de uma parada só não é erro: é o sábado em que só vão ao hotel.
   * Sem `lugarUnico` a tela teria que escolher entre esconder o dia ou desenhar
   * um botão de rota morto.
   */
  it('devolve o lugar único quando não há rota a traçar', () => {
    const abertura = aberturaNoMaps(paradas(1), MAX_PONTOS_LINK_MOBILE)

    expect(abertura.trechos).toEqual([])
    expect(abertura.lugarUnico?.ordem).toBe(0)
  })

  it('conta as paradas que ficaram fora da rota', () => {
    const lista = [parada(0), parada(1, { google_place_id: null }), parada(2)]
    const abertura = aberturaNoMaps(lista, MAX_PONTOS_LINK_MOBILE)

    expect(abertura.foraDaRota).toBe(1)
    expect(abertura.trechos[0]!.map(p => p.ordem)).toEqual([0, 2])
  })

  it('não oferece nada quando o recorte só tem texto livre', () => {
    const abertura = aberturaNoMaps([parada(0, { google_place_id: null })], MAX_PONTOS_LINK_MOBILE)

    expect(abertura.trechos).toEqual([])
    expect(abertura.lugarUnico).toBeNull()
    expect(abertura.foraDaRota).toBe(1)
  })
})

describe('aberturasPorDia', () => {
  it('dá uma abertura por dia, cada uma com a própria rota', () => {
    const lista = [
      parada(0, { dia: 1 }),
      parada(1, { dia: 1 }),
      parada(2, { dia: 2 }),
      parada(3, { dia: 2 }),
      parada(4, { dia: null }),
    ]

    const dias = aberturasPorDia(lista, MAX_PONTOS_LINK_MOBILE)

    expect(dias.map(d => d.dia)).toEqual([1, 2, null])
    expect(dias[0]!.trechos[0]!.map(p => p.ordem)).toEqual([0, 1])
    expect(dias[1]!.trechos[0]!.map(p => p.ordem)).toEqual([2, 3])
    expect(dias[2]!.lugarUnico?.ordem).toBe(4)
  })

  it('quebra em trechos dentro do dia quando ele é longo demais para um link', () => {
    const lista = paradas(8).map(p => ({ ...p, dia: 1 }))

    const dias = aberturasPorDia(lista, MAX_PONTOS_LINK_MOBILE)

    expect(dias).toHaveLength(1)
    expect(dias[0]!.trechos).toHaveLength(2)
  })
})

describe('dataDoDia', () => {
  it('conta o Dia 1 como o próprio início da viagem', () => {
    expect(dataDoDia(1, '2026-08-15')).toBe('2026-08-15')
    expect(dataDoDia(3, '2026-08-15')).toBe('2026-08-17')
  })

  it('atravessa a virada de mês', () => {
    expect(dataDoDia(4, '2026-08-30')).toBe('2026-09-02')
  })

  it('não deriva data sem início marcado, nem para dia inválido', () => {
    expect(dataDoDia(2, null)).toBeNull()
    expect(dataDoDia(null, '2026-08-15')).toBeNull()
    expect(dataDoDia(0, '2026-08-15')).toBeNull()
  })
})

describe('rotuloDoDia', () => {
  it('mostra a data quando ela existe, e só o dia quando não', () => {
    expect(rotuloDoDia(2, '2026-08-15')).toBe('Dia 2 · dom, 16 de ago')
    expect(rotuloDoDia(2, null)).toBe('Dia 2')
    expect(rotuloDoDia(null, '2026-08-15')).toBe('Sem dia')
  })
})

describe('roteirosNovos', () => {
  it('marca o liberado que ainda não foi aberto, inclusive o que eu criei', () => {
    const lista = [roteiro({ id: 'meu', criado_por: 'eu' }), roteiro({ id: 'dela', criado_por: 'ela' })]

    expect(roteirosNovos(lista, [])).toEqual(['meu', 'dela'])
  })

  it('esquece o que já foi aberto', () => {
    const lista = [roteiro({ id: 'a' }), roteiro({ id: 'b' })]

    expect(roteirosNovos(lista, ['a'])).toEqual(['b'])
  })

  it('nunca marca um roteiro secreto — nem para quem o escondeu', () => {
    const lista = [roteiro({ id: 'segredo', visibilidade: 'segredo', liberado_em: null })]

    expect(roteirosNovos(lista, [])).toEqual([])
  })
})

describe('separarPorTempo', () => {
  it('sobe as próximas por data e desce as passadas', () => {
    const lista = [
      roteiro({ id: 'dezembro', data_inicio: '2026-12-20' }),
      roteiro({ id: 'janeiro', data_inicio: '2026-01-10', data_fim: '2026-01-15' }),
      roteiro({ id: 'setembro', data_inicio: '2026-09-05' }),
      roteiro({ id: 'marco', data_inicio: '2026-03-02', data_fim: '2026-03-04' }),
    ]

    const { proximas, passadas } = separarPorTempo(lista, HOJE)

    expect(proximas.map(r => r.id)).toEqual(['setembro', 'dezembro'])
    expect(passadas.map(r => r.id)).toEqual(['marco', 'janeiro'])
  })

  /*
   * Um roteiro sem data é um plano esperando um quando. Mandá-lo para "passadas"
   * enterraria justamente as ideias que ainda vão virar viagem.
   */
  it('mantém o roteiro sem data nas próximas, depois das que têm data', () => {
    const lista = [
      roteiro({ id: 'sem-data', data_inicio: null }),
      roteiro({ id: 'com-data', data_inicio: '2026-09-05' }),
    ]

    const { proximas, passadas } = separarPorTempo(lista, HOJE)

    expect(proximas.map(r => r.id)).toEqual(['com-data', 'sem-data'])
    expect(passadas).toEqual([])
  })

  it('não arquiva a viagem em curso — começou ontem, termina domingo', () => {
    const lista = [roteiro({ id: 'em-curso', data_inicio: '2026-08-08', data_fim: '2026-08-16' })]

    expect(separarPorTempo(lista, HOJE).proximas.map(r => r.id)).toEqual(['em-curso'])
  })

  it('arquiva a viagem de um dia só que foi ontem', () => {
    const lista = [roteiro({ id: 'ontem', data_inicio: '2026-08-08' })]

    expect(separarPorTempo(lista, HOJE).passadas.map(r => r.id)).toEqual(['ontem'])
  })

  it('mantém hoje nas próximas', () => {
    const lista = [roteiro({ id: 'hoje', data_inicio: HOJE })]

    expect(separarPorTempo(lista, HOJE).proximas.map(r => r.id)).toEqual(['hoje'])
  })
})

describe('proximaViagem', () => {
  it('pega a de início mais próximo entre as que ainda não passaram', () => {
    const lista = [
      roteiro({ id: 'dezembro', data_inicio: '2026-12-20' }),
      roteiro({ id: 'setembro', data_inicio: '2026-09-05' }),
      roteiro({ id: 'passada', data_inicio: '2026-01-10', data_fim: '2026-01-15' }),
    ]

    expect(proximaViagem(lista, '2026-08-09')?.id).toBe('setembro')
  })

  it('mantém a viagem em curso — começou ontem, termina domingo', () => {
    const lista = [
      roteiro({ id: 'em-curso', data_inicio: '2026-08-08', data_fim: '2026-08-16' }),
      roteiro({ id: 'depois', data_inicio: '2026-09-01' }),
    ]

    expect(proximaViagem(lista, '2026-08-09')?.id).toBe('em-curso')
  })

  it('ignora roteiro sem data', () => {
    expect(proximaViagem([roteiro({ data_inicio: null })], '2026-08-09')).toBeNull()
  })
})
