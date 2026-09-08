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
  /**
   * Só Livros usa: em que página a pessoa está.
   *
   * Vive aqui, e não num tipo à parte, porque é uma coluna de `rating` como as
   * outras — e `rating` é uma tabela só para os três tipos. Filme e música
   * simplesmente a deixam nula.
   */
  pagina_atual: number | null
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
  /** Quem marcou, já reunido: "Ana e Bruno" quando os dois marcaram o mesmo dia. */
  quem: string
  tom: 'planejado' | 'visto'
}

/**
 * Os marcadores do calendário: UM POR ITEM E POR TOM, e não um por pessoa.
 *
 * A bolinha responde "aconteceu alguma coisa neste dia", e o que acontece é com
 * o filme, não com cada membro do espaço. Uma linha por avaliação — que é o
 * formato cru do banco — punha duas bolinhas verdes no dia em que o casal viu um
 * filme JUNTO, e o calendário passava a contar pessoas: dois filmes marcados e
 * um filme assistido a dois davam o mesmo desenho, que é exatamente a confusão
 * que a bolinha existe para evitar.
 *
 * Reunir aqui, e não no componente do calendário, é o que faz a regra ser
 * testável fora do Nuxt e valer igual para o rótulo de leitor de tela — que
 * antes repetia o mesmo título uma vez por membro.
 */
export function marcadoresDoCalendario(
  itens: ItemDoEspaco[],
  nomeDe: (userId: string) => string,
): MarcadorDia[] {
  const porChave = new Map<string, MarcadorDia & { nomes: string[] }>()

  const somar = (item: ItemDoEspaco, data: string, tom: MarcadorDia['tom'], userId: string) => {
    const chave = `${data}|${item.id}|${tom}`
    const existente = porChave.get(chave)

    if (existente) {
      if (!existente.nomes.includes(nomeDe(userId))) existente.nomes.push(nomeDe(userId))
      return
    }

    porChave.set(chave, {
      data,
      entryId: item.id,
      titulo: item.media.titulo,
      quem: '',
      tom,
      nomes: [nomeDe(userId)],
    })
  }

  for (const item of itens) {
    for (const av of item.avaliacoes) {
      if (av.planejado_para) somar(item, av.planejado_para, 'planejado', av.user_id)
      if (av.visto_em) somar(item, av.visto_em, 'visto', av.user_id)
    }
  }

  return [...porChave.values()].map(({ nomes, ...marcador }) => ({
    ...marcador,
    quem: juntarNomes(nomes),
  }))
}

/** "Ana", "Ana e Bruno", "Ana, Bruno e Carla" — a vírgula de lista em português. */
function juntarNomes(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? ''
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
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
