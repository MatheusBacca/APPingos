/**
 * Transações no formato da Pluggy, montadas a partir da documentação v2
 * (`v2.docs.pluggy.ai/en/docs/products/transactions` e `.../credit-card-bills`).
 *
 * NÃO são dado real. A fase 2 do plano (docs/notion-plano-open-finance.md) pede
 * uma amostra real anonimizada para revalidar estas regras — quando ela existir,
 * vale acrescentar ao lado destas, sem apagar: estas documentam o que a
 * documentação promete, e a real, o que o banco entrega.
 */
import type { ContaPluggy, TransacaoPluggy } from '~~/supabase/functions/_shared/pluggy-api'

export const CPF_EU = '12345678901'
export const CPF_ELA = '98765432100'

export const CONTA_CORRENTE: ContaPluggy = {
  id: 'acc-corrente',
  itemId: 'item-banco',
  type: 'BANK',
  subtype: 'CHECKING_ACCOUNT',
  name: 'Conta Corrente',
  number: '0001/12345-0',
  owner: 'Matheus Exemplo',
  taxNumber: '123.456.789-01',
}

export const CARTAO: ContaPluggy = {
  id: 'acc-cartao',
  itemId: 'item-banco',
  type: 'CREDIT',
  subtype: 'CREDIT_CARD',
  name: 'Cartão Platinum',
  number: '4321',
  owner: 'Matheus Exemplo',
  taxNumber: '123.456.789-01',
  creditData: { brand: 'VISA', balanceCloseDate: '2026-11-03', balanceDueDate: '2026-11-10' },
}

let sequencia = 0

/** Uma transação com o mínimo da documentação; o resto vem em `extra`. */
export function transacao(extra: Partial<TransacaoPluggy> = {}): TransacaoPluggy {
  sequencia++
  return {
    id: `tx-${sequencia}`,
    accountId: CARTAO.id,
    description: 'Compra',
    currencyCode: 'BRL',
    amount: 100,
    date: '2026-11-05T15:30:00.000Z',
    type: 'DEBIT',
    status: 'POSTED',
    providerId: `prov-${sequencia}`,
    category: null,
    ...extra,
  }
}

/** A parcela `n` de `total` de uma compra no cartão, como a Pluggy manda: uma por fatura. */
export function parcela(n: number, total: number, extra: Partial<TransacaoPluggy> = {}): TransacaoPluggy {
  return transacao({
    description: `MAGAZINE EXEMPLO PARC ${String(n).padStart(2, '0')}/${String(total).padStart(2, '0')}`,
    amount: 100,
    date: `2026-${String(8 + n).padStart(2, '0')}-12T13:00:00.000Z`,
    providerId: `prov-magazine-${n}`,
    creditCardMetadata: {
      installmentNumber: n,
      totalInstallments: total,
      totalAmount: 1000,
      purchaseDate: '2026-08-20T17:45:00.000Z',
      billId: `bill-${n}`,
    },
    ...extra,
  })
}

/** Pagamento da fatura do cartão, debitado da conta corrente. */
export const PAGAMENTO_FATURA_NA_CONTA = transacao({
  accountId: CONTA_CORRENTE.id,
  description: 'PAGAMENTO FATURA CARTAO',
  amount: -2350.4,
  type: 'DEBIT',
  category: 'Credit card payment',
})

/** O mesmo pagamento, chegando como crédito na conta do cartão. */
export const PAGAMENTO_RECEBIDO_NO_CARTAO = transacao({
  description: 'Pagamento recebido',
  amount: -2350.4,
  type: 'CREDIT',
})

/** Pix da conta corrente para a poupança da mesma pessoa, já sem a categoria do trial. */
export const PIX_PARA_MIM = transacao({
  accountId: CONTA_CORRENTE.id,
  description: 'PIX ENVIADO',
  amount: -500,
  type: 'DEBIT',
  paymentData: {
    paymentMethod: 'PIX',
    payer: { name: 'Matheus Exemplo', documentNumber: { type: 'CPF', value: CPF_EU } },
    receiver: { name: 'MATHEUS EXEMPLO', documentNumber: { type: 'CPF', value: '123.456.789-01' } },
  },
})

/** Pix para a outra pessoa do casal — o acerto do mês. NÃO é transferência própria. */
export const PIX_PARA_ELA = transacao({
  accountId: CONTA_CORRENTE.id,
  description: 'PIX ENVIADO',
  amount: -412.37,
  type: 'DEBIT',
  date: '2026-11-06T14:00:00.000Z',
  paymentData: {
    paymentMethod: 'PIX',
    payer: { name: 'Matheus Exemplo', documentNumber: { type: 'CPF', value: CPF_EU } },
    receiver: { name: 'Ana Exemplo', documentNumber: { type: 'CPF', value: CPF_ELA } },
  },
})

/** Salário caindo na conta. */
export const SALARIO = transacao({
  accountId: CONTA_CORRENTE.id,
  description: 'CRED SALARIO EMPRESA X',
  amount: 6500,
  type: 'CREDIT',
  date: '2026-11-06T09:00:00.000Z',
})
