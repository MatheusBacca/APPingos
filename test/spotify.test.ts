/**
 * A tradução do Spotify para o formato do app.
 *
 * O que está coberto aqui é o que o shape da API do Spotify tem de traiçoeiro e
 * que o TMDB não tinha: `release_date` com três precisões diferentes, a lista de
 * capas cuja ordem não está no contrato, e o álbum que não pode repetir o
 * próprio nome na legenda.
 */
import { describe, expect, it } from 'vitest'
import { creditos, intercalar, normalizarAlbum, normalizarFaixa } from '~~/server/utils/spotify'

const CAPA_640 = 'https://i.scdn.co/image/640'
const CAPA_300 = 'https://i.scdn.co/image/300'
const CAPA_64 = 'https://i.scdn.co/image/64'

/*
 * Os shapes crus do Spotify não são exportados de propósito — eles são um
 * detalhe do proxy. `Parameters<...>` dá acesso a eles aqui sem abrir o tipo
 * para o resto do app.
 */
type FaixaBruta = Parameters<typeof normalizarFaixa>[0]
type AlbumBruto = Parameters<typeof normalizarAlbum>[0]

function faixaBruta(extra: Partial<FaixaBruta> = {}): FaixaBruta {
  return {
    id: '4LRPiXqCikLlN15c3yImP7',
    name: 'Everything In Its Right Place',
    artists: [{ name: 'Radiohead' }],
    duration_ms: 251_000,
    external_urls: { spotify: 'https://open.spotify.com/track/4LRPiXqCikLlN15c3yImP7' },
    album: {
      id: '6GjwtEZcfenmOf6l18N7T7',
      name: 'Kid A',
      release_date: '2000-10-02',
      images: [{ url: CAPA_300, width: 300 }, { url: CAPA_640, width: 640 }, { url: CAPA_64, width: 64 }],
    },
    ...extra,
  }
}

function albumBruto(extra: Partial<AlbumBruto> = {}): AlbumBruto {
  return {
    id: '6GjwtEZcfenmOf6l18N7T7',
    name: 'Kid A',
    artists: [{ name: 'Radiohead' }],
    release_date: '2000-10-02',
    total_tracks: 10,
    images: [{ url: CAPA_640, width: 640 }],
    external_urls: { spotify: 'https://open.spotify.com/album/6GjwtEZcfenmOf6l18N7T7' },
    ...extra,
  }
}

describe('normalizarFaixa', () => {
  it('traduz a faixa inteira para o formato do app', () => {
    expect(normalizarFaixa(faixaBruta())).toEqual({
      tipo: 'musica',
      formato: 'faixa',
      fonte: 'spotify',
      fonte_id: '4LRPiXqCikLlN15c3yImP7',
      titulo: 'Everything In Its Right Place',
      artistas: ['Radiohead'],
      album: 'Kid A',
      ano: 2000,
      capa_url: CAPA_640,
      duracao_ms: 251_000,
      url_spotify: 'https://open.spotify.com/track/4LRPiXqCikLlN15c3yImP7',
    })
  })

  it('lê o ano nas três precisões que o release_date pode ter', () => {
    const anoDe = (release_date: string) =>
      normalizarFaixa(faixaBruta({ album: { id: 'a', name: 'A', release_date } })).ano

    expect(anoDe('2000')).toBe(2000)
    expect(anoDe('2000-10')).toBe(2000)
    expect(anoDe('2000-10-02')).toBe(2000)
  })

  it('não quebra quando o álbum, a data ou os artistas não vêm', () => {
    const magra = normalizarFaixa({ id: 'x'.repeat(22), name: '' })

    expect(magra.titulo).toBe('Sem título')
    expect(magra.artistas).toEqual([])
    expect(magra.album).toBeNull()
    expect(magra.ano).toBeNull()
    expect(magra.capa_url).toBeNull()
    expect(magra.duracao_ms).toBeNull()
    expect(magra.url_spotify).toBeNull()
  })

  it('mantém todos os creditados, na ordem em que vieram', () => {
    const feat = normalizarFaixa(faixaBruta({
      artists: [{ name: 'Thom Yorke' }, { name: 'Burial' }, { name: 'Four Tet' }],
    }))

    expect(feat.artistas).toEqual(['Thom Yorke', 'Burial', 'Four Tet'])
    expect(creditos(feat.artistas)).toBe('Thom Yorke, Burial, Four Tet')
  })
})

describe('escolha da capa', () => {
  it('pega a maior que ainda cabe numa miniatura, mesmo fora de ordem', () => {
    const fora = normalizarFaixa(faixaBruta({
      album: {
        id: 'a',
        name: 'A',
        images: [{ url: CAPA_64, width: 64 }, { url: CAPA_640, width: 640 }, { url: CAPA_300, width: 300 }],
      },
    }))

    expect(fora.capa_url).toBe(CAPA_640)
  })

  it('cai na menor disponível quando todas passam do limite', () => {
    const gigantes = normalizarFaixa(faixaBruta({
      album: {
        id: 'a',
        name: 'A',
        images: [{ url: 'https://i.scdn.co/image/2000', width: 2000 }, { url: 'https://i.scdn.co/image/1000', width: 1000 }],
      },
    }))

    expect(gigantes.capa_url).toBe('https://i.scdn.co/image/1000')
  })

  it('aceita imagem sem largura declarada em vez de devolver undefined', () => {
    const semLargura = normalizarFaixa(faixaBruta({
      album: { id: 'a', name: 'A', images: [{ url: CAPA_300 }] },
    }))

    expect(semLargura.capa_url).toBe(CAPA_300)
  })
})

describe('normalizarAlbum', () => {
  it('não repete o nome do álbum no campo de álbum', () => {
    const album = normalizarAlbum(albumBruto())

    expect(album.titulo).toBe('Kid A')
    expect(album.album).toBeNull()
    expect(album.formato).toBe('album')
    // A busca não traz as faixas, então não há duração a somar.
    expect(album.duracao_ms).toBeNull()
  })
})

describe('intercalar', () => {
  const f = (n: string) => normalizarFaixa(faixaBruta({ id: n, name: n }))
  const a = (n: string) => normalizarAlbum(albumBruto({ id: n, name: n }))

  it('alterna faixa e álbum para o disco não ficar depois de vinte faixas', () => {
    const juntos = intercalar([f('f1'), f('f2')], [a('a1'), a('a2')])

    expect(juntos.map(r => r.titulo)).toEqual(['f1', 'a1', 'f2', 'a2'])
  })

  it('deixa a lista mais longa seguir sozinha quando a outra acaba', () => {
    expect(intercalar([f('f1'), f('f2'), f('f3')], [a('a1')]).map(r => r.titulo))
      .toEqual(['f1', 'a1', 'f2', 'f3'])

    expect(intercalar([], [a('a1'), a('a2')]).map(r => r.titulo))
      .toEqual(['a1', 'a2'])

    expect(intercalar([], [])).toEqual([])
  })
})
