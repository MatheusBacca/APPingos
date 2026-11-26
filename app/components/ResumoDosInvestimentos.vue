<script setup lang="ts">
/**
 * O resumo dos investimentos: o total, o rendimento bruto e a rosca por banco.
 *
 * Era o cartão "Investimentos" do painel de Orçamentos; mudou para o alto da
 * seção de Investimentos do Planejamento — a tela que o "Salário do mês" abre —,
 * porque é lá que a pessoa vem ver o que guardou. O painel ficou com o que é do
 * mês; o patrimônio mora aqui.
 *
 * As mesmas caixinhas da seção (as do pessoal e as do espaço ativo).
 */
import { Skeleton } from '@/components/ui/skeleton'
import { formatarPercentual } from '@/lib/dinheiro'
import { seloDoBanco } from '~/lib/cartoes'
import { resumoPorBanco, saldoDaCaixinha, totalInvestido } from '~/lib/investimentos'
import { corDeDado } from '~/lib/painel-orcamentos'
import { useCaixinhas, useInvestimentosDosBancos } from '~/composables/useCaixinhas'
import { useValoresOcultos } from '~/composables/useValoresOcultos'
import { useSpaceStore } from '~/stores/space'

const { dinheiro } = useValoresOcultos()
const store = useSpaceStore()

const { data: caixinhas } = useCaixinhas()
const { data: posicoes, isPending: carregandoPosicoes } = useInvestimentosDosBancos()

const espacoPessoal = computed(() => store.espacos.find(e => e.tipo === 'pessoal')?.id ?? null)
const caixinhasVisiveis = computed(() =>
  (caixinhas.value ?? []).filter(c => !c.arquivada && (c.space_id === espacoPessoal.value || c.space_id === store.espacoAtivoId)),
)

const bancos = computed(() => resumoPorBanco(posicoes.value ?? []))
const investimentos = computed(() => totalInvestido(bancos.value, caixinhasVisiveis.value))

/** A rosca: um arco por banco, na cor do banco. */
const RAIO = 30
const VOLTA = 2 * Math.PI * RAIO
const arcos = computed(() => {
  const total = bancos.value.reduce((s, b) => s + b.saldo, 0)
  if (!total) return []
  let deslocamento = 0
  return bancos.value.map((b) => {
    const comprimento = (b.saldo / total) * VOLTA
    const arco = { banco: b.banco, cor: corDeDado(seloDoBanco(b.banco).cor) ?? 'currentColor', fracao: b.saldo / total, traco: `${comprimento} ${VOLTA}`, deslocamento: -deslocamento }
    deslocamento += comprimento
    return arco
  })
})
</script>

<template>
  <!-- Sem banco nem caixinha não há o que resumir: a seção já diz como começar. -->
  <div v-if="carregandoPosicoes || investimentos" class="@container rounded-lg border bg-card p-4">
    <Skeleton v-if="carregandoPosicoes" class="h-28 w-full" />
    <template v-else>
      <div v-if="investimentos" class="mb-3">
        <p class="text-2xl font-semibold tabular-nums">{{ dinheiro(investimentos.total) }}</p>
        <p class="text-xs text-muted-foreground">
          <template v-if="investimentos.rendimento !== null">Rendimento bruto {{ dinheiro(investimentos.rendimento) }}</template>
          <template v-else>Pelas suas caixinhas</template>
        </p>
      </div>
      <div v-if="arcos.length" class="flex flex-col items-center gap-4 @[18rem]:flex-row">
        <svg viewBox="0 0 80 80" class="size-24 shrink-0 -rotate-90 text-muted-foreground" aria-hidden="true">
          <circle cx="40" cy="40" :r="RAIO" fill="none" stroke-width="12" class="stroke-muted" />
          <circle
            v-for="a in arcos"
            :key="a.banco"
            cx="40"
            cy="40"
            :r="RAIO"
            fill="none"
            stroke-width="12"
            :stroke="a.cor"
            :stroke-dasharray="a.traco"
            :stroke-dashoffset="a.deslocamento"
          />
        </svg>
        <ul class="w-full min-w-0 flex-1 space-y-1.5 text-xs">
          <li v-for="a in arcos" :key="a.banco" class="flex items-center gap-2">
            <span class="size-2.5 shrink-0 rounded-full" :style="{ background: a.cor }" />
            <span class="min-w-0 flex-1 truncate">{{ a.banco }}</span>
            <span class="tabular-nums text-muted-foreground">{{ formatarPercentual(a.fracao) }}</span>
          </li>
        </ul>
      </div>
      <ul v-else-if="caixinhasVisiveis.length" class="space-y-2 text-sm">
        <li v-for="c in caixinhasVisiveis.slice(0, 5)" :key="c.id" class="flex justify-between gap-2">
          <span class="truncate">{{ c.nome }}</span>
          <span class="tabular-nums">{{ dinheiro(saldoDaCaixinha(c)) }}</span>
        </li>
      </ul>
    </template>
  </div>
</template>
