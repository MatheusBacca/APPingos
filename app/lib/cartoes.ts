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
import { iconeDaInstituicao, instituicaoPorNome } from '~/lib/instituicoes'
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
  /**
   * O dia do fechamento tirado das faturas (`fechamentoPelasFaturas`): exato
   * quando a fatura traz o fechamento, estimado pelas datas das transações
   * quando não traz. Fica depois do manual e do `fecha_em` do banco.
   */
  fechamento_das_faturas?: FechamentoDasFaturas | null
}

export interface FechamentoDasFaturas {
  dia: number
  fonte: 'fatura' | 'estimado'
}

export interface Ciclo {
  /** Primeiro dia da fatura aberta. */
  inicio: string
  /** Dia do fechamento (inclusive). */
  fechamento: string
  vencimento: string | null
  /** De onde o ciclo saiu — a tela avisa quando é só o mês do calendário ou uma estimativa. */
  fonte: 'banco' | 'manual' | 'fatura' | 'estimado' | 'calendario'
}

/** O valor mais frequente; no empate, o que aparece por último (o mais recente). */
function moda(valores: number[]): number | null {
  const contagem = new Map<number, number>()
  let melhor: number | null = null
  let maior = 0
  for (const v of valores) {
    const n = (contagem.get(v) ?? 0) + 1
    contagem.set(v, n)
    if (n >= maior) {
      maior = n
      melhor = v
    }
  }
  return melhor
}

export interface FaturaParaFechamento {
  pluggy_bill_id: string
  vencimento: string
  fechamento: string | null
}

export interface LancamentoParaFechamento {
  fatura_id?: string | null
  data: string
  parcelas_total: number | null
}

/**
 * O dia do fechamento a partir das faturas fechadas.
 *
 * 1. Com o fechamento oficial (`billClosingDate`, coluna `fechamento`), é o dia
 *    mais frequente entre eles — o banco às vezes empurra para o dia útil.
 * 2. Sem ele, ESTIMA pelas transações: entre duas faturas seguidas, o fechamento
 *    fica entre a última compra da mais antiga e a véspera da primeira compra da
 *    seguinte. Usa a véspera (o fim da janela). Parcelas ficam de fora: a data
 *    delas é a da compra original, não a do lançamento.
 *
 * `null` quando não há como saber — aí o ciclo cai no calendário, como antes.
 */
export function fechamentoPelasFaturas(
  faturas: FaturaParaFechamento[],
  lancamentos: LancamentoParaFechamento[],
): FechamentoDasFaturas | null {
  const ordenadas = [...faturas].sort((a, b) => a.vencimento.localeCompare(b.vencimento))

  const oficiais = ordenadas.flatMap(f => (f.fechamento ? [partesDaData(f.fechamento).dia] : []))
  const oficial = moda(oficiais)
  if (oficial) return { dia: oficial, fonte: 'fatura' }

  const datasPorFatura = new Map<string, string[]>()
  for (const l of lancamentos) {
    if (!l.fatura_id || (l.parcelas_total ?? 1) > 1) continue
    const datas = datasPorFatura.get(l.fatura_id) ?? []
    datas.push(l.data)
    datasPorFatura.set(l.fatura_id, datas)
  }

  const vesperas: number[] = []
  for (let i = 1; i < ordenadas.length; i++) {
    const anterior = datasPorFatura.get(ordenadas[i - 1]!.pluggy_bill_id)
    const seguinte = datasPorFatura.get(ordenadas[i]!.pluggy_bill_id)
    if (!anterior?.length || !seguinte?.length) continue
    const ultima = anterior.reduce((a, b) => (a > b ? a : b))
    const primeira = seguinte.reduce((a, b) => (a < b ? a : b))
    const vespera = somarDias(primeira, -1)
    if (vespera < ultima) continue // datas que se cruzam: a janela não diz nada
    vesperas.push(partesDaData(vespera).dia)
  }

  const estimado = moda(vesperas)
  return estimado ? { dia: estimado, fonte: 'estimado' } : null
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
  else if (c.fechamento_das_faturas) {
    diaBase = c.fechamento_das_faturas.dia
    fechamento = proximoDia(hoje, diaBase)
    fonte = c.fechamento_das_faturas.fonte
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
  /** Com fatura, a transação já está numa fatura FECHADA — não é da aberta. */
  fatura_id?: string | null
  /**
   * O mês da fatura em que o BANCO diz que a compra cai (`billForecastDate`,
   * como dia 1). Cada banco usa a sua convenção — o Nubank dá o mês do
   * vencimento, o C6 o do início do ciclo —, então ele só serve comparado com o
   * das outras compras da mesma conta, nunca com uma data do calendário.
   */
  fatura_prevista?: string | null
}

/**
 * As compras que estão na fatura ABERTA de um cartão.
 *
 * Pelas datas do ciclo não dá: a parcela de uma compra antiga vem com a data da
 * compra, e cai na fatura de hoje — somar pelas datas deixava a fatura aberta
 * menor que a do banco. Quem sabe é o banco, por dois sinais:
 *
 *   1. sem `fatura_id` — o banco ainda não pôs a compra numa fatura fechada;
 *   2. `fatura_prevista` — a fatura em que ela vai cair.
 *
 * O mês aberto é o que o banco deu às compras de DENTRO do ciclo (o mais comum
 * entre elas); daí entram todas as compras soltas daquele mês, de qualquer data.
 * Assim a compra do fim do ciclo anterior que o banco ainda não ligou à fatura
 * fechada (outro mês) fica de fora, e a parcela antiga (mesmo mês) entra. Sem
 * nenhuma compra do ciclo com mês, vale o menor mês entre as soltas. Compra sem
 * `fatura_prevista` (lançamento antigo, banco que não manda) segue a data.
 */
export function lancamentosDaFaturaAberta<T extends LancamentoDoCartao>(
  lancamentos: ReadonlyArray<T>,
  contaId: string,
  ciclo: Ciclo,
): T[] {
  const soltos = lancamentos.filter(l => l.conta_id === contaId && !l.motivo_exclusao && !l.fatura_id)
  const noCiclo = (l: T) => l.data >= ciclo.inicio && l.data <= ciclo.fechamento

  const votos = new Map<string, number>()
  for (const l of soltos) {
    if (l.fatura_prevista && noCiclo(l)) votos.set(l.fatura_prevista, (votos.get(l.fatura_prevista) ?? 0) + 1)
  }
  const mesAberto = [...votos].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
    ?? soltos.map(l => l.fatura_prevista).filter((m): m is string => !!m).sort()[0]
    ?? null

  return soltos.filter(l => (l.fatura_prevista ? l.fatura_prevista === mesAberto : noCiclo(l)))
}

/**
 * Quanto a fatura aberta já tem (`lancamentosDaFaturaAberta`). Estorno
 * (`entrada` no cartão) desconta; o pagamento da fatura anterior, que a
 * importação já marca, não entra.
 */
export function totalDoCiclo(lancamentos: LancamentoDoCartao[], contaId: string, ciclo: Ciclo): number {
  let total = 0
  for (const l of lancamentosDaFaturaAberta(lancamentos, contaId, ciclo)) {
    total += l.sentido === 'saida' ? l.valor : -l.valor
  }
  return Math.max(0, Math.round(total * 100) / 100)
}


// ---- A fatura aberta por destino ---------------------------------------------

/** O destino de uma conta de cartão ou de um final dela (`cartao_bancario`). */
export interface DestinoDoCartao {
  destino: string
  space_id: string | null
}

export interface FinalDoCartao extends DestinoDoCartao {
  conta_id: string
  final: string
}

/** Para onde vai uma compra: o id do espaço compartilhado, ou `'pessoal'`. */
export type ChaveDeDestino = string

/**
 * O destino que vale para um final: o dele, a menos que siga a conta
 * (`herdar`). "Perguntar a cada compra" não é de espaço nenhum, então conta como
 * da pessoa — é o cartão dela até alguém mandar a compra para o casal.
 */
export function destinoEfetivo(conta: DestinoDoCartao, final?: DestinoDoCartao | null): ChaveDeDestino {
  const d = final && final.destino !== 'herdar' ? final : conta
  return d.destino === 'casal' && d.space_id ? d.space_id : 'pessoal'
}

export interface ParteDaFatura {
  destino: ChaveDeDestino
  valor: number
  /** Os finais que caíram nesta parte (sem os lançamentos sem final). */
  finais: string[]
}

/**
 * A fatura aberta de um cartão repartida por destino. É o que separa, numa
 * conta Nubank só, o virtual do casal dos finais da pessoa: a Pluggy entrega
 * todos na mesma conta, e só o final diz de quem é cada compra.
 *
 * O destino é o de HOJE, para o ciclo inteiro — sem olhar `designada_em`. Na
 * caixa a designação só vale para o que entrou depois dela, mas aqui a pergunta é
 * "de que espaço é este cartão", e a compra de antes da designação costuma ser
 * classificada à mão para o mesmo espaço.
 *
 * Mesmo recorte de `totalDoCiclo` (a soma das partes é a fatura aberta, a menos
 * de estorno que deixe uma parte negativa — que vai a zero, como lá). Um cartão
 * sem nada no ciclo devolve uma parte só, zerada, no destino da conta: ele
 * continua aparecendo no grupo certo.
 */
export function faturaPorDestino(
  lancamentos: ReadonlyArray<LancamentoDoCartao & { cartao_final?: string | null }>,
  conta: DestinoDoCartao & { id: string },
  finais: ReadonlyArray<FinalDoCartao>,
  ciclo: Ciclo,
): ParteDaFatura[] {
  const doFinal = new Map(finais.filter(f => f.conta_id === conta.id).map(f => [f.final, f]))
  const partes = new Map<ChaveDeDestino, { valor: number, finais: Set<string> }>()

  for (const l of lancamentosDaFaturaAberta(lancamentos, conta.id, ciclo)) {
    const destino = destinoEfetivo(conta, l.cartao_final ? doFinal.get(l.cartao_final) : null)
    const parte = partes.get(destino) ?? { valor: 0, finais: new Set<string>() }
    parte.valor += l.sentido === 'saida' ? l.valor : -l.valor
    if (l.cartao_final) parte.finais.add(l.cartao_final)
    partes.set(destino, parte)
  }

  const lista = [...partes]
    .map(([destino, p]) => ({ destino, valor: Math.max(0, Math.round(p.valor * 100) / 100), finais: [...p.finais].sort() }))
    .filter(p => p.valor > 0)
    .sort((a, b) => b.valor - a.valor)

  return lista.length ? lista : [{ destino: destinoEfetivo(conta), valor: 0, finais: [] }]
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

export interface SeloDeBanco {
  cor: string
  texto: string
  sigla: string
  /** O ícone da Pluggy, quando a instituição tem conector conhecido. */
  icone: string | null
  /** O visual do cartão daquela instituição. */
  cartao: { fundo: string, texto: string }
}

/**
 * A cor, a sigla, o ícone e o cartão de cada banco (`~/lib/instituicoes`). É
 * identificação: um quadrado na cor que todo mundo associa ao banco, com o ícone
 * que a Pluggy mostra no widget quando há.
 */
export function seloDoBanco(nome: string): SeloDeBanco {
  const achado = instituicaoPorNome(nome)
  if (achado) {
    return { cor: achado.cor, texto: achado.texto, sigla: achado.sigla, icone: iconeDaInstituicao(achado), cartao: achado.cartao }
  }
  const sigla = nome.trim().slice(0, 2) || '?'
  return {
    cor: '#52525B',
    texto: '#FFFFFF',
    sigla,
    icone: null,
    cartao: { fundo: 'linear-gradient(135deg, #71717A 0%, #52525B 55%, #27272A 100%)', texto: '#FFFFFF' },
  }
}
