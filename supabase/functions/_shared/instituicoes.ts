/**
 * As instituições financeiras que o app reconhece: nome curto, cores, o ícone
 * da Pluggy e o visual do cartão.
 *
 * POR QUE O APP PRECISA DESCOBRIR O BANCO: pelo MeuPluggy, o conector de toda
 * conexão é o próprio MeuPluggy (`connector.id = 200`, `name = "MeuPluggy"`), e
 * a conta não tem campo de instituição. O banco de verdade só aparece no NOME da
 * conta ("C6 BANK", "itau", "Nu Pagamentos S.A. - Instituição de Pagamento").
 * Cada banco vira uma conexão separada no MeuPluggy, então a conta corrente de
 * uma conexão identifica a conexão inteira — inclusive o cartão, cujo nome é o
 * do produto ("BANDEIRADO", "platinum") e não diz o banco.
 *
 * O ÍCONE: `cdn.pluggy.ai/assets/connector-icons/<id>.svg` é o ícone que a
 * própria Pluggy mostra no widget para o conector Open Finance de cada banco.
 * Os ids foram conferidos em 20/11/2026 olhando os SVGs. Sem id, o selo de sigla
 * e cor continua valendo.
 *
 * Fica em `_shared` porque a Edge Function grava o código na conexão e a tela
 * usa o mesmo mapa (re-exportado em `app/lib/instituicoes.ts`).
 *
 * Fora da lista de propósito: Daycoval e Revolut não transmitem dados no Open
 * Finance Brasil, e a Pluggy não tem conector para eles (pesquisa de 20/11/2026).
 */

export interface Instituicao {
  /** O que se grava em `conexao_bancaria.instituicao`. */
  codigo: string
  /** Como o app escreve: "C6", "Itaú", "Nubank". */
  nome: string
  /** O reconhecimento pelo nome da conta ou pelo que a pessoa digitou. */
  teste: RegExp
  /** A cor da marca, para selo, chips e barras. */
  cor: string
  /** A cor do texto sobre `cor`. */
  texto: string
  sigla: string
  /** O conector Open Finance da Pluggy (o ícone). */
  conectorPluggy?: number
  /** O cartão: um fundo em CSS (gradiente) e a cor do texto sobre ele. */
  cartao: { fundo: string, texto: string }
}

export const INSTITUICOES: Instituicao[] = [
  {
    codigo: 'nubank',
    nome: 'Nubank',
    teste: /nu ?bank|^nu\b|nu pagamentos|nu financeira|nuconta/i,
    cor: '#820AD1',
    texto: '#FFFFFF',
    sigla: 'nu',
    conectorPluggy: 612,
    cartao: { fundo: 'linear-gradient(135deg, #9A2BE0 0%, #820AD1 45%, #530082 100%)', texto: '#FFFFFF' },
  },
  {
    codigo: 'c6',
    nome: 'C6',
    teste: /\bc6\b|banco c6/i,
    cor: '#242424',
    texto: '#FFFFFF',
    sigla: 'C6',
    conectorPluggy: 626,
    cartao: { fundo: 'linear-gradient(135deg, #3A3A3A 0%, #1E1E1E 55%, #0A0A0A 100%)', texto: '#F5F5F5' },
  },
  {
    codigo: 'itau',
    nome: 'Itaú',
    teste: /ita[uú]/i,
    cor: '#EC7000',
    texto: '#FFFFFF',
    sigla: 'itaú',
    conectorPluggy: 601,
    cartao: { fundo: 'linear-gradient(135deg, #FF8A1F 0%, #EC7000 50%, #C45A00 100%)', texto: '#FFFFFF' },
  },
  {
    codigo: 'bradesco',
    nome: 'Bradesco',
    teste: /bradesco|bradescard/i,
    cor: '#CC092F',
    texto: '#FFFFFF',
    sigla: 'b',
    conectorPluggy: 603,
    cartao: { fundo: 'linear-gradient(135deg, #E1173F 0%, #CC092F 50%, #8E0620 100%)', texto: '#FFFFFF' },
  },
  {
    codigo: 'santander',
    nome: 'Santander',
    teste: /santander/i,
    cor: '#EC0000',
    texto: '#FFFFFF',
    sigla: 'S',
    conectorPluggy: 608,
    cartao: { fundo: 'linear-gradient(135deg, #FF2A2A 0%, #EC0000 50%, #A30000 100%)', texto: '#FFFFFF' },
  },
  {
    codigo: 'bb',
    nome: 'Banco do Brasil',
    teste: /banco do brasil|\bbb\b/i,
    cor: '#FCFC30',
    texto: '#003DA5',
    sigla: 'BB',
    conectorPluggy: 611,
    cartao: { fundo: 'linear-gradient(135deg, #FFF45C 0%, #FCE300 55%, #E5C800 100%)', texto: '#003DA5' },
  },
  {
    codigo: 'caixa',
    nome: 'Caixa',
    teste: /caixa econ|^caixa\b|caixa tem/i,
    cor: '#005CA9',
    texto: '#F39200',
    sigla: 'CX',
    conectorPluggy: 619,
    cartao: { fundo: 'linear-gradient(135deg, #1A73C4 0%, #005CA9 55%, #003E73 100%)', texto: '#FFFFFF' },
  },
  {
    codigo: 'inter',
    nome: 'Inter',
    teste: /\binter\b/i,
    cor: '#FF7A00',
    texto: '#FFFFFF',
    sigla: 'in',
    conectorPluggy: 615,
    cartao: { fundo: 'linear-gradient(135deg, #FF8F26 0%, #FF7A00 50%, #D96200 100%)', texto: '#FFFFFF' },
  },
  {
    codigo: 'btg',
    nome: 'BTG Pactual',
    teste: /btg/i,
    cor: '#0B2340',
    texto: '#FFFFFF',
    sigla: 'btg',
    conectorPluggy: 614,
    cartao: { fundo: 'linear-gradient(135deg, #1D3A5F 0%, #0B2340 55%, #050F1C 100%)', texto: '#FFFFFF' },
  },
  {
    codigo: 'xp',
    nome: 'XP',
    teste: /\bxp\b/i,
    cor: '#000000',
    texto: '#FFD400',
    sigla: 'XP',
    conectorPluggy: 602,
    cartao: { fundo: 'linear-gradient(135deg, #2B2B2B 0%, #111111 55%, #000000 100%)', texto: '#FFD400' },
  },
  {
    codigo: 'mercadopago',
    nome: 'Mercado Pago',
    teste: /mercado ?pago/i,
    cor: '#00B1EA',
    texto: '#FFFFFF',
    sigla: 'MP',
    conectorPluggy: 606,
    cartao: { fundo: 'linear-gradient(135deg, #2BC4F5 0%, #00B1EA 50%, #0083B0 100%)', texto: '#FFFFFF' },
  },
  {
    codigo: 'picpay',
    nome: 'PicPay',
    teste: /picpay/i,
    cor: '#21C25E',
    texto: '#FFFFFF',
    sigla: 'pp',
    cartao: { fundo: 'linear-gradient(135deg, #3FD579 0%, #21C25E 50%, #13914A 100%)', texto: '#FFFFFF' },
  },
  {
    codigo: 'sicredi',
    nome: 'Sicredi',
    teste: /sicredi/i,
    cor: '#3FA110',
    texto: '#FFFFFF',
    sigla: 'sc',
    conectorPluggy: 627,
    cartao: { fundo: 'linear-gradient(135deg, #5BBE2A 0%, #3FA110 50%, #2A7008 100%)', texto: '#FFFFFF' },
  },
  {
    codigo: 'sicoob',
    nome: 'Sicoob',
    teste: /sicoob/i,
    cor: '#003641',
    texto: '#00AE9D',
    sigla: 'sb',
    conectorPluggy: 628,
    cartao: { fundo: 'linear-gradient(135deg, #0A5563 0%, #003641 55%, #001E24 100%)', texto: '#FFFFFF' },
  },
]

const POR_CODIGO = new Map(INSTITUICOES.map(i => [i.codigo, i]))

/** A instituição pelo código gravado na conexão. */
export function instituicaoPorCodigo(codigo: string | null | undefined): Instituicao | null {
  return codigo ? POR_CODIGO.get(codigo) ?? null : null
}

/** A instituição pelo nome — da conta, do banco, do que a pessoa digitou. */
export function instituicaoPorNome(nome: string | null | undefined): Instituicao | null {
  const n = nome?.trim()
  if (!n) return null
  return INSTITUICOES.find(i => i.teste.test(n)) ?? null
}

/**
 * O banco de uma conexão, pelas contas dela. A conta corrente primeiro: o nome
 * dela é o do banco ("C6 BANK"); o do cartão é o do produto ("BANDEIRADO").
 */
export function instituicaoDasContas(
  contas: ReadonlyArray<{ name?: string | null, marketingName?: string | null, type?: string | null }>,
): string | null {
  const ordenadas = [...contas].sort((a, b) => (a.type === 'BANK' ? 0 : 1) - (b.type === 'BANK' ? 0 : 1))
  for (const conta of ordenadas) {
    const achada = instituicaoPorNome(conta.name) ?? instituicaoPorNome(conta.marketingName)
    if (achada) return achada.codigo
  }
  return null
}

/** O SVG da Pluggy para a instituição, quando ela tem conector conhecido. */
export function iconeDaInstituicao(i: Pick<Instituicao, 'conectorPluggy'> | null | undefined): string | null {
  return i?.conectorPluggy ? `https://cdn.pluggy.ai/assets/connector-icons/${i.conectorPluggy}.svg` : null
}

/** Os conectores que não são um banco: com eles, o nome não serve de rótulo. */
const AGREGADORES = /meu ?pluggy|pluggy/i

/**
 * O nome do banco para a tela: o da instituição reconhecida; senão o do
 * conector, se não for um agregador; senão `reserva` (o nome da conta).
 */
export function nomeDoBanco(
  conexao: { banco?: string | null, instituicao?: string | null } | null | undefined,
  reserva = '',
): string {
  const instituicao = instituicaoPorCodigo(conexao?.instituicao)
  if (instituicao) return instituicao.nome
  const banco = conexao?.banco?.trim() ?? ''
  if (banco && !AGREGADORES.test(banco)) return banco
  return reserva
}
