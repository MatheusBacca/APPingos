<script setup lang="ts">
/**
 * Cartões — a porta de entrada da aba Open Finance.
 *
 * A pergunta desta tela é "como estão as minhas faturas": quanto cada cartão já
 * tem na fatura ABERTA (pelo ciclo do cartão, não pelo mês do calendário), quanto
 * do limite foi, e quanto cada um pesa no total. O detalhe por compra fica na
 * Chico Moedas; o extrato esperando destino, na Caixa de entrada.
 *
 * Por isso a ação principal é a caixa de entrada, e não "Nova compra": no Open
 * Finance o lançamento vira classificação. Quem quer lançar à mão faz isso na
 * Chico Moedas, como sempre.
 */
import { CreditCardIcon, InboxIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarPercentual } from '@/lib/dinheiro'
import { useValoresOcultos } from '~/composables/useValoresOcultos'
import { seloDoBanco } from '~/lib/cartoes'
import { useCartoes, useQuantasNaCaixa } from '~/composables/useCartoes'
import type { CartaoDaPessoa } from '~/composables/useCartoes'

/** Os valores em dinheiro seguem o olho de Orçamentos (`useValoresOcultos`). */
const { dinheiro } = useValoresOcultos()

// Tela de dado: ocupa a largura inteira no computador (ver layouts/default.vue).
definePageMeta({ larguraAmpla: true })

useHead({ title: 'Cartões · APPingos' })

const { data, isPending } = useCartoes()
const { data: naCaixa } = useQuantasNaCaixa()

const resumos = computed(() => data.value?.resumos ?? [])

const fracaoPorCartao = computed(() =>
  new Map((data.value?.fatias ?? []).map(f => [f.id, f.fracao])),
)

/** A barra empilhada: cada cartão na cor do banco, do maior para o menor. */
const segmentos = computed(() =>
  (data.value?.fatias ?? []).map((f) => {
    const r = resumos.value.find(x => x.cartao.id === f.id)!
    return { ...f, nome: r.cartao.nome, banco: r.cartao.banco, cor: seloDoBanco(r.cartao.banco).cor }
  }),
)

/** Quanto do limite somado dos cartões as faturas abertas já tomaram. */
const usoGeral = computed(() => {
  const d = data.value
  if (!d?.limiteTotal) return null
  return d.total / d.limiteTotal
})

const emAjuste = ref<CartaoDaPessoa | null>(null)
const ajusteAberto = ref(false)

function ajustar(c: CartaoDaPessoa) {
  emAjuste.value = c
  ajusteAberto.value = true
}
</script>

<template>
  <div class="space-y-6">
    <OrcamentosCabecalho titulo="Cartões" subtitulo="Suas faturas abertas, o limite de cada cartão e o extrato esperando destino.">
      <template #acoes>
        <Button as-child class="gap-1.5">
          <NuxtLink to="/orcamentos/open-finance/caixa">
            <InboxIcon class="size-4" />
            <template v-if="naCaixa">{{ naCaixa }} para classificar</template>
            <template v-else>Caixa de entrada</template>
          </NuxtLink>
        </Button>
      </template>
    </OrcamentosCabecalho>

    <div v-if="isPending" class="space-y-3">
      <Skeleton class="h-28 w-full rounded-xl" />
      <Skeleton v-for="i in 3" :key="i" class="h-32 w-full rounded-xl" />
    </div>

    <section v-else-if="!resumos.length" class="rounded-xl border bg-card p-6 text-center">
      <CreditCardIcon class="mx-auto size-8 text-muted-foreground" />
      <p class="mt-2 font-medium">Nenhum cartão conectado ainda</p>
      <p class="mt-1 text-sm text-muted-foreground">
        Conecte o banco em <NuxtLink to="/orcamentos/open-finance/contas" class="text-primary underline">Contas</NuxtLink>
        e a fatura de cada cartão aparece aqui.
      </p>
    </section>

    <template v-else>
      <!-- O total e o peso de cada cartão. -->
      <section class="rounded-xl border bg-card p-4">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p class="text-sm text-muted-foreground">Faturas abertas</p>
            <p class="text-2xl font-semibold tabular-nums">{{ dinheiro(data!.total) }}</p>
          </div>
          <p v-if="usoGeral !== null" class="text-right text-xs text-muted-foreground">
            <strong class="text-sm font-semibold text-foreground">{{ formatarPercentual(usoGeral) }}</strong>
            do limite somado<br>
            de {{ dinheiro(data!.limiteTotal) }}
          </p>
        </div>

        <div
          v-if="segmentos.length"
          class="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full"
          role="img"
          :aria-label="segmentos.map(s => `${s.nome} ${formatarPercentual(s.fracao)}`).join(', ')"
        >
          <div
            v-for="s in segmentos"
            :key="s.id"
            class="h-full first:rounded-l-full last:rounded-r-full"
            :style="{ width: `${s.fracao * 100}%`, backgroundColor: s.cor }"
          />
        </div>

        <ul v-if="segmentos.length" class="mt-3 grid gap-x-4 gap-y-1.5 text-xs sm:flex sm:flex-wrap">
          <li v-for="s in segmentos" :key="s.id" class="flex items-center gap-2">
            <span class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: s.cor }" />
            <span class="truncate text-muted-foreground">{{ s.nome }}</span>
            <span class="ml-auto font-medium tabular-nums sm:ml-0">{{ formatarPercentual(s.fracao) }}</span>
          </li>
        </ul>
      </section>

      <section class="space-y-3">
        <h2 class="flex items-center gap-2 text-sm font-medium">
          <CreditCardIcon class="size-4 text-muted-foreground" />
          Seus cartões
        </h2>
        <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <CartaoFatura
            v-for="r in resumos"
            :key="r.cartao.id"
            :resumo="r"
            :fracao-do-total="fracaoPorCartao.get(r.cartao.id) ?? null"
            @ajustar="ajustar(r.cartao)"
          />
        </div>
      </section>
    </template>

    <AjustarCartaoDialogo v-model:aberto="ajusteAberto" :cartao="emAjuste" />
  </div>
</template>
