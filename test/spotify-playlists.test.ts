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
import { linhasDePlaylist, normalizarPlaylists } from '~~/server/utils/spotify-playlists'

const EU = 'user-1'
const AGORA = '2026-08-16T12:00:00.000Z'

type Bruta = Parameters<typeof normalizarPlaylists>[0][number]

function playlist(id: string, extra: Partial<Bruta> = {}): Bruta {
  return {
    id,
    name: `Playlist ${id}`,
    tracks: { total: 3 },
    external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
    ...extra,
  }
}

/** O caminho real: o que veio do Spotify normalizado e virado linha de banco. */
function linhas(brutas: Bruta[]) {
  return linhasDePlaylist(normalizarPlaylists(brutas), EU, AGORA)
}

describe('normalizarPlaylists', () => {
  it('descarta a playlist repetida entre páginas, ficando com a primeira', () => {
    const lista = normalizarPlaylists([
      playlist('a'),
      playlist('b'),
      playlist('a', { name: 'veio de novo' }),
    ])

    expect(lista).toHaveLength(2)
    expect(lista.map(p => p.spotify_id)).toEqual(['a', 'b'])
    expect(lista[0]?.nome).toBe('Playlist a')
  })

  it('ignora item sem id em vez de devolver lixo', () => {
    const lista = normalizarPlaylists([
      playlist('a'),
      { id: '' } as Bruta,
      null as unknown as Bruta,
    ])

    expect(lista.map(p => p.spotify_id)).toEqual(['a'])
  })

  it('não deixa playlist sem nome virar linha em branco', () => {
    expect(normalizarPlaylists([playlist('a', { name: '   ' })])[0]?.nome).toBe('Sem nome')
  })

  it('escolhe a menor capa que ainda serve de miniatura', () => {
    const [p] = normalizarPlaylists([playlist('a', {
      images: [
        { url: 'https://i.scdn.co/60', width: 60 },
        { url: 'https://i.scdn.co/300', width: 300 },
        { url: 'https://i.scdn.co/640', width: 640 },
      ],
    })])

    expect(p?.capa_url).toBe('https://i.scdn.co/300')
  })

  it('traz o dono, que é o que separa "minhas" das que eu só sigo', () => {
    const [minha] = normalizarPlaylists([playlist('a', { owner: { display_name: 'Bixo Pingo' } })])
    const [semDono] = normalizarPlaylists([playlist('b', { owner: { display_name: '  ' } })])

    expect(minha?.dono).toBe('Bixo Pingo')
    expect(semDono?.dono).toBeNull()
  })
})

describe('linhasDePlaylist', () => {
  it('nunca devolve duas linhas com a mesma chave de conflito', () => {
    const chaves = linhas([playlist('x'), playlist('x'), playlist('x')])
      .map(l => `${l.user_id}:${l.spotify_id}`)

    expect(chaves).toHaveLength(1)
    expect(new Set(chaves).size).toBe(chaves.length)
  })

  it('traduz os campos, com padrão para o que o Spotify omite', () => {
    expect(linhas([playlist('a')])[0]).toMatchObject({
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

  it('aceita lista vazia sem inventar linha', () => {
    expect(linhas([])).toEqual([])
  })
})
