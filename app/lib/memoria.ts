/**
 * A memória da viagem como dado, e as regras que não precisam do Vue para valer.
 *
 * Duas perguntas moram aqui, e as duas são feias de resolver na tela:
 *
 *   1. QUAIS SEÇÕES OFERECER. A memória sugere os dias entre `data_inicio` e
 *      `data_fim` do roteiro, mas só vira linha no banco o que for de fato
 *      escrito — não é obrigatório escrever sobre todos os dias. A sugestão é
 *      derivada, então ela precisa ser recalculada a cada mexida, e um `for` de
 *      datas escrito dentro de um `computed` é onde a virada de mês costuma
 *      passar batida.
 *
 *   2. ONDE CADA SEÇÃO CAI NA FOLHA A4. O documento é impresso, e o navegador
 *      quebra páginas por conta própria de um jeito que ninguém escolheu — uma
 *      foto sozinha no topo da folha 3, o rótulo do sábado no rodapé da 2. A
 *      distribuição é ESTIMADA aqui, por peso de conteúdo, e não medida no DOM:
 *      medir o DOM mediria errado antes de as imagens carregarem, que é
 *      exatamente quando a paginação é calculada.
 *
 * A estimativa é aproximada por construção — é o preço de não medir. As duas
 * válvulas que tornam o erro inofensivo estão na tela: a quebra automática do
 * navegador dentro de uma seção grande demais, e o "começar em nova folha"
 * manual, que ganha da conta sempre que a conta não agradar.
 */
import { partesDaData } from '~/lib/datas'

export type TipoItemMemoria = 'foto' | 'playlist' | 'musica'

/** Uma seção como ela existe no banco. */
export interface SecaoDaMemoria {
  id: string
  ordem: number
  /** Nula = seção sem data ("A volta", "No geral"). */
  data: string | null
  /** Nulo = o rótulo sai da data. */
  titulo: string | null
  texto: string | null
  /** A válvula manual da paginação — ver `paginar`. */
  nova_folha: boolean
}

/** O que a tela manda para a RPC `salvar_secoes`. O `id` vai junto: ver a migration. */
export interface SecaoParaSalvar {
  id: string
  data: string | null
  titulo: string | null
  texto: string | null
  nova_folha: boolean
}

export interface ItemDaMemoria {
  id: string
  /** Nulo = item solto, presos à memória e não a um dia. */
  secao_id: string | null
  ordem: number
  tipo: TipoItemMemoria
  foto_id: string | null
  caminho: string | null
  playlist_id: string | null
  spotify_id: string | null
  titulo: string | null
  subtitulo: string | null
  capa_url: string | null
  url_spotify: string | null
  legenda: string | null
}

export interface Memoria {
  id: string
  roteiro_id: string
  nota: number | null
  concluida_em: string | null
  criada_por: string
  created_at: string
  updated_at: string
}

export interface MemoriaCompleta extends Memoria {
  secoes: SecaoDaMemoria[]
  itens: ItemDaMemoria[]
}

// ---------------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------------

/**
 * "Sexta-feira, 21 de agosto" — o rótulo que o papel imprime.
 *
 * Sem passar por `new Date(iso)`: num fuso a oeste isso interpreta em UTC e
 * devolve o dia anterior. É a mesma lição de `app/lib/datas.ts`, e ela vale em
 * dobro aqui — a data errada num documento impresso não tem como ser corrigida
 * depois de entregue.
 */
export function rotuloDaData(iso: string): string {
  const { ano, mes, dia } = partesDaData(iso)
  const texto = new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return `${texto.charAt(0).toUpperCase()}${texto.slice(1)}`
}

/**
 * Como a seção se chama no documento.
 *
 * O título escrito à mão ganha da data — quem digitou "O dia da chuva" quis
 * aquilo, e não "Domingo, 23 de agosto". Sem título e sem data sobra "Sem data",
 * que é honesto: a seção existe, ela só não está presa a um dia.
 */
export function rotuloDaSecao(secao: Pick<SecaoDaMemoria, 'titulo' | 'data'>): string {
  const titulo = secao.titulo?.trim()
  if (titulo) return titulo
  return secao.data ? rotuloDaData(secao.data) : 'Sem data'
}

/** A seção tem alguma coisa dentro? Vazia, ela não merece virar linha no banco. */
export function secaoVazia(
  secao: Pick<SecaoDaMemoria, 'titulo' | 'texto'>,
  itens: ItemDaMemoria[] = [],
): boolean {
  return !secao.titulo?.trim() && !secao.texto?.trim() && itens.length === 0
}

// ---------------------------------------------------------------------------
// Os dias que a viagem teve
// ---------------------------------------------------------------------------

/**
 * Teto de dias sugeridos.
 *
 * Um roteiro com `data_fim` digitada errada ("2036" no lugar de "2026") pediria
 * quatro mil sugestões de seção e travaria a aba. O teto transforma um erro de
 * digitação numa lista longa demais — visível, e sem travar nada.
 */
export const MAX_DIAS_SUGERIDOS = 60

/**
 * As datas da viagem, de `data_inicio` a `data_fim`, inclusive nas duas pontas.
 *
 * Sem `data_inicio` não há dia nenhum a sugerir: um roteiro sem data é um plano
 * que ainda não tem quando, e a memória dele começa com uma seção sem data.
 * Sem `data_fim`, a viagem é de um dia só até que se diga o contrário.
 */
export function diasDaViagem(dataInicio: string | null, dataFim: string | null): string[] {
  if (!dataInicio) return []

  const inicio = partesDaData(dataInicio)
  const dias: string[] = []
  // `new Date(a, m, d)` é sempre horário local e normaliza a virada de mês.
  const cursor = new Date(inicio.ano, inicio.mes - 1, inicio.dia)
  const fim = dataFim ?? dataInicio

  while (dias.length < MAX_DIAS_SUGERIDOS) {
    const mes = String(cursor.getMonth() + 1).padStart(2, '0')
    const dia = String(cursor.getDate()).padStart(2, '0')
    const iso = `${cursor.getFullYear()}-${mes}-${dia}`

    dias.push(iso)
    if (iso >= fim) break

    cursor.setDate(cursor.getDate() + 1)
  }

  return dias
}

/**
 * Os dias da viagem que ainda não viraram seção.
 *
 * É o que a tela oferece como sugestão vazia ("Sexta-feira, 21 de agosto —
 * escrever"). Escrever cria a linha; não escrever não cria nada, e o dia
 * continua sendo oferecido enquanto sobrar.
 */
export function diasSemSecao(
  secoes: Pick<SecaoDaMemoria, 'data'>[],
  dataInicio: string | null,
  dataFim: string | null,
): string[] {
  const usados = new Set(secoes.map(s => s.data).filter((d): d is string => !!d))

  return diasDaViagem(dataInicio, dataFim).filter(d => !usados.has(d))
}

// ---------------------------------------------------------------------------
// O papel
// ---------------------------------------------------------------------------

/** Uma seção junto do que está pendurado nela — o bloco que a folha recebe. */
export interface BlocoDaMemoria {
  secao: SecaoDaMemoria | null
  itens: ItemDaMemoria[]
}

/**
 * A memória em blocos, na ordem em que o papel a imprime.
 *
 * O último bloco pode ter `secao: null` — são os itens SOLTOS, anexados à
 * memória e não a um dia. Eles existem porque a playlist da viagem inteira não
 * pertence a nenhuma tarde específica, e escondê-los até que alguém escreva uma
 * seção faria a pessoa anexar a playlist e não vê-la em lugar nenhum.
 */
export function blocosDaMemoria(
  secoes: SecaoDaMemoria[],
  itens: ItemDaMemoria[],
): BlocoDaMemoria[] {
  const porSecao = new Map<string, ItemDaMemoria[]>()
  const soltos: ItemDaMemoria[] = []

  for (const item of [...itens].sort((a, b) => a.ordem - b.ordem)) {
    if (!item.secao_id) {
      soltos.push(item)
      continue
    }
    porSecao.set(item.secao_id, [...(porSecao.get(item.secao_id) ?? []), item])
  }

  const blocos: BlocoDaMemoria[] = [...secoes]
    .sort((a, b) => a.ordem - b.ordem)
    .map(secao => ({ secao, itens: porSecao.get(secao.id) ?? [] }))

  if (soltos.length) blocos.push({ secao: null, itens: soltos })

  return blocos
}

/**
 * As medidas da folha, em milímetros, para a conta de paginação.
 *
 * Parâmetro e não constante embutida pelo mesmo motivo de `hoje` em
 * `agruparPorDia`: uma função que lê o próprio mundo não é testável sem
 * congelar esse mundo. Aqui o mundo são as dimensões do papel — e um teste que
 * dependesse dos números reais quebraria junto com o primeiro ajuste de CSS.
 */
export interface DimensoesDoPapel {
  /** Altura útil de uma folha A4, já descontadas as margens de impressão. */
  alturaUtil: number
  /** O cabeçalho do documento — nome da viagem, datas, nota. Só na folha 1. */
  cabecalho: number
  /** O rótulo de uma seção. */
  rotulo: number
  /** Altura de uma linha de texto manuscrito. */
  linha: number
  /** Quantos caracteres cabem numa linha, na largura útil. */
  colunas: number
  /** Altura de uma fileira de fotos. */
  foto: number
  /** Fotos lado a lado numa fileira. */
  fotosPorLinha: number
  /** Altura de uma música ou playlist anexada. */
  musica: number
  /** O respiro depois de cada seção. */
  espaco: number
}

/**
 * Os números reais do `MemoriaPapel.vue`, em mm.
 *
 * A4 tem 297 mm; `alturaUtil` já desconta as margens de 22 mm em cima e embaixo.
 * Os demais saem do CSS do componente e são estimativas honestas, não medidas —
 * mexer no tamanho da fonte do papel pede mexer em `linha` e `colunas` aqui.
 */
export const PAPEL: DimensoesDoPapel = {
  alturaUtil: 253,
  cabecalho: 46,
  rotulo: 13,
  linha: 7.5,
  colunas: 54,
  foto: 54,
  fotosPorLinha: 3,
  musica: 17,
  espaco: 9,
}

/**
 * Quantas linhas o texto ocupa, contando as quebras que a pessoa digitou.
 *
 * Cada parágrafo vale pelo menos uma linha, inclusive o vazio: uma linha em
 * branco entre dois parágrafos é espaço que o papel de fato gasta, e ignorá-la
 * faria toda memória com respiro entre parágrafos estourar a folha.
 */
export function linhasDeTexto(texto: string | null, colunas: number): number {
  if (!texto) return 0

  return texto
    .split('\n')
    .reduce((total, paragrafo) => total + Math.max(1, Math.ceil(paragrafo.length / colunas)), 0)
}

/** A altura estimada de um bloco na folha, em mm. */
export function alturaDoBloco(bloco: BlocoDaMemoria, dim: DimensoesDoPapel): number {
  const fotos = bloco.itens.filter(i => i.tipo === 'foto').length
  const musicas = bloco.itens.length - fotos

  return (
    (bloco.secao ? dim.rotulo : 0)
    + linhasDeTexto(bloco.secao?.texto ?? null, dim.colunas) * dim.linha
    + Math.ceil(fotos / dim.fotosPorLinha) * dim.foto
    + musicas * dim.musica
    + dim.espaco
  )
}

export interface FolhaDaMemoria {
  /** 1, 2, 3… — o número impresso no rodapé. */
  numero: number
  blocos: BlocoDaMemoria[]
}

/**
 * Os blocos distribuídos em folhas A4.
 *
 * O algoritmo é o mais simples que responde ao problema: vai enchendo a folha
 * corrente e vira a página quando o bloco seguinte não cabe. Nada de procurar a
 * melhor distribuição global — o documento é lido na ordem, e uma seção
 * empurrada para trás "porque coube melhor" seria o sábado depois do domingo.
 *
 * Três regras, e cada uma existe por um caso concreto:
 *
 *   - `nova_folha` na seção força a virada. É a válvula manual, e ela ganha da
 *     conta sempre: a estimativa não sabe que aquela foto é a foto do documento
 *     e merece abrir a página.
 *   - Um bloco MAIOR que a folha inteira (o dia em que se escreveu três
 *     páginas) fica sozinho na dele e deixa o navegador quebrar dentro — é o que
 *     `break-inside: auto` faz no CSS. Depois dele a folha corrente está
 *     estourada por definição, então a próxima começa em branco.
 *   - A folha 1 é mais curta que as outras: ela carrega o cabeçalho. Sem isto o
 *     primeiro dia sempre transbordava, e sempre por pouco.
 *
 * Sem blocos nenhum, devolve UMA folha vazia — o documento em branco ainda é um
 * documento, e a tela precisa de uma folha para desenhar o cabeçalho.
 */
export function paginar(
  blocos: BlocoDaMemoria[],
  dim: DimensoesDoPapel = PAPEL,
): FolhaDaMemoria[] {
  const folhas: FolhaDaMemoria[] = [{ numero: 1, blocos: [] }]
  let disponivel = dim.alturaUtil - dim.cabecalho

  for (const bloco of blocos) {
    const altura = alturaDoBloco(bloco, dim)
    const atual = folhas[folhas.length - 1]!
    const forcada = bloco.secao?.nova_folha ?? false

    // Virar a folha só faz sentido se a corrente já tiver alguma coisa: uma
    // folha em branco seguida de outra em branco é uma folha em branco a mais no
    // PDF, e ninguém pediu isso.
    if (atual.blocos.length && (forcada || altura > disponivel)) {
      folhas.push({ numero: folhas.length + 1, blocos: [bloco] })
      disponivel = dim.alturaUtil - altura
    }
    else {
      atual.blocos.push(bloco)
      disponivel -= altura
    }

    // O bloco que não cabe numa folha inteira gasta o resto dela por definição.
    // Deixar `disponivel` negativo já faria o próximo virar a página; zerar aqui
    // é só dizer isso em voz alta.
    if (altura > dim.alturaUtil) disponivel = 0
  }

  return folhas
}
