/**
 * Leitura do que o módulo de Músicas guardou em `media_item.metadados`.
 *
 * O motor de catálogo é genérico: `metadados` é um `jsonb` livre, e do lado do
 * app chega como `Record<string, unknown>`. Estas funções são a única porta de
 * entrada desses campos — sem elas, cada tela faria o próprio cast e a primeira
 * faixa sem artista (existe: podcast, faixa de acervo) derrubaria a página com
 * "undefined is not iterable".
 */
import type { FormatoMusica } from '~~/server/utils/spotify'
import type { MediaItem } from '~/types/catalogo'

// Reexportado para as telas não precisarem saber que o tipo nasce no servidor.
export type { FormatoMusica }

export const FORMATO_ROTULO: Record<FormatoMusica, string> = {
  faixa: 'Faixa',
  album: 'Álbum',
}

/** Faixa é o padrão: item antigo sem o campo veio de uma busca de faixa. */
export function formatoDe(metadados: Record<string, unknown>): FormatoMusica {
  return metadados.formato === 'album' ? 'album' : 'faixa'
}

export function artistasDe(metadados: Record<string, unknown>): string[] {
  const bruto = metadados.artistas
  if (!Array.isArray(bruto)) return []
  return bruto.filter((a): a is string => typeof a === 'string' && a.length > 0)
}

export function albumDe(metadados: Record<string, unknown>): string | null {
  return typeof metadados.album === 'string' && metadados.album ? metadados.album : null
}

export function urlSpotifyDe(metadados: Record<string, unknown>): string | null {
  const url = metadados.url_spotify
  // Só https do domínio do Spotify: o valor vem do banco, e o banco é escrito
  // por uma RPC que aceita qualquer jsonb. Um `javascript:` aqui viraria XSS
  // no href do "Abrir no Spotify".
  if (typeof url !== 'string') return null
  return url.startsWith('https://open.spotify.com/') ? url : null
}

export function duracaoDe(metadados: Record<string, unknown>): string | null {
  const ms = metadados.duracao_ms
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null

  const total = Math.round(ms / 1000)
  const minutos = Math.floor(total / 60)
  const segundos = total % 60
  return `${minutos}:${String(segundos).padStart(2, '0')}`
}

/** "Fulano, Sicrano" — os creditados na ordem em que o Spotify devolveu. */
export function creditos(artistas: string[]): string {
  return artistas.join(', ')
}

/**
 * A linha abaixo do título: quem toca, de que disco e de quando.
 *
 * Sem o nome do álbum quando ele É o álbum, e sem o ano quando não veio — o
 * separador some junto, para não sobrar um "· " pendurado.
 */
export function legendaDe(media: Pick<MediaItem, 'ano' | 'metadados'>): string {
  const metadados = media.metadados
  const partes = [
    creditos(artistasDe(metadados)),
    albumDe(metadados),
    media.ano ? String(media.ano) : null,
  ]
  return partes.filter(Boolean).join(' · ')
}
