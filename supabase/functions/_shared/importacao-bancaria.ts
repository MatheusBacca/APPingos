/**
 * As regras da importação bancária — do formato da Pluggy para o do APPingos.
 *
 * Fase 1 de docs/notion-plano-open-finance.md: tudo aqui é função pura, testada
 * no vitest contra fixtures montadas a partir da documentação (test/fixtures/
 * pluggy.ts), e por isso não gasta o trial da Pluggy. Mora em `_shared/` porque
 * quem aplica as regras é a Edge Function `sincronizar-pluggy` (Deno), e quem as
 * testa e mostra o resultado é o app — uma cópia em cada lado divergiria.
 *
 * As pegadinhas que este arquivo resolve, na numeração do plano:
 *   2. parcelado chega como N transações  → `chaveDaCompra`, `planoDaCompra`
 *   3. contar duas vezes                  → `motivoDeExclusao`
 *   4. id que muda                        → `provider_id` e `deduplicar`
 *   5. sinal do valor                     → `normalizarValor`
 *   6. fuso horário                       → `dataLocal`
 *   7. competência pela fatura            → `competenciaDaTransacao`
 *
 * Só `import type` (apagado na compilação) — a regra de zero imports de runtime
 * de `_shared/` continua valendo.
 */
import type {
  ContaPluggy,
  EmprestimoPluggy,
  FaturaPluggy,
  InvestimentoPluggy,
  ItemPluggy,
  MovimentoDeInvestimentoPluggy,
  ParteDoPagamento,
  TransacaoPluggy,
} from './pluggy-api.ts'

export const FUSO = 'America/Sao_Paulo'

/** Um JSON qualquer como veio da Pluggy — o mesmo formato do `Json` dos tipos do banco. */
export type JsonDaPluggy = string | number | boolean | null | { [chave: string]: JsonDaPluggy | undefined } | JsonDaPluggy[]

export type TipoConta = 'conta' | 'cartao'
export type Sentido = 'saida' | 'entrada'

/**
 * Por que uma transação sai da caixa de entrada sozinha.
 *
 * Só o que é contagem dupla CERTA entra aqui. Aplicação e resgate de
 * investimento ficam de fora de propósito: pelas decisões de 12/11/2026, uma
 * transferência para a caixinha pode virar aporte em meta, então ela precisa
 * aparecer. Estorno também fica: ele é dinheiro voltando, e quem decide o que
 * fazer com ele é a pessoa.
 */
export type MotivoExclusao = 'pagamento_fatura' | 'transferencia_propria' | 'valor_zero'

/** O que cada transação vira antes de ir para `transacao_bancaria`. */
export interface TransacaoNormalizada {
  pluggy_id: string
  /** Chave de deduplicação: `providerId`, ou o `id` com prefixo quando ele falta. */
  provider_id: string
  conta_pluggy_id: string
  descricao: string
  /** Sempre positivo. Quem diz a direção é `sentido`. */
  valor: number
  sentido: Sentido
  /** `YYYY-MM-DD` no fuso de Brasília. */
  data: string
  /** Dia 1 do mês em que a transação pesa — o da fatura, se ela for conhecida. */
  competencia: string
  pendente: boolean
  parcela_numero: number | null
  parcelas_total: number | null
  valor_total_compra: number | null
  data_compra: string | null
  fatura_id: string | null
  contraparte_nome: string | null
  contraparte_documento: string | null
  metodo: string | null
  categoria_pluggy: string | null
  /** O `categoryId` da Pluggy: hierárquico, os dois primeiros dígitos são a raiz. */
  categoria_pluggy_id: string | null
  /** `merchant.name`, ou `merchant.businessName` quando o nome fantasia falta. */
  estabelecimento_nome: string | null
  /** O CNPJ do estabelecimento, só dígitos. */
  estabelecimento_cnpj: string | null
  /** Junta as parcelas de uma mesma compra. `null` em compra à vista. */
  chave_compra: string | null
  motivo_exclusao: MotivoExclusao | null
  /** Os 4 últimos dígitos do cartão que fez a compra (físico, virtual ou adicional). */
  cartao_final: string | null
  /** Merchant Category Code do estabelecimento. */
  mcc: number | null
  tipo_cobranca: 'a_vista' | 'parcelada' | null
  /** A hora da compra, ISO 8601, quando o banco informa. */
  data_hora: string | null
  /** Dia 1 do mês da fatura prevista (`billForecastDate`). */
  fatura_prevista: string | null
  /** `billPostDate`: o dia em que entrou na fatura. */
  lancada_na_fatura_em: string | null
  /** Moeda da compra, quando não é o real. */
  moeda: string | null
  /** O valor na moeda original, quando não é o real. */
  valor_moeda_original: number | null
  /** A mensagem do Pix/TED. */
  mensagem: string | null
  tarifa_tipo: string | null
  credito_tipo: string | null
  /** Valor original, multa, juros e desconto do boleto pago. */
  boleto: BoletoPago | null
}

export interface BoletoPago {
  valor_original: number | null
  multa: number | null
  juros: number | null
  desconto: number | null
}

/** O que a importação sabe da pessoa — para reconhecer o que é dela mesma. */
export interface ContextoImportacao {
  /** CPFs/CNPJs dos titulares das contas da pessoa, só dígitos. */
  documentosProprios: string[]
  /** Nomes dos titulares, já passados por `normalizarNome`. */
  nomesProprios: string[]
  /** `billId` → vencimento (`YYYY-MM-DD`), quando a Pluggy entrega faturas. */
  vencimentoDasFaturas?: Record<string, string>
}

const centavos = (v: number) => Math.round(v * 100) / 100

// ---------------------------------------------------------------------------
// Datas (pegadinhas 6 e 7)
// ---------------------------------------------------------------------------

const formatoLocal = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * A data de calendário em Brasília.
 *
 * A Pluggy manda `date` em ISO 8601 UTC, e uma compra às 22h de 31/08 aqui é
 * 01h de 01/09 lá — truncar o texto poria a compra no mês errado. Daí converter
 * para `America/Sao_Paulo` antes de cortar.
 *
 * A EXCEÇÃO é meia-noite UTC exata. Banco que só informa o dia (sem hora) chega
 * como `T00:00:00.000Z`, e converter isso daria o dia ANTERIOR em Brasília — o
 * mesmo erro, no sentido oposto. Meia-noite exata no milissegundo é o carimbo de
 * "só a data", e aí o dia escrito é o dia certo. O custo é uma compra feita às
 * 21h00min00s000 de Brasília cair no dia seguinte, e ele é aceito.
 */
export function dataLocal(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  if (/T00:00(:00(\.0+)?)?(Z|[+-]00:?00)$/.test(iso)) return iso.slice(0, 10)

  const instante = new Date(iso)
  if (Number.isNaN(instante.getTime())) throw new Error(`data inválida vinda da Pluggy: ${iso}`)

  return formatoLocal.format(instante)
}

/** Dia 1 do mês da data. */
export function competenciaDe(data: string): string {
  return `${data.slice(0, 7)}-01`
}

/** Anda `n` meses numa competência (dia 1), sem passar por `Date`. */
export function somarMesesCompetencia(competencia: string, n: number): string {
  const ano = Number(competencia.slice(0, 4))
  const mes = Number(competencia.slice(5, 7))
  const total = ano * 12 + (mes - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
}

/**
 * Em que mês a transação pesa.
 *
 * Com o vencimento da fatura, é o mês dele — a compra de 28/07 que cai na fatura
 * que vence em 10/08 é gasto de agosto, que é como o casal já lança à mão. Sem
 * fatura (conta corrente, ou conexão que não a entrega), é o mês da data.
 */
export function competenciaDaTransacao(data: string, vencimentoFatura?: string | null): string {
  return competenciaDe(vencimentoFatura ? dataLocal(vencimentoFatura) : data)
}

// ---------------------------------------------------------------------------
// Valor (pegadinha 5)
// ---------------------------------------------------------------------------

export function tipoDaConta(conta: Pick<ContaPluggy, 'type'>): TipoConta {
  return conta.type === 'CREDIT' ? 'cartao' : 'conta'
}

/**
 * Valor sempre positivo e a direção à parte, para o resto do app não precisar
 * saber de convenção de sinal.
 *
 * No cartão, o sinal manda: positivo é gasto, negativo é pagamento ou estorno.
 * Na conta, quem manda é `type` (`DEBIT` sai, `CREDIT` entra); sem ele, o sinal
 * (negativo sai). Convenção da documentação — confirmar com a amostra real.
 */
export function normalizarValor(
  amount: number,
  type: TransacaoPluggy['type'],
  tipoConta: TipoConta,
): { valor: number, sentido: Sentido } {
  const valor = centavos(Math.abs(amount))

  if (tipoConta === 'cartao') return { valor, sentido: amount < 0 ? 'entrada' : 'saida' }
  if (type === 'DEBIT') return { valor, sentido: 'saida' }
  if (type === 'CREDIT') return { valor, sentido: 'entrada' }
  return { valor, sentido: amount < 0 ? 'saida' : 'entrada' }
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Para comparar nomes de titular e contraparte: sem acento, caixa nem pontuação. */
export function normalizarNome(nome: string | null | undefined): string {
  return semAcento(nome ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Só os dígitos de um CPF/CNPJ. Mascarado (`***.456.789-**`) fica incompleto e não casa. */
export function soDigitos(doc: string | null | undefined): string {
  return (doc ?? '').replace(/\D/g, '')
}

/**
 * A descrição sem o que muda de uma parcela para outra.
 *
 * "LOJA X PARC 02/10" e "LOJA X PARC 03/10" são a mesma compra. Tira o marcador
 * de parcela ("02/10", "2 de 10", "parc 2/10"), acento, caixa e pontuação.
 */
export function normalizarDescricao(descricao: string): string {
  return normalizarNome(
    semAcento(descricao)
      .toLowerCase()
      .replace(/\b(parc(ela)?\.?\s*)?\d{1,3}\s*(\/|de)\s*\d{1,3}\b/g, ' ')
      .replace(/\bparc(ela)?\b/g, ' '),
  ).replace(/\s+/g, ' ')
}

const MARCADOR_DE_PARCELA = /[\s\-–]*\b(parc(ela)?\.?\s*)?\d{1,3}\s*(\/|de)\s*\d{1,3}\s*$/i

/**
 * A descrição que a compra recebe: a do banco sem o "PARC 03/10" do fim, que
 * na compra (uma linha para as N parcelas) seria mentira a partir do mês seguinte.
 */
export function descricaoDaCompra(descricao: string): string {
  return descricao.replace(MARCADOR_DE_PARCELA, '').trim() || descricao.trim()
}

// ---------------------------------------------------------------------------
// Contagem dupla (pegadinha 3)
// ---------------------------------------------------------------------------

const CATEGORIA_PAGAMENTO_FATURA = /credit card payment/i
const CATEGORIA_TRANSFERENCIA_PROPRIA = /same person transfer|same ownership/i
const DESCRICAO_PAGAMENTO_FATURA
  = /\b(pag(amento|to)?|pgto)\s*(de\s*)?(fatura|cartao( de credito)?|cart credito)\b/
const DESCRICAO_PAGAMENTO_NO_CARTAO = /\b(pag(amento|to)?|pgto)\b/
/**
 * Compra feita com o cartão de DÉBITO, que sai da conta corrente. Alguns bancos
 * (o C6, na primeira amostra real) a categorizam como "Credit card payment" —
 * e confiar só na categoria escondia da caixa de entrada todo gasto no débito.
 */
const DESCRICAO_COMPRA_NO_DEBITO = /\b(debito de cartao|deb(ito)? cartao|compra (no |com )?(cartao de )?debito|cartao de debito|compra debito)\b/
/** O `operationType` do Open Finance para o pagamento da fatura. */
const OPERACAO_PAGAMENTO_FATURA = /^pagamento_fatura$/i
const DESCRICAO_TRANSFERENCIA_PROPRIA = /mesma titularidade|entre contas proprias|transf(erencia)? propria/

function contraparteDe(t: TransacaoPluggy, sentido: Sentido): ParteDoPagamento | null {
  const p = t.paymentData
  if (!p) return null
  return (sentido === 'saida' ? p.receiver : p.payer) ?? null
}

/**
 * Se a transação é contagem dupla e por isso não pode virar compra.
 *
 * - **Pagamento de fatura.** O gasto já entrou pelas transações do cartão; o
 *   débito na conta que paga a fatura é o mesmo dinheiro, e o crédito na conta
 *   do cartão também.
 * - **Transferência entre contas próprias.** Contraparte com o documento (ou o
 *   nome) de um titular das contas da própria pessoa.
 *
 * A categoria da Pluggy é usada enquanto vier (é recurso do trial); depois dela
 * sobram descrição e contraparte, que é por isso que as duas existem.
 */
export function motivoDeExclusao(
  t: TransacaoPluggy,
  tipoConta: TipoConta,
  sentido: Sentido,
  valor: number,
  contexto: ContextoImportacao,
): MotivoExclusao | null {
  if (valor === 0) return 'valor_zero'

  const categoria = t.category ?? ''
  const descricao = normalizarNome(t.description)

  // O próprio Open Finance dizendo que é pagamento de fatura: o sinal mais forte.
  if (OPERACAO_PAGAMENTO_FATURA.test(t.operationType ?? '') || OPERACAO_PAGAMENTO_FATURA.test(t.paymentData?.paymentMethod ?? '')) {
    return 'pagamento_fatura'
  }
  // A categoria vale, menos para compra no débito na conta: o banco pode
  // classificá-la como pagamento de cartão, e ela é gasto de verdade.
  const compraNoDebito = tipoConta === 'conta' && DESCRICAO_COMPRA_NO_DEBITO.test(descricao)
  if (CATEGORIA_PAGAMENTO_FATURA.test(categoria) && !compraNoDebito) return 'pagamento_fatura'
  if (tipoConta === 'conta' && sentido === 'saida' && DESCRICAO_PAGAMENTO_FATURA.test(descricao)) {
    return 'pagamento_fatura'
  }
  // Na conta do cartão, uma entrada que se diz pagamento é a fatura sendo paga.
  // Estorno também é entrada no cartão, mas não fala em "pagamento" e fica.
  if (tipoConta === 'cartao' && sentido === 'entrada' && DESCRICAO_PAGAMENTO_NO_CARTAO.test(descricao)) {
    return 'pagamento_fatura'
  }

  if (CATEGORIA_TRANSFERENCIA_PROPRIA.test(categoria)) return 'transferencia_propria'
  if (DESCRICAO_TRANSFERENCIA_PROPRIA.test(descricao)) return 'transferencia_propria'

  const contraparte = contraparteDe(t, sentido)
  const documento = soDigitos(contraparte?.documentNumber?.value)
  if (documento.length >= 11 && contexto.documentosProprios.includes(documento)) {
    return 'transferencia_propria'
  }
  const nome = normalizarNome(contraparte?.name)
  if (nome && contexto.nomesProprios.includes(nome)) return 'transferencia_propria'

  return null
}

// ---------------------------------------------------------------------------
// Parcelas (pegadinha 2)
// ---------------------------------------------------------------------------

/**
 * O que junta as N parcelas de uma compra numa só.
 *
 * Heurística do plano: cartão + data da compra + valor total + número de
 * parcelas + descrição normalizada. Sem `purchaseDate`, o mês da compra é
 * deduzido recuando a competência da parcela; sem `totalAmount`, o valor sai da
 * chave (sobra mês, parcelas e descrição, que ainda separa bem). É sugestão —
 * a caixa de entrada mostra e a pessoa confirma.
 */
export function chaveDaCompra(t: Pick<
  TransacaoNormalizada,
  'conta_pluggy_id' | 'parcela_numero' | 'parcelas_total' | 'valor_total_compra'
  | 'data_compra' | 'descricao' | 'competencia'
>): string | null {
  if (!t.parcelas_total || t.parcelas_total < 2) return null

  const quando = t.data_compra
    ?? somarMesesCompetencia(t.competencia, -((t.parcela_numero ?? 1) - 1)).slice(0, 7)
  const valor = t.valor_total_compra != null ? t.valor_total_compra.toFixed(2) : '?'

  return [t.conta_pluggy_id, quando, valor, t.parcelas_total, normalizarDescricao(t.descricao)].join('|')
}

/** A compra que a primeira parcela vista cria — os argumentos de `registrar_compra`. */
export interface PlanoDaCompra {
  descricao: string
  valor_total: number
  parcelas: number
  data_compra: string
  competencia_inicial: string
  /**
   * Quantos meses a competência recuou: a primeira vista era a parcela k, então
   * as k − 1 anteriores caem em meses que já passaram — e talvez já acertados.
   */
  recuo_meses: number
}

/**
 * A compra que uma parcela representa.
 *
 * Se a primeira vista é a parcela k de N (compra anterior à conexão), a
 * `competencia_inicial` recua k − 1 meses: a parcela 3 de 10 que cai em
 * novembro é de uma compra cuja primeira parcela caiu em setembro. Assim a
 * `parcela_mensal` põe cada parcela no mês em que o banco a cobrou.
 */
export function planoDaCompra(t: TransacaoNormalizada): PlanoDaCompra {
  const parcelas = t.parcelas_total && t.parcelas_total > 1 ? t.parcelas_total : 1
  const numero = parcelas > 1 ? Math.min(Math.max(t.parcela_numero ?? 1, 1), parcelas) : 1
  const recuo = numero - 1

  return {
    descricao: parcelas > 1 ? descricaoDaCompra(t.descricao) : t.descricao,
    valor_total: parcelas > 1
      ? (t.valor_total_compra ?? centavos(t.valor * parcelas))
      : t.valor,
    parcelas,
    data_compra: t.data_compra ?? t.data,
    competencia_inicial: somarMesesCompetencia(t.competencia, -recuo),
    recuo_meses: recuo,
  }
}

// ---------------------------------------------------------------------------
// Normalização de uma transação
// ---------------------------------------------------------------------------

export interface ContaDaTransacao {
  pluggyId: string
  tipo: TipoConta
}

/**
 * Quem vendeu, pelo `merchant` do enriquecimento da Pluggy.
 *
 * O nome fantasia (`name`) é o que a pessoa reconhece ("iFood"); a razão social
 * (`businessName`) só entra quando ele falta. O CNPJ vai só com os dígitos, para
 * casar igual venha ele formatado ou não. Vazio vira `null` — e a ingestão, com
 * `null`, mantém o que já estava gravado.
 */
export function estabelecimentoDe(t: Pick<TransacaoPluggy, 'merchant'>): {
  estabelecimento_nome: string | null
  estabelecimento_cnpj: string | null
} {
  const m = t.merchant
  return {
    estabelecimento_nome: m?.name?.trim() || m?.businessName?.trim() || null,
    estabelecimento_cnpj: soDigitos(m?.cnpj) || null,
  }
}

/**
 * Os 4 últimos dígitos de um número de cartão, como o banco mandar
 * ("0750", "**** 0750", "5162 92** **** 0750"). `null` sem 4 dígitos no fim.
 */
export function finalDoCartao(numero: string | null | undefined): string | null {
  const digitos = soDigitos(numero)
  return digitos.length >= 4 ? digitos.slice(-4) : null
}

/** `YYYY-MM` ou `YYYY-MM-DD` → dia 1 do mês; o resto vira `null`. */
function mesDaFatura(valor: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(valor?.trim() ?? '')
  return m ? `${m[1]}-${m[2]}-01` : null
}

function textoOuNulo(v: string | null | undefined): string | null {
  return v?.trim() || null
}

/**
 * Tipo de tarifa ou de crédito contratado, sem o enchimento do banco. O Nubank
 * manda `"OTHER"` com informação adicional `"NA"` em TODA compra (amostra real
 * de 20/11/2026) — isso não é tarifa nenhuma, e gravar faria toda compra parecer
 * uma cobrança do banco.
 */
function tipoInformado(tipo: string | null | undefined, info: string | null | undefined): string | null {
  const t = textoOuNulo(tipo)
  if (!t) return null
  const extra = textoOuNulo(info)
  if (t === 'OTHER' && (!extra || /^n\/?a$/i.test(extra))) return null
  return t
}

/**
 * Os campos que a importação só passou a guardar na onda 1 do plano
 * docs/plano-open-finance-campos-novos.md. Tudo é opcional na Pluggy, e o que
 * não veio sai `null` (a ingestão mantém o valor anterior nesse caso).
 */
export function camposExtrasDaTransacao(t: TransacaoPluggy) {
  const c = t.creditCardMetadata ?? null
  const moeda = textoOuNulo(t.currencyCode)?.toUpperCase() ?? null
  const estrangeira = !!moeda && moeda !== 'BRL' && /^[A-Z]{3}$/.test(moeda)
  // Na resposta real (20/11/2026) o boleto vem DENTRO de `paymentData`; o de cima fica por garantia.
  const b = t.paymentData?.boletoMetadata ?? t.boletoMetadata ?? null
  const boleto: BoletoPago | null = b && [b.baseAmount, b.penaltyAmount, b.interestAmount, b.discountAmount].some(v => typeof v === 'number')
    ? {
        valor_original: valorOuNulo(b.baseAmount),
        multa: valorOuNulo(b.penaltyAmount),
        juros: valorOuNulo(b.interestAmount),
        desconto: valorOuNulo(b.discountAmount),
      }
    : null
  const mcc = typeof c?.payeeMCC === 'number' && Number.isInteger(c.payeeMCC) && c.payeeMCC >= 0 && c.payeeMCC <= 9999
    ? c.payeeMCC
    : null
  const instante = c?.transactionDateTime ? new Date(c.transactionDateTime) : null

  return {
    cartao_final: finalDoCartao(c?.cardNumber),
    mcc,
    tipo_cobranca: c?.paymentType === 'SINGLE' ? 'a_vista' as const : c?.paymentType === 'INSTALLMENT' ? 'parcelada' as const : null,
    data_hora: instante && !Number.isNaN(instante.getTime()) ? instante.toISOString() : null,
    fatura_prevista: mesDaFatura(c?.billForecastDate),
    lancada_na_fatura_em: /^\d{4}-\d{2}-\d{2}/.test(c?.billPostDate ?? '') ? c!.billPostDate!.slice(0, 10) : null,
    moeda: estrangeira ? moeda : null,
    // Na Pluggy, `amount` é na moeda da transação e `amountInAccountCurrency` em reais.
    valor_moeda_original: estrangeira ? valorOuNulo(Math.abs(t.amount)) : null,
    mensagem: textoOuNulo(t.paymentData?.reason),
    tarifa_tipo: tipoInformado(c?.feeType, c?.feeTypeAdditionalInfo),
    credito_tipo: tipoInformado(c?.otherCreditsType, c?.otherCreditsAdditionalInfo),
    boleto,
  }
}

/** Uma transação da Pluggy no formato de `transacao_bancaria`. */
export function normalizarTransacao(
  t: TransacaoPluggy,
  conta: ContaDaTransacao,
  contexto: ContextoImportacao,
): TransacaoNormalizada {
  /*
    Compra em outra moeda: `amount` vem na moeda da compra (USD 20) e o que pesa
    na fatura é `amountInAccountCurrency` (R$ 110). Sem este, o valor em dólar
    entraria como se fosse real.
  */
  const emReais = t.currencyCode && t.currencyCode.toUpperCase() !== 'BRL' && typeof t.amountInAccountCurrency === 'number'
    ? Math.sign(t.amount || 1) * Math.abs(t.amountInAccountCurrency)
    : t.amount
  const { valor, sentido } = normalizarValor(emReais, t.type, conta.tipo)
  const data = dataLocal(t.date)
  const cartao = t.creditCardMetadata ?? null
  const faturaId = cartao?.billId ?? null
  const vencimento = faturaId ? contexto.vencimentoDasFaturas?.[faturaId] : null
  const contraparte = contraparteDe(t, sentido)
  const total = cartao?.totalInstallments ?? null
  const parcelado = total != null && total > 1

  const base = {
    pluggy_id: t.id,
    provider_id: t.providerId?.trim() || `pluggy:${t.id}`,
    conta_pluggy_id: conta.pluggyId,
    descricao: (t.description || t.descriptionRaw || 'Sem descrição').trim(),
    valor,
    sentido,
    data,
    competencia: competenciaDaTransacao(data, vencimento),
    pendente: t.status === 'PENDING',
    parcela_numero: parcelado ? (cartao?.installmentNumber ?? null) : null,
    parcelas_total: parcelado ? total : null,
    valor_total_compra: parcelado && cartao?.totalAmount != null ? centavos(Math.abs(cartao.totalAmount)) : null,
    data_compra: cartao?.purchaseDate ? dataLocal(cartao.purchaseDate) : null,
    fatura_id: faturaId,
    contraparte_nome: contraparte?.name?.trim() || null,
    contraparte_documento: contraparte?.documentNumber?.value?.trim() || null,
    metodo: t.paymentData?.paymentMethod ?? t.operationType ?? null,
    categoria_pluggy: t.category ?? null,
    categoria_pluggy_id: t.categoryId?.trim() || null,
    ...estabelecimentoDe(t),
    motivo_exclusao: motivoDeExclusao(t, conta.tipo, sentido, valor, contexto),
    ...camposExtrasDaTransacao(t),
  }

  return {
    ...base,
    // Só gasto se parcela: parcela de estorno não monta compra.
    chave_compra: base.sentido === 'saida' ? chaveDaCompra(base) : null,
  }
}

// ---------------------------------------------------------------------------
// O lote (pegadinha 4)
// ---------------------------------------------------------------------------

/**
 * Uma transação por `provider_id`, a mais recente vencendo.
 *
 * A mesma transação aparece duas vezes num lote quando a página muda durante a
 * leitura, ou quando o banco a reemite ao trocar `PENDING` por `POSTED`. A
 * lançada (não pendente) vence sempre; entre duas iguais, vence a que veio
 * depois. O banco garante o mesmo entre execuções, pelo índice único.
 */
export function deduplicar(transacoes: TransacaoNormalizada[]): TransacaoNormalizada[] {
  const porChave = new Map<string, TransacaoNormalizada>()

  for (const t of transacoes) {
    const anterior = porChave.get(t.provider_id)
    if (anterior && !anterior.pendente && t.pendente) continue
    porChave.set(t.provider_id, t)
  }

  return [...porChave.values()]
}

/** Uma compra importada: o plano dela e as parcelas que a formam. */
export interface CompraImportada {
  chave: string
  plano: PlanoDaCompra
  transacoes: TransacaoNormalizada[]
}

/**
 * As parcelas de uma mesma compra juntas — compra parcelada é UMA linha
 * (decisão nº 1 de Orçamentos), e não N.
 *
 * O plano sai da parcela de menor número vista: é dela que o recuo da
 * competência é calculado. O que não é parcela segue avulso.
 */
export function agruparParcelas(transacoes: TransacaoNormalizada[]): {
  compras: CompraImportada[]
  avulsas: TransacaoNormalizada[]
} {
  const grupos = new Map<string, TransacaoNormalizada[]>()
  const avulsas: TransacaoNormalizada[] = []

  for (const t of transacoes) {
    if (!t.chave_compra) {
      avulsas.push(t)
      continue
    }
    const grupo = grupos.get(t.chave_compra) ?? []
    grupo.push(t)
    grupos.set(t.chave_compra, grupo)
  }

  const compras = [...grupos.entries()].map(([chave, grupo]) => {
    const ordenado = [...grupo].sort((a, b) => (a.parcela_numero ?? 0) - (b.parcela_numero ?? 0))
    return { chave, plano: planoDaCompra(ordenado[0]!), transacoes: ordenado }
  })

  return { compras, avulsas }
}

/** Uma compra pronta para `lancar_compras_do_cartao` (o cartão designado). */
export interface CompraParaLancar {
  provider_ids: string[]
  descricao: string
  valor_total: number
  parcelas: number
  data_compra: string
  competencia_inicial: string
}

/**
 * As compras que o cartão designado ("do casal" ou "pessoal") lança sozinho.
 *
 * Só gasto lançado (não pendente) e que não é contagem dupla. As parcelas de uma
 * mesma compra viram UMA, com o plano da menor parcela vista (recuo incluído).
 * O banco ainda filtra o que já foi classificado e o que é de antes da
 * designação — aqui é só o plano.
 */
export function comprasParaLancar(linhas: TransacaoNormalizada[]): CompraParaLancar[] {
  const elegiveis = linhas.filter(t => t.sentido === 'saida' && !t.pendente && !t.motivo_exclusao && t.valor > 0)
  const { compras, avulsas } = agruparParcelas(elegiveis)

  const plano = (p: PlanoDaCompra, transacoes: TransacaoNormalizada[]): CompraParaLancar => ({
    provider_ids: transacoes.map(t => t.provider_id),
    descricao: p.descricao,
    valor_total: p.valor_total,
    parcelas: p.parcelas,
    data_compra: p.data_compra,
    competencia_inicial: p.competencia_inicial,
  })

  return [
    ...compras.map(c => plano(c.plano, c.transacoes)),
    ...avulsas.map(t => plano(planoDaCompra(t), [t])),
  ]
}

// ---------------------------------------------------------------------------
// A janela de cada sincronização
// ---------------------------------------------------------------------------

/** Na primeira vez, quanto do passado buscar. */
export const JANELA_INICIAL_DIAS = 90

/**
 * Quanto voltar antes da última sincronização. O banco corrige transações dias
 * depois (pendente → lançada, valor ajustado, descrição trocada) e o upsert por
 * `provider_id` torna a releitura inócua — então sobra sobrepor.
 */
export const SOBREPOSICAO_DIAS = 10

function somarDiasIso(data: string, n: number): string {
  const d = new Date(Date.UTC(Number(data.slice(0, 4)), Number(data.slice(5, 7)) - 1, Number(data.slice(8, 10)) + n))
  return d.toISOString().slice(0, 10)
}

/** De quando a quando pedir as transações, em datas de Brasília. */
export function janelaDeSincronizacao(sincronizadoEm: string | null, hoje: string): { de: string, ate: string } {
  const de = sincronizadoEm
    ? somarDiasIso(dataLocal(sincronizadoEm), -SOBREPOSICAO_DIAS)
    : somarDiasIso(hoje, -JANELA_INICIAL_DIAS)
  return { de, ate: hoje }
}

/** `billId` → vencimento, para a competência sair da fatura (pegadinha 7). */
export function vencimentosDasFaturas(faturas: Array<{ id: string, dueDate: string }>): Record<string, string> {
  return Object.fromEntries(faturas.map(f => [f.id, f.dueDate]))
}

/** O lote de uma conta pronto para `ingerir_transacoes`: normalizado e sem repetição. */
export function linhasDaConta(
  transacoes: TransacaoPluggy[],
  conta: ContaDaTransacao,
  contexto: ContextoImportacao,
): TransacaoNormalizada[] {
  return deduplicar(transacoes.map(t => normalizarTransacao(t, conta, contexto)))
}

// ---------------------------------------------------------------------------
// Conexão e contas — o mesmo mapeamento no cadastro (Nuxt) e na sincronização
// ---------------------------------------------------------------------------

/** As colunas de `conexao_bancaria` que vêm do item (sem `user_id`). */
export function camposDaConexao(item: ItemPluggy) {
  return {
    item_id: item.id,
    banco: item.connector?.name ?? '',
    banco_logo_url: item.connector?.imageUrl ?? null,
    status: item.status,
    consentimento_expira_em: item.consentExpiresAt ?? null,
    atualizada_na_pluggy_em: item.lastUpdatedAt ?? null,
    situacao_execucao: item.executionStatus ?? null,
    // Por produto (contas, cartões, transações, investimentos...): `isUpdated` e avisos.
    situacao_produtos: item.statusDetail && typeof item.statusDetail === 'object' ? item.statusDetail as JsonDaPluggy : null,
  }
}

/**
 * As colunas de `conta_bancaria` que vêm da Pluggy.
 *
 * `destino` e `space_id` NÃO estão aqui de propósito: são escolha da pessoa, e
 * o upsert da sincronização reescreve só o que está no objeto. Pôr o destino
 * aqui faria cada sincronização devolver o cartão do casal para "perguntar".
 */
export function camposDaConta(conta: ContaPluggy) {
  const tipo = tipoDaConta(conta)
  const numero = conta.number?.trim() || null
  return {
    pluggy_account_id: conta.id,
    tipo,
    nome: (conta.marketingName || conta.name || (tipo === 'cartao' ? 'Cartão' : 'Conta')).trim(),
    // De cartão, só o fim: é o que a fatura e o app do banco mostram.
    numero: tipo === 'cartao' && numero ? numero.replace(/\D/g, '').slice(-4) || numero : numero,
    titular_nome: conta.owner?.trim() || null,
    titular_documento: conta.taxNumber?.trim() || null,
  }
}

/** As colunas de crédito de `conta_bancaria` — as que a Pluggy escreve, nunca as `*_manual`. */
export interface CamposDeCredito {
  limite: number | null
  limite_disponivel: number | null
  /** `YYYY-MM-DD` em Brasília. */
  fecha_em: string | null
  /** `YYYY-MM-DD` em Brasília. */
  vence_em: string | null
  pagamento_minimo: number | null
}

const valorOuNulo = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? centavos(v) : null

/** `dataLocal` que não derruba a sincronização por uma data torta num campo de bônus. */
function dataLocalOuNula(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null
  try {
    return dataLocal(iso.trim())
  }
  catch {
    return null
  }
}

/**
 * O limite e o ciclo da fatura atual, de `creditData`.
 *
 * Tudo é opcional na Pluggy: o que não veio sai `null` (e conta sem `creditData`,
 * como a corrente, sai toda `null`). As datas chegam em UTC e viram o dia de
 * Brasília pela mesma `dataLocal` das transações — um fechamento às 02h UTC do
 * dia 4 é dia 3 aqui. Limite negativo não existe (a coluna recusa): vira `null`.
 */
export function camposDeCreditoDaConta(conta: Pick<ContaPluggy, 'creditData'>): CamposDeCredito {
  const c = conta.creditData ?? null
  const limite = valorOuNulo(c?.creditLimit)
  return {
    limite: limite != null && limite >= 0 ? limite : null,
    limite_disponivel: valorOuNulo(c?.availableCreditLimit),
    fecha_em: dataLocalOuNula(c?.balanceCloseDate),
    vence_em: dataLocalOuNula(c?.balanceDueDate),
    pagamento_minimo: valorOuNulo(c?.minimumPayment),
  }
}

/**
 * Só os campos de crédito que vieram — o objeto do `update` da conta.
 *
 * O banco às vezes deixa de mandar um campo de uma sincronização para outra, e
 * o limite de ontem é mais útil que um buraco. Por isso nada de `null` aqui: o
 * que não veio não é escrito. Objeto vazio = nada a atualizar.
 *
 * (Não vai junto no upsert de `camposDaConta`: num upsert de várias linhas o
 * PostgREST grava `null` na coluna que falta numa delas, e um cartão sem limite
 * apagaria o do vizinho.)
 */
export function creditoParaAtualizar(conta: Pick<ContaPluggy, 'creditData'>): Partial<CamposDeCredito> {
  return Object.fromEntries(
    Object.entries(camposDeCreditoDaConta(conta)).filter(([, v]) => v != null),
  ) as Partial<CamposDeCredito>
}

/** Saldo, dados da conta corrente e o perfil do cartão (bandeira, nível, situação...). */
export interface CamposExtrasDaConta {
  saldo: number | null
  moeda: string | null
  saldo_com_pendentes: number | null
  saldo_aplicado_automatico: number | null
  cheque_especial_limite: number | null
  cheque_especial_usado: number | null
  agencia_conta: string | null
  bandeira: string | null
  nivel: string | null
  situacao_cartao: 'ACTIVE' | 'BLOCKED' | 'CANCELLED' | null
  titularidade: 'MAIN' | 'ADDITIONAL' | null
  limite_flexivel: boolean | null
  saldo_moeda_estrangeira: number | null
  limites_detalhados: Array<Record<string, unknown>> | null
}

export function camposExtrasDaConta(conta: Pick<ContaPluggy, 'balance' | 'currencyCode' | 'bankData' | 'creditData'>): CamposExtrasDaConta {
  const b = conta.bankData ?? null
  const c = conta.creditData ?? null
  const um = <T extends string>(v: string | null | undefined, validos: readonly T[]): T | null =>
    validos.includes(v as T) ? v as T : null
  return {
    saldo: valorOuNulo(conta.balance),
    moeda: textoOuNulo(conta.currencyCode),
    saldo_com_pendentes: valorOuNulo(b?.closingBalance),
    saldo_aplicado_automatico: valorOuNulo(b?.automaticallyInvestedBalance),
    cheque_especial_limite: valorOuNulo(b?.overdraftContractedLimit),
    cheque_especial_usado: valorOuNulo(b?.overdraftUsedLimit),
    agencia_conta: textoOuNulo(b?.transferNumber),
    bandeira: textoOuNulo(c?.brand),
    nivel: textoOuNulo(c?.level),
    situacao_cartao: um(c?.status, ['ACTIVE', 'BLOCKED', 'CANCELLED'] as const),
    titularidade: um(c?.holderType, ['MAIN', 'ADDITIONAL'] as const),
    limite_flexivel: typeof c?.isLimitFlexible === 'boolean' ? c.isLimitFlexible : null,
    saldo_moeda_estrangeira: valorOuNulo(c?.balanceForeignCurrency),
    limites_detalhados: Array.isArray(c?.disaggregatedCreditLimits) && c.disaggregatedCreditLimits.length
      ? c.disaggregatedCreditLimits
      : null,
  }
}

/**
 * O `update` de cada conta: crédito e extras, só o que veio (o mesmo motivo de
 * `creditoParaAtualizar`). Com saldo, carimba quando ele foi lido.
 */
export function contaParaAtualizar(conta: Pick<ContaPluggy, 'balance' | 'currencyCode' | 'bankData' | 'creditData'>, agora: string) {
  const campos = Object.fromEntries(
    Object.entries({ ...camposDeCreditoDaConta(conta), ...camposExtrasDaConta(conta) }).filter(([, v]) => v != null),
  ) as Partial<CamposDeCredito & CamposExtrasDaConta> & { saldo_atualizado_em?: string }
  if (campos.saldo != null) campos.saldo_atualizado_em = agora
  return campos
}

/**
 * Os finais de cartão de uma conta de cartão: o da própria conta, os adicionais
 * e virtuais que o banco lista, e os que apareceram nas transações. Sem
 * repetição, na ordem em que aparecem.
 */
export function finaisDosCartoes(
  conta: Pick<ContaPluggy, 'number' | 'creditData'>,
  linhas: Array<Pick<TransacaoNormalizada, 'cartao_final'>>,
): string[] {
  const finais = [
    finalDoCartao(conta.number),
    ...(conta.creditData?.additionalCards ?? []).map(a => finalDoCartao(a?.number)),
    ...linhas.map(l => l.cartao_final),
  ]
  return [...new Set(finais.filter((f): f is string => !!f))]
}

/** Uma linha de `fatura_cartao` (sem `id` nem `atualizada_em`, que o banco e o chamador põem). */
export interface LinhaDeFatura {
  user_id: string
  conta_id: string
  pluggy_bill_id: string
  /** `YYYY-MM-DD` em Brasília. */
  vencimento: string
  total: number
  minimo: number | null
  /** `YYYY-MM-DD` em Brasília: o fechamento oficial desta fatura. */
  fechamento: string | null
  encargos: EncargoDaFatura[]
  total_encargos: number
  permite_parcelar: boolean | null
  pagamentos: PagamentoDaFatura[]
}

export interface EncargoDaFatura {
  /** `LATE_PAYMENT_REMUNERATIVE_INTEREST`, `LATE_PAYMENT_FEE`, `LATE_PAYMENT_INTEREST`, `IOF`, `OTHER`. */
  tipo: string
  valor: number
  info: string | null
}

export interface PagamentoDaFatura {
  /** `YYYY-MM-DD` em Brasília. */
  data: string | null
  valor: number
  /** `FULL_PAYMENT`, `INSTALLMENT_PAYMENT`, `OTHER_PAYMENT`. */
  tipo: string | null
  /** `DEBIT_ACCOUNT`, `BANK_SLIP`, `PIX`... */
  forma: string | null
}

/**
 * Uma fatura fechada da Pluggy no formato de `fatura_cartao`.
 *
 * `null` quando falta o que a tabela exige (id, vencimento legível, total) —
 * fatura é bônus, e uma torta não pode impedir as outras de entrar.
 */
export function faturaParaLinha(fatura: FaturaPluggy, contaId: string, userId: string): LinhaDeFatura | null {
  const vencimento = dataLocalOuNula(fatura.dueDate)
  const total = valorOuNulo(fatura.totalAmount)
  if (!fatura.id || !vencimento || total == null) return null
  const encargos: EncargoDaFatura[] = (fatura.financeCharges ?? []).flatMap((e) => {
    const valor = valorOuNulo(e?.amount)
    return valor ? [{ tipo: textoOuNulo(e?.type) ?? 'OTHER', valor: Math.abs(valor), info: textoOuNulo(e?.additionalInfo) }] : []
  })
  const pagamentos: PagamentoDaFatura[] = (fatura.payments ?? []).flatMap((p) => {
    const valor = valorOuNulo(p?.amount)
    return valor ? [{ data: dataLocalOuNula(p?.paymentDate), valor: Math.abs(valor), tipo: textoOuNulo(p?.valueType), forma: textoOuNulo(p?.paymentMode) }] : []
  })
  return {
    user_id: userId,
    conta_id: contaId,
    pluggy_bill_id: fatura.id,
    vencimento,
    total,
    minimo: valorOuNulo(fatura.minimumPaymentAmount),
    fechamento: dataLocalOuNula(fatura.billClosingDate),
    encargos,
    total_encargos: centavos(encargos.reduce((s, e) => s + e.valor, 0)),
    permite_parcelar: typeof fatura.allowsInstallments === 'boolean' ? fatura.allowsInstallments : null,
    pagamentos,
  }
}

// ---------------------------------------------------------------------------
// Investimentos e empréstimos
// ---------------------------------------------------------------------------

/** Uma posição no formato de `investimento` (sem `user_id`/`conexao_id`, que o chamador põe). */
export function investimentoParaLinha(i: InvestimentoPluggy) {
  return {
    pluggy_investment_id: i.id,
    nome: textoOuNulo(i.name) ?? 'Investimento',
    tipo: textoOuNulo(i.type),
    subtipo: textoOuNulo(i.subtype),
    codigo: textoOuNulo(i.code),
    numero: textoOuNulo(i.number),
    emissor: textoOuNulo(i.issuer),
    moeda: textoOuNulo(i.currencyCode),
    saldo: valorOuNulo(i.balance),
    valor_bruto: valorOuNulo(i.amount),
    valor_original: valorOuNulo(i.amountOriginal),
    valor_resgatavel: valorOuNulo(i.amountWithdrawal),
    rendimento: valorOuNulo(i.amountProfit),
    impostos: valorOuNulo((i.taxes ?? 0) + (i.taxes2 ?? 0) || null),
    taxa: typeof i.rate === 'number' && Number.isFinite(i.rate) ? i.rate : null,
    taxa_tipo: textoOuNulo(i.rateType),
    indexador: textoOuNulo(i.indexerAdditionalInfo),
    data_referencia: dataLocalOuNula(i.date),
    data_compra: dataLocalOuNula(i.purchaseDate),
    vencimento: dataLocalOuNula(i.dueDate),
    situacao: textoOuNulo(i.status),
  }
}

/**
 * Um movimento de investimento. `entrada` é dinheiro ENTRANDO na posição
 * (aplicação); resgate, imposto e amortização são `saida`. Sem direção nem tipo
 * conhecido, `null` — a tela não adivinha.
 */
export function movimentoParaLinha(m: MovimentoDeInvestimentoPluggy) {
  const data = dataLocalOuNula(m.date)
  if (!m.id || !data) return null
  const sentido = m.movementType === 'CREDIT' || (!m.movementType && m.type === 'BUY')
    ? 'entrada' as const
    : m.movementType === 'DEBIT' || (!m.movementType && m.type && m.type !== 'BUY')
      ? 'saida' as const
      : null
  const valor = valorOuNulo(m.amount)
  const liquido = valorOuNulo(m.netAmount)
  return {
    pluggy_id: m.id,
    tipo: textoOuNulo(m.type),
    sentido,
    valor: valor == null ? null : Math.abs(valor),
    valor_liquido: liquido == null ? null : Math.abs(liquido),
    quantidade: typeof m.quantity === 'number' && Number.isFinite(m.quantity) ? m.quantity : null,
    data,
    descricao: textoOuNulo(m.description),
  }
}

export function emprestimoParaLinha(e: EmprestimoPluggy) {
  return {
    pluggy_loan_id: e.id,
    produto: textoOuNulo(e.productName),
    tipo: textoOuNulo(e.type),
    contrato: textoOuNulo(e.contractNumber),
    moeda: textoOuNulo(e.currencyCode),
    valor_contratado: valorOuNulo(e.contractAmount),
    data_contrato: dataLocalOuNula(e.contractDate),
    vencimento: dataLocalOuNula(e.dueDate),
    primeira_parcela_em: dataLocalOuNula(e.firstInstallmentDueDate),
    periodicidade: textoOuNulo(e.installmentPeriodicity),
    cet: typeof e.CET === 'number' && Number.isFinite(e.CET) ? e.CET : null,
    parcelas: e.installments ?? null,
    pagamentos: e.payments ?? null,
    juros: e.interestRates ?? null,
  }
}

/**
 * O pedaço de uma lista que vai para `amostra_pluggy`: o bastante para estudar
 * quais campos vêm, sem guardar o extrato inteiro duas vezes. Prefere variedade
 * — um exemplo de cada final de cartão e de cada método — antes de completar.
 */
export function amostraDeTransacoes(transacoes: TransacaoPluggy[], limite = 40): TransacaoPluggy[] {
  const escolhidas = new Map<string, TransacaoPluggy>()
  const vistos = new Set<string>()
  for (const t of transacoes) {
    const tipo = `${t.creditCardMetadata?.cardNumber ?? ''}|${t.paymentData?.paymentMethod ?? t.operationType ?? ''}|${t.currencyCode ?? ''}|${t.creditCardMetadata?.paymentType ?? ''}`
    if (vistos.has(tipo)) continue
    vistos.add(tipo)
    escolhidas.set(t.id, t)
  }
  for (const t of transacoes) {
    if (escolhidas.size >= limite) break
    escolhidas.set(t.id, t)
  }
  return [...escolhidas.values()].slice(0, limite)
}

/**
 * Se o item pode ser registrado por esta pessoa.
 *
 * O item criado pelo widget volta com o `clientUserId` que a rota do connect
 * token definiu — o id de quem conectou. Outro id ali é o item de outra pessoa.
 * Item sem `clientUserId` (copiado do demo do dashboard, como a pegadinha 1 do
 * plano permite) é aceito: num app de duas pessoas, quem cadastra é quem tem o
 * id na mão, e o `item_id` único impede que o mesmo item tenha dois donos.
 */
export function itemPodeSerDe(item: { clientUserId?: string | null }, userId: string): boolean {
  return !item.clientUserId || item.clientUserId === userId
}

/** O que a pessoa sabe dela mesma a partir das próprias contas. */
export function contextoDasContas(
  contas: Array<Pick<ContaPluggy, 'owner' | 'taxNumber'>>,
  vencimentoDasFaturas: Record<string, string> = {},
): ContextoImportacao {
  const documentos = new Set<string>()
  const nomes = new Set<string>()

  for (const c of contas) {
    const doc = soDigitos(c.taxNumber)
    if (doc.length >= 11) documentos.add(doc)
    const nome = normalizarNome(c.owner)
    if (nome) nomes.add(nome)
  }

  return { documentosProprios: [...documentos], nomesProprios: [...nomes], vencimentoDasFaturas }
}
