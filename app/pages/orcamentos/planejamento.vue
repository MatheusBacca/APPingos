<script setup lang="ts">
/**
 * Orçamentos › Planejamento — "como vai ser o mês".
 *
 * Chico Moedas responde "quanto gastamos e quem deve a quem"; esta aba responde
 * a pergunta de antes: quanto o mês TEM, e quanto ainda sobra dele. Duas
 * projeções, e elas não se somam:
 *
 *   - **Meu mês** — salário − contribuição − gastos pessoais − aportes em metas
 *     pessoais. Só quem olha vê, porque usa o salário de quem olha (e só o dele:
 *     a projeção de uma pessoa nunca lê a renda da outra).
 *   - **Mês do casal** — valor central − parcelas do mês − aportes em metas do
 *     casal. Só existe num espaço compartilhado.
 *
 * As duas leem gavetas diferentes ao mesmo tempo — o pessoal e o compartilhado —
 * com `useEspacoQuery`, o mesmo par de primitivas que os gastos pessoais usam em
 * Chico Moedas. No espaço pessoal de quem não está em casal, a tela continua
 * inteira: é só o "meu mês".
 */
import { ChevronLeftIcon, ChevronRightIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarDia, formatarMes, hojeIso, primeiroDoMes, somarMeses } from '@/lib/datas'
import { dataPrevistaDoSalario, descreverRecebimento } from '@/lib/salario'
import { totalDoMes } from '~/types/orcamento'
import { somaDosAportes } from '~/types/meta'
import { projecaoDoCasal, projecaoPessoal, valorCentral, valorDaContribuicao } from '~/types/planejamento'
import type { LinhaDaProjecao } from '~/components/ProjecaoCartao.vue'
import { useGastosPessoais } from '~/composables/useGastosPessoais'
import { useMembros } from '~/composables/useMembros'
import { useAportesDoMes } from '~/composables/useMetas'
import { useComprasDoMes } from '~/composables/useOrcamento'
import { useContribuicoesDoEspaco, useMinhasContribuicoes } from '~/composables/usePlanejamento'
import { useMeusCompartilhamentos, useMinhaRenda } from '~/composables/useRenda'
import { useSpaceStore } from '~/stores/space'

useHead({ title: 'Planejamento · Orçamentos · APPingos' })

const store = useSpaceStore()
const { data: membros } = useMembros()
const { espacoPessoalId } = useGastosPessoais()

const competencia = ref(primeiroDoMes(hojeIso()))
const mesCorrente = computed(() => primeiroDoMes(hojeIso()))

/** O espaço do casal, quando o ativo é compartilhado; `null` desliga as consultas dele. */
const espacoCasal = computed(() =>
  store.espacoAtivo && store.espacoAtivo.tipo !== 'pessoal' ? store.espacoAtivo.id : null,
)

// ---- A pessoa -------------------------------------------------------------------

const renda = useMinhaRenda()
const minhasContribuicoes = useMinhasContribuicoes()
const compartilhamentos = useMeusCompartilhamentos()

const { data: comprasPessoais, isPending: carregandoPessoais } = useComprasDoMes(competencia, espacoPessoalId)
const { data: aportesPessoais } = useAportesDoMes(espacoPessoalId, competencia)

const salario = computed(() => renda.data.value?.valor_liquido ?? null)

/**
 * O que sai do salário para os espaços compartilhados — todos eles, e não só o
 * ativo: quem contribui com o casal e com a família tem as duas saídas no mês,
 * qualquer que seja o espaço aberto na tela.
 */
const contribuicoesEmReais = computed(() =>
  (minhasContribuicoes.data.value ?? []).map(c => ({
    space_id: c.space_id,
    valor: valorDaContribuicao(c, salario.value),
  })),
)

const nomeDoEspaco = (id: string) => store.espacos.find(e => e.id === id)?.nome ?? 'um espaço'

const meuMes = computed(() => projecaoPessoal({
  salario: salario.value,
  contribuicoes: contribuicoesEmReais.value.map(c => c.valor),
  gastosPessoais: totalDoMes(comprasPessoais.value ?? []),
  aportesPessoais: somaDosAportes(aportesPessoais.value),
}))

const dataDoSalario = computed(() => {
  const r = renda.data.value
  if (!r) return null
  return dataPrevistaDoSalario(competencia.value, r.recebimento_tipo, r.recebimento_dia)
})

const linhasDoMeuMes = computed<LinhaDaProjecao[]>(() => {
  const r = renda.data.value
  if (!r || !meuMes.value) return []

  return [
    {
      rotulo: 'Salário',
      valor: meuMes.value.salario,
      sentido: 'entra',
      detalhe: `${descreverRecebimento(r.recebimento_tipo, r.recebimento_dia)} — ${formatarDia(dataDoSalario.value!)}`,
    },
    ...contribuicoesEmReais.value
      .filter(c => c.valor !== null)
      .map(c => ({
        rotulo: `Contribuição a ${nomeDoEspaco(c.space_id)}`,
        valor: c.valor!,
        sentido: 'sai' as const,
      })),
  ]
})

// ---- O casal --------------------------------------------------------------------

const { data: comprasDoCasal } = useComprasDoMes(competencia, espacoCasal)
const { data: aportesDoCasal } = useAportesDoMes(espacoCasal, competencia)
const { data: contribuicoes, isPending: carregandoContribuicoes } = useContribuicoesDoEspaco(espacoCasal)

const mesDoCasal = computed(() => projecaoDoCasal({
  valorCentral: valorCentral(contribuicoes.value ?? []),
  parcelas: totalDoMes(comprasDoCasal.value ?? []),
  aportes: somaDosAportes(aportesDoCasal.value),
}))

/**
 * Cada contribuição é uma linha que ENTRA no valor central, com o nome de quem
 * pôs. O percentual não aparece aqui de propósito: a lista de contribuições, logo
 * abaixo, é o lugar dele — e lá a regra de quem pode vê-lo já está aplicada.
 */
const linhasDoCasal = computed<LinhaDaProjecao[]>(() =>
  (membros.value ?? []).map(m => ({
    rotulo: m.exibicao,
    valor: contribuicoes.value?.find(c => c.user_id === m.user_id)?.valor_efetivo ?? 0,
    sentido: 'entra' as const,
  })),
)

const minhaNoCasal = computed(() =>
  (minhasContribuicoes.data.value ?? []).find(c => c.space_id === espacoCasal.value) ?? null,
)

const salarioAbertoAqui = computed(() =>
  !!espacoCasal.value && (compartilhamentos.data.value?.has(espacoCasal.value) ?? false),
)

// ---- Mês ------------------------------------------------------------------------

const situacao = computed(() => {
  if (competencia.value < mesCorrente.value) return 'fechado'
  if (competencia.value > mesCorrente.value) return 'futuro'
  return 'aberto'
})
</script>

<template>
  <div class="space-y-6">
    <OrcamentosAbas subtitulo="Como vai ser o mês: o que entra, o que já saiu e o que sobra." />

    <section class="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
      <div class="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Mês anterior" @click="competencia = somarMeses(competencia, -1)">
          <ChevronLeftIcon class="size-4" />
        </Button>
        <span class="min-w-40 text-center text-sm font-medium">{{ formatarMes(competencia) }}</span>
        <Button variant="ghost" size="icon" aria-label="Próximo mês" @click="competencia = somarMeses(competencia, 1)">
          <ChevronRightIcon class="size-4" />
        </Button>
      </div>

      <button
        v-if="situacao !== 'aberto'"
        type="button"
        class="rounded-full border px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        @click="competencia = mesCorrente"
      >
        Hoje
      </button>

      <p v-if="situacao === 'futuro'" class="text-xs text-muted-foreground">
        Os gastos de um mês futuro são só as parcelas já comprometidas.
      </p>
    </section>

    <div class="grid gap-4 lg:grid-cols-2">
      <!-- ---- Meu mês ---- -->
      <div v-if="renda.isPending.value || carregandoPessoais" class="space-y-3 rounded-lg border bg-card p-4">
        <Skeleton v-for="i in 5" :key="i" class="h-6 w-full" />
      </div>

      <ProjecaoCartao
        v-else-if="meuMes"
        titulo="Meu mês"
        subtitulo="Seu salário menos o que vai para os espaços compartilhados, seus gastos pessoais e o que você guarda nas suas metas. Só você vê."
        :projecao="meuMes"
        :linhas="linhasDoMeuMes"
        rotulo-planejado="Para o seu mês"
        rotulo-gastos="Gastos pessoais"
        rotulo-aportes="Guardado nas suas metas"
      >
        <SalarioDoMes
          v-if="dataDoSalario"
          :competencia="competencia"
          :previsto="meuMes.salario"
          :data-prevista="dataDoSalario"
        />
      </ProjecaoCartao>

      <section v-else class="space-y-2 rounded-lg border border-dashed bg-card p-4">
        <h2 class="text-sm font-medium">Meu mês</h2>
        <p class="text-sm text-muted-foreground">
          Sem o salário, não há o que planejar. Cadastre o valor líquido e quando ele cai em
          <NuxtLink to="/espacos" class="text-primary underline-offset-2 hover:underline">Espaços › Seu salário</NuxtLink>
          — ele fica privado, a menos que você compartilhe.
        </p>
      </section>

      <!-- ---- Mês do casal ---- -->
      <template v-if="espacoCasal">
        <div v-if="carregandoContribuicoes" class="space-y-3 rounded-lg border bg-card p-4">
          <Skeleton v-for="i in 5" :key="i" class="h-6 w-full" />
        </div>

        <ProjecaoCartao
          v-else
          :titulo="`Mês de ${store.espacoAtivo?.nome}`"
          subtitulo="O valor central — a soma das contribuições — menos as parcelas que caem neste mês e o que vocês guardam nas metas do espaço."
          :projecao="mesDoCasal"
          :linhas="linhasDoCasal"
          rotulo-planejado="Valor central"
          rotulo-gastos="Parcelas do mês"
          rotulo-aportes="Guardado nas metas do espaço"
        />
      </template>
    </div>

    <ContribuicoesDoCasal
      v-if="espacoCasal && contribuicoes"
      :space-id="espacoCasal"
      :membros="membros ?? []"
      :contribuicoes="contribuicoes"
      :minha="minhaNoCasal"
      :meu-salario="salario"
      :salario-aberto-aqui="salarioAbertoAqui"
    />

    <p class="text-xs text-muted-foreground">
      Aqui o aporte numa meta conta como dinheiro que saiu do mês — mas não é compra: não entra no
      gasto do espaço, no gráfico de categorias nem no acerto de Chico Moedas.
    </p>
  </div>
</template>
