/**
 * A API da Pluggy — os formatos que ela devolve e um cliente mínimo sobre `fetch`.
 *
 * MORA EM `_shared/` PELO MESMO MOTIVO DE `notificacoes.ts`: dois runtimes leem
 * isto. A rota do Nuxt que gera o connect token e registra a conexão roda no
 * Nitro; a sincronização diária roda na Edge Function `sincronizar-pluggy`, no
 * Deno. Um cliente só garante que os dois entendem a Pluggy do mesmo jeito.
 *
 * POR QUE NÃO O `pluggy-sdk`. Ele é feito para Node, e o Deno o leria via `npm:`
 * com o peso todo do pacote para usar quatro endpoints. Aqui são ~100 linhas que
 * os dois runtimes rodam iguais, porque `fetch` existe nos dois. A troca custa
 * pouco nos dois sentidos: quem fala com a Pluggy é só este arquivo.
 *
 * ZERO IMPORTS de runtime (a regra de `_shared/`). Os formatos abaixo seguem a
 * documentação v2 (`v2.docs.pluggy.ai`) e foram escritos ANTES de qualquer dado
 * real: campos que a documentação dá como opcionais estão como opcionais, e a
 * importação trata a ausência de cada um. Revalidar com a amostra real da fase 2
 * do plano (docs/notion-plano-open-finance.md).
 */

export const PLUGGY_API = 'https://api.pluggy.ai'

// ---------------------------------------------------------------------------
// Formatos
// ---------------------------------------------------------------------------

export type StatusItemPluggy =
  | 'UPDATED'
  | 'UPDATING'
  | 'WAITING_USER_INPUT'
  | 'WAITING_USER_ACTION'
  | 'LOGIN_ERROR'
  | 'OUTDATED'
  | 'MERGING'

/** Um item: a conexão de UMA pessoa com UM banco (no MeuPluggy, uma conexão de lá). */
export interface ItemPluggy {
  id: string
  connector: { id: number, name: string, imageUrl?: string | null, primaryColor?: string | null }
  status: StatusItemPluggy
  executionStatus?: string | null
  statusDetail?: unknown
  error?: { code?: string, message?: string } | null
  /** O id de quem conectou, que a rota do connect token define como o `auth.uid()`. */
  clientUserId?: string | null
  createdAt?: string
  updatedAt?: string
  lastUpdatedAt?: string | null
  /** Open Finance: até quando o consentimento vale. */
  consentExpiresAt?: string | null
}

export interface ContaPluggy {
  id: string
  itemId: string
  type: 'BANK' | 'CREDIT'
  subtype?: 'CHECKING_ACCOUNT' | 'SAVINGS_ACCOUNT' | 'CREDIT_CARD' | string
  name: string
  marketingName?: string | null
  /** Conta: o número; cartão: os últimos dígitos. */
  number?: string | null
  owner?: string | null
  /** CPF/CNPJ do titular — é o que reconhece transferência entre contas próprias. */
  taxNumber?: string | null
  /** Conta: o saldo. Cartão: o valor da fatura aberta segundo o banco. */
  balance?: number | null
  currencyCode?: string | null
  /** Só em conta corrente/poupança. */
  bankData?: {
    /** Agência/conta completas. */
    transferNumber?: string | null
    /** O saldo contando as transações ainda não lançadas. */
    closingBalance?: number | null
    /** O que o banco aplica sozinho (rende conta, "guardar automático"). */
    automaticallyInvestedBalance?: number | null
    overdraftContractedLimit?: number | null
    overdraftUsedLimit?: number | null
    unarrangedOverdraftAmount?: number | null
  } | null
  /**
   * Só em cartão, e cada campo só quando o banco informa — a documentação dá
   * todos como opcionais. Datas em ISO 8601 UTC; valores em reais.
   */
  creditData?: {
    /** O nível do cartão ("GOLD", "PLATINUM"...). */
    level?: string | null
    brand?: string | null
    /** O fechamento da fatura atual. */
    balanceCloseDate?: string | null
    /** O vencimento da fatura atual. */
    balanceDueDate?: string | null
    creditLimit?: number | null
    availableCreditLimit?: number | null
    minimumPayment?: number | null
    balanceForeignCurrency?: number | null
    isLimitFlexible?: boolean | null
    status?: 'ACTIVE' | 'BLOCKED' | 'CANCELLED' | string | null
    /** Titular (MAIN) ou adicional (ADDITIONAL). */
    holderType?: 'MAIN' | 'ADDITIONAL' | string | null
    /** Os cartões adicionais (e, no Open Finance, os virtuais) da conta. */
    additionalCards?: Array<{ number?: string | null }> | null
    /** Limites por modalidade ou por cartão, quando o banco divide. */
    disaggregatedCreditLimits?: Array<Record<string, unknown>> | null
  } | null
}

export interface ParteDoPagamento {
  name?: string | null
  documentNumber?: { type?: 'CPF' | 'CNPJ' | string, value?: string | null } | null
  accountNumber?: string | null
  branchNumber?: string | null
}

export interface TransacaoPluggy {
  /** Pode MUDAR quando o banco altera o dado — não serve de chave. */
  id: string
  accountId: string
  description: string
  descriptionRaw?: string | null
  currencyCode?: string
  amount: number
  /** ISO 8601 em UTC. */
  date: string
  type?: 'DEBIT' | 'CREDIT'
  status?: 'PENDING' | 'POSTED'
  /** Enriquecimento: vem no trial e vira recurso pago depois. */
  category?: string | null
  categoryId?: string | null
  /** O id estável no Open Finance — a chave de deduplicação. Pode faltar. */
  providerId?: string | null
  operationType?: string | null
  creditCardMetadata?: {
    installmentNumber?: number | null
    totalInstallments?: number | null
    totalAmount?: number | null
    purchaseDate?: string | null
    billId?: string | null
    /**
     * O cartão que fez a compra. Difere do número da conta em cartão adicional
     * ou VIRTUAL — é o que separa o virtual do casal do físico pessoal.
     */
    cardNumber?: string | null
    /** Merchant Category Code: dado regulado do Open Finance, não enriquecimento. */
    payeeMCC?: number | null
    /** Só Open Finance: `SINGLE` (à vista) ou `INSTALLMENT` (parcelada). */
    paymentType?: 'SINGLE' | 'INSTALLMENT' | string | null
    /** Só Open Finance: a hora da compra como o banco informou. */
    transactionDateTime?: string | null
    /** Só Open Finance: a fatura prevista (`YYYY-MM`), também para as pendentes. */
    billForecastDate?: string | null
    /** Só Open Finance: o dia em que entrou na fatura (`YYYY-MM-DD`). */
    billPostDate?: string | null
    /** Quando a transação é tarifa (anuidade, saque...). */
    feeType?: string | null
    /** Quando é crédito contratado no cartão (rotativo, parcelamento da fatura...). */
    otherCreditsType?: string | null
  } | null
  paymentData?: {
    payer?: ParteDoPagamento | null
    receiver?: ParteDoPagamento | null
    paymentMethod?: 'PIX' | 'TED' | 'DOC' | 'BOLETO' | 'TEF' | string | null
    referenceNumber?: string | null
    /** A mensagem que quem pagou escreveu no Pix/TED. */
    reason?: string | null
    receiverReferenceId?: string | null
  } | null
  /** Valor na moeda da conta, quando a compra foi em outra moeda. */
  amountInAccountCurrency?: number | null
  boletoMetadata?: {
    digitableLine?: string | null
    barcode?: string | null
    baseAmount?: number | null
    penaltyAmount?: number | null
    interestAmount?: number | null
    discountAmount?: number | null
  } | null
  merchant?: { name?: string | null, businessName?: string | null, cnpj?: string | null } | null
  createdAt?: string
  updatedAt?: string
}

/** Uma fatura FECHADA do cartão (`/bills`). A aberta não vem aqui — ela está em `creditData`. */
export interface FaturaPluggy {
  id: string
  /** ISO 8601 em UTC. */
  dueDate: string
  /** O fechamento desta fatura — o `balanceCloseDate` da conta é sempre nulo no Open Finance. */
  billClosingDate?: string | null
  totalAmount: number
  totalAmountCurrencyCode?: string | null
  minimumPaymentAmount?: number | null
  allowsInstallments?: boolean | null
  financeCharges?: Array<{
    type?: string | null
    amount?: number | null
    currencyCode?: string | null
    additionalInfo?: string | null
  }> | null
  payments?: Array<{
    id?: string | null
    valueType?: string | null
    paymentDate?: string | null
    paymentMode?: string | null
    amount?: number | null
    currencyCode?: string | null
  }> | null
  createdAt?: string
  updatedAt?: string
}

/** Uma posição de investimento (`/investments`). */
export interface InvestimentoPluggy {
  id: string
  itemId?: string
  name: string
  type?: string | null
  subtype?: string | null
  code?: string | null
  number?: string | null
  issuer?: string | null
  currencyCode?: string | null
  /** Líquido, depois de taxas e impostos. */
  balance?: number | null
  amount?: number | null
  amountOriginal?: number | null
  amountWithdrawal?: number | null
  amountProfit?: number | null
  taxes?: number | null
  taxes2?: number | null
  rate?: number | null
  rateType?: string | null
  indexerAdditionalInfo?: string | null
  date?: string | null
  purchaseDate?: string | null
  dueDate?: string | null
  status?: string | null
}

/** Um movimento de uma posição (`/investments/{id}/transactions`). */
export interface MovimentoDeInvestimentoPluggy {
  id: string
  type?: 'BUY' | 'SELL' | 'TAX' | 'TRANSFER' | 'INTEREST' | 'AMORTIZATION' | string | null
  movementType?: 'CREDIT' | 'DEBIT' | string | null
  amount?: number | null
  netAmount?: number | null
  quantity?: number | null
  date: string
  description?: string | null
}

/** Um empréstimo ou financiamento (`/loans`). */
export interface EmprestimoPluggy {
  id: string
  itemId?: string
  productName?: string | null
  type?: string | null
  contractNumber?: string | null
  currencyCode?: string | null
  contractAmount?: number | null
  contractDate?: string | null
  dueDate?: string | null
  firstInstallmentDueDate?: string | null
  installmentPeriodicity?: string | null
  CET?: number | null
  installments?: unknown
  payments?: unknown
  interestRates?: unknown
}

interface Pagina<T> {
  total: number
  totalPages: number
  page: number
  results: T[]
}

/** A página do `GET /v2/transactions`: `next` é a query da próxima, ou `null` no fim. */
interface PaginaCursor<T> {
  results: T[]
  next: string | null
}

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

/**
 * Erro da Pluggy com o status preservado — é ele que decide se a conexão foi
 * revogada (404 no item), se a chave venceu (401) ou se é só instabilidade.
 */
export class ErroPluggy extends Error {
  constructor(readonly status: number, mensagem: string) {
    super(mensagem)
    this.name = 'ErroPluggy'
  }
}

async function pedir<T>(caminho: string, init: RequestInit & { apiKey?: string } = {}): Promise<T> {
  const { apiKey, headers, ...resto } = init
  const resposta = await fetch(`${PLUGGY_API}${caminho}`, {
    ...resto,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(apiKey ? { 'X-API-KEY': apiKey } : {}),
      ...(headers as Record<string, string> | undefined),
    },
  })

  if (!resposta.ok) {
    // O corpo de erro da Pluggy traz `message`; o caminho vai junto (sem query,
    // que pode ter id de conta) para o log dizer qual chamada falhou.
    let motivo = ''
    try {
      motivo = ((await resposta.json()) as { message?: string }).message ?? ''
    }
    catch {
      // corpo vazio ou não-JSON: fica só o status
    }
    throw new ErroPluggy(
      resposta.status,
      `Pluggy respondeu ${resposta.status} em ${caminho.split('?')[0]}${motivo ? `: ${motivo}` : ''}`,
    )
  }

  return await resposta.json() as T
}

/**
 * Troca client id + secret por uma `apiKey`, que vale 2 horas.
 *
 * Quem chama guarda em cache — o Nitro em memória do processo, a Edge Function
 * pela duração da execução. Pedir uma por chamada funcionaria, mas é a
 * requisição mais lenta do fluxo.
 */
export async function autenticarPluggy(clientId: string, clientSecret: string): Promise<string> {
  const { apiKey } = await pedir<{ apiKey: string }>('/auth', {
    method: 'POST',
    body: JSON.stringify({ clientId, clientSecret }),
  })
  return apiKey
}

/**
 * O connect token: o ÚNICO segredo que chega ao navegador. Vale 30 minutos e só
 * serve para abrir o widget em nome daquela pessoa.
 *
 * `clientUserId` = id do usuário no APPingos. Ele volta gravado no item, e é o
 * que permite à sincronização recusar um item que não é de quem o cadastrou.
 * `itemId` só no fluxo de reconectar (atualizar credencial ou consentimento).
 */
export async function criarConnectToken(
  apiKey: string,
  clientUserId: string,
  itemId?: string,
): Promise<string> {
  const { accessToken } = await pedir<{ accessToken: string }>('/connect_token', {
    method: 'POST',
    apiKey,
    body: JSON.stringify({ ...(itemId ? { itemId } : {}), options: { clientUserId } }),
  })
  return accessToken
}

export function buscarItem(apiKey: string, itemId: string): Promise<ItemPluggy> {
  return pedir<ItemPluggy>(`/items/${encodeURIComponent(itemId)}`, { apiKey })
}

export async function listarContas(apiKey: string, itemId: string): Promise<ContaPluggy[]> {
  const pagina = await pedir<Pagina<ContaPluggy>>(
    `/accounts?itemId=${encodeURIComponent(itemId)}`,
    { apiKey },
  )
  return pagina.results
}

/** Faturas do cartão. Só vêm em conexão regulada (Open Finance) — pode voltar vazio. */
export async function listarFaturas(apiKey: string, accountId: string): Promise<FaturaPluggy[]> {
  try {
    const pagina = await pedir<Pagina<FaturaPluggy>>(
      `/bills?accountId=${encodeURIComponent(accountId)}`,
      { apiKey },
    )
    return pagina.results
  }
  catch (e) {
    // Fatura é bônus: sem ela a competência cai no mês da transação.
    if (e instanceof ErroPluggy && e.status !== 401) return []
    throw e
  }
}

/**
 * Os produtos que não são extrato. Todos são bônus: o banco pode não ter
 * compartilhado (o consentimento é por produto), e aí a lista volta vazia —
 * nunca derruba a sincronização, salvo chave vencida (401).
 */
async function listaBonus<T>(caminho: string, apiKey: string): Promise<T[]> {
  try {
    const todos: T[] = []
    for (let pagina = 1; pagina <= 20; pagina++) {
      const sep = caminho.includes('?') ? '&' : '?'
      const r = await pedir<Pagina<T>>(`${caminho}${sep}page=${pagina}`, { apiKey })
      todos.push(...r.results)
      if (!r.totalPages || pagina >= r.totalPages) break
    }
    return todos
  }
  catch (e) {
    if (e instanceof ErroPluggy && e.status !== 401) return []
    throw e
  }
}

export function listarInvestimentos(apiKey: string, itemId: string): Promise<InvestimentoPluggy[]> {
  return listaBonus<InvestimentoPluggy>(`/investments?itemId=${encodeURIComponent(itemId)}`, apiKey)
}

export function listarMovimentosDoInvestimento(apiKey: string, investimentoId: string): Promise<MovimentoDeInvestimentoPluggy[]> {
  return listaBonus<MovimentoDeInvestimentoPluggy>(`/investments/${encodeURIComponent(investimentoId)}/transactions`, apiKey)
}

export function listarEmprestimos(apiKey: string, itemId: string): Promise<EmprestimoPluggy[]> {
  return listaBonus<EmprestimoPluggy>(`/loans?itemId=${encodeURIComponent(itemId)}`, apiKey)
}

/**
 * O dia inteiro de Brasília, de `de` a `ate` (`YYYY-MM-DD`), em instantes UTC —
 * é o que `/v2/transactions` pede em `dateFrom`/`dateTo` (date-time). A Pluggy
 * grava `date` em UTC, e uma compra às 22h do dia 31 aqui já é dia 1 lá: mandar
 * só a data cortaria a noite do último dia da janela.
 */
export function intervaloDaJanela(de: string, ate: string): { dateFrom: string, dateTo: string } {
  const inicio = new Date(`${de}T00:00:00.000-03:00`)
  const fim = new Date(`${ate}T23:59:59.999-03:00`)
  return { dateFrom: inicio.toISOString(), dateTo: fim.toISOString() }
}

/**
 * Todas as transações da conta na janela, pela paginação por cursor.
 *
 * A Pluggy desligou o `GET /transactions` paginado por número para as contas
 * criadas a partir de junho de 2026 (responde 410, "Use GET /v2/transactions
 * with cursor pagination instead") e o tira do ar de vez em 2026-12-31. O v2
 * devolve páginas de 500 e um `next` que é a query string pronta da próxima
 * página — anexada como veio, sem remontar —, ou `null` no fim.
 *
 * O teto de páginas é só o cinto de segurança contra um cursor que não anda.
 */
export async function listarTransacoes(
  apiKey: string,
  accountId: string,
  de: string,
  ate: string,
): Promise<TransacaoPluggy[]> {
  const todas: TransacaoPluggy[] = []
  const { dateFrom, dateTo } = intervaloDaJanela(de, ate)
  let consulta: string | null = `?${new URLSearchParams({ accountId, dateFrom, dateTo })}`
  const vistas = new Set<string>()

  while (consulta && !vistas.has(consulta) && vistas.size < 200) {
    vistas.add(consulta)
    const resposta: PaginaCursor<TransacaoPluggy> = await pedir<PaginaCursor<TransacaoPluggy>>(
      `/v2/transactions${consulta}`,
      { apiKey },
    )
    todas.push(...resposta.results)
    consulta = proximaConsulta(resposta.next)
  }

  return todas
}

/**
 * O `next` da Pluggy como query string a anexar em `/v2/transactions`.
 *
 * A documentação diz que ele já vem pronto (`?accountId=…&after=…`). Por
 * garantia aceita também a URL inteira ou a query sem o `?`.
 */
export function proximaConsulta(next: string | null | undefined): string | null {
  const valor = next?.trim()
  if (!valor) return null
  if (/^https?:\/\//i.test(valor)) {
    const url = new URL(valor)
    return url.search || null
  }
  return valor.startsWith('?') ? valor : `?${valor}`
}
