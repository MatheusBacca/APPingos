/**
 * O lote de playlists que vai para o upsert.
 *
 * Este arquivo nasceu de um bug em produção (2026-08-16): a primeira
 * sincronização real morreu com
 *
 *   ON CONFLICT DO UPDATE command cannot affect row a second time
 *
 * que é o que o Postgres diz quando um único INSERT traz duas linhas caindo na
 * mesma chave de conflito. O `/me/playlists` do Spotify pagina por offset, então
 * uma playlist criada ou apagada entre uma página e outra reaparece — e o lote
 * inteiro é recusado, não só a linha repetida.
 */
import { describe, expect, it } from 'vitest'
import { linhasDePlaylist } from '~~/server/utils/spotify-playlists'

const EU = 'user-1'
const AGORA = '2026-08-16T12:00:00.000Z'

type Bruta = Parameters<typeof linhasDePlaylist>[0][number]

function playlist(id: string, extra: Partial<Bruta> = {}): Bruta {
  return {
    id,
    name: `Playlist ${id}`,
    tracks: { total: 3 },
    external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
    ...extra,
  }
}

describe('linhasDePlaylist', () => {
  it('descarta a playlist repetida entre páginas, ficando com a primeira', () => {
    const linhas = linhasDePlaylist(
      [playlist('a'), playlist('b'), playlist('a', { name: 'veio de novo' })],
      EU,
      AGORA,
    )

    expect(linhas).toHaveLength(2)
    expect(linhas.map(l => l.spotify_id)).toEqual(['a', 'b'])
    expect(linhas[0]?.nome).toBe('Playlist a')
  })

  it('não deixa passar duas linhas com a mesma chave de conflito', () => {
    const linhas = linhasDePlaylist(
      [playlist('x'), playlist('x'), playlist('x')],
      EU,
      AGORA,
    )

    const chaves = linhas.map(l => `${l.user_id}:${l.spotify_id}`)
    expect(new Set(chaves).size).toBe(chaves.length)
  })

  it('ignora item sem id em vez de gravar lixo', () => {
    const linhas = linhasDePlaylist(
      [playlist('a'), { id: '' } as Bruta, null as unknown as Bruta],
      EU,
      AGORA,
    )

    expect(linhas.map(l => l.spotify_id)).toEqual(['a'])
  })

  it('traduz os campos, com padrão para o que o Spotify omite', () => {
    const [linha] = linhasDePlaylist([playlist('a')], EU, AGORA)

    expect(linha).toMatchObject({
      user_id: EU,
      spotify_id: 'a',
      nome: 'Playlist a',
      descricao: null,
      capa_url: null,
      total_faixas: 3,
      publica: false,
      colaborativa: false,
      sincronizado_em: AGORA,
    })
  })

  it('não deixa playlist sem nome virar linha em branco', () => {
    const [linha] = linhasDePlaylist([playlist('a', { name: '   ' })], EU, AGORA)
    expect(linha?.nome).toBe('Sem nome')
  })

  it('escolhe a menor capa que ainda serve de miniatura', () => {
    const [linha] = linhasDePlaylist([playlist('a', {
      images: [
        { url: 'https://i.scdn.co/60', width: 60 },
        { url: 'https://i.scdn.co/300', width: 300 },
        { url: 'https://i.scdn.co/640', width: 640 },
      ],
    })], EU, AGORA)

    expect(linha?.capa_url).toBe('https://i.scdn.co/300')
  })

  it('aceita lista vazia sem inventar linha', () => {
    expect(linhasDePlaylist([], EU, AGORA)).toEqual([])
  })
})
