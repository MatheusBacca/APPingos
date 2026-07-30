export type TipoMidia = 'filme' | 'serie' | 'livro' | 'musica' | 'jogo'
export type StatusItem = 'quero' | 'vendo' | 'visto' | 'abandonei'

export const STATUS_ROTULO: Record<StatusItem, string> = {
  quero: 'Quero ver',
  vendo: 'Vendo',
  visto: 'Visto',
  abandonei: 'Abandonei',
}

export interface MediaItem {
  id: string
  tipo: TipoMidia
  titulo: string
  titulo_original: string | null
  ano: number | null
  capa_url: string | null
  sinopse: string | null
  metadados: Record<string, unknown>
}

export interface Avaliacao {
  user_id: string
  status: StatusItem
  nota: number | null
  resenha: string | null
  visto_em: string | null
}

export interface ItemDoEspaco {
  id: string
  created_at: string
  media: MediaItem
  avaliacoes: Avaliacao[]
}

/** Payload aceito pela RPC adicionar_item. */
export interface ItemParaAdicionar {
  tipo: TipoMidia
  fonte: string
  fonte_id: string
  titulo: string
  titulo_original?: string | null
  ano?: number | null
  capa_url?: string | null
  sinopse?: string | null
  metadados?: Record<string, unknown>
}
