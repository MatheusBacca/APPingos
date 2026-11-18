/**
 * O cartão de crédito como a pessoa pensa nele: a fatura que está aberta, quando
 * ela fecha, quando vence e quanto do limite já foi.
 *
 * O mês do calendário não serve para cartão. Uma compra no dia 27 cai na fatura
 * do mês seguinte se o cartão fecha no dia 26 — somar "o mês" dá um número que
 * não bate com a fatura que chega. Por isso tudo aqui gira em torno do CICLO:
 * do dia seguinte ao fechamento anterior até o próximo fechamento.
 *
 * As datas vêm de dois lugares, e o manual ganha:
 *   - da Pluggy (`fecha_em`, `vence_em`, `limite`), quando o banco informa;
 *   - do que a pessoa digitou (`dia_fechamento_manual`, `limite_manual`...), que
 *     existe justamente porque nem todo banco informa — e porque quem conhece o
 *     cartão é a dona dele.
 * Sem nenhum dos dois, o ciclo cai no mês do calendário e a tela diz isso.
 */
import { paraIso, partesDaData, somarDias, somarMeses, primeiroDoMes, ultimoDiaDoMes } from '@/lib/datas'

export interface DadosDoCartao {
  limite: number | null
  limite_disponivel: number | null
  fecha_em: string | null
  vence_em: string | null
  pagamento_minimo: number | null
  limite_manual: number | null
  dia_fechamento_manual: number | null
  dia_vencimento_manual: number | null
}

export interface Ciclo {
  /** Primeiro dia da fatura aberta. */
  inicio: string
  /** Dia do fechamento (inclusive). */
  fechamento: string
  vencimento: string | null
  /** De onde o ciclo saiu — a tela avisa quando é só o mês do calendário. */
  fonte: 'banco' | 'manual' | 'calendario'
}

/** O dia `dia` do mês de `mesIso`, encostando no último dia quando o mês é curto (31 → 30/28). */
function diaNoMes(mesIso: string, dia: number): string {
  const ultimo = partesDaData(ultimoDiaDoMes(mesIso)).dia
  const { ano, mes } = partesDaData(mesIso)
  return paraIso(ano, mes, Math.min(dia, ultimo))
}

/** O próximo dia `dia` a partir de `hoje` (inclusive). */
function proximoDia(hoje: string, dia: number): string {
  const esteMes = diaNoMes(primeiroDoMes(hoje), dia)
  return esteMes >= hoje ? esteMes : diaNoMes(somarMeses(primeiroDoMes(hoje), 1), dia)
}

export function limiteDoCartao(c: DadosDoCartao): number | null {
  return c.limite_manual ?? c.limite ?? null
}

export function cicloAtual(c: DadosDoCartao, hoje: string): Ciclo {
  let fechamento: string
  let fonte: Ciclo['fonte']
  // O dia "de verdade" do fechamento, antes de encostar no fim de um mês curto:
  // o cartão que fecha dia 31 fechou em 31/01, não em 28/01, mesmo vendo de fevereiro.
  let diaBase: number

  if (c.dia_fechamento_manual) {
    diaBase = c.dia_fechamento_manual
    fechamento = proximoDia(hoje, diaBase)
    fonte = 'manual'
  }
  else if (c.fecha_em) {
    // A data da Pluggy é a do fechamento corrente; se já passou (o banco ainda
    // não mandou a próxima), o ciclo seguinte fecha no mesmo dia do mês.
    diaBase = partesDaData(c.fecha_em).dia
    fechamento = c.fecha_em >= hoje ? c.fecha_em : proximoDia(hoje, diaBase)
    fonte = 'banco'
  }
  else {
    return {
      inicio: primeiroDoMes(hoje),
      fechamento: ultimoDiaDoMes(primeiroDoMes(hoje)),
      vencimento: c.dia_vencimento_manual ? proximoDia(hoje, c.dia_vencimento_manual) : null,
      fonte: 'calendario',
    }
  }

  const anterior = diaNoMes(somarMeses(primeiroDoMes(fechamento), -1), diaBase)

  let vencimento: string | null = null
  if (c.dia_vencimento_manual) vencimento = proximoDia(somarDias(fechamento, 1), c.dia_vencimento_manual)
  else if (c.vence_em && c.vence_em > fechamento) vencimento = c.vence_em
  else if (c.vence_em) vencimento = proximoDia(somarDias(fechamento, 1), partesDaData(c.vence_em).dia)

  return { inicio: somarDias(anterior, 1), fechamento, vencimento, fonte }
}

export interface LancamentoDoCartao {
  conta_id: string
  valor: number
  sentido: 'saida' | 'entrada'
  data: string
  /** `ignorada` com motivo é contagem dupla (pagamento da fatura) — não é gasto. */
  motivo_exclusao: string | null
}

/**
 * Quanto a fatura aberta já tem. Estorno (`entrada` no cartão) desconta; o
 * pagamento da fatura anterior, que a importação já marca, não entra.
 */
export function totalDoCiclo(lancamentos: LancamentoDoCartao[], contaId: string, ciclo: Ciclo): number {
  let total = 0
  for (const l of lancamentos) {
    if (l.conta_id !== contaId || l.motivo_exclusao) continue
    if (l.data < ciclo.inicio || l.data > ciclo.fechamento) continue
    total += l.sentido === 'saida' ? l.valor : -l.valor
  }
  return Math.max(0, Math.round(total * 100) / 100)
}

export type Faixa = 'tranquilo' | 'atencao' | 'alerta'

export interface UsoDoLimite {
  usado: number
  limite: number
  fracao: number
  faixa: Faixa
}

/**
 * Quanto do limite está tomado. Com o disponível do banco, é o que o banco diz
 * (inclui parcelas futuras, que comem limite sem estar na fatura aberta). Sem
 * ele — limite digitado à mão — a melhor aproximação é a fatura aberta.
 */
export function usoDoLimite(c: DadosDoCartao, faturaAberta: number): UsoDoLimite | null {
  const limite = limiteDoCartao(c)
  if (!limite) return null
  const usado = c.limite_manual == null && c.limite_disponivel != null
    ? Math.max(0, limite - c.limite_disponivel)
    : faturaAberta
  const fracao = Math.min(1, usado / limite)
  const faixa: Faixa = fracao >= 0.8 ? 'alerta' : fracao >= 0.5 ? 'atencao' : 'tranquilo'
  return { usado, limite, fracao, faixa }
}

/** Dias inteiros de `de` até `ate` (datas ISO), negativo se já passou. */
export function diasAte(de: string, ate: string): number {
  const ms = Date.UTC(...partes(ate)) - Date.UTC(...partes(de))
  return Math.round(ms / 86_400_000)
}

function partes(iso: string): [number, number, number] {
  const { ano, mes, dia } = partesDaData(iso)
  return [ano, mes - 1, dia]
}

/** "fecha hoje", "fecha amanhã", "fecha em 9 dias". */
export function quandoFecha(ciclo: Ciclo, hoje: string): string {
  const d = diasAte(hoje, ciclo.fechamento)
  if (d <= 0) return 'fecha hoje'
  if (d === 1) return 'fecha amanhã'
  return `fecha em ${d} dias`
}

export interface Fatia { id: string, valor: number, fracao: number }

/** O peso de cada cartão no total das faturas abertas — a barra empilhada do topo. */
export function distribuicao(itens: { id: string, valor: number }[]): Fatia[] {
  const total = itens.reduce((s, i) => s + i.valor, 0)
  if (total <= 0) return []
  return itens
    .filter(i => i.valor > 0)
    .map(i => ({ ...i, fracao: i.valor / total }))
    .sort((a, b) => b.valor - a.valor)
}

/**
 * A cor e a sigla de cada banco, para o selo do cartão. É identificação, não
 * logo: um quadrado na cor que todo mundo associa ao banco, com as letras.
 */
const BANCOS: { teste: RegExp, cor: string, texto: string, sigla: string }[] = [
  { teste: /ita[uú]/i, cor: '#EC7000', texto: '#FFFFFF', sigla: 'itaú' },
  { teste: /bradesco/i, cor: '#CC092F', texto: '#FFFFFF', sigla: 'b' },
  { teste: /nu ?bank|^nu\b/i, cor: '#820AD1', texto: '#FFFFFF', sigla: 'nu' },
  { teste: /santander/i, cor: '#EC0000', texto: '#FFFFFF', sigla: 'S' },
  { teste: /banco do brasil|\bbb\b/i, cor: '#FCFC30', texto: '#003DA5', sigla: 'BB' },
  { teste: /caixa/i, cor: '#005CA9', texto: '#F39200', sigla: 'CX' },
  { teste: /inter\b/i, cor: '#FF7A00', texto: '#FFFFFF', sigla: 'in' },
  { teste: /c6/i, cor: '#242424', texto: '#FFFFFF', sigla: 'C6' },
  { teste: /btg/i, cor: '#0B2340', texto: '#FFFFFF', sigla: 'btg' },
  { teste: /xp\b/i, cor: '#000000', texto: '#FFD400', sigla: 'XP' },
  { teste: /picpay/i, cor: '#21C25E', texto: '#FFFFFF', sigla: 'pp' },
  { teste: /mercado ?pago/i, cor: '#00B1EA', texto: '#FFFFFF', sigla: 'MP' },
  { teste: /sicredi/i, cor: '#3FA110', texto: '#FFFFFF', sigla: 'sc' },
  { teste: /sicoob/i, cor: '#003641', texto: '#00AE9D', sigla: 'sb' },
]

export interface SeloDeBanco { cor: string, texto: string, sigla: string }

export function seloDoBanco(nome: string): SeloDeBanco {
  const achado = BANCOS.find(b => b.teste.test(nome))
  if (achado) return { cor: achado.cor, texto: achado.texto, sigla: achado.sigla }
  const sigla = nome.trim().slice(0, 2) || '?'
  return { cor: '#52525B', texto: '#FFFFFF', sigla }
}
