/**
 * "O que fulano está ouvindo agora."
 *
 * O Spotify NÃO tem webhook de now-playing: a única forma é perguntar. A
 * pergunta é feita aqui, no servidor, e por conta de QUEM ESTÁ OLHANDO — não de
 * quem está ouvindo.
 *
 * Isso é o que faz a coisa funcionar no caso que interessa: a outra pessoa
 * ouvindo no carro, com o APPingos fechado. O token dela já está no banco
 * (cifrado), e a RPC `token_de_escuta` entrega esse token cifrado a quem divide
 * um espaço com ela E tem a autorização dela ligada. Nenhum processo roda
 * sozinho: ninguém olhando, nenhuma chamada ao Spotify.
 */
import type { H3Event } from 'h3'
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'
import { chamarSpotify, erroSpotify } from '~~/server/utils/spotify'
import { trocarCifradoPorAcesso, usuarioDaRequisicao } from '~~/server/utils/spotify-conta'

interface TocandoAgora {
  is_playing?: boolean
  progress_ms?: number | null
  item?: {
    id?: string | null
    name?: string
    duration_ms?: number
    artists?: Array<{ name?: string }>
    album?: { name?: string, images?: Array<{ url: string, width?: number }> }
    external_urls?: { spotify?: string }
  } | null
}

/** A menor capa acima de 160px — a escuta aparece em miniatura, na sidebar. */
function capaDe(imagens: Array<{ url: string, width?: number }> | undefined): string | null {
  if (!imagens?.length) return null

  const ordenadas = [...imagens].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
  const cabe = ordenadas.find(img => (img.width ?? 0) >= 160)
  return (cabe ?? ordenadas[ordenadas.length - 1])?.url ?? null
}

/**
 * Pergunta o now-playing de UMA pessoa e grava.
 *
 * Devolve `false` quando não deu para perguntar (sem autorização, token que não
 * abre, Spotify fora do ar). Não lança: numa varredura de espaço, a pessoa que
 * falhou não pode derrubar a leitura das outras.
 */
async function atualizarUm(event: H3Event, userId: string): Promise<boolean> {
  const supabase = await serverSupabaseClient<Database>(event)

  const { data: cifrado, error } = await supabase.rpc('token_de_escuta', { p_user: userId })

  // `null` aqui é a resposta normal para "não autorizou" ou "não conectou" — a
  // RPC filtra por `mostrar_escuta` e por dividir espaço.
  if (error || !cifrado) return false

  try {
    const { resposta } = await trocarCifradoPorAcesso(event, cifrado)

    /*
     * 204 sem corpo é a resposta do Spotify para "nada tocando agora", e é um
     * caso comum, não um erro. O `$fetch` devolve vazio, e o registro vira
     * `tocando: false` — que é o que a tela precisa para dizer "não está
     * ouvindo" em vez de congelar na última faixa.
     */
    const agora = await chamarSpotify<TocandoAgora | null>(
      '/me/player/currently-playing',
      resposta.access_token,
      { market: 'BR' },
    )

    const faixa = agora?.item
    const { error: erroRegistro } = await supabase.rpc('registrar_escuta', {
      p_user: userId,
      p_dados: {
        tocando: !!agora?.is_playing && !!faixa?.id,
        spotify_track_id: faixa?.id ?? null,
        titulo: faixa?.name ?? null,
        artistas: (faixa?.artists ?? []).map(a => a.name).filter(Boolean).join(', ') || null,
        album: faixa?.album?.name ?? null,
        capa_url: capaDe(faixa?.album?.images),
        url_spotify: faixa?.external_urls?.spotify ?? null,
        progresso_ms: agora?.progress_ms ?? null,
        duracao_ms: faixa?.duration_ms ?? null,
      } as never,
    })

    return !erroRegistro
  }
  catch {
    return false
  }
}

/**
 * Atualiza a escuta de todo mundo do espaço que autorizou.
 *
 * Em sequência, e não em paralelo: são duas pessoas num espaço de casal, e
 * disparar tudo junto a cada 20 segundos é o caminho mais curto para o 429.
 */
export async function atualizarEscutaDoEspaco(
  event: H3Event,
  spaceId: string,
): Promise<number> {
  await usuarioDaRequisicao(event)
  const supabase = await serverSupabaseClient<Database>(event)

  // A RLS de `membership` só devolve os membros de espaços de que você
  // participa — um `space_id` de fora simplesmente não traz ninguém.
  const { data: membros, error } = await supabase
    .from('membership')
    .select('user_id')
    .eq('space_id', spaceId)

  if (error) throw erroSpotify(500, `Não deu para ler os membros: ${error.message}`)

  let atualizados = 0
  for (const membro of membros ?? []) {
    if (await atualizarUm(event, membro.user_id)) atualizados++
  }

  return atualizados
}
