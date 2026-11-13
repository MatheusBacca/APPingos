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
  creditData?: {
    brand?: string | null
    balanceCloseDate?: string | null
    balanceDueDate?: string | null
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
    cardNumber?: string | null
  } | null
  paymentData?: {
    payer?: ParteDoPagamento | null
    receiver?: ParteDoPagamento | null
    paymentMethod?: 'PIX' | 'TED' | 'DOC' | 'BOLETO' | 'TEF' | string | null
    referenceNumber?: string | null
    reason?: string | null
  } | null
  merchant?: { name?: string | null, businessName?: string | null, cnpj?: string | null } | null
  createdAt?: string
  updatedAt?: string
}

export interface FaturaPluggy {
  id: string
  dueDate: string
  totalAmount: number
}

interface Pagina<T> {
  total: number
  totalPages: number
  page: number
  results: T[]
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

/** Página de 500 (o máximo da API), até acabar. `de`/`ate` em `YYYY-MM-DD`. */
export async function listarTransacoes(
  apiKey: string,
  accountId: string,
  de: string,
  ate: string,
): Promise<TransacaoPluggy[]> {
  const todas: TransacaoPluggy[] = []
  let pagina = 1
  let totalPaginas = 1

  do {
    const params = new URLSearchParams({
      accountId,
      from: de,
      to: ate,
      pageSize: '500',
      page: String(pagina),
    })
    const resposta = await pedir<Pagina<TransacaoPluggy>>(`/transactions?${params}`, { apiKey })
    todas.push(...resposta.results)
    totalPaginas = resposta.totalPages
    pagina++
  } while (pagina <= totalPaginas)

  return todas
}
