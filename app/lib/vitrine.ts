/**
 * O que cada card do painel MOSTRA — a escolha, sem o desenho.
 *
 * O painel tem duas camadas de conteúdo, e elas respondem a perguntas
 * diferentes. `types/resumo.ts` é a camada de TEXTO: números que cabem numa
 * linha e valem igual na sidebar e no cartão ("Pendente · Agosto, −R$ 50"). A
 * vitrine é a camada VISUAL, e só existe no dashboard: a capa do filme, a foto,
 * o mapa, a barra do mês. Uma não substitui a outra — o cartão mostra as duas.
 *
 * A escolha de cada vitrine mora aqui, e não dentro do componente, pelo mesmo
 * motivo dos resumos: é a regra que decide o que a pessoa vê de relance, é a que
 * mais tende a mudar, e é a única parte testável sem subir o Nuxt. O componente
 * fica com o que é de fato dele — a imagem, a barra, o mapa.
 *
 * Toda função aqui é pura e recebe `hoje`/`agora` por parâmetro: sem isso os
 * testes viram o tipo que falha sozinho quando a suíte roda perto da meia-noite.
 */
import { formatarDiaCurto, formatarMes, mesAbreviado, somarMeses, tempoRelativo } from '@/lib/datas'
import { albumDe, artistasDe, creditos, urlSpotifyDe } from '@/lib/musica'
import { itemNoRecorte } from '@/lib/recortes'
import type { ItemDoEspaco } from '~/types/catalogo'
import type { Foto } from '~/types/foto'
import { esperandoPorMim, situacaoDaFoto } from '~/types/foto'
import type { EstadoInteresse, InteresseComAgrupamentos } from '~/types/interesse'
import { ESTADOS_ABERTOS } from '~/types/interesse'
import type { Roteiro } from '~/types/viagem'
import { proximaViagem, separarPorTempo } from '~/types/viagem'
import type { InjectionKey, Ref } from 'vue'
import type { PontoMensal } from '~/composables/useOrcamento'
import type { Membro } from '~/composables/useMembros'
import type { EscutaAgora } from '~/composables/useSpotify'

// ---------------------------------------------------------------------------
// O espaço que o cartão dá à vitrine
// ---------------------------------------------------------------------------

/**
 * Quanto espaço a vitrine tem para preencher.
 *
 * `altura: null` quer dizer "o cartão cresce com o conteúdo" — é o padrão, e nele
 * a vitrine NÃO pode decidir quantos itens mostrar pela altura: mais itens
 * deixariam o cartão mais alto, que daria mais espaço, que pediria mais itens.
 * Um número só entra aqui quando a pessoa fixou a altura no modo de ajuste, e aí
 * a caixa é firme: o conteúdo se ajusta a ela, e não o contrário.
 *
 * A largura é sempre um número — ela vem da coluna da grade, nunca do conteúdo,
 * então não há laço nenhum em usá-la.
 */
export interface EspacoDaVitrine {
  largura: number
  altura: number | null
}

export const ESPACO_INDEFINIDO: EspacoDaVitrine = { largura: 0, altura: null }

/** O cartão fornece; cada vitrine injeta se souber o que fazer com isso. */
export const ESPACO_DA_VITRINE: InjectionKey<Ref<EspacoDaVitrine>> = Symbol('espaço da vitrine')

export interface CabemNaCaixa {
  /** Quantas colunas desenhar — é o `grid-template-columns` da vitrine. */
  colunas: number
  linhas: number
  /** Quantos itens buscar, já com piso e teto aplicados. */
  total: number
}

/**
 * Quantos itens cabem na caixa — colunas pela largura, linhas pela altura.
 *
 * `minimo` existe porque um cartão pequeno ainda precisa dizer alguma coisa: uma
 * vitrine que mostrasse zero cartazes seria só um título. `maximo` existe pelo
 * motivo oposto — um cartão esticado até o rodapé da tela não deve virar a
 * listagem inteira do módulo, que é o que a tela do módulo já faz melhor.
 *
 * `linhas` nos limites é o palpite para o cartão de altura natural, onde medir a
 * altura seria morder o próprio rabo (ver `EspacoDaVitrine`).
 *
 * Devolve as colunas junto com o total porque as duas coisas têm de concordar:
 * uma vitrine que buscasse seis itens e desenhasse quatro colunas deixaria a
 * última fileira pela metade sempre.
 */
export function quantosCabem(
  espaco: EspacoDaVitrine,
  item: {
    largura: number
    /**
     * Altura de um item — ou como calculá-la a partir da largura da coluna.
     *
     * A função existe por causa do cartaz: ele é 2:3, então a altura dele DEPENDE
     * de quantas colunas couberam. Com um número fixo, duas colunas largas
     * cabiam "duas fileiras" que na hora de desenhar não cabiam, e a segunda
     * saía cortada pela borda do cartão.
     */
    altura: number | ((larguraDaColuna: number) => number)
  },
  limites: {
    minimo: number
    maximo: number
    colunas?: number
    linhas?: number
    /** O `gap` da grade da vitrine, que entra entre as fileiras e as colunas. */
    vao?: number
    /** O que a vitrine gasta antes da grade — a legenda dela, por exemplo. */
    reserva?: number
  },
): CabemNaCaixa {
  const vao = limites.vao ?? 0

  const colunas = Math.min(
    Math.max(Math.floor(espaco.largura / item.largura), 1),
    limites.colunas ?? limites.maximo,
  )

  const larguraDaColuna = (espaco.largura - vao * (colunas - 1)) / colunas
  const alturaDoItem = typeof item.altura === 'function'
    ? item.altura(larguraDaColuna)
    : item.altura

  const livre = espaco.altura === null ? null : espaco.altura - (limites.reserva ?? 0)

  // `(livre + vao) / (item + vao)`: o vão existe ENTRE fileiras, não depois da
  // última — sem isso, a última fileira que caberia justinho é descartada.
  const linhas = livre === null
    ? (limites.linhas ?? 1)
    : Math.max(1, Math.floor((livre + vao) / (alturaDoItem + vao)))

  const total = Math.min(Math.max(colunas * linhas, limites.minimo), limites.maximo)

  return { colunas, linhas, total }
}

// ---------------------------------------------------------------------------
// Orçamentos — os três meses
// ---------------------------------------------------------------------------

/**
 * Três, e não a janela inteira do módulo.
 *
 * O gráfico de Orçamentos mostra doze meses porque ali a pergunta é a tendência.
 * No painel a pergunta é outra — "o mês está mais caro que os anteriores?" — e
 * ela se responde com o mês corrente e os dois que dão a referência. Doze barras
 * de 6px num cartão de celular não são um gráfico, são uma textura.
 */
export const MESES_DA_VITRINE = 3

export interface MesDaVitrine {
  competencia: string
  /** "ago" — o rótulo do eixo. */
  rotulo: string
  /** "Agosto de 2026" — o rótulo por extenso, para leitor de tela. */
  rotuloLongo: string
  total: number
  /** O mês corrente ganha o tom cheio; os fechados, o esmaecido. */
  atual: boolean
}

/**
 * Os três meses, do mais antigo para o corrente.
 *
 * A série vem de `useSerieMensal` (a MESMA consulta da tela de Orçamentos, mesma
 * chave de cache), e o valor é o total do espaço por competência — nunca uma
 * conta refeita aqui. Um painel que somasse "do jeito óbvio" mostraria um número
 * diferente do módulo, e não haveria como saber qual dos dois está certo.
 *
 * Mês que não veio na série entra com zero em vez de sumir: uma barra faltando
 * mudaria a leitura de "gastamos nada em julho" para "julho não existe".
 */
export function mesesDaVitrine(serie: PontoMensal[], mesCorrente: string): MesDaVitrine[] {
  const porMes = new Map(serie.map(p => [p.competencia, p]))

  return Array.from({ length: MESES_DA_VITRINE }, (_, i) => {
    const competencia = somarMeses(mesCorrente, i - (MESES_DA_VITRINE - 1))

    return {
      competencia,
      rotulo: mesAbreviado(competencia),
      rotuloLongo: formatarMes(competencia),
      total: porMes.get(competencia)?.total ?? 0,
      atual: competencia === mesCorrente,
    }
  })
}

// ---------------------------------------------------------------------------
// Filmes — dois cartazes
// ---------------------------------------------------------------------------

/** O piso: dois cartazes é o mínimo que ainda parece uma vitrine. */
export const FILMES_DA_VITRINE = 2

/** A fila de prioridade do card, na ordem em que ele desce por ela. */
export type FaseDoFilme = 'planejado' | 'disponivel' | 'visto'

export const LEGENDA_DA_FASE: Record<FaseDoFilme, string> = {
  planejado: 'Bora assistir',
  disponivel: 'Na fila, ainda sem data',
  visto: 'Os últimos que vocês viram',
}

export interface FilmeDaVitrine {
  entryId: string
  titulo: string
  ano: number | null
  capaUrl: string | null
  /** A data que explica por que ELE está aqui — ou nada, quando não há data. */
  legenda: string | null
  fase: FaseDoFilme
}

export interface VitrineDeFilmes {
  /** A fase do primeiro cartaz: é ela que nomeia o card. */
  fase: FaseDoFilme
  legenda: string
  filmes: FilmeDaVitrine[]
}

function cartaz(item: ItemDoEspaco, fase: FaseDoFilme, legenda: string | null): FilmeDaVitrine {
  return {
    entryId: item.id,
    titulo: item.media.titulo,
    ano: item.media.ano,
    capaUrl: item.media.capa_url,
    legenda,
    fase,
  }
}

/**
 * Os dois cartazes: o que está marcado, o que está na fila, o que já foi visto.
 *
 * A ordem é a de quem pergunta "o que a gente vai ver": primeiro o que tem data,
 * depois o interesse sem data, e só então a memória. As fases se COMPLETAM em
 * vez de se excluírem — com um filme marcado e nenhum outro, o segundo cartaz
 * vem da fila, porque meia vitrine vazia não é mais honesta, é só mais vazia.
 *
 * A data é por ITEM, e não por avaliação: no espaço de casal os dois marcam o
 * mesmo filme, e sem isto o mesmo cartaz ocuparia as duas vagas.
 */
export function filmesDaVitrine(
  itens: ItemDoEspaco[],
  hoje: string,
  quantidade: number = FILMES_DA_VITRINE,
): VitrineDeFilmes | null {
  const planejados: Array<{ item: ItemDoEspaco, data: string }> = []
  const disponiveis: ItemDoEspaco[] = []
  const vistos: Array<{ item: ItemDoEspaco, data: string | null }> = []

  for (const item of itens) {
    const datas = item.avaliacoes
      .map(av => av.planejado_para)
      .filter((d): d is string => !!d && d >= hoje)
      .sort()

    if (datas[0]) {
      planejados.push({ item, data: datas[0] })
      continue
    }

    if (itemNoRecorte(item, 'disponivel')) {
      disponiveis.push(item)
      continue
    }

    if (itemNoRecorte(item, 'visto')) {
      const vistoEm = item.avaliacoes
        .map(av => av.visto_em)
        .filter((d): d is string => !!d)
        .sort()
        .at(-1) ?? null

      vistos.push({ item, data: vistoEm })
    }
  }

  planejados.sort((a, b) => a.data.localeCompare(b.data))
  // Quem viu e não anotou quando fica atrás de quem anotou; entre iguais decide
  // a ordem de chegada da lista (`created_at` desc), porque o `sort` é estável.
  vistos.sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''))

  const candidatos: FilmeDaVitrine[] = [
    ...planejados.map(({ item, data }) => cartaz(item, 'planejado', formatarDiaCurto(data))),
    ...disponiveis.map(item => cartaz(item, 'disponivel', null)),
    ...vistos.map(({ item, data }) => cartaz(item, 'visto', data ? formatarDiaCurto(data) : null)),
  ]

  const filmes = candidatos.slice(0, Math.max(quantidade, 1))
  if (!filmes.length) return null

  return { fase: filmes[0]!.fase, legenda: LEGENDA_DA_FASE[filmes[0]!.fase], filmes }
}

// ---------------------------------------------------------------------------
// Fotos — o carrossel
// ---------------------------------------------------------------------------

/**
 * O teto do carrossel. Oito são ~40 segundos de rodízio — o bastante para o card
 * parecer vivo sem virar uma galeria que ninguém pediu no painel —, e é também o
 * que limita quantas URLs assinadas o dashboard pede a cada visita.
 */
export const FOTOS_DA_VITRINE = 8

export type FaseDaFoto = 'liberada' | 'esperando'

export const LEGENDA_DA_FOTO: Record<FaseDaFoto, string> = {
  liberada: 'Vocês curtiram — pode postar',
  esperando: 'Esperando o seu coração',
}

export interface VitrineDeFotos {
  fase: FaseDaFoto
  legenda: string
  fotos: Foto[]
}

/**
 * As que já podem ser postadas; sem nenhuma, as que esperam o SEU coração.
 *
 * A ordem inverte a do resumo em texto de propósito. Lá a tarefa vem primeiro,
 * porque a linha é um chamado. Aqui o card é uma vitrine: o que ele mostra bem é
 * a foto que já passou pelos dois, e a pendência entra como o segundo melhor
 * assunto — não como a chamada principal.
 *
 * Só imagens: um vídeo em rodízio automático dentro do painel ou fica congelado
 * no primeiro quadro, ou começa a baixar sozinho no celular de quem abriu o app
 * com dados móveis.
 */
export function fotosDaVitrine(
  fotos: Foto[],
  euId: string | null,
  totalDeMembros: number,
): VitrineDeFotos | null {
  const imagens = fotos.filter(f => f.tipo === 'imagem')

  const liberadas = imagens.filter(f => situacaoDaFoto(f, totalDeMembros) === 'liberada')
  if (liberadas.length) {
    return {
      fase: 'liberada',
      legenda: LEGENDA_DA_FOTO.liberada,
      fotos: liberadas.slice(0, FOTOS_DA_VITRINE),
    }
  }

  const minhas = esperandoPorMim(imagens, euId, totalDeMembros)
  if (minhas.length) {
    return {
      fase: 'esperando',
      legenda: LEGENDA_DA_FOTO.esperando,
      fotos: minhas.slice(0, FOTOS_DA_VITRINE),
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Músicas — a última faixa
// ---------------------------------------------------------------------------

export interface MusicaDaVitrine {
  /** De onde a faixa veio — muda o que a legenda pode prometer. */
  origem: 'escuta' | 'catalogo'
  /**
   * O item do catálogo, quando a faixa veio de lá. É o que permite a lista de
   * "também na lista" não repetir, embaixo, a faixa que está em destaque.
   * Nulo na escuta: o que toca no Spotify não é necessariamente da nossa lista.
   */
  id: string | null
  titulo: string
  artistas: string | null
  album: string | null
  capaUrl: string | null
  url: string | null
  /** Quem estava ouvindo, pelo primeiro nome. Nulo quando vem do catálogo. */
  quem: string | null
  /** Tocando agora, e não a última notícia de horas atrás. */
  aoVivo: boolean
  /** "há 3 horas" — nulo quando é ao vivo, ou quando passou de uma semana. */
  quando: string | null
}

/**
 * "Você", ou o primeiro nome. O nome inteiro não cabe: a linha divide um cartão
 * de celular com o título da faixa, que é o que a pessoa procura ali.
 */
function nomeCurto(membros: Membro[], userId: string, euId: string | null): string {
  if (userId === euId) return 'Você'
  const nome = membros.find(m => m.user_id === userId)?.exibicao ?? 'Alguém'
  return nome.split(' ')[0] || nome
}

/**
 * A última música ouvida por alguém do espaço — ou, sem ninguém transmitindo, a
 * última que entrou no catálogo.
 *
 * `escuta_agora` é uma linha por pessoa, sempre sobrescrita, e o servidor grava
 * `titulo: null` quando o Spotify responde "nada tocando". Então uma linha COM
 * título é sempre a última faixa conhecida daquela pessoa: ou ela está ouvindo
 * agora, ou é o que tocava quando alguém olhou pela última vez. As duas coisas
 * respondem à pergunta do card; o que muda é a legenda, e é por isso que
 * `aoVivo` existe em vez de um filtro que jogaria a segunda fora.
 *
 * O catálogo entra como reserva porque o card não pode depender de o Spotify
 * estar conectado E o interruptor de "mostrar o que estou ouvindo" estar ligado
 * — dois consentimentos que ninguém deve ao painel.
 */
export function musicaDaVitrine(
  escutas: EscutaAgora[],
  membros: Membro[],
  itens: ItemDoEspaco[],
  euId: string | null,
  agora: number,
  limiteAoVivoMs: number,
): MusicaDaVitrine | null {
  const recente = [...escutas]
    .filter(e => !!e.titulo)
    .sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em))[0]

  if (recente) {
    const idade = agora - new Date(recente.atualizado_em).getTime()
    const aoVivo = recente.tocando && idade <= limiteAoVivoMs

    return {
      origem: 'escuta',
      id: null,
      titulo: recente.titulo!,
      artistas: recente.artistas,
      album: recente.album,
      capaUrl: recente.capa_url,
      url: recente.url_spotify,
      quem: nomeCurto(membros, recente.user_id, euId),
      aoVivo,
      quando: aoVivo ? null : tempoRelativo(recente.atualizado_em, agora),
    }
  }

  const item = itens[0]
  if (!item) return null

  return {
    origem: 'catalogo',
    id: item.id,
    titulo: item.media.titulo,
    artistas: creditos(artistasDe(item.media.metadados)) || null,
    album: albumDe(item.media.metadados),
    capaUrl: item.media.capa_url,
    url: urlSpotifyDe(item.media.metadados),
    quem: null,
    aoVivo: false,
    quando: null,
  }
}

// ---------------------------------------------------------------------------
// Viagens — o mapa
// ---------------------------------------------------------------------------

export type MomentoDaViagem = 'proxima' | 'passada' | 'sem-data'

export const LEGENDA_DO_MOMENTO: Record<MomentoDaViagem, string> = {
  'proxima': 'A próxima viagem',
  'passada': 'A última que vocês fizeram',
  'sem-data': 'Um roteiro pronto, esperando data',
}

export interface VitrineDeViagem<T extends Roteiro = Roteiro> {
  roteiro: T
  momento: MomentoDaViagem
  legenda: string
}

/**
 * A próxima viagem; sem nenhuma marcada, a última que aconteceu.
 *
 * Roteiro secreto fica de fora, e não porque a RLS o esconderia — para quem o
 * criou ele aparece normalmente. É que o painel é a primeira tela do app e vive
 * aberta na mesa: desenhar ali o mapa da surpresa é entregá-la a quem passar
 * pelo lado. Dentro de Viagens, onde a pessoa entrou de propósito, ele continua
 * inteiro.
 *
 * A terceira saída é o roteiro sem data nenhuma: um espaço que só tem planos
 * ainda sem quando continua tendo um mapa a mostrar, e o card diz exatamente
 * isso em vez de fingir que não há viagem.
 */
export function roteiroDaVitrine<T extends Roteiro>(
  roteiros: T[],
  hoje: string,
): VitrineDeViagem<T> | null {
  const abertos = roteiros.filter(r => r.visibilidade !== 'segredo')

  const proxima = proximaViagem(abertos, hoje) as T | null
  if (proxima) return { roteiro: proxima, momento: 'proxima', legenda: LEGENDA_DO_MOMENTO.proxima }

  const { passadas } = separarPorTempo(abertos, hoje)
  if (passadas[0]) {
    return { roteiro: passadas[0], momento: 'passada', legenda: LEGENDA_DO_MOMENTO.passada }
  }

  // Sobrou o que não tem data: a lista já vem por `created_at` desc.
  const semData = abertos.find(r => !r.data_inicio)
  if (semData) {
    return { roteiro: semData, momento: 'sem-data', legenda: LEGENDA_DO_MOMENTO['sem-data'] }
  }

  return null
}

// ---------------------------------------------------------------------------
// Objetivos — os interesses
// ---------------------------------------------------------------------------

/** O padrão do cartão de altura natural; com altura fixa, quem manda é a caixa. */
export const INTERESSES_DA_VITRINE = 4

/**
 * Os interesses vivos, do mais novo para o mais velho.
 *
 * Só os estados abertos, pela mesma razão da tela do módulo e do resumo em
 * texto: 'convertido' já virou outra coisa e 'arquivado' é decisão tomada. Uma
 * vitrine com os quatro estados estaria exibindo, depois de alguns meses,
 * sobretudo o que ninguém quer mais.
 */
export function interessesDaVitrine(
  interesses: InteresseComAgrupamentos[],
  quantidade: number = INTERESSES_DA_VITRINE,
  abertos: EstadoInteresse[] = ESTADOS_ABERTOS,
): InteresseComAgrupamentos[] {
  return interesses
    .filter(i => abertos.includes(i.estado))
    .slice(0, Math.max(quantidade, 1))
}
