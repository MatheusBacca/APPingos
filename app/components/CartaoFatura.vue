<script setup lang="ts">
/**
 * Um cartão de crédito na aba Open Finance: a fatura ABERTA (não "o mês"), quando
 * fecha e vence, e quanto do limite já foi.
 *
 * A barra do limite muda de cor por faixa — até 50% é tranquilo, até 80% pede
 * atenção, acima disso é alerta. Sem limite conhecido, a barra vira um convite
 * para digitá-lo: o banco nem sempre informa, e quem sabe o limite é a dona.
 */
import { ChevronDownIcon, SlidersHorizontalIcon } from '@lucide/vue'
import { hojeIso, partesDaData, somarDias } from '@/lib/datas'
import { diasEntre } from '~/lib/contas-bancarias'
import { formatarDinheiro, formatarPercentual } from '@/lib/dinheiro'
import { quandoFecha, seloDoBanco } from '~/lib/cartoes'
import type { FaturaFechada, PagamentoDaFatura, ResumoDoCartao } from '~/composables/useCartoes'

const props = defineProps<{ resumo: ResumoDoCartao, fracaoDoTotal: number | null }>()
const emit = defineEmits<{ ajustar: [] }>()

const hoje = hojeIso()

/** "05/12": cabe ao lado do resto numa linha de celular, onde "5 de dezembro" não cabe. */
function diaCurto(iso: string): string {
  const { dia, mes } = partesDaData(iso)
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`
}
const aberto = ref(false)

const cor = computed(() => seloDoBanco(props.resumo.cartao.banco).cor)

const COR_DA_FAIXA = {
  tranquilo: 'bg-emerald-500',
  atencao: 'bg-amber-500',
  alerta: 'bg-red-500',
} as const

const TEXTO_DA_FAIXA = {
  tranquilo: 'text-emerald-600 dark:text-emerald-400',
  atencao: 'text-amber-600 dark:text-amber-400',
  alerta: 'text-red-600 dark:text-red-400',
} as const

const prazo = computed(() => {
  const { ciclo } = props.resumo
  if (ciclo.fonte === 'calendario') return 'no mês · informe o fechamento'
  // Estimado pelas datas das transações: "~" avisa que pode errar um dia.
  const partes = [ciclo.fonte === 'estimado' ? `~${quandoFecha(ciclo, hoje)}` : quandoFecha(ciclo, hoje)]
  if (ciclo.vencimento) partes.push(`vence ${diaCurto(ciclo.vencimento)}`)
  return partes.join(' · ')
})

/*
 * O `account.balance` do cartão NÃO é a fatura aberta: na amostra real do
 * Nubank (20/11/2026) ele é o limite tomado, parcelas futuras incluídas — o
 * mesmo número que a barra do limite já mostra. Por isso não aparece aqui.
 */

const SITUACAO = { BLOCKED: 'bloqueado', CANCELLED: 'cancelado' } as const
const situacao = computed(() => SITUACAO[props.resumo.cartao.situacao_cartao as keyof typeof SITUACAO] ?? null)

const perfil = computed(() => [props.resumo.cartao.bandeira, props.resumo.cartao.nivel]
  .filter(Boolean)
  .map(t => t!.charAt(0) + t!.slice(1).toLowerCase())
  .join(' '))

const NOME_DO_ENCARGO: Record<string, string> = {
  IOF: 'IOF',
  LATE_PAYMENT_FEE: 'multa',
  LATE_PAYMENT_INTEREST: 'juros de mora',
  LATE_PAYMENT_REMUNERATIVE_INTEREST: 'juros',
  OTHER: 'outros encargos',
}
function nomeDoEncargo(tipo: string): string {
  return NOME_DO_ENCARGO[tipo] ?? tipo.toLowerCase()
}

/*
 * O pagamento de cada fatura fechada: o que entrou no cartão entre o fechamento
 * e uns dias depois do vencimento (quem paga atrasado também conta), o mais
 * perto do vencimento. A conta que pagou vem do par (`par_id`).
 */
function pagamentoDa(f: FaturaFechada): PagamentoDaFatura | null {
  const desde = f.fechamento ?? somarDias(f.vencimento, -12)
  const ate = somarDias(f.vencimento, 10)
  const candidatos = props.resumo.pagamentos.filter(p => p.data >= desde && p.data <= ate)
  if (!candidatos.length) return null
  const distancia = (p: PagamentoDaFatura) => Math.abs(diasEntre(f.vencimento, p.data))
  return [...candidatos].sort((a, b) => distancia(a) - distancia(b))[0]!
}

/** O pagamento de cada fatura, calculado uma vez por render. */
const pagamentoPorFatura = computed(() => new Map(props.resumo.faturas.map(f => [f.id, pagamentoDa(f)])))

const pagamentoDaUltima = computed(() => props.resumo.ultimaFechada ? pagamentoDa(props.resumo.ultimaFechada) : null)
</script>

<template>
  <article
    class="relative overflow-hidden rounded-xl border bg-card"
    :style="{ boxShadow: `inset 4px 0 0 ${cor}` }"
  >
    <div class="p-4 pl-5">
      <div>
        <div class="flex items-start gap-3">
          <SeloDoBanco :banco="resumo.cartao.banco" />
          <div class="min-w-0 flex-1">
            <h3 class="line-clamp-2 font-medium leading-tight">
              {{ resumo.cartao.apelido || resumo.cartao.nome }}
              <span v-if="resumo.cartao.apelido" class="text-xs font-normal text-muted-foreground">· {{ resumo.cartao.banco }}</span>
            </h3>
            <p class="mt-0.5 text-xs text-muted-foreground">
              <span v-if="resumo.cartao.numero" class="tracking-wider">•••• {{ resumo.cartao.numero }}</span>
              <span v-if="perfil"> · {{ perfil }}</span>
              <span v-if="fracaoDoTotal !== null"> · {{ formatarPercentual(fracaoDoTotal) }} das faturas</span>
            </p>
            <p v-if="situacao" class="mt-1 inline-block rounded bg-red-500/10 px-1.5 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
              Cartão {{ situacao }}
            </p>
          </div>
          <div class="shrink-0 text-right">
            <p class="text-lg font-semibold tabular-nums leading-tight">{{ formatarDinheiro(resumo.faturaAberta) }}</p>
            <p class="text-xs text-muted-foreground">fatura aberta</p>
          </div>
        </div>

        <!-- O limite: barra por faixa, ou o convite para informá-lo. -->
        <div v-if="resumo.uso" class="mt-3">
          <div
            class="h-2 overflow-hidden rounded-full bg-muted"
            role="meter"
            :aria-valuenow="Math.round(resumo.uso.fracao * 100)"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="`Uso do limite de ${resumo.cartao.nome}`"
          >
            <div
              class="h-full rounded-full transition-[width]"
              :class="COR_DA_FAIXA[resumo.uso.faixa]"
              :style="{ width: `${Math.max(2, resumo.uso.fracao * 100)}%` }"
            />
          </div>
          <div class="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
            <span>
              <strong class="font-semibold" :class="TEXTO_DA_FAIXA[resumo.uso.faixa]">{{ formatarPercentual(resumo.uso.fracao) }}</strong>
              <span class="text-muted-foreground"> do limite · {{ formatarDinheiro(resumo.uso.usado) }} de {{ formatarDinheiro(resumo.uso.limite) }}</span>
            </span>
            <span class="text-muted-foreground">{{ prazo }}</span>
          </div>
        </div>

        <div v-else class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <button
            type="button"
            class="rounded-md border border-dashed px-2.5 py-1 font-medium text-primary hover:bg-primary/10"
            @click="emit('ajustar')"
          >
            Informar limite
          </button>
          <span class="text-muted-foreground">{{ prazo }}</span>
        </div>

        <!-- Rodapé: a fatura fechada mais recente e o ajuste manual. -->
        <div class="mt-3 flex items-center justify-between gap-2 border-t pt-2.5 text-xs">
          <button
            v-if="resumo.faturas.length"
            type="button"
            class="flex min-w-0 items-center gap-1 text-muted-foreground hover:text-foreground"
            :aria-expanded="aberto"
            @click="aberto = !aberto"
          >
            <ChevronDownIcon class="size-3.5 shrink-0 transition-transform" :class="aberto && 'rotate-180'" />
            <span class="truncate">
              Última fechada: <strong class="font-medium text-foreground">{{ formatarDinheiro(resumo.ultimaFechada!.total) }}</strong>
              · <template v-if="pagamentoDaUltima">paga {{ diaCurto(pagamentoDaUltima.data) }}</template>
              <template v-else>{{ resumo.ultimaFechada!.vencimento < hoje ? 'venceu' : 'vence' }} {{ diaCurto(resumo.ultimaFechada!.vencimento) }}</template>
            </span>
          </button>
          <span v-else class="text-muted-foreground">O banco ainda não mandou faturas fechadas.</span>

          <button
            type="button"
            class="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            :aria-label="`Ajustar limite e datas de ${resumo.cartao.nome}`"
            title="Ajustar limite e datas"
            @click="emit('ajustar')"
          >
            <SlidersHorizontalIcon class="size-4" />
          </button>
        </div>

        <ul v-if="aberto" class="mt-2 space-y-1 text-xs">
          <li v-for="f in resumo.faturas" :key="f.id" class="rounded-md bg-muted/50 px-2.5 py-1.5">
            <div class="flex justify-between gap-3">
              <span class="text-muted-foreground">
                Vencimento {{ diaCurto(f.vencimento) }}<span v-if="f.fechamento"> · fechou {{ diaCurto(f.fechamento) }}</span>
              </span>
              <span class="tabular-nums">
                {{ formatarDinheiro(f.total) }}
                <span v-if="f.minimo" class="text-muted-foreground"> · mín. {{ formatarDinheiro(f.minimo) }}</span>
              </span>
            </div>
            <p v-if="pagamentoPorFatura.get(f.id)" class="mt-0.5 text-muted-foreground">
              Paga em {{ diaCurto(pagamentoPorFatura.get(f.id)!.data) }} · {{ formatarDinheiro(pagamentoPorFatura.get(f.id)!.valor) }}
              <template v-if="pagamentoPorFatura.get(f.id)!.pagoPor">pela conta <span class="text-foreground">{{ pagamentoPorFatura.get(f.id)!.pagoPor }}</span></template>
            </p>
            <p v-if="f.total_encargos > 0" class="mt-0.5 text-red-600 dark:text-red-400">
              {{ formatarDinheiro(f.total_encargos) }} em encargos:
              {{ f.encargos.map(e => `${nomeDoEncargo(e.tipo)} ${formatarDinheiro(e.valor)}`).join(', ') }}
            </p>
          </li>
        </ul>
      </div>
    </div>
  </article>
</template>
