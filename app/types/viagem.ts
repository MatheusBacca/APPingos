/**
 * O roteiro de viagem como dado, e as regras que não precisam do Vue para valer.
 *
 * Quase tudo aqui existe por causa de uma assimetria do Google: o mapa embutido,
 * o link que abre o app do Maps e a lista que a pessoa vê na tela têm limites e
 * conteúdos DIFERENTES para o mesmo roteiro. A lista mostra tudo, inclusive as
 * paradas escritas à mão; o mapa aguenta 22 pontos; o link aguenta 5 no celular.
 * Deixar isso espalhado pelos componentes seria três lugares para errar — aqui é
 * um só, e testado.
 */
import { paraIso, partesDaData, formatarDiaCurto } from '@/lib/datas'

export type ModoTransporte = 'driving' | 'walking' | 'bicycling' | 'transit'

/**
 * Os quatro modos que o Google sabe rotear, e só eles.
 *
 * Avião ficou de fora porque não é um modo de transporte para o Maps: não há
 * rota a desenhar entre dois aeroportos, e um roteiro aéreo é outro produto
 * (trechos com horário, não paradas em sequência). Acrescentar um quinto valor
 * aqui exige mexer no CHECK da migration — os dois são a mesma lista.
 */
export const MODOS_TRANSPORTE: { valor: ModoTransporte, rotulo: string, icone: string }[] = [
  { valor: 'driving', rotulo: 'Carro', icone: 'CarIcon' },
  { valor: 'transit', rotulo: 'Transporte público', icone: 'BusIcon' },
  { valor: 'walking', rotulo: 'A pé', icone: 'FootprintsIcon' },
  { valor: 'bicycling', rotulo: 'Bicicleta', icone: 'BikeIcon' },
]

export type VisibilidadeRoteiro = 'segredo' | 'compartilhado'

/**
 * O mínimo que uma parada precisa ter para virar rota ou dia na tela.
 *
 * Existe porque a mesma parada aparece em duas formas ao longo da edição: a
 * linha do banco (com `id` e `ordem`) e o rascunho que a tela está montando
 * (sem os dois — ali a ordem É a posição no array). Tipar as funções pelo que
 * elas de fato leem evita ter que inventar `id` falso para pedir um link do
 * Maps, e é o que permite o mapa acompanhar a edição antes de salvar.
 */
export interface PontoDoRoteiro {
  /** Nulo = parada escrita à mão, que o Google não conhece. */
  google_place_id: string | null
  nome: string
}

export interface Parada extends PontoDoRoteiro {
  id: string
  ordem: number
  endereco: string | null
  /** Dia 1, Dia 2… Nulo = parada sem dia definido. */
  dia: number | null
  anotacao: string | null
}

export interface Roteiro {
  id: string
  space_id: string
  nome: string
  descricao: string | null
  modo_transporte: ModoTransporte
  /** Datas em ISO curto (YYYY-MM-DD) — são `date` no banco, sem fuso. */
  data_inicio: string | null
  data_fim: string | null
  visibilidade: VisibilidadeRoteiro
  /** Carimbo de quando passou a existir para o outro. Nulo enquanto secreto. */
  liberado_em: string | null
  criado_por: string
  created_at: string
  updated_at: string
}

export interface RoteiroComParadas extends Roteiro {
  paradas: Parada[]
}

/** O que a tela manda para a RPC `salvar_paradas` — sem `id` nem `ordem`. */
export interface ParadaParaSalvar extends PontoDoRoteiro {
  endereco: string | null
  dia: number | null
  anotacao: string | null
}

/**
 * Limites do Google, em PONTOS (paradas), não em waypoints.
 *
 * A doc do Maps URLs conta waypoints, que são os pontos do MEIO — origem e
 * destino ficam de fora da conta. Traduzir para "pontos" aqui, uma vez, é o que
 * evita o erro de somar 3 waypoints e caber 3 paradas num link que na verdade
 * leva 5. Os dois números do link vêm de "up to three waypoints supported on
 * mobile browsers, and a maximum of nine waypoints supported otherwise".
 */
export const MAX_PONTOS_LINK_MOBILE = 5
export const MAX_PONTOS_LINK_DESKTOP = 11
/** O Embed aceita 20 waypoints — outro limite, e ninguém espera que seja outro. */
export const MAX_PONTOS_EMBED = 22

const BASE_EMBED = 'https://www.google.com/maps/embed/v1'
const BASE_LINK = 'https://www.google.com/maps/dir/'

/**
 * O único lugar que ordena. Tudo daqui para baixo recebe a lista já na ordem.
 *
 * O PostgREST não garante ordem de linha embutida, então a lista do banco passa
 * por aqui uma vez, ao entrar na tela. Depois disso a ordem é a posição no
 * array — inclusive para a RPC, que reescreve `ordem` por posição.
 */
export function paradasOrdenadas(paradas: Parada[]): Parada[] {
  return [...paradas].sort((a, b) => a.ordem - b.ordem)
}

/**
 * As paradas que o Google consegue rotear.
 *
 * Filtrar aqui, e não dentro de cada função de URL, é de propósito: "o que entra
 * na rota" é uma decisão de produto (uma parada escrita à mão conta na lista mas
 * não no mapa), e ela fica visível num lugar em que dá para ler o porquê.
 */
export function paradasNaRota<T extends PontoDoRoteiro>(paradas: T[]): T[] {
  return paradas.filter(p => !!p.google_place_id)
}

/**
 * A data real de um "Dia N", quando a viagem tem início marcado.
 *
 * Derivada, nunca gravada: mudar o início da viagem tem que reescrever o
 * roteiro inteiro sozinho. Guardar a data em cada parada faria adiar a viagem
 * em uma semana virar um trabalho de corrigir parada por parada — e, na prática,
 * um roteiro com metade das datas velhas.
 */
export function dataDoDia(dia: number | null, dataInicio: string | null): string | null {
  if (dia === null || dia < 1 || !dataInicio) return null

  const { ano, mes, dia: primeiro } = partesDaData(dataInicio)
  // `new Date(a, m, d)` é sempre horário local e normaliza a virada de mês.
  const d = new Date(ano, mes - 1, primeiro + dia - 1)
  return paraIso(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

/** "Dia 2 · dom, 16 de ago", "Dia 2" sem datas, "Sem dia" sem dia. */
export function rotuloDoDia(dia: number | null, dataInicio: string | null): string {
  if (dia === null) return 'Sem dia'

  const data = dataDoDia(dia, dataInicio)
  return data ? `Dia ${dia} · ${formatarDiaCurto(data)}` : `Dia ${dia}`
}

/**
 * O roteiro fatiado em trechos que cabem num link do Maps.
 *
 * O último ponto de um trecho é o primeiro do seguinte — encadeados, e não
 * cortados: sem a repetição, o percurso entre a parada 5 e a 6 simplesmente não
 * existiria em link nenhum, e ninguém notaria olhando a tela.
 *
 * Quando tudo cabe num link só, devolve um trecho só e a tela desenha um botão
 * — a mecânica não aparece para quem não precisa dela.
 *
 * Com menos de dois pontos não há trecho nenhum, e não é detalhe: uma rota
 * precisa de origem E destino. Devolver um "trecho de um ponto" fazia a tela
 * desenhar um botão "Abrir no Google Maps" que não levava a lugar nenhum — foi
 * o que aconteceu ao adicionar a primeira parada de um roteiro novo.
 */
export function trechosDoMaps<T extends PontoDoRoteiro>(paradas: T[], maxPontos: number): T[][] {
  const pontos = paradasNaRota(paradas)
  if (pontos.length < 2) return []

  // Cada trecho avança `maxPontos - 1` porque o ponto de emenda conta duas
  // vezes. O piso de 1 protege de um `maxPontos` absurdo virar laço infinito.
  const passo = Math.max(1, maxPontos - 1)
  const trechos: T[][] = []

  for (let inicio = 0; inicio < pontos.length - 1; inicio += passo) {
    trechos.push(pontos.slice(inicio, inicio + passo + 1))
  }

  return trechos
}

/**
 * O link que abre o app nativo do Google Maps com o trecho montado.
 *
 * A Maps URLs API não aceita um link só de `place_id`: o texto do lugar é
 * obrigatório junto do ID. É por isso que o banco guarda `nome` como cache do
 * Places — não é conveniência, é requisito da API (ver o contorno 3 do plano).
 */
export function urlDoTrecho(trecho: PontoDoRoteiro[], modo: ModoTransporte): string | null {
  if (trecho.length < 2) return null

  const origem = trecho[0]!
  const destino = trecho[trecho.length - 1]!
  const meio = trecho.slice(1, -1)

  const params = new URLSearchParams({
    api: '1',
    origin: origem.nome,
    origin_place_id: origem.google_place_id!,
    destination: destino.nome,
    destination_place_id: destino.google_place_id!,
    travelmode: modo,
  })

  if (meio.length) {
    params.set('waypoints', meio.map(p => p.nome).join('|'))
    params.set('waypoint_place_ids', meio.map(p => p.google_place_id!).join('|'))
  }

  return `${BASE_LINK}?${params}`
}

/**
 * O `src` do iframe do Embed API.
 *
 * Três formas, e a de uma parada só não é detalhe: um roteiro nasce vazio e
 * ganha a primeira parada antes da segunda, então o estado "ainda não há rota"
 * é o normal por alguns segundos, não um caso de borda. `/place` mostra o lugar;
 * `/directions` só existe a partir de dois pontos.
 *
 * Acima de `MAX_PONTOS_EMBED` o mapa mostra só o começo — quem avisa é a tela,
 * com `embedTruncado`.
 */
export function urlDoEmbed(
  paradas: PontoDoRoteiro[],
  modo: ModoTransporte,
  chave: string,
): string | null {
  const pontos = paradasNaRota(paradas).slice(0, MAX_PONTOS_EMBED)
  if (!chave || !pontos.length) return null

  if (pontos.length === 1) {
    const params = new URLSearchParams({ key: chave, q: `place_id:${pontos[0]!.google_place_id}` })
    return `${BASE_EMBED}/place?${params}`
  }

  const params = new URLSearchParams({
    key: chave,
    origin: `place_id:${pontos[0]!.google_place_id}`,
    destination: `place_id:${pontos[pontos.length - 1]!.google_place_id}`,
    mode: modo,
  })

  const meio = pontos.slice(1, -1)
  if (meio.length) {
    params.set('waypoints', meio.map(p => `place_id:${p.google_place_id}`).join('|'))
  }

  return `${BASE_EMBED}/directions?${params}`
}

/** O mapa está mostrando menos do que o roteiro tem? */
export function embedTruncado(paradas: PontoDoRoteiro[]): boolean {
  return paradasNaRota(paradas).length > MAX_PONTOS_EMBED
}

/**
 * Os roteiros que ainda merecem o selo "Novo", por pessoa.
 *
 * Vale para quem criou também — abrir é o que apaga o selo, e cada um apaga o
 * seu. Um roteiro secreto nunca é novo para ninguém: ele não existe para o outro,
 * e para o criador não há novidade nenhuma no que ele mesmo escondeu.
 */
export function roteirosNovos(roteiros: Roteiro[], vistos: string[]): string[] {
  const jaVistos = new Set(vistos)

  return roteiros
    .filter(r => r.liberado_em !== null && !jaVistos.has(r.id))
    .map(r => r.id)
}

/**
 * A viagem mais próxima que ainda não passou.
 *
 * "Não passou" olha `data_fim` quando ela existe: uma viagem que começou ontem e
 * termina domingo ainda é a próxima coisa que interessa — sumir com ela no meio
 * do passeio seria o painel esquecendo justo a viagem em curso.
 */
export function proximaViagem(roteiros: Roteiro[], hoje: string): Roteiro | null {
  const futuras = roteiros
    .filter(r => r.data_inicio !== null && (r.data_fim ?? r.data_inicio!) >= hoje)
    .sort((a, b) => a.data_inicio!.localeCompare(b.data_inicio!))

  return futuras[0] ?? null
}
