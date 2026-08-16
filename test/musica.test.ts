/**
 * A leitura dos metadados de música.
 *
 * `media_item.metadados` é um jsonb livre, escrito por uma RPC que aceita
 * qualquer coisa — do lado do app ele chega como `Record<string, unknown>` e
 * não há tipo nenhum garantindo o que tem lá dentro. Estes testes travam as
 * duas consequências: nada aqui pode estourar com dado torto, e o link "Abrir
 * no Spotify" não pode virar um href arbitrário.
 */
import { describe, expect, it } from 'vitest'
import { albumDe, artistasDe, creditos, duracaoDe, formatoDe, legendaDe, urlSpotifyDe } from '~/lib/musica'

describe('formatoDe', () => {
  it('distingue álbum de faixa, e assume faixa no silêncio', () => {
    expect(formatoDe({ formato: 'album' })).toBe('album')
    expect(formatoDe({ formato: 'faixa' })).toBe('faixa')
    // Item antigo, gravado antes de o campo existir.
    expect(formatoDe({})).toBe('faixa')
    expect(formatoDe({ formato: 'disco-de-vinil' })).toBe('faixa')
  })
})

describe('artistasDe', () => {
  it('devolve os nomes na ordem', () => {
    expect(artistasDe({ artistas: ['Radiohead', 'Björk'] })).toEqual(['Radiohead', 'Björk'])
  })

  it('devolve lista vazia em vez de estourar com dado torto', () => {
    expect(artistasDe({})).toEqual([])
    expect(artistasDe({ artistas: null })).toEqual([])
    expect(artistasDe({ artistas: 'Radiohead' })).toEqual([])
    expect(artistasDe({ artistas: [] })).toEqual([])
  })

  it('descarta o que não é nome dentro da lista', () => {
    expect(artistasDe({ artistas: ['Radiohead', null, '', 42, 'Björk'] })).toEqual(['Radiohead', 'Björk'])
  })
})

describe('urlSpotifyDe', () => {
  it('aceita o link de verdade', () => {
    const url = 'https://open.spotify.com/track/4LRPiXqCikLlN15c3yImP7'
    expect(urlSpotifyDe({ url_spotify: url })).toBe(url)
  })

  it('recusa qualquer coisa que não seja um link do Spotify', () => {
    // eslint-disable-next-line no-script-url -- é exatamente o que está sendo barrado
    expect(urlSpotifyDe({ url_spotify: 'javascript:alert(1)' })).toBeNull()
    expect(urlSpotifyDe({ url_spotify: 'http://open.spotify.com/track/x' })).toBeNull()
    expect(urlSpotifyDe({ url_spotify: 'https://open.spotify.com.evil.test/track/x' })).toBeNull()
    expect(urlSpotifyDe({ url_spotify: 42 })).toBeNull()
    expect(urlSpotifyDe({})).toBeNull()
  })
})

describe('duracaoDe', () => {
  it('formata como minuto:segundo, com dois dígitos no segundo', () => {
    expect(duracaoDe({ duracao_ms: 251_000 })).toBe('4:11')
    expect(duracaoDe({ duracao_ms: 65_000 })).toBe('1:05')
    expect(duracaoDe({ duracao_ms: 600_000 })).toBe('10:00')
  })

  it('não mostra duração quando não há duração', () => {
    expect(duracaoDe({})).toBeNull()
    expect(duracaoDe({ duracao_ms: 0 })).toBeNull()
    expect(duracaoDe({ duracao_ms: null })).toBeNull()
    expect(duracaoDe({ duracao_ms: '251000' })).toBeNull()
    expect(duracaoDe({ duracao_ms: Number.NaN })).toBeNull()
  })
})

describe('legendaDe', () => {
  it('junta artista, álbum e ano', () => {
    expect(legendaDe({
      ano: 2000,
      metadados: { artistas: ['Radiohead'], album: 'Kid A' },
    })).toBe('Radiohead · Kid A · 2000')
  })

  it('não deixa separador solto quando falta uma parte', () => {
    expect(legendaDe({ ano: 2000, metadados: { artistas: ['Radiohead'] } }))
      .toBe('Radiohead · 2000')

    expect(legendaDe({ ano: null, metadados: { artistas: ['Radiohead'], album: 'Kid A' } }))
      .toBe('Radiohead · Kid A')

    expect(legendaDe({ ano: null, metadados: {} })).toBe('')
  })
})

describe('albumDe e creditos', () => {
  it('trata o álbum ausente e o vazio do mesmo jeito', () => {
    expect(albumDe({ album: 'Kid A' })).toBe('Kid A')
    expect(albumDe({ album: '' })).toBeNull()
    expect(albumDe({})).toBeNull()
  })

  it('lista os creditados separados por vírgula', () => {
    expect(creditos(['Thom Yorke', 'Burial'])).toBe('Thom Yorke, Burial')
    expect(creditos([])).toBe('')
  })
})
