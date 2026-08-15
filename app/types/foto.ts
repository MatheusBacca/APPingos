/**
 * A foto como dado, e a regra que decide se ela pode ser postada.
 *
 * Tudo aqui é puro e testado em `test/fotos.test.ts`, e o motivo é a própria
 * pergunta do módulo: "aprovada" não é uma coluna que a tela lê, é uma contagem
 * comparada com o tamanho do espaço. Essa comparação aparece na galeria, no
 * filtro, no resumo do painel e no card — quatro lugares onde escrevê-la de novo
 * significaria quatro chances de escrevê-la diferente.
 *
 * O banco também mantém `aprovada_em` (ver a migration 20260815120000_fotos.sql),
 * e as duas fontes não competem: a coluna é a verdade gravada, usada para ordenar
 * e para disparar a notificação; `situacaoDaFoto` é a mesma regra vista pela tela,
 * que precisa responder no instante do clique, antes de o banco confirmar.
 */

export type TipoMidia = 'imagem' | 'video'

export interface Curtida {
  foto_id: string
  user_id: string
  created_at: string
}

export interface Foto {
  id: string
  space_id: string
  enviada_por: string
  caminho: string
  /** O envio de que esta foto fez parte. Ver 20260815160000_fotos_lote.sql. */
  lote_id: string
  tipo: TipoMidia
  mime: string
  tamanho: number | null
  /** O nome que o arquivo tinha no aparelho. Só serve ao download. */
  nome_original: string | null
  legenda: string | null
  aprovada_em: string | null
  postada_em: string | null
  created_at: string
  updated_at: string
  curtidas: Curtida[]
}

// ---------------------------------------------------------------------------
// O que o Storage aceita
// ---------------------------------------------------------------------------

/**
 * Os mesmos formatos do `allowed_mime_types` do bucket, e o mesmo teto.
 *
 * Duplicados de propósito: o bucket é quem de fato barra, e esta lista existe
 * para barrar ANTES da subida. Um vídeo de 200 MB rejeitado pelo servidor é a
 * pessoa esperando o upload inteiro para receber um erro — no celular, com dados
 * móveis, isso é o pior desfecho possível.
 *
 * HEIC está na lista porque é o que o iPhone grava por padrão. Ele não renderiza
 * em <img> na maioria dos navegadores, e mesmo assim entra: recusar a foto que o
 * celular acabou de tirar seria recusar o caso mais comum do módulo. O card cai
 * no aviso de "prévia indisponível" e o arquivo continua lá, íntegro, para baixar.
 */
export const MIMES_ACEITOS = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime', 'video/webm',
] as const

/** 50 MB — o teto de um arquivo no plano gratuito do Supabase. */
export const TAMANHO_MAXIMO = 52428800

/** Formatos que o navegador não desenha, ainda que o Storage os guarde. */
const SEM_PREVIA = ['image/heic', 'image/heif']

export function ehVideo(mime: string): boolean {
  return mime.startsWith('video/')
}

export function tipoDoMime(mime: string): TipoMidia {
  return ehVideo(mime) ? 'video' : 'imagem'
}

export function temPrevia(mime: string): boolean {
  return !SEM_PREVIA.includes(mime.toLowerCase())
}

/**
 * O que impede este arquivo de subir, ou `null` quando nada impede.
 *
 * Devolve a frase pronta em vez de um booleano porque quem chama é um formulário
 * com vários arquivos de uma vez: dizer "3 arquivos recusados" sem dizer por quê
 * deixa a pessoa tentando de novo com o mesmo arquivo.
 */
export function motivoParaRecusar(arquivo: { name: string, type: string, size: number }): string | null {
  if (!(MIMES_ACEITOS as readonly string[]).includes(arquivo.type)) {
    return `${arquivo.name}: formato não aceito`
  }

  if (arquivo.size > TAMANHO_MAXIMO) {
    return `${arquivo.name}: passa de ${formatarTamanho(TAMANHO_MAXIMO)}`
  }

  if (arquivo.size === 0) {
    return `${arquivo.name}: arquivo vazio`
  }

  return null
}

/**
 * A extensão que o arquivo terá no bucket.
 *
 * Sai do MIME, e não do nome que veio do celular, porque o nome é entrada de fora
 * e vai para dentro de um caminho de Storage. "foto.jpg.exe" ou um nome com `../`
 * não é uma ameaça teórica quando quem monta o caminho é uma string template.
 */
export function extensaoDoMime(mime: string): string {
  const mapa: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
  }

  return mapa[mime] ?? 'bin'
}

export function formatarTamanho(bytes: number | null): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

// ---------------------------------------------------------------------------
// A situação da foto
// ---------------------------------------------------------------------------

/**
 * As três gavetas da galeria, na ordem em que importam.
 *
 * 'esperando' primeiro porque é a única que pede ação de alguém, e a razão de o
 * módulo existir. 'postada' por último porque é arquivo — o que já saiu não
 * compete pela atenção com o que ainda espera resposta.
 */
export type SituacaoFoto = 'esperando' | 'liberada' | 'postada'

export const SITUACOES: { valor: SituacaoFoto, rotulo: string }[] = [
  { valor: 'esperando', rotulo: 'Esperando curtida' },
  { valor: 'liberada', rotulo: 'Pode postar' },
  { valor: 'postada', rotulo: 'Já postadas' },
]

const SITUACAO_ROTULO = new Map(SITUACOES.map(s => [s.valor, s.rotulo]))

export function rotuloSituacao(situacao: SituacaoFoto): string {
  return SITUACAO_ROTULO.get(situacao) ?? situacao
}

/**
 * Aprovada = TODO MUNDO do espaço curtiu — a mesma regra do trigger no banco.
 *
 * `totalDeMembros` entra como parâmetro em vez de sair de um store porque é o que
 * torna a função testável e porque a resposta de fato depende dele: no espaço
 * pessoal, uma curtida (a automática de quem enviou) já aprova; no do casal,
 * faltam duas. Escrever `curtidas.length >= 2` teria funcionado hoje e mentido
 * para todo espaço que não fosse um casal.
 *
 * `totalDeMembros` desconhecido (0, enquanto a lista de membros carrega) devolve
 * 'esperando': o estado neutro é o que não promete liberação que talvez não haja.
 */
export function situacaoDaFoto(foto: Foto, totalDeMembros: number): SituacaoFoto {
  if (foto.postada_em) return 'postada'
  if (totalDeMembros > 0 && foto.curtidas.length >= totalDeMembros) return 'liberada'
  return 'esperando'
}

export function euCurti(foto: Foto, userId: string | null): boolean {
  return !!userId && foto.curtidas.some(c => c.user_id === userId)
}

/** Quem ainda não curtiu — é o que o card usa para dizer de quem se espera. */
export function faltamCurtir(foto: Foto, membros: { user_id: string }[]): string[] {
  const curtiram = new Set(foto.curtidas.map(c => c.user_id))
  return membros.filter(m => !curtiram.has(m.user_id)).map(m => m.user_id)
}

export interface GrupoDeFotos {
  situacao: SituacaoFoto
  rotulo: string
  itens: Foto[]
}

/**
 * A galeria agrupada, já sem os grupos vazios.
 *
 * Devolver só o que tem conteúdo é o que permite o template varrer os grupos sem
 * um `v-if` por seção — e é o que faz a tela de quem nunca postou nada não
 * mostrar um cabeçalho "Já postadas" com nada embaixo.
 */
export function agruparPorSituacao(fotos: Foto[], totalDeMembros: number): GrupoDeFotos[] {
  return SITUACOES
    .map(({ valor, rotulo }) => ({
      situacao: valor,
      rotulo,
      itens: fotos.filter(f => situacaoDaFoto(f, totalDeMembros) === valor),
    }))
    .filter(g => g.itens.length > 0)
}

export function contarPorSituacao(
  fotos: Foto[],
  totalDeMembros: number,
): Record<SituacaoFoto, number> {
  const contagem: Record<SituacaoFoto, number> = { esperando: 0, liberada: 0, postada: 0 }
  for (const foto of fotos) contagem[situacaoDaFoto(foto, totalDeMembros)] += 1
  return contagem
}

// ---------------------------------------------------------------------------
// O lote
// ---------------------------------------------------------------------------

export interface GrupoDeLote {
  loteId: string
  /** Quem mandou — todas as fotos de um lote vêm da mesma pessoa. */
  enviadaPor: string
  /** O `created_at` da primeira, que é o instante do envio inteiro. */
  quando: string
  /** A legenda do lote: a primeira que existir entre as fotos dele. */
  legenda: string | null
  itens: Foto[]
}

/**
 * As fotos separadas pelo envio de que fizeram parte.
 *
 * Preserva a ordem em que as fotos chegaram em vez de reordenar por data: a
 * consulta já vem em `created_at desc`, então o primeiro lote a aparecer é o mais
 * recente, e dentro dele a ordem é a do envio. Reordenar aqui refaria (pior) um
 * trabalho que o índice do banco já fez.
 *
 * A legenda do lote é a primeira preenchida, e não a da primeira foto: o envio em
 * lote grava a mesma legenda em todas, mas editar uma delas depois é o caso normal
 * — e um lote perderia seu título só porque a foto de cima foi a editada.
 */
export function agruparPorLote(fotos: Foto[]): GrupoDeLote[] {
  const porLote = new Map<string, GrupoDeLote>()

  for (const foto of fotos) {
    const grupo = porLote.get(foto.lote_id)

    if (grupo) {
      grupo.itens.push(foto)
      grupo.legenda ??= foto.legenda
      continue
    }

    porLote.set(foto.lote_id, {
      loteId: foto.lote_id,
      enviadaPor: foto.enviada_por,
      quando: foto.created_at,
      legenda: foto.legenda,
      itens: [foto],
    })
  }

  return [...porLote.values()]
}

// ---------------------------------------------------------------------------
// Baixar
// ---------------------------------------------------------------------------

/**
 * O nome com que o arquivo chega na pasta de downloads.
 *
 * O que está no bucket se chama `<uuid>.jpg`, e baixar quarenta desses é o mesmo
 * que não poder baixar. Então o nome do aparelho é preferido — "IMG_0042.HEIC" diz
 * de onde a foto veio — e o gerado entra quando ele não existe (as fotos que
 * subiram antes desta coluna existir).
 *
 * A limpeza não é cosmética: este nome vai para o cabeçalho `Content-Disposition`
 * da URL assinada. Barra, contrabarra, aspas e quebra de linha saem porque são o
 * que transformaria um nome de arquivo em outro cabeçalho — e porque um nome com
 * `/` também é um caminho.
 */
export function nomeParaBaixar(foto: Foto, indice = 0): string {
  const limpo = (foto.nome_original ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F"\\/]/g, '')
    .trim()
    .slice(0, 120)

  if (limpo) return limpo

  const dia = foto.created_at.slice(0, 10)
  return `appingos-${dia}-${indice + 1}.${extensaoDoMime(foto.mime)}`
}

/**
 * As que esperam o coração de QUEM ESTÁ OLHANDO.
 *
 * Diferente de "esperando": uma foto que eu já curti e o outro não também está
 * esperando, e mostrá-la como pendência minha me faria procurar um botão que não
 * existe. Esta é a lista que vale como chamado à ação — e é dela que sai a linha
 * do painel.
 */
export function esperandoPorMim(fotos: Foto[], userId: string | null, totalDeMembros: number): Foto[] {
  if (!userId) return []
  return fotos.filter(f => situacaoDaFoto(f, totalDeMembros) === 'esperando' && !euCurti(f, userId))
}
