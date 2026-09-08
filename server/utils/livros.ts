import type { H3Event } from 'h3'

/**
 * A busca de livros — Open Library.
 *
 * POR QUE NÃO GOOGLE BOOKS, que era a primeira escolha. O endpoint dele
 * responde sem chave, mas as chamadas anônimas do mundo inteiro entram numa
 * cota diária COMPARTILHADA: o erro que ele devolve nomeia o projeto
 * (`consumer 'project_number:624717413613'`), que não é nosso. Na prática isso
 * significa 429 em horário movimentado, por culpa de terceiros — foi o que
 * aconteceu no primeiro teste, e nenhum retry resolvia.
 *
 * Open Library não tem cota nem chave. Perde em sinopse (a busca não devolve
 * descrição, que vem numa segunda chamada) e o catálogo é mais irregular fora
 * do inglês. Mas o que a estante precisa — título, autor, ano, páginas e capa —
 * veio completo no primeiro resultado de todos os títulos em português que
 * testamos: Torto Arado, A Hora da Estrela, Quarto de Despejo, Capitães da
 * Areia.
 *
 * A troca também apaga uma dependência de configuração: não há `.env` para
 * preencher, e o módulo funciona no dia 1 de verdade.
 */

const BASE = 'https://openlibrary.org'
const CAPAS = 'https://covers.openlibrary.org/b/id'

/** Formato que a tela consome — traduzido, sem vazar o shape de nenhuma fonte. */
export interface ResultadoBuscaLivro {
  tipo: 'livro'
  /**
   * Qual catálogo respondeu. Fica guardado no item porque o `fonte_id` só faz
   * sentido junto dela: `OL27448W` é da Open Library, `zyTCAlFPjgYC` é do
   * Google — e a estante pode ter livros das duas, de épocas diferentes.
   */
  fonte: 'open-library' | 'google-books'
  /** Open Library: a chave da obra sem `/works/`. Google: o id do volume. */
  fonte_id: string
  titulo: string
  autores: string[]
  ano: number | null
  capa_url: string | null
  sinopse: string | null
  paginas: number | null
}

interface DocBusca {
  key?: string
  title?: string
  author_name?: string[]
  first_publish_year?: number
  cover_i?: number
  number_of_pages_median?: number
}

interface RespostaBusca {
  docs?: DocBusca[]
}

/**
 * A descrição da obra vem em dois formatos conforme a idade do registro: uma
 * string crua nos antigos, um objeto `{ type, value }` nos novos. Os dois estão
 * vivos na base, então os dois precisam ser tratados.
 */
type Descricao = string | { value?: string } | undefined

interface Obra {
  description?: Descricao
  covers?: number[]
}

export function erroLivros(statusCode: number, texto: string) {
  return createError({ statusCode, statusMessage: texto, message: texto })
}

/** `/works/OL27448W` → `OL27448W`. É o que vai em `fonte_id`. */
export function idDaObra(key: string | undefined): string | null {
  if (!key) return null
  const id = key.replace(/^\/works\//, '').trim()
  return id || null
}

/**
 * A capa em tamanho grande.
 *
 * `-L` e não `-M`: a estante desenha capas de ~150px de largura em tela retina,
 * e a média (180px) fica visivelmente borrada. A grande tem ~500px e é o que a
 * Open Library serve mais rápido depois da miniatura.
 */
export function capaDaObra(coverId: number | undefined): string | null {
  return coverId ? `${CAPAS}/${coverId}-L.jpg` : null
}

export function textoDaDescricao(descricao: Descricao): string | null {
  if (typeof descricao === 'string') return descricao.trim() || null
  if (descricao && typeof descricao === 'object') return descricao.value?.trim() || null
  return null
}

/**
 * Tira autor repetido, inclusive quando a diferença é só o acento.
 *
 * A Open Library guarda variações do mesmo nome como entradas distintas —
 * "Itamar Vieira Junior" e "Itamar Vieira Júnior" vieram juntos no primeiro
 * teste, e um `Set` cru não pega isso porque as duas strings são diferentes de
 * verdade. A comparação é feita sobre a forma sem acento e em minúsculas.
 *
 * A grafia PRESERVADA é a primeira que aparecer, e não a "correta": não há como
 * saber qual é, e a Open Library ordena por relevância — a primeira costuma ser
 * a mais usada.
 */
export function autoresUnicos(nomes: string[]): string[] {
  const vistos = new Set<string>()
  const saida: string[] = []

  for (const nome of nomes.filter(Boolean)) {
    const chave = nome
      .normalize('NFD')
      // Tira os diacríticos que o NFD separou — "Júnior" e "Junior" viram a
      // mesma chave.
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()

    if (vistos.has(chave)) continue
    vistos.add(chave)
    saida.push(nome)
  }

  return saida
}

export function normalizarDoc(doc: DocBusca): ResultadoBuscaLivro | null {
  const id = idDaObra(doc.key)
  // Sem id não dá para adicionar (é a chave em `fonte_id`), e sem título não há
  // o que mostrar na estante.
  if (!id || !doc.title) return null

  return {
    tipo: 'livro',
    fonte: 'open-library',
    fonte_id: id,
    titulo: doc.title,
    autores: autoresUnicos(doc.author_name ?? []),
    ano: doc.first_publish_year ?? null,
    capa_url: capaDaObra(doc.cover_i),
    // A busca não devolve descrição — ela vem em `detalharLivro`, na hora de
    // pôr o livro na estante.
    sinopse: null,
    paginas: doc.number_of_pages_median && doc.number_of_pages_median > 0
      ? doc.number_of_pages_median
      : null,
  }
}

/** "Fulano e Sicrano", "Fulano, Sicrano e Beltrano" — o crédito da capa. */
export function creditoDeAutores(autores: string[]): string {
  if (!autores.length) return 'Autoria desconhecida'
  if (autores.length === 1) return autores[0]!
  return `${autores.slice(0, -1).join(', ')} e ${autores[autores.length - 1]}`
}

async function openLibrary<T>(caminho: string, params: Record<string, string> = {}): Promise<T> {
  try {
    return await $fetch<T>(`${BASE}${caminho}`, { query: params }) as T
  }
  catch (e: unknown) {
    const status = (e as { status?: number }).status ?? 502

    // O status vai na mensagem pelo mesmo motivo do spotify.ts: 404 (obra
    // sumiu) e 5xx se comportam igual daqui, e sem o número não há como saber
    // qual é sem instrumentar de novo.
    throw erroLivros(status, `Falha ao consultar a Open Library (${status})`)
  }
}

/**
 * O título principal, sem subtítulo nem selo de edição.
 *
 * A Open Library casa a string inteira, então o título completo de uma capa
 * brasileira não acha NADA: "O Caibalion: Um estudo da filosofia hermética do
 * Antigo Egito e da Grécia - Edição especial" devolve zero, enquanto "O
 * Caibalion" devolve oito — sendo um deles exatamente aquela edição.
 *
 * E copiar o título inteiro da livraria é o gesto mais natural que existe. Sem
 * este corte, a busca falha justamente para quem sabe exatamente o que quer.
 *
 * Corta no primeiro `:`, `–`, `—` ou ` - ` — os quatro separadores que as capas
 * usam antes de subtítulo e selo. Devolve `null` quando não há o que cortar,
 * para o chamador saber que não adianta tentar de novo.
 */
export function tituloPrincipal(termo: string): string | null {
  const cabeca = termo.split(/\s[–—]\s|\s-\s|:/)[0]?.trim()
  if (!cabeca || cabeca === termo.trim()) return null
  // Uma palavra curta ("O", "A") não é busca; seria pior que não achar nada.
  return cabeca.length >= 3 ? cabeca : null
}

/**
 * Busca livros por termo livre, com uma segunda tentativa mais curta.
 *
 * `fields` enxuga a resposta de propósito: sem ele a Open Library devolve
 * dezenas de campos por resultado (edições, ISBNs, assuntos) e a busca fica
 * lenta em conexão de celular. Aqui vêm só os cinco que a estante desenha.
 *
 * A segunda tentativa só acontece quando a primeira volta VAZIA e há subtítulo
 * a cortar — nunca encurta uma busca que já achou algo, e não custa requisição
 * nenhuma no caso comum.
 */
export async function buscarLivros(event: H3Event, termo: string): Promise<ResultadoBuscaLivro[]> {
  const { googleBooksApiKey } = useRuntimeConfig(event)

  const naOpenLibrary = async (q: string) => {
    const data = await openLibrary<RespostaBusca>('/search.json', {
      q,
      limit: '20',
      fields: 'key,title,author_name,first_publish_year,cover_i,number_of_pages_median',
    })

    return (data.docs ?? [])
      .map(normalizarDoc)
      .filter((l): l is ResultadoBuscaLivro => l !== null)
  }

  /*
   * O Google primeiro, quando há chave: ele tem capa e sinopse de muito mais
   * edição brasileira, que é o que faz a estante parecer uma estante.
   *
   * A falha dele NÃO derruba a busca. Cota estourada, chave revogada e serviço
   * fora se parecem daqui, e em todos os casos a resposta certa é a mesma —
   * seguir com a Open Library, que não tem cota. Melhor um resultado sem capa
   * que uma tela de erro.
   */
  if (googleBooksApiKey) {
    try {
      const doGoogle = await buscarNoGoogle(googleBooksApiKey, termo)
      if (doGoogle.length) return doGoogle
    }
    catch {
      // Segue para a Open Library.
    }
  }

  const achados = await naOpenLibrary(termo)
  if (achados.length) return achados

  const curto = tituloPrincipal(termo)
  if (!curto) return achados

  // O corte do subtítulo vale para as duas fontes: o Google também devolve
  // vazio para o título inteiro de capa em alguns casos.
  if (googleBooksApiKey) {
    try {
      const doGoogle = await buscarNoGoogle(googleBooksApiKey, curto)
      if (doGoogle.length) return doGoogle
    }
    catch {
      // Segue para a Open Library.
    }
  }

  return naOpenLibrary(curto)
}

// ---------------------------------------------------------------------------
// Google Books — a fonte melhor, quando há chave
// ---------------------------------------------------------------------------

const GOOGLE = 'https://www.googleapis.com/books/v1'

interface VolumeInfo {
  title?: string
  subtitle?: string
  authors?: string[]
  publishedDate?: string
  description?: string
  pageCount?: number
  imageLinks?: Record<string, string>
}

interface Volume {
  id?: string
  volumeInfo?: VolumeInfo
}

/**
 * A capa do Google, no maior tamanho que ele oferecer.
 *
 * DUAS CORREÇÕES NO URL, e as duas são necessárias:
 *
 *   1. `http:` → `https:`. O Google ainda devolve links inseguros, e o
 *      navegador bloqueia imagem em HTTP dentro de página HTTPS — a capa
 *      simplesmente não aparece, sem erro visível.
 *   2. `&edge=curl` sai fora. É um efeito de "página dobrada" que ele aplica na
 *      miniatura; num grid de capas lê como defeito de imagem.
 */
export function capaDoVolume(imageLinks: Record<string, string> | undefined): string | null {
  if (!imageLinks) return null

  const ordem = ['extraLarge', 'large', 'medium', 'small', 'thumbnail', 'smallThumbnail']
  const bruto = ordem.map(k => imageLinks[k]).find(Boolean)
  if (!bruto) return null

  return bruto
    .replace(/^http:/, 'https:')
    /*
     * Os três casos, e não só `&edge=curl`.
     *
     * O parâmetro pode ser o primeiro da query (`?edge=curl&zoom=1`), o do meio
     * (`&edge=curl&`) ou o último (`?edge=curl`). Tratar só a forma com `&` na
     * frente — como estava — deixava a página dobrada aparecer justamente nas
     * URLs em que `edge` vem primeiro, e o teste pegou isso.
     */
    .replace(/&edge=curl/g, '')
    .replace(/\?edge=curl&/g, '?')
    .replace(/\?edge=curl$/g, '')
}

/**
 * `publishedDate` vem como YYYY, YYYY-MM ou YYYY-MM-DD conforme a editora
 * informou — os quatro primeiros dígitos servem nos três casos.
 */
export function anoDoVolume(publicado: string | undefined): number | null {
  const ano = publicado ? Number.parseInt(publicado.slice(0, 4), 10) : Number.NaN
  return Number.isFinite(ano) ? ano : null
}

export function normalizarVolume(volume: Volume): ResultadoBuscaLivro | null {
  const info = volume.volumeInfo
  if (!volume.id || !info?.title) return null

  return {
    tipo: 'livro',
    fonte: 'google-books',
    fonte_id: volume.id,
    titulo: info.title,
    autores: autoresUnicos(info.authors ?? []),
    ano: anoDoVolume(info.publishedDate),
    capa_url: capaDoVolume(info.imageLinks),
    // A sinopse vem junto aqui, ao contrário da Open Library — uma chamada a
    // menos na hora de pôr na estante.
    sinopse: info.description?.trim() || null,
    paginas: info.pageCount && info.pageCount > 0 ? info.pageCount : null,
  }
}

/**
 * Busca no Google Books. Só é chamada quando há chave — ver `buscarLivros`.
 *
 * `printType=books` tira revista e periódico, que poluem a busca por autor.
 * `langRestrict` fica de fora de propósito: ele corta traduções e edições
 * importadas que estão justamente na estante de quem lê nos dois idiomas.
 */
async function buscarNoGoogle(chave: string, termo: string): Promise<ResultadoBuscaLivro[]> {
  const data = await $fetch<{ items?: Volume[] }>(`${GOOGLE}/volumes`, {
    query: {
      q: termo,
      printType: 'books',
      orderBy: 'relevance',
      maxResults: '20',
      key: chave,
    },
  })

  return (data.items ?? [])
    .map(normalizarVolume)
    .filter((l): l is ResultadoBuscaLivro => l !== null)
}

/**
 * A sinopse de uma obra — a segunda chamada, feita só ao pôr o livro na estante.
 *
 * Não é feita durante a busca de propósito: seriam vinte requisições por tecla
 * digitada para um texto que a lista nem mostra. Uma por livro adicionado é
 * barato e é onde a sinopse passa a valer.
 *
 * Devolve `null` em qualquer falha em vez de estourar: sinopse é enfeite, e um
 * livro sem ela entra na estante igual. Derrubar o "pôr na estante" por causa
 * de um texto seria trocar o essencial pelo acessório.
 */
export async function sinopseDaObra(id: string): Promise<string | null> {
  try {
    const obra = await openLibrary<Obra>(`/works/${encodeURIComponent(id)}.json`)
    return textoDaDescricao(obra.description)
  }
  catch {
    return null
  }
}
