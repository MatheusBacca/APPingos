export type TipoMidia = 'filme' | 'serie' | 'livro' | 'musica' | 'jogo'
export type StatusItem = 'quero' | 'vendo' | 'visto' | 'abandonei'

// Mesmos rótulos dos recortes da tela de Filmes (ver `app/lib/recortes.ts`),
// para o mesmo estado não ter dois nomes no app.
export const STATUS_ROTULO: Record<StatusItem, string> = {
  quero: 'Quero ver',
  vendo: 'Assistindo',
  visto: 'Assistido',
  abandonei: 'Abandonei',
}

/**
 * O mesmo estado, com o verbo de quem ouve.
 *
 * Os quatro valores do banco (`quero`/`vendo`/`visto`/`abandonei`) são um
 * check constraint em `rating` e continuam valendo para tudo — mudar só o
 * rótulo é o que permite música e filme dividirem o motor sem a tela de
 * Músicas dizer "Assistido" para um disco.
 *
 * `abandonei` vira "Não curti": largar no meio é uma coisa que acontece com
 * uma série de oito horas, não com uma faixa de três minutos. O que a pessoa
 * quer registrar ali é que não colou.
 */
export const STATUS_ROTULO_MUSICA: Record<StatusItem, string> = {
  quero: 'Quero ouvir',
  vendo: 'Ouvindo',
  visto: 'Já ouvi',
  abandonei: 'Não curti',
}

export interface MediaItem {
  id: string
  tipo: TipoMidia
  /**
   * De onde o item veio e o id dele lá — `('spotify', '4LRPiXqCik...')`.
   *
   * Vem junto na leitura porque é a única chave estável para a tela saber "isto
   * que apareceu na busca já está na nossa lista". Título + ano não serve para
   * música: um álbum e a faixa que dá nome a ele têm os dois iguais.
   */
  fonte: string
  fonte_id: string
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
  /** Datas em ISO curto (YYYY-MM-DD) — são `date` no banco, sem fuso. */
  planejado_para: string | null
  visto_em: string | null
  /** Carimbo do "Enviar". Preenchido = nota e resenha não mudam mais. */
  enviado_em: string | null
}

export interface ItemDoEspaco {
  id: string
  created_at: string
  media: MediaItem
  avaliacoes: Avaliacao[]
}

/** Um item marcado num dia do calendário. */
export interface MarcadorDia {
  /** YYYY-MM-DD */
  data: string
  entryId: string
  titulo: string
  /** Nome de quem marcou — no espaço de casal, a mesma data pode ser de um só. */
  quem: string
  tom: 'planejado' | 'visto'
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
