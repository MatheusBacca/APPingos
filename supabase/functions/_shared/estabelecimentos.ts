/**
 * Quem é o estabelecimento de uma transação — e que categoria ele costuma ser.
 *
 * É a base do auto-tag da caixa de entrada (docs/notion-plano-open-finance.md,
 * "Lembrar a escolha por estabelecimento"): a descrição do extrato vira uma
 * CHAVE estável, que é por onde o app lembra o que a pessoa escolheu
 * (`regra_classificacao.chave`), e um dicionário de marcas conhecidas dá a
 * sugestão da primeira vez, antes de existir qualquer escolha para lembrar.
 *
 * Mora em `_shared/` pelo mesmo motivo de `importacao-bancaria.ts`: a chave é
 * calculada no app (quem classifica) e vai ser calculada na sincronização (a
 * regra `automatica` do espaço pessoal). Duas cópias divergiriam, e uma chave
 * diferente é uma regra que nunca mais casa. Por isso, também, zero imports de
 * runtime aqui.
 *
 * As cores são a cor principal de cada marca, em hex; não há logo nem imagem —
 * a tela desenha um selo colorido com a `sigla`.
 */

// ---------------------------------------------------------------------------
// Categorias-base
// ---------------------------------------------------------------------------

/**
 * O vocabulário fixo de categorias que o app entende. As categorias de verdade
 * são por espaço e têm nome livre ("Comida", "Uber/Táxi"); `categoriaBaseDoNome`
 * é a ponte entre as duas.
 */
export type CategoriaBase =
  | 'mercado' | 'restaurante' | 'delivery' | 'padaria' | 'transporte' | 'combustivel' | 'estacionamento'
  | 'viagem' | 'hospedagem' | 'streaming' | 'cinema' | 'lazer' | 'jogos' | 'compras' | 'eletronicos'
  | 'roupas' | 'saude' | 'farmacia' | 'educacao' | 'casa' | 'contas' | 'telefone' | 'pet' | 'beleza'
  | 'academia' | 'impostos' | 'tarifas' | 'seguros' | 'presentes' | 'transferencia' | 'outros'

/** O nome que a categoria recebe quando o espaço ainda não tem uma equivalente. */
export const ROTULO_CATEGORIA_BASE: Record<CategoriaBase, string> = {
  mercado: 'Mercado',
  restaurante: 'Restaurantes',
  delivery: 'Delivery',
  padaria: 'Padaria',
  transporte: 'Transporte',
  combustivel: 'Combustível',
  estacionamento: 'Estacionamento',
  viagem: 'Viagem',
  hospedagem: 'Hospedagem',
  streaming: 'Streaming',
  cinema: 'Cinema',
  lazer: 'Lazer',
  jogos: 'Jogos',
  compras: 'Compras',
  // Inclui as assinaturas de software (iCloud, ChatGPT, Adobe): "Eletrônicos"
  // seria estranho para elas, e "Tecnologia" cobre as duas coisas.
  eletronicos: 'Tecnologia',
  roupas: 'Roupas',
  saude: 'Saúde',
  farmacia: 'Farmácia',
  educacao: 'Educação',
  casa: 'Casa',
  contas: 'Contas da casa',
  telefone: 'Celular e internet',
  pet: 'Pet',
  beleza: 'Beleza',
  academia: 'Academia',
  impostos: 'Impostos',
  tarifas: 'Tarifas bancárias',
  seguros: 'Seguros',
  presentes: 'Presentes',
  transferencia: 'Transferências',
  outros: 'Outros',
}

export const CATEGORIAS_BASE = Object.keys(ROTULO_CATEGORIA_BASE) as CategoriaBase[]

type CorDaPaleta = 'cinza' | 'marrom' | 'laranja' | 'amarelo' | 'verde' | 'azul' | 'roxo' | 'rosa' | 'vermelho'

/** cor da paleta do app sugerida para criar a categoria */
export const COR_CATEGORIA_BASE: Record<CategoriaBase, CorDaPaleta> = {
  mercado: 'verde',
  restaurante: 'laranja',
  delivery: 'vermelho',
  padaria: 'amarelo',
  transporte: 'azul',
  combustivel: 'cinza',
  estacionamento: 'cinza',
  viagem: 'azul',
  hospedagem: 'roxo',
  streaming: 'vermelho',
  cinema: 'roxo',
  lazer: 'rosa',
  jogos: 'roxo',
  compras: 'amarelo',
  eletronicos: 'azul',
  roupas: 'rosa',
  saude: 'verde',
  farmacia: 'verde',
  educacao: 'azul',
  casa: 'marrom',
  contas: 'cinza',
  telefone: 'azul',
  pet: 'marrom',
  beleza: 'rosa',
  academia: 'laranja',
  impostos: 'cinza',
  tarifas: 'cinza',
  seguros: 'azul',
  presentes: 'rosa',
  transferencia: 'cinza',
  outros: 'cinza',
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Para procurar marcas: minúsculas, sem acento, pontuação vira espaço. O `&`
 * fica colado ("C & A" → "c&a") e o `+` fica ("Disney+").
 */
function paraBusca(texto: string): string {
  return semAcento(texto)
    .toLowerCase()
    .replace(/\s*&\s*/g, '&')
    .replace(/[^a-z0-9&+]+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// A chave do estabelecimento
// ---------------------------------------------------------------------------

/*
 * Os prefixos de adquirente e gateway: "PG *", "PAG*", "IFD*", "MP*"... dizem
 * por onde o dinheiro passou, não onde a compra foi. O que vem depois do `*` é
 * o estabelecimento. Podem vir encadeados ("PAG*IFD*..."), daí o laço.
 */
const PREFIXO_GATEWAY
  = /^(pg|pag|pags|pagseguro|ps|ifd|ifood|mp|mercpago|merpago|mercadopago|ec|paypal|pp|ebn|dl|dlo|sumup|stone|cielo|getnet|zp|picpay|ppro|sq|shopify)\s*\*\s*/

/** "APPLE.COM/BILL" é a cobrança da Apple — sem nada depois, a chave é "apple". */
const PREFIXO_APPLE = /^apple\.com\s*\/\s*bill\b\s*/

/** O que alguns bancos põem antes do nome na compra no débito. */
const PREFIXO_DEBITO
  = /^(?:compra|cp)\s+(?:no\s+)?(?:cartao|debito|deb|credito|cred)(?:\s+(?:visa|elo|mc|master|mastercard|deb|debito|cred|credito))*\s+/

/** "PARC 02/10", "PARCELA 2 DE 10", "02/10" — e datas "12/05", que também mudam. */
const MARCADOR_PARCELA = /\b(?:parc(?:ela)?\.?\s*)?\d{1,3}\s*(?:\/|\bde\b)\s*\d{1,3}\b/g

const PAISES = new Set(['br', 'bra', 'bras', 'brasil', 'brazil'])
const UFS = new Set([
  'ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms', 'mg', 'pa',
  'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc', 'sp', 'se', 'to',
])
/** Sufixo societário e preposição solta no fim (o extrato corta "AGENCIA DE RESTAURANTES" em "AGENCIA DE"). */
const RABICHOS = new Set(['ltda', 'eireli', 'me', 'epp', 'sa', 'de', 'da', 'do', 'das', 'dos', 'e', 'parc', 'parcela', 'com'])
/**
 * As cidades que o extrato do cartão põe no fim. Ficam de fora as que também
 * são nome de loja ("Drogaria Santos", "Padaria São José", "Pizzaria Serra").
 */
const CIDADES = [
  'sao paulo', 'rio de janeiro', 'curitiba', 'belo horizonte', 'porto alegre', 'brasilia',
  'salvador', 'fortaleza', 'recife', 'manaus', 'belem', 'goiania', 'florianopolis',
  'joao pessoa', 'maceio', 'teresina', 'campo grande', 'cuiaba', 'aracaju', 'sao luis',
  'porto velho', 'macapa', 'rio branco', 'campinas', 'guarulhos', 'osasco',
  'sao bernardo do campo', 'santo andre', 'niteroi', 'londrina', 'maringa', 'joinville',
  'blumenau', 'ribeirao preto', 'sorocaba', 'uberlandia', 'juiz de fora', 'contagem',
  'sao jose dos campos', 'barueri', 'jundiai', 'piracicaba', 'caxias do sul', 'pelotas',
  'ponta grossa', 'cascavel', 'foz do iguacu', 'sao jose dos pinhais', 'araucaria',
  'pinhais', 'campo largo', 'balneario camboriu', 'itajai', 'petropolis', 'duque de caxias',
  'nova iguacu', 'sao goncalo', 'betim', 'anapolis', 'aparecida de goiania',
  'feira de santana', 'olinda', 'jaboatao', 'vila velha', 'canoas', 'novo hamburgo',
  'sao caetano do sul', 'mogi das cruzes', 'santana de parnaiba', 'taboao da serra',
].map(c => c.split(' ')).sort((a, b) => b.length - a.length)

function terminaCom(tokens: string[], fim: string[]): boolean {
  if (tokens.length <= fim.length) return false
  return fim.every((t, i) => tokens[tokens.length - fim.length + i] === t)
}

/**
 * Tira do fim o que é lugar ou formalidade: país, UF, cidade, "LTDA", "DE".
 * Nunca esvazia — o último token fica, mesmo que seja "sp".
 */
function semRabichoNoFim(tokens: string[]): string[] {
  const t = [...tokens]
  let mudou = true
  while (mudou && t.length > 1) {
    mudou = false
    const ultimo = t[t.length - 1]!
    if (PAISES.has(ultimo) || UFS.has(ultimo) || RABICHOS.has(ultimo) || ultimo.length === 1) {
      t.pop()
      mudou = true
      continue
    }
    const cidade = CIDADES.find(c => terminaCom(t, c))
    if (cidade) {
      t.splice(t.length - cidade.length)
      mudou = true
    }
  }
  return t
}

/** Descrição de extrato → chave estável: minúsculas, sem acento, sem prefixos de adquirente/gateway (PG *, PAG*, IFD*, IFOOD *, MP*, MERCPAGO*, EC *, PAYPAL *, EBN *, DL*, APPLE.COM/BILL...), sem "PARC 02/10"/"02/10", sem cidade/UF no fim, sem números longos e sem espaços duplicados. */
export function chaveDoEstabelecimento(texto: string): string {
  let s = semAcento(texto ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
  // Se o gateway for tudo o que há ("APPLE.COM/BILL", "PAYPAL *"), a chave é ele.
  let reserva = ''

  if (PREFIXO_APPLE.test(s)) {
    s = s.replace(PREFIXO_APPLE, '')
    reserva = 'apple'
  }
  s = s.replace(PREFIXO_DEBITO, '')
  for (let i = 0; i < 3; i++) {
    const m = s.match(PREFIXO_GATEWAY)
    if (!m) break
    reserva = m[1]!
    s = s.slice(m[0].length)
  }

  s = s
    .replace(MARCADOR_PARCELA, ' ')
    // O código depois do asterisco ("AMAZON PRIME*1A2B3C", "MERCADOLIVRE*3PRODUTOS")
    // muda a cada compra; o que vem antes é a loja.
    .replace(/\*\s*[a-z0-9]*\d[a-z0-9]*/g, ' ')
    .replace(/\bwww\./g, ' ')
    .replace(/\.(?:com|net|org)(?:\.br)?\b/g, ' ')
    .replace(/\.br\b/g, ' ')
    .replace(/\s*&\s*/g, '&')

  const tokens = s
    .replace(/[^a-z0-9&+]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    // Números longos: número da loja, terminal, telefone, CNPJ.
    .filter(t => !/^\d{3,}$/.test(t) && t.replace(/\D/g, '').length < 4)

  const chave = semRabichoNoFim(tokens).join(' ')
  if (chave) return chave
  if (reserva) return reserva
  return paraBusca(texto ?? '')
}

// ---------------------------------------------------------------------------
// Marcas conhecidas
// ---------------------------------------------------------------------------

export interface Estabelecimento {
  id: string
  nome: string
  /** hex da marca */
  cor: string
  /** hex legível sobre `cor` */
  corTexto: string
  /** 1–3 caracteres para o selo */
  sigla: string
  categoria: CategoriaBase
}

/**
 * Branco sobre a cor da marca, a não ser que o contraste fique abaixo de 3:1
 * (o mínimo do WCAG para texto grande e negrito, que é o caso da sigla do selo).
 * O critério "o maior contraste" escolheria preto sobre o vermelho do iFood —
 * legível, mas com cara de outra marca.
 */
function textoLegivel(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const canal = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const l = 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255)
  return 1.05 / (l + 0.05) >= 3 ? '#FFFFFF' : '#111111'
}

/**
 * Um termo de busca. Texto: casa a partir de um começo de palavra, com espaço
 * opcional onde o termo tem espaço ("pao de acucar" casa "PAODEACUCAR"), e
 * termina em fim de palavra — a não ser que acabe em `*`, que deixa colar no
 * resto ("condor*" casa "CondorSuperCentro"). RegExp: usada como está, sobre o
 * texto de `paraBusca`.
 */
type Termo = string | RegExp

function compilar(termo: Termo): RegExp {
  if (termo instanceof RegExp) return termo
  const prefixo = termo.endsWith('*')
  const corpo = (prefixo ? termo.slice(0, -1) : termo)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/ /g, ' ?')
  return new RegExp(`(?:^| )${corpo}${prefixo ? '' : '(?= |$)'}`)
}

interface Marca extends Estabelecimento {
  termos: RegExp[]
}

function marca(
  id: string,
  nome: string,
  cor: string,
  sigla: string,
  categoria: CategoriaBase,
  termos: Termo[],
  corTexto?: string,
): Marca {
  return { id, nome, cor, corTexto: corTexto ?? textoLegivel(cor), sigla, categoria, termos: termos.map(compilar) }
}

/*
 * A ORDEM IMPORTA: a primeira marca que casa ganha. Por isso o específico vem
 * antes do genérico (Uber Eats antes de Uber, Prime Video antes de Amazon,
 * YouTube antes de Google, Xbox antes de Microsoft) e as plataformas de
 * delivery antes dos restaurantes ("IFOOD *SUBWAY" é Delivery, não Subway).
 */
const MARCAS: Marca[] = [
  // --- Delivery ---------------------------------------------------------------
  marca('uber-eats', 'Uber Eats', '#06C167', 'UE', 'delivery', ['uber eats', 'ubereats*']),
  marca('99food', '99Food', '#FFDD00', '99', 'delivery', [/(?:^| )99 ?food/]),
  marca('ifood', 'iFood', '#EA1D2C', 'iF', 'delivery', ['ifood*', 'ifd']),
  marca('rappi', 'Rappi', '#FF441F', 'R', 'delivery', ['rappi*']),
  marca('ze-delivery', 'Zé Delivery', '#FFC700', 'Zé', 'delivery', ['ze delivery*']),
  marca('aiqfome', 'aiqfome', '#7B1FA2', 'aiq', 'delivery', ['aiqfome*']),
  marca('keeta', 'Keeta', '#FFD100', 'K', 'delivery', ['keeta*']),
  marca('daki', 'Daki', '#E8175D', 'D', 'mercado', ['daki', 'soudaki*', 'jokr']),

  // --- Transporte ---------------------------------------------------------------
  marca('uber', 'Uber', '#000000', 'U', 'transporte', ['uber', 'uberbr*', 'uber trip*', 'uber do brasil']),
  marca('99', '99', '#FFDD00', '99', 'transporte', [/(?:^| )99 ?(?:app|pop|taxi|tecnologia|corridas?)(?= |$)/, /^99$/]),
  marca('cabify', 'Cabify', '#7145D6', 'Cb', 'transporte', ['cabify*']),
  marca('indrive', 'inDrive', '#C1F11D', 'iD', 'transporte', ['indrive*', 'indriver*']),
  marca('sem-parar', 'Sem Parar', '#E4002B', 'SP', 'transporte', ['sem parar*']),
  marca('conectcar', 'ConectCar', '#0090D0', 'CC', 'transporte', ['conectcar*', 'conect car']),
  marca('veloe', 'Veloe', '#7AC143', 'Vl', 'transporte', ['veloe*']),
  marca('taggy', 'Taggy', '#F15A22', 'Tg', 'transporte', ['taggy*']),
  marca('localiza', 'Localiza', '#00A859', 'Lz', 'transporte', ['localiza*']),
  marca('movida', 'Movida', '#F37021', 'Mv', 'transporte', ['movida*']),
  marca('estapar', 'Estapar', '#00539F', 'E', 'estacionamento', ['estapar*']),
  marca('zul', 'Zul+', '#1BB55C', 'Z+', 'estacionamento', ['zul digital*', 'zul+', 'zul mais', 'zuldigital*']),

  // --- Combustível ----------------------------------------------------------------
  marca('shell', 'Shell', '#FFD500', 'S', 'combustivel', ['shell', 'shellbox*', 'shell box*'], '#DD1D21'),
  marca('ipiranga', 'Ipiranga', '#FFD100', 'Ip', 'combustivel', ['posto ipiranga*', 'ipiranga', 'abastece ai*', 'km de vantagens'], '#0033A0'),
  marca('petrobras', 'Petrobras', '#008542', 'BR', 'combustivel', ['petrobras*', 'posto br', 'br distribuidora', 'vibra energia', 'br mania*']),

  // --- Farmácia -------------------------------------------------------------------
  marca('drogasil', 'Drogasil', '#E30613', 'Dr', 'farmacia', ['drogasil*']),
  marca('droga-raia', 'Droga Raia', '#0069B4', 'Ra', 'farmacia', ['droga raia*', 'drogaraia*']),
  marca('pague-menos', 'Pague Menos', '#0061AF', 'PM', 'farmacia', ['pague menos*', 'paguemenos*']),
  marca('panvel', 'Panvel', '#003F7F', 'Pv', 'farmacia', ['panvel*']),
  marca('drogaria-sao-paulo', 'Drogaria São Paulo', '#E2001A', 'DSP', 'farmacia', ['drogaria sao paulo*', 'drogaria sp', 'drogariasaopaulo*']),
  marca('pacheco', 'Drogarias Pacheco', '#009245', 'Pc', 'farmacia', ['drogaria pacheco*', 'drogarias pacheco*']),
  marca('nissei', 'Farmácias Nissei', '#E30613', 'Ns', 'farmacia', ['nissei*', 'farmacia nissei*']),
  marca('araujo', 'Drogaria Araujo', '#E3000F', 'Ar', 'farmacia', ['drogaria araujo*', 'drogarias araujo*']),

  // --- Mercado ----------------------------------------------------------------------
  marca('carrefour', 'Carrefour', '#004E9F', 'C', 'mercado', ['carrefour*']),
  marca('pao-de-acucar', 'Pão de Açúcar', '#2E8B2E', 'PA', 'mercado', ['pao de acucar*', 'pao acucar*', 'gpa pao*']),
  marca('assai', 'Assaí', '#F26522', 'As', 'mercado', ['assai*']),
  marca('atacadao', 'Atacadão', '#E30613', 'At', 'mercado', ['atacadao*']),
  marca('condor', 'Condor', '#0055A4', 'Cd', 'mercado', ['condor*']),
  marca('muffato', 'Super Muffato', '#E4002B', 'Mf', 'mercado', ['muffato*', 'super muffato*']),
  marca('big', 'Big', '#F7941D', 'Big', 'mercado', ['big bompreco*', 'hiper big', 'big hiper*', 'supermercado big', 'big supermercado*', /^big(?= |$)/]),
  marca('extra', 'Extra', '#E30613', 'Ex', 'mercado', ['extra hiper*', 'hiper extra', 'extra super*', 'mercado extra', 'supermercado extra', 'extra mercado*', /^extra(?= |$)/]),
  marca('oxxo', 'Oxxo', '#E31E24', 'Ox', 'mercado', ['oxxo*']),
  marca('sams-club', 'Sam\'s Club', '#0060A9', 'SC', 'mercado', ['sams club*', 'sam s club*']),
  marca('angeloni', 'Angeloni', '#E30613', 'An', 'mercado', ['angeloni*']),
  marca('zaffari', 'Zaffari', '#E2001A', 'Zf', 'mercado', ['zaffari*']),

  // --- Streaming (antes de Amazon, Google e Apple) --------------------------------
  marca('prime-video', 'Prime Video', '#00A8E1', 'P', 'streaming', ['prime video*', 'amazon prime*', 'amazonprime*']),
  marca('netflix', 'Netflix', '#E50914', 'N', 'streaming', ['netflix*']),
  marca('spotify', 'Spotify', '#1DB954', 'S', 'streaming', ['spotify*'], '#111111'),
  marca('disney-plus', 'Disney+', '#113CCF', 'D+', 'streaming', ['disney plus*', 'disney+', 'disney*']),
  marca('max', 'Max', '#002BE7', 'Max', 'streaming', ['hbo max*', 'hbo', 'max com', 'wbd max', 'max streaming']),
  marca('globoplay', 'Globoplay', '#FB0234', 'G', 'streaming', ['globoplay*', 'globo play*', 'globo com']),
  marca('youtube-premium', 'YouTube Premium', '#FF0000', 'YT', 'streaming', ['youtube*', 'google youtube*']),
  marca('apple-music', 'Apple Music', '#FA243C', 'AM', 'streaming', ['apple music*']),
  marca('apple-tv', 'Apple TV+', '#000000', 'tv', 'streaming', ['apple tv*']),
  marca('deezer', 'Deezer', '#A238FF', 'Dz', 'streaming', ['deezer*']),
  marca('paramount', 'Paramount+', '#0064FF', 'P+', 'streaming', ['paramount*']),
  marca('crunchyroll', 'Crunchyroll', '#F47521', 'Cr', 'streaming', ['crunchyroll*']),

  // --- Jogos (Xbox antes de Microsoft) -----------------------------------------------
  marca('steam', 'Steam', '#171A21', 'St', 'jogos', ['steam', 'steampowered*', 'steamgames*', 'valve']),
  marca('playstation', 'PlayStation', '#003791', 'PS', 'jogos', ['playstation*', 'psn', 'sony interactive*']),
  marca('xbox', 'Xbox', '#107C10', 'X', 'jogos', ['xbox*', 'microsoft xbox*']),
  marca('nintendo', 'Nintendo', '#E60012', 'Nt', 'jogos', ['nintendo*']),
  marca('epic-games', 'Epic Games', '#2F2D2E', 'EG', 'jogos', ['epic games*', 'epicgames*']),
  marca('roblox', 'Roblox', '#000000', 'Rb', 'jogos', ['roblox*']),

  // --- Tecnologia e assinaturas de software ------------------------------------------
  marca('icloud', 'iCloud', '#3693F3', 'iC', 'eletronicos', ['icloud*', 'apple icloud*']),
  marca('apple', 'Apple', '#000000', 'A', 'eletronicos', ['apple', 'apple com', 'itunes*', 'apple store']),
  marca('google', 'Google', '#4285F4', 'G', 'eletronicos', ['google*', 'googleplay*']),
  marca('openai', 'ChatGPT', '#10A37F', 'AI', 'eletronicos', ['openai*', 'chatgpt*', 'chat gpt']),
  marca('anthropic', 'Claude', '#D97757', 'Cl', 'eletronicos', ['anthropic*', 'claude ai', 'claude com', 'claude pro']),
  marca('microsoft', 'Microsoft', '#0078D4', 'MS', 'eletronicos', ['microsoft*', 'msft', 'office 365', 'microsoft 365']),
  marca('adobe', 'Adobe', '#FA0F00', 'Ad', 'eletronicos', ['adobe*']),
  marca('dropbox', 'Dropbox', '#0061FF', 'Db', 'eletronicos', ['dropbox*']),
  marca('canva', 'Canva', '#00C4CC', 'Cv', 'eletronicos', ['canva']),
  marca('github', 'GitHub', '#181717', 'GH', 'eletronicos', ['github*']),
  marca('kabum', 'KaBuM!', '#FF6500', 'KB', 'eletronicos', ['kabum*']),
  marca('casas-bahia', 'Casas Bahia', '#0033A0', 'CB', 'eletronicos', ['casas bahia*', 'casasbahia*']),

  // --- Marketplaces e compras --------------------------------------------------------
  marca('mercado-livre', 'Mercado Livre', '#FFE600', 'ML', 'compras', ['mercado livre*', 'mercadolivre*', 'mercadolibre*', 'meli'], '#2D3277'),
  marca('amazon', 'Amazon', '#FF9900', 'a', 'compras', ['amazon', 'amazon com', 'amazon br', 'amazon mktp*', 'amazon marketplace*', 'amzn*']),
  marca('shopee', 'Shopee', '#EE4D2D', 'Sh', 'compras', ['shopee*']),
  marca('magalu', 'Magalu', '#0086FF', 'Mg', 'compras', ['magalu*', 'magazine luiza*', 'magazineluiza*']),
  marca('americanas', 'Americanas', '#E60014', 'Am', 'compras', ['americanas*', 'lojas americanas*']),
  marca('aliexpress', 'AliExpress', '#E62E04', 'Ali', 'compras', ['aliexpress*', 'alibaba*', 'alipay*']),
  marca('temu', 'Temu', '#FB7701', 'Tm', 'compras', ['temu*']),
  marca('correios', 'Correios', '#FFD200', 'Co', 'compras', ['correios*'], '#0055A4'),
  marca('leroy-merlin', 'Leroy Merlin', '#78BE20', 'LM', 'casa', ['leroy merlin*', 'leroy']),
  marca('tok-stok', 'Tok&Stok', '#1A1A1A', 'T&S', 'casa', ['tok&stok*', 'tok stok*']),
  marca('cacau-show', 'Cacau Show', '#4E2A1E', 'CS', 'presentes', ['cacau show*', 'cacaushow*']),

  // --- Pet -------------------------------------------------------------------------
  marca('petz', 'Petz', '#00A0E4', 'Pz', 'pet', ['petz']),
  marca('cobasi', 'Cobasi', '#0076BE', 'Cb', 'pet', ['cobasi*']),
  marca('petlove', 'Petlove', '#6C2EB9', 'PL', 'pet', ['petlove*']),

  // --- Roupas ----------------------------------------------------------------------
  marca('shein', 'Shein', '#000000', 'SH', 'roupas', ['shein*']),
  marca('zara', 'Zara', '#000000', 'Z', 'roupas', ['zara']),
  marca('renner', 'Renner', '#D50032', 'Rn', 'roupas', ['renner*', 'lojas renner*']),
  marca('cea', 'C&A', '#0066B3', 'C&A', 'roupas', ['c&a', 'cea modas*', 'c e a modas*']),
  marca('riachuelo', 'Riachuelo', '#231F20', 'Ri', 'roupas', ['riachuelo*']),
  marca('centauro', 'Centauro', '#E30613', 'Ct', 'roupas', ['centauro*']),
  marca('netshoes', 'Netshoes', '#5F2D84', 'NS', 'roupas', ['netshoes*']),
  marca('nike', 'Nike', '#111111', 'Nk', 'roupas', ['nike', 'nike com', 'nikestore*', 'nike store*']),
  marca('adidas', 'Adidas', '#000000', 'ad', 'roupas', ['adidas*']),
  marca('decathlon', 'Decathlon', '#0082C3', 'Dc', 'roupas', ['decathlon*']),

  // --- Beleza ----------------------------------------------------------------------
  marca('boticario', 'O Boticário', '#007A3D', 'oB', 'beleza', ['boticario*', 'o boticario*']),
  marca('natura', 'Natura', '#F07D00', 'Na', 'beleza', ['natura', 'natura cosmeticos*']),
  marca('sephora', 'Sephora', '#000000', 'Sp', 'beleza', ['sephora*']),

  // --- Restaurantes ------------------------------------------------------------------
  marca('mcdonalds', 'McDonald\'s', '#DA291C', 'M', 'restaurante', ['mcdonalds*', 'mc donalds*', 'mcdonald s*', 'mcdonald', 'arcos dourados*', 'arcos dorados*'], '#FFC72C'),
  marca('burger-king', 'Burger King', '#D62300', 'BK', 'restaurante', ['burger king*', 'burgerking*', 'bk brasil*'], '#F5EBDC'),
  marca('starbucks', 'Starbucks', '#00704A', 'Sb', 'restaurante', ['starbucks*']),
  marca('outback', 'Outback', '#8B1A10', 'Ob', 'restaurante', ['outback*']),
  marca('subway', 'Subway', '#008C15', 'Sw', 'restaurante', ['subway*'], '#FFC600'),
  marca('habibs', 'Habib\'s', '#E30613', 'Hb', 'restaurante', ['habibs*', 'habib s*', 'habib']),
  marca('bobs', 'Bob\'s', '#E30613', 'Bb', 'restaurante', ['bobs', 'bob s']),
  marca('kfc', 'KFC', '#A3080C', 'KFC', 'restaurante', ['kfc']),
  marca('popeyes', 'Popeyes', '#FF7D00', 'Pp', 'restaurante', ['popeyes*']),
  marca('pizza-hut', 'Pizza Hut', '#EE3124', 'PH', 'restaurante', ['pizza hut*', 'pizzahut*']),
  marca('dominos', 'Domino\'s', '#006491', 'Dm', 'restaurante', ['dominos*', 'domino s*']),
  marca('madero', 'Madero', '#1A1A1A', 'Md', 'restaurante', ['madero*']),

  // --- Cinema e lazer ------------------------------------------------------------------
  marca('cinemark', 'Cinemark', '#C8102E', 'Cm', 'cinema', ['cinemark*']),
  marca('cinepolis', 'Cinépolis', '#002D72', 'Cp', 'cinema', ['cinepolis*']),
  marca('kinoplex', 'Kinoplex', '#E4002B', 'Kp', 'cinema', ['kinoplex*']),
  marca('ingresso-com', 'Ingresso.com', '#F6511D', 'In', 'cinema', ['ingresso com', 'ingressocom*']),
  marca('sympla', 'Sympla', '#2E86F4', 'Sy', 'lazer', ['sympla*']),
  marca('eventim', 'Eventim', '#002B5C', 'Ev', 'lazer', ['eventim*']),

  // --- Academia ------------------------------------------------------------------------
  marca('smart-fit', 'Smart Fit', '#FFC20E', 'SF', 'academia', ['smart fit*', 'smartfit*']),
  marca('wellhub', 'Wellhub', '#E5195E', 'W', 'academia', ['wellhub*', 'gympass*']),

  // --- Viagem e hospedagem -----------------------------------------------------------
  marca('azul', 'Azul', '#003C7E', 'Az', 'viagem', ['azul linhas*', 'voeazul*', 'azul viagens*', 'azul companhia*', 'azul cia*']),
  marca('gol', 'GOL', '#FF5A00', 'GOL', 'viagem', ['gol linhas*', 'voegol*', 'gol transportes*', 'gol transp*', 'gol linha*']),
  marca('latam', 'LATAM', '#1B0088', 'LA', 'viagem', ['latam*', 'tam linhas*']),
  marca('smiles', 'Smiles', '#FF7020', 'Sm', 'viagem', ['smiles']),
  marca('decolar', 'Decolar', '#4B2A8F', 'Dc', 'viagem', ['decolar*']),
  marca('airbnb', 'Airbnb', '#FF5A5F', 'ab', 'hospedagem', ['airbnb*']),
  marca('booking', 'Booking.com', '#003580', 'B.', 'hospedagem', ['booking*']),
  marca('expedia', 'Expedia', '#00355F', 'Ex', 'hospedagem', ['expedia*', 'hoteis com']),

  // --- Educação ------------------------------------------------------------------------
  marca('udemy', 'Udemy', '#A435F0', 'Ud', 'educacao', ['udemy*']),
  marca('alura', 'Alura', '#051933', 'Al', 'educacao', ['alura*']),
  marca('duolingo', 'Duolingo', '#58CC02', 'Du', 'educacao', ['duolingo*']),
  marca('coursera', 'Coursera', '#0056D2', 'Cs', 'educacao', ['coursera*']),
  marca('hotmart', 'Hotmart', '#F04E23', 'Ht', 'educacao', ['hotmart*']),

  // --- Celular e internet ------------------------------------------------------------
  marca('vivo', 'Vivo', '#660099', 'V', 'telefone', ['vivo', 'telefonica*', 'vivo movel*', 'vivo fibra*']),
  marca('claro', 'Claro', '#DA291C', 'C', 'telefone', ['claro', 'claro sa', 'claro net*', 'net servicos*']),
  marca('tim', 'TIM', '#004691', 'TIM', 'telefone', [/^tim(?= |$)/, 'tim celular*', 'tim brasil*']),

  // --- Contas da casa ------------------------------------------------------------------
  marca('copel', 'Copel', '#00579C', 'Cp', 'contas', ['copel*']),
  marca('sanepar', 'Sanepar', '#0083CA', 'Sn', 'contas', ['sanepar*']),
  marca('sabesp', 'Sabesp', '#0055A4', 'Sb', 'contas', ['sabesp*']),
  marca('enel', 'Enel', '#0555FA', 'En', 'contas', ['enel', 'enel distribuicao*']),
  marca('cemig', 'Cemig', '#007A3D', 'Cg', 'contas', ['cemig*']),
  marca('comgas', 'Comgás', '#0072BC', 'Cg', 'contas', ['comgas*']),

  // --- Seguros e impostos ----------------------------------------------------------------
  marca('porto-seguro', 'Porto Seguro', '#0046C0', 'PS', 'seguros', ['porto seguro*']),
  marca('receita-federal', 'Receita Federal', '#1351B4', 'RF', 'impostos', ['receita federal*', 'darf']),
]

/** Reconhece marcas conhecidas pela descrição OU pelo nome do estabelecimento. null se não reconhecer. */
export function reconhecerEstabelecimento(texto: string | null | undefined): Estabelecimento | null {
  const busca = paraBusca(texto ?? '')
  if (!busca) return null
  const achada = MARCAS.find(m => m.termos.some(t => t.test(busca)))
  if (!achada) return null
  const { termos: _termos, ...estabelecimento } = achada
  return estabelecimento
}

/** Quantas marcas o dicionário conhece (para teste e para a tela dizer). */
export const TOTAL_DE_MARCAS = MARCAS.length

// ---------------------------------------------------------------------------
// Categoria do espaço → base
// ---------------------------------------------------------------------------

/*
 * Palavras-chave, na ordem em que são testadas: o específico antes do geral
 * ("Celular e internet" é telefone, não conta; "Delivery" antes de comida;
 * "Farmácia" antes de saúde; "Padaria e café" antes de restaurante).
 */
const PALAVRAS_DA_CATEGORIA: Array<[CategoriaBase, RegExp]> = [
  ['delivery', /deliver|ifood|entrega/],
  ['farmacia', /farmac|droga|remedio/],
  ['padaria', /padaria|panific|confeitar|cafeter/],
  ['mercado', /mercado|feira|hortifrut|sacolao|atacad|rancho|acougue/],
  ['combustivel', /combust|gasolina|posto|etanol|abastec/],
  ['estacionamento', /estacion/],
  ['telefone', /telefon|celular|operadora|plano movel/],
  ['streaming', /streaming|assinatura|netflix|spotify|musica/],
  ['cinema', /cinema|filme|teatro|\bshows?\b|ingresso/],
  ['jogos', /\bjogos?\b|\bgames?\b|videogame/],
  ['academia', /academia|ginast|esporte|fitness|treino|crossfit|pilates/],
  ['beleza', /beleza|cabel|salao|estetic|cosmetic|maquia|barbe|manicure|perfum/],
  ['restaurante', /restaura|comida|alimenta|lanche|refeic|almoco|jantar|\bbar\b|\bbares\b|fast ?food|pizza|\bcafe\b/],
  ['transporte', /transport|uber|taxi|\b99\b|onibus|metro|corrida|mobilidade|carro|pedagio|locomoc/],
  ['hospedagem', /hosped|hotel|airbnb|pousada/],
  ['viagem', /viage|passage|aere|\bvoos?\b|turismo|ferias/],
  ['eletronicos', /eletron|tecnolog|informatic|gadget|software/],
  ['roupas', /roupa|vestu|\bmoda\b|calcad|sapato|acessorio/],
  ['saude', /saude|medic|consult|exame|dentist|terapia|psic|hospital|otica/],
  ['educacao', /educa|curso|escola|faculdade|livro|estudo|idioma|ingles/],
  ['pet', /\bpets?\b|animal|veterin|cachorro|\bgatos?\b|racao/],
  ['impostos', /impost|iptu|ipva|tribut|\biof\b|darf/],
  ['tarifas', /tarifa|juros|anuidade|banc|multa/],
  ['seguros', /seguro/],
  ['contas', /\bcontas?\b|\bluz\b|energia|\bagua\b|\bgas\b|internet|boleto/],
  ['casa', /\bcasa\b|\blar\b|movei|decora|utilidade|limpeza|manuten|reforma|constru|aluguel|condominio|moradia/],
  ['presentes', /presente|doac|aniversari|\bgifts?\b/],
  ['transferencia', /transfer|\bpix\b|\bted\b/],
  ['lazer', /lazer|diversao|entreten|passeio|\brole\b|hobby/],
  ['compras', /compra|shopping|\bloja|varejo|online|marketplace|diversos/],
  ['outros', /outro|geral|misc/],
]

/** Nome livre de categoria do espaço → base, por palavras-chave sem acento. null se não souber. */
export function categoriaBaseDoNome(nome: string | null | undefined): CategoriaBase | null {
  const n = semAcento(nome ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (!n) return null
  return PALAVRAS_DA_CATEGORIA.find(([, re]) => re.test(n))?.[0] ?? null
}

// ---------------------------------------------------------------------------
// Categoria da Pluggy → base
// ---------------------------------------------------------------------------

/*
 * A árvore de categorias da Pluggy: 8 dígitos, os 2 primeiros são a raiz e os 4
 * primeiros a subcategoria. Procura-se do mais fino para o mais grosso. `null`
 * é "conhecida, mas não é gasto com categoria" (renda, investimento, pagamento
 * da fatura) — diferente de não estar aqui.
 */
const PLUGGY_POR_ID: Record<string, CategoriaBase | null> = {
  '01': null, // Income
  '02': 'tarifas', // Loans and financing (juros, cheque especial)
  '0203': 'outros', // Financing
  '0204': 'outros', // Loans
  '03': null, // Investments
  '04': 'transferencia', // Same person transfer
  '05': 'transferencia', // Transfers
  '0510': null, // Credit card payment
  '06': 'outros', // Legal obligations
  '07': 'contas', // Services
  '0701': 'telefone', // Telecommunications
  '0702': 'educacao', // Education
  '0703': 'academia', // Wellness and fitness
  '0704': 'lazer', // Tickets
  '07040003': 'cinema', // Cinema, theater and concerts
  '08': 'compras', // Shopping
  '0802': 'eletronicos', // Electronics
  '0803': 'pet', // Pet supplies and vet
  '0804': 'roupas', // Clothing
  '0806': 'educacao', // Bookstore
  '0807': 'roupas', // Sports goods
  '0809': null, // Cashback
  '09': 'streaming', // Digital services
  '0901': 'jogos', // Gaming
  '10': 'mercado', // Groceries
  '11': 'restaurante', // Food and drinks
  '1102': 'delivery', // Food delivery
  '12': 'viagem', // Travel
  '1202': 'hospedagem', // Accommodation
  '13': 'presentes', // Donations
  '14': 'lazer', // Gambling
  '15': 'impostos', // Taxes
  '16': 'tarifas', // Bank fees
  '17': 'casa', // Housing
  '1702': 'contas', // Utilities
  '18': 'saude', // Healthcare
  '1802': 'farmacia', // Pharmacy
  '19': 'transporte', // Transportation
  '19050001': 'combustivel', // Gas stations
  '19050002': 'estacionamento', // Parking
  '19050004': 'impostos', // Vehicle ownership taxes and fees
  '20': 'seguros', // Insurance
  '21': 'lazer', // Leisure
  '99': null, // Unknown
}

const PLUGGY_POR_NOME: Record<string, CategoriaBase | null> = {
  'income': null,
  'salary': null,
  'investments': null,
  'credit card payment': null,
  'cashback': null,
  'loans and financing': 'tarifas',
  'same person transfer': 'transferencia',
  'transfers': 'transferencia',
  'transfer': 'transferencia',
  'transfer - pix': 'transferencia',
  'transfer - ted': 'transferencia',
  'transfer - bank slip': 'contas',
  'services': 'contas',
  'telecommunications': 'telefone',
  'internet': 'telefone',
  'mobile': 'telefone',
  'tv': 'streaming',
  'education': 'educacao',
  'online courses': 'educacao',
  'university': 'educacao',
  'school': 'educacao',
  'wellness and fitness': 'academia',
  'gyms and fitness centers': 'academia',
  'sports practice': 'academia',
  'wellness': 'beleza',
  'tickets': 'lazer',
  'cinema, theater and concerts': 'cinema',
  'entertainment': 'lazer',
  'leisure': 'lazer',
  'shopping': 'compras',
  'online shopping': 'compras',
  'electronics': 'eletronicos',
  'pet supplies and vet': 'pet',
  'clothing': 'roupas',
  'kids and toys': 'compras',
  'bookstore': 'educacao',
  'sports goods': 'roupas',
  'office supplies': 'compras',
  'digital services': 'streaming',
  'gaming': 'jogos',
  'video streaming': 'streaming',
  'music streaming': 'streaming',
  'groceries': 'mercado',
  'food and drinks': 'restaurante',
  'eating out': 'restaurante',
  'food delivery': 'delivery',
  'travel': 'viagem',
  'airport and airlines': 'viagem',
  'accommodation': 'hospedagem',
  'accomodation': 'hospedagem',
  'mileage programs': 'viagem',
  'bus tickets': 'viagem',
  'donations': 'presentes',
  'gambling': 'lazer',
  'lottery': 'lazer',
  'taxes': 'impostos',
  'income taxes': 'impostos',
  'tax on financial operations': 'impostos',
  'real estate taxes': 'impostos',
  'vehicle taxes': 'impostos',
  'bank fees': 'tarifas',
  'account fees': 'tarifas',
  'wire transfer fees and atm fees': 'tarifas',
  'credit card fees': 'tarifas',
  'housing': 'casa',
  'rent': 'casa',
  'utilities': 'contas',
  'water': 'contas',
  'electricity': 'contas',
  'gas': 'contas',
  'houseware': 'casa',
  'healthcare': 'saude',
  'health': 'saude',
  'dentist': 'saude',
  'pharmacy': 'farmacia',
  'optometry': 'saude',
  'hospital clinics and labs': 'saude',
  'transportation': 'transporte',
  'transport': 'transporte',
  'taxi and ride-hailing': 'transporte',
  'public transportation': 'transporte',
  'car rental': 'transporte',
  'bicycle': 'transporte',
  'automotive': 'transporte',
  'gas stations': 'combustivel',
  'parking': 'estacionamento',
  'tolls and in vehicle payment': 'transporte',
  'insurance': 'seguros',
  'life insurance': 'seguros',
  'home insurance': 'seguros',
  'health insurance': 'saude',
  'vehicle insurance': 'seguros',
}

/** categoryId hierárquico da Pluggy (8 dígitos; os 2 primeiros = raiz, os 4 primeiros = subcategoria) e/ou o nome em inglês → base. */
export function categoriaBaseDaPluggy(categoriaId?: string | null, categoria?: string | null): CategoriaBase | null {
  const id = (categoriaId ?? '').trim()
  if (/^\d{8}$/.test(id)) {
    for (const chave of [id, id.slice(0, 4), id.slice(0, 2)]) {
      if (chave in PLUGGY_POR_ID) return PLUGGY_POR_ID[chave] ?? null
    }
  }
  const nome = (categoria ?? '').trim().toLowerCase()
  if (nome && nome in PLUGGY_POR_NOME) return PLUGGY_POR_NOME[nome] ?? null
  return null
}

// ---------------------------------------------------------------------------
// Regras automáticas na sincronização
// ---------------------------------------------------------------------------

export interface RegraParaSincronizar {
  id: string
  chave: string
}

/**
 * Separa, das linhas de uma conta, as que pertencem a uma regra automática —
 * pela chave da descrição ou pela do nome do estabelecimento. É de propósito
 * mais estrito que a sugestão da caixa de entrada (que também casa pela marca
 * reconhecida): uma sugestão errada custa um toque, um lançamento automático
 * errado é uma compra no lugar errado que ninguém pediu.
 *
 * Só gasto entra. Devolve regra → linhas, sem as regras que não casaram nada.
 */
export function agruparPorRegra<T extends { descricao: string, estabelecimento_nome?: string | null, sentido: string }>(
  linhas: T[],
  regras: RegraParaSincronizar[],
): Map<string, T[]> {
  const porChave = new Map(regras.map(r => [r.chave, r.id]))
  const grupos = new Map<string, T[]>()
  if (!porChave.size) return grupos

  for (const linha of linhas) {
    if (linha.sentido !== 'saida') continue
    const id = porChave.get(chaveDoEstabelecimento(linha.descricao))
      ?? (linha.estabelecimento_nome ? porChave.get(chaveDoEstabelecimento(linha.estabelecimento_nome)) : undefined)
    if (!id) continue
    const grupo = grupos.get(id) ?? []
    grupo.push(linha)
    grupos.set(id, grupo)
  }
  return grupos
}
