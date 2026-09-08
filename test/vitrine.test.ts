/**
 * O que cada card do painel escolhe mostrar.
 *
 * Cinco regras, e nenhuma delas é óbvia olhando a tela pronta: as fases de
 * Filmes se completam em vez de se excluírem; o carrossel de Fotos prefere o que
 * já pode ser postado; a última faixa pode ser de horas atrás sem deixar de ser
 * a resposta certa; o roteiro secreto nunca chega ao painel; e o interesse
 * arquivado também não.
 */
import { describe, expect, it } from 'vitest'
import {
  FOTOS_DA_VITRINE,
  filmesDaVitrine,
  quantosCabem,
  fotosDaVitrine,
  interessesDaVitrine,
  mesesDaVitrine,
  musicaDaVitrine,
  roteiroDaVitrine,
} from '~/lib/vitrine'
import type { Avaliacao, ItemDoEspaco } from '~/types/catalogo'
import type { Foto } from '~/types/foto'
import type { InteresseComAgrupamentos } from '~/types/interesse'
import type { Roteiro } from '~/types/viagem'
import type { Membro } from '~/composables/useMembros'
import type { EscutaAgora } from '~/composables/useSpotify'

const HOJE = '2026-09-03'
const EU = 'eu'
const ELA = 'ela'
const LIMITE_AO_VIVO = 2 * 60 * 1000

const membros: Membro[] = [
  { user_id: EU, papel: 'dono', nome: 'Matheus Bacca', apelido: null, exibicao: 'Matheus Bacca', avatar_url: null },
  { user_id: ELA, papel: 'membro', nome: 'Ana Paula', apelido: null, exibicao: 'Ana Paula', avatar_url: null },
]

function avaliacao(extra: Partial<Avaliacao> & { user_id: string }): Avaliacao {
  return {
    status: 'quero',
    nota: null,
    resenha: null,
    planejado_para: null,
    visto_em: null,
    enviado_em: null,
    ...extra,
  }
}

function item(id: string, titulo: string, avaliacoes: Avaliacao[], criadoEm = '2026-07-01T00:00:00Z'): ItemDoEspaco {
  return {
    id,
    created_at: criadoEm,
    media: {
      id: `m-${id}`,
      tipo: 'filme',
      fonte: 'tmdb',
      fonte_id: `tmdb-${id}`,
      titulo,
      titulo_original: null,
      ano: 2026,
      capa_url: null,
      sinopse: null,
      metadados: {},
    },
    avaliacoes,
  }
}

// ---------------------------------------------------------------------------

describe('quantosCabem', () => {
  const item = { largura: 150, altura: 100 }

  it('as colunas saem da largura', () => {
    expect(quantosCabem({ largura: 340, altura: null }, item, { minimo: 1, maximo: 8 }).colunas).toBe(2)
    expect(quantosCabem({ largura: 690, altura: null }, item, { minimo: 1, maximo: 8 }).colunas).toBe(4)
  })

  /*
   * A regra que impede o laço: com altura automática, mais itens deixariam o
   * cartão mais alto, o que daria espaço para mais itens ainda. Ver
   * `EspacoDaVitrine`.
   */
  it('sem altura fixa, as linhas são o palpite — nunca a medida', () => {
    const cabem = quantosCabem({ largura: 340, altura: null }, item, {
      minimo: 1,
      maximo: 8,
      linhas: 2,
    })

    expect(cabem.linhas).toBe(2)
    expect(cabem.total).toBe(4)
  })

  it('com altura fixa, cresce e encolhe com a caixa', () => {
    const baixo = quantosCabem({ largura: 340, altura: 120 }, item, { minimo: 1, maximo: 8 })
    const alto = quantosCabem({ largura: 340, altura: 420 }, item, { minimo: 1, maximo: 8 })

    expect(baixo.total).toBe(2)
    expect(alto.total).toBe(8)
  })

  it('o piso garante conteúdo no cartão apertado, e o teto evita a listagem inteira', () => {
    expect(quantosCabem({ largura: 80, altura: 90 }, item, { minimo: 2, maximo: 8 }).total).toBe(2)
    expect(quantosCabem({ largura: 690, altura: 900 }, item, { minimo: 2, maximo: 8 }).total).toBe(8)
  })

  /*
   * O bug do cartaz cortado: com altura fixa, duas colunas largas "cabiam" duas
   * fileiras que na hora de desenhar passavam da borda do cartão. A altura do
   * cartaz depende da largura da coluna, porque ele é 2:3.
   */
  it('a altura do item pode depender da largura da coluna', () => {
    const cartaz = { largura: 150, altura: (coluna: number) => coluna * 1.5 + 62 }
    const limites = { minimo: 2, maximo: 8, colunas: 4, vao: 12, reserva: 40 }

    // 305px de largura → 2 colunas de 146,5 → cartaz de ~282px. Em 546 de altura
    // sobram 506 para a grade: uma fileira, e não duas.
    expect(quantosCabem({ largura: 305, altura: 546 }, cartaz, limites)).toMatchObject({
      colunas: 2,
      linhas: 1,
      total: 2,
    })

    // O dobro de altura já comporta a segunda fileira.
    expect(quantosCabem({ largura: 305, altura: 1000 }, cartaz, limites).linhas).toBe(3)
  })

  it('o vão entre fileiras não é cobrado depois da última', () => {
    const item = { largura: 100, altura: 100 }
    const limites = { minimo: 1, maximo: 9, vao: 12 }

    // Duas fileiras de 100 com um vão de 12 = 212, e é isso que a caixa tem.
    expect(quantosCabem({ largura: 100, altura: 212 }, item, limites).linhas).toBe(2)
    expect(quantosCabem({ largura: 100, altura: 211 }, item, limites).linhas).toBe(1)
  })

  it('a reserva desconta o que a vitrine gasta antes da grade', () => {
    const item = { largura: 100, altura: 100 }

    expect(quantosCabem({ largura: 100, altura: 200 }, item, { minimo: 1, maximo: 9 }).linhas).toBe(2)
    expect(
      quantosCabem({ largura: 100, altura: 200 }, item, { minimo: 1, maximo: 9, reserva: 40 }).linhas,
    ).toBe(1)
  })

  it('o limite de colunas vale mesmo num cartão muito largo', () => {
    const cabem = quantosCabem({ largura: 1200, altura: null }, item, {
      minimo: 1,
      maximo: 8,
      colunas: 4,
    })

    expect(cabem.colunas).toBe(4)
  })
})

describe('mesesDaVitrine', () => {
  it('devolve os três meses em ordem, com o corrente marcado', () => {
    const meses = mesesDaVitrine(
      [
        { competencia: '2026-07-01', total: 1218.4, minhaParte: 600 },
        { competencia: '2026-08-01', total: 1362.75, minhaParte: 700 },
        { competencia: '2026-09-01', total: 1485.15, minhaParte: 800 },
      ],
      '2026-09-01',
    )

    expect(meses.map(m => m.competencia)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01'])
    expect(meses.map(m => m.total)).toEqual([1218.4, 1362.75, 1485.15])
    expect(meses.map(m => m.atual)).toEqual([false, false, true])
  })

  it('mês sem lançamento vira barra zerada, e não barra faltando', () => {
    const meses = mesesDaVitrine([{ competencia: '2026-09-01', total: 10, minhaParte: 5 }], '2026-09-01')

    expect(meses).toHaveLength(3)
    expect(meses[0]!.total).toBe(0)
  })
})

describe('filmesDaVitrine', () => {
  it('o que tem data vem primeiro, e o mais próximo na frente', () => {
    const vitrine = filmesDaVitrine([
      item('a', 'Duna', [avaliacao({ user_id: EU, planejado_para: '2026-09-20' })]),
      item('b', 'Alien', [avaliacao({ user_id: EU, planejado_para: '2026-09-05' })]),
    ], HOJE)

    expect(vitrine!.fase).toBe('planejado')
    expect(vitrine!.filmes.map(f => f.titulo)).toEqual(['Alien', 'Duna'])
  })

  it('o mesmo filme marcado pelos dois ocupa uma vaga só', () => {
    const vitrine = filmesDaVitrine([
      item('a', 'Duna', [
        avaliacao({ user_id: EU, planejado_para: '2026-09-20' }),
        avaliacao({ user_id: ELA, planejado_para: '2026-09-20' }),
      ]),
      item('b', 'Alien', [avaliacao({ user_id: EU })]),
    ], HOJE)

    expect(vitrine!.filmes.map(f => f.titulo)).toEqual(['Duna', 'Alien'])
  })

  it('com uma data só, a segunda vaga desce para a fila em vez de ficar vazia', () => {
    const vitrine = filmesDaVitrine([
      item('a', 'Duna', [avaliacao({ user_id: EU, planejado_para: '2026-09-20' })]),
      item('b', 'Alien', [avaliacao({ user_id: EU })]),
    ], HOJE)

    expect(vitrine!.fase).toBe('planejado')
    expect(vitrine!.filmes.map(f => f.fase)).toEqual(['planejado', 'disponivel'])
  })

  it('data que já passou não é plano: o filme desce para os vistos', () => {
    const vitrine = filmesDaVitrine([
      item('a', 'Duna', [avaliacao({ user_id: EU, planejado_para: '2026-08-01', status: 'visto', visto_em: '2026-08-01' })]),
    ], HOJE)

    expect(vitrine!.fase).toBe('visto')
    expect(vitrine!.legenda).toBe('Já vimos')
  })

  it('sem nada na lista, não há vitrine', () => {
    expect(filmesDaVitrine([], HOJE)).toBeNull()
  })

  it('o cartão maior pede mais cartazes', () => {
    const itens = Array.from({ length: 6 }, (_, i) =>
      item(`f${i}`, `Filme ${i}`, [avaliacao({ user_id: EU })]))

    expect(filmesDaVitrine(itens, HOJE)!.filmes).toHaveLength(2)
    expect(filmesDaVitrine(itens, HOJE, 4)!.filmes).toHaveLength(4)
    // Pedir mais do que existe devolve o que existe, e não buracos.
    expect(filmesDaVitrine(itens, HOJE, 10)!.filmes).toHaveLength(6)
  })
})

describe('fotosDaVitrine', () => {
  function foto(id: string, curtidas: string[], extra: Partial<Foto> = {}): Foto {
    return {
      id,
      space_id: 'casal',
      enviada_por: EU,
      caminho: `casal/${id}.jpg`,
      lote_id: `lote-${id}`,
      tipo: 'imagem',
      mime: 'image/jpeg',
      tamanho: 100,
      nome_original: null,
      legenda: null,
      aprovada_em: null,
      postada_em: null,
      created_at: '2026-09-01T12:00:00Z',
      updated_at: '2026-09-01T12:00:00Z',
      curtidas: curtidas.map(user_id => ({ foto_id: id, user_id, created_at: '2026-09-01T12:00:00Z' })),
      ...extra,
    }
  }

  it('mostra o que já pode ser postado', () => {
    const vitrine = fotosDaVitrine([foto('a', [EU, ELA]), foto('b', [EU])], EU, 2)

    expect(vitrine!.fase).toBe('liberada')
    expect(vitrine!.fotos.map(f => f.id)).toEqual(['a'])
  })

  it('sem nenhuma liberada, cai para as que esperam o MEU coração', () => {
    const vitrine = fotosDaVitrine([foto('a', [ELA]), foto('b', [EU])], EU, 2)

    expect(vitrine!.fase).toBe('esperando')
    expect(vitrine!.fotos.map(f => f.id)).toEqual(['a'])
  })

  it('vídeo não entra no rodízio', () => {
    expect(fotosDaVitrine([foto('v', [EU, ELA], { tipo: 'video', mime: 'video/mp4' })], EU, 2)).toBeNull()
  })

  it('o rodízio tem teto', () => {
    const muitas = Array.from({ length: 20 }, (_, i) => foto(`f${i}`, [EU, ELA]))
    expect(fotosDaVitrine(muitas, EU, 2)!.fotos).toHaveLength(FOTOS_DA_VITRINE)
  })

  /*
   * O grupo escolhido à mão. O que ele muda em relação ao automático não é só o
   * filtro: é a ausência do plano B — ver o cabeçalho de `fotosDaVitrine`.
   */
  describe('com grupo escolhido', () => {
    const postada = foto('p', [EU, ELA], { postada_em: '2026-09-02T10:00:00Z' })
    const liberada = foto('l', [EU, ELA])
    const esperando = foto('e', [ELA])
    const todas = [postada, liberada, esperando]

    it('"postada" mostra o que já saiu, que o automático nunca alcança', () => {
      const vitrine = fotosDaVitrine(todas, EU, 2, 'postada')

      expect(vitrine!.fase).toBe('postada')
      expect(vitrine!.fotos.map(f => f.id)).toEqual(['p'])
    })

    it('"esperando" é o grupo da galeria, não só o que espera por mim', () => {
      const minha = foto('m', [EU])
      const vitrine = fotosDaVitrine([esperando, minha], EU, 2, 'esperando')

      expect(vitrine!.fotos.map(f => f.id)).toEqual(['e', 'm'])
    })

    it('"todas" ignora a situação, mas não deixa de ignorar vídeo', () => {
      const video = foto('v', [EU, ELA], { tipo: 'video', mime: 'video/mp4' })
      const vitrine = fotosDaVitrine([...todas, video], EU, 2, 'todas')

      expect(vitrine!.fotos.map(f => f.id)).toEqual(['p', 'l', 'e'])
    })

    it('grupo vazio devolve nulo em vez de cair para outro', () => {
      // Com "liberada" existindo, o automático teria algo a mostrar aqui.
      expect(fotosDaVitrine([liberada], EU, 2, 'postada')).toBeNull()
    })
  })
})

describe('musicaDaVitrine', () => {
  const AGORA = new Date('2026-09-03T20:00:00Z').getTime()

  function escuta(extra: Partial<EscutaAgora> & { user_id: string }): EscutaAgora {
    return {
      tocando: false,
      titulo: null,
      artistas: null,
      album: null,
      capa_url: null,
      url_spotify: null,
      atualizado_em: '2026-09-03T20:00:00Z',
      ...extra,
    }
  }

  it('quem está tocando agora aparece ao vivo, pelo primeiro nome', () => {
    const musica = musicaDaVitrine(
      [escuta({ user_id: ELA, tocando: true, titulo: 'Get Lucky', artistas: 'Daft Punk' })],
      membros,
      [],
      EU,
      AGORA,
      LIMITE_AO_VIVO,
    )

    expect(musica!.origem).toBe('escuta')
    expect(musica!.quem).toBe('Ana')
    expect(musica!.aoVivo).toBe(true)
    expect(musica!.quando).toBeNull()
  })

  it('faixa antiga continua sendo a resposta — só deixa de ser "agora"', () => {
    const musica = musicaDaVitrine(
      [escuta({
        user_id: ELA,
        tocando: true,
        titulo: 'Get Lucky',
        atualizado_em: '2026-09-03T17:00:00Z',
      })],
      membros,
      [],
      EU,
      AGORA,
      LIMITE_AO_VIVO,
    )

    expect(musica!.aoVivo).toBe(false)
    expect(musica!.quando).toBe('há 3 horas')
  })

  it('linha sem título (ninguém tocando) não conta, e o catálogo assume', () => {
    const musica = musicaDaVitrine(
      [escuta({ user_id: ELA })],
      membros,
      [item('m1', 'Random Access Memories', [])],
      EU,
      AGORA,
      LIMITE_AO_VIVO,
    )

    expect(musica!.origem).toBe('catalogo')
    expect(musica!.titulo).toBe('Random Access Memories')
    expect(musica!.quem).toBeNull()
  })

  it('sem escuta e sem catálogo, o card não inventa nada', () => {
    expect(musicaDaVitrine([], membros, [], EU, AGORA, LIMITE_AO_VIVO)).toBeNull()
  })
})

describe('roteiroDaVitrine', () => {
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
      liberado_em: null,
      criado_por: EU,
      created_at: '2026-08-01T12:00:00Z',
      updated_at: '2026-08-01T12:00:00Z',
      ...extra,
    }
  }

  it('a próxima viagem ganha da que já passou', () => {
    const escolha = roteiroDaVitrine([
      roteiro({ id: 'passada', data_inicio: '2026-07-01', data_fim: '2026-07-05' }),
      roteiro({ id: 'proxima', data_inicio: '2026-12-12' }),
    ], HOJE)

    expect(escolha!.roteiro.id).toBe('proxima')
    expect(escolha!.momento).toBe('proxima')
  })

  it('sem nada marcado, mostra a última que aconteceu', () => {
    const escolha = roteiroDaVitrine([
      roteiro({ id: 'antiga', data_inicio: '2026-01-01', data_fim: '2026-01-05' }),
      roteiro({ id: 'recente', data_inicio: '2026-07-01', data_fim: '2026-07-05' }),
    ], HOJE)

    expect(escolha!.roteiro.id).toBe('recente')
    expect(escolha!.momento).toBe('passada')
  })

  it('o segredo não chega ao painel, mesmo sendo a próxima viagem', () => {
    const escolha = roteiroDaVitrine([
      roteiro({ id: 'segredo', data_inicio: '2026-09-10', visibilidade: 'segredo' }),
      roteiro({ id: 'aberta', data_inicio: '2026-12-12' }),
    ], HOJE)

    expect(escolha!.roteiro.id).toBe('aberta')
  })

  it('só segredo é o mesmo que nada', () => {
    expect(roteiroDaVitrine([roteiro({ visibilidade: 'segredo', data_inicio: '2026-09-10' })], HOJE)).toBeNull()
  })

  it('roteiro sem data nenhuma ainda vale um mapa', () => {
    const escolha = roteiroDaVitrine([roteiro({ id: 'sonho' })], HOJE)

    expect(escolha!.momento).toBe('sem-data')
  })
})

describe('interessesDaVitrine', () => {
  function interesse(id: string, estado: InteresseComAgrupamentos['estado']): InteresseComAgrupamentos {
    return {
      id,
      space_id: 'casal',
      criado_por: EU,
      titulo: `Interesse ${id}`,
      destino: 'compra',
      estado,
      para_quem: null,
      para_quem_user_id: null,
      observacao: null,
      assumido_por: null,
      assumido_em: null,
      convertido_em: null,
      convertido_tipo: null,
      convertido_ref_id: null,
      created_at: '2026-08-01T12:00:00Z',
      updated_at: '2026-08-01T12:00:00Z',
      agrupamentos: [],
      compartilhamentos: [],
    }
  }

  it('a quantidade acompanha o tamanho do cartão', () => {
    const abertos = Array.from({ length: 6 }, (_, i) => interesse(`i${i}`, 'rascunho'))

    expect(interessesDaVitrine(abertos)).toHaveLength(4)
    expect(interessesDaVitrine(abertos, 2)).toHaveLength(2)
    expect(interessesDaVitrine(abertos, 8)).toHaveLength(6)
  })

  it('só os estados abertos, e no máximo quatro', () => {
    const vitrine = interessesDaVitrine([
      interesse('a', 'rascunho'),
      interesse('b', 'arquivado'),
      interesse('c', 'amadurecendo'),
      interesse('d', 'convertido'),
      interesse('e', 'rascunho'),
      interesse('f', 'rascunho'),
      interesse('g', 'rascunho'),
      interesse('h', 'rascunho'),
    ])

    expect(vitrine.map(i => i.id)).toEqual(['a', 'c', 'e', 'f'])
  })
})
