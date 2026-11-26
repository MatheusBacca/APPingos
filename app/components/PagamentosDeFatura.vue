<script setup lang="ts">
/**
 * "Pagamentos de fatura" na caixa de entrada: o dinheiro que saiu de uma conta
 * para pagar um cartão — transferência para outro banco, Pix, boleto do banco 2
 * pago pelo banco 1, débito automático.
 *
 * Não é gasto: as compras da fatura já são. Por isso não fica na caixa esperando
 * destino; aparece aqui, recolhido, para a pessoa conferir que o app entendeu
 * ("C6 BANK" pagando o C6 não é empréstimo). Cada pagamento é UMA linha: o par
 * (cartão + conta) vira "Fatura do X, paga pela conta Y".
 */
import { ChevronDownIcon, ReceiptTextIcon } from '@lucide/vue'
import { formatarDia, nomeDoMes } from '@/lib/datas'
import { useValoresOcultos } from '~/composables/useValoresOcultos'
import { rotuloDaConta } from '~/lib/caixa-lista'
import { usePagamentosDeFatura } from '~/composables/useCaixaDeEntrada'
import type { PagamentoDeFaturaDoMes } from '~/composables/useCaixaDeEntrada'

/** Os valores em dinheiro seguem o olho de Orçamentos (`useValoresOcultos`). */
const { dinheiro } = useValoresOcultos()

const props = defineProps<{ mes: string }>()

const { data: pagamentos } = usePagamentosDeFatura(() => props.mes)

interface Linha {
  id: string
  data: string
  valor: number
  /** O cartão que recebeu; `null` quando o cartão não está conectado. */
  cartao: string | null
  /** A conta que pagou; `null` quando o pagamento veio de conta não conectada. */
  conta: string | null
}

/*
 * Uma linha por pagamento: a ponta do cartão carrega o par; a ponta da conta só
 * aparece sozinha quando não tem par (o cartão é de banco não conectado).
 */
const linhas = computed<Linha[]>(() => {
  const todas = pagamentos.value ?? []
  const doCartao = (p: PagamentoDeFaturaDoMes) => p.conta?.tipo === 'cartao'
  return todas
    .filter(p => doCartao(p) || !p.par)
    .map(p => doCartao(p)
      ? { id: p.id, data: p.data, valor: p.valor, cartao: rotuloDaConta(p.conta), conta: p.par ? rotuloDaConta(p.par.conta) : null }
      : { id: p.id, data: p.data, valor: p.valor, cartao: null, conta: rotuloDaConta(p.conta) })
})

const total = computed(() => linhas.value.reduce((s, l) => s + l.valor, 0))
</script>

<template>
  <details v-if="linhas.length" class="group rounded-lg border bg-card">
    <summary class="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm">
      <span class="flex items-start gap-2">
        <ReceiptTextIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>
          <span class="font-medium">
            Pagamentos de fatura em {{ nomeDoMes(mes).toLowerCase() }} ({{ linhas.length }}) · {{ dinheiro(total) }}
          </span>
          <span class="block text-xs text-muted-foreground">
            Não contam como gasto — as compras da fatura já contam. Saem da caixa sozinhos.
          </span>
        </span>
      </span>
      <ChevronDownIcon class="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
    </summary>
    <ul class="divide-y border-t">
      <li v-for="l in linhas" :key="l.id" class="flex items-baseline justify-between gap-3 px-3 py-2">
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm">
            <template v-if="l.cartao">Fatura {{ l.cartao }}</template>
            <template v-else>Fatura de cartão não conectado</template>
          </p>
          <p class="text-xs text-muted-foreground">
            {{ formatarDia(l.data) }} ·
            <template v-if="l.conta">paga pela conta {{ l.conta }}</template>
            <template v-else>paga de uma conta não conectada</template>
          </p>
        </div>
        <span class="shrink-0 text-sm tabular-nums">{{ dinheiro(l.valor) }}</span>
      </li>
    </ul>
  </details>
</template>
