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
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarDia, formatarMes, hojeIso, primeiroDoMes, somarMeses } from '@/lib/datas'
import { dataPrevistaDoSalario, descreverRecebimento } from '@/lib/salario'
import { competenciaDaUrl } from '~/lib/painel-orcamentos'
import type { LinhaDaProjecao } from '~/components/ProjecaoCartao.vue'
import { useMembros } from '~/composables/useMembros'
import { useProjecoesDoMes } from '~/composables/useProjecoesDoMes'
import { useMeusCompartilhamentos } from '~/composables/useRenda'
import { useSpaceStore } from '~/stores/space'

// Tela de dado: ocupa a largura inteira no computador (ver layouts/default.vue).
definePageMeta({ larguraAmpla: true })

useHead({ title: 'Planejamento · Orçamentos · APPingos' })

const store = useSpaceStore()
const route = useRoute()
const { data: membros } = useMembros()

// O atalho do painel traz o mês em `?mes=AAAA-MM`; sem ele, o mês de hoje.
const competencia = ref(competenciaDaUrl(route.query.mes) ?? primeiroDoMes(hojeIso()))
const mesCorrente = computed(() => primeiroDoMes(hojeIso()))

// As duas projeções e o que as compõe — as mesmas que o painel de Orçamentos mostra.
const {
  espacoCasal,
  minhasContribuicoes,
  rendaDoMes,
  salario,
  contribuicoesEmReais,
  meuMes,
  carregandoMeuMes,
  contribuicoes,
  carregandoContribuicoes,
  mesDoCasal,
} = useProjecoesDoMes(competencia)

const compartilhamentos = useMeusCompartilhamentos()

/*
 * O salário se ajusta daqui também, sem passar por Espaços: muda o valor dali
 * em diante. O "Quem vê" continua só em Espaços, ao lado do resto do perfil.
 */
const editandoSalario = ref(false)

const nomeDoEspaco = (id: string) => store.espacos.find(e => e.id === id)?.nome ?? 'um espaço'

const dataDoSalario = computed(() => {
  const r = rendaDoMes.value
  if (!r) return null
  return dataPrevistaDoSalario(competencia.value, r.recebimento_tipo, r.recebimento_dia)
})

const linhasDoMeuMes = computed<LinhaDaProjecao[]>(() => {
  const r = rendaDoMes.value
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
    <OrcamentosCabecalho titulo="Planejamento" subtitulo="Como vai ser o mês: o que entra, o que já saiu e o que sobra." />

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

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <!-- ---- Meu mês ---- -->
      <div v-if="carregandoMeuMes" class="space-y-3 rounded-lg border bg-card p-4">
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
        <div class="flex justify-end">
          <Button size="sm" variant="ghost" class="gap-1.5 text-muted-foreground" @click="editandoSalario = true">
            <PencilIcon class="size-3.5" />
            Ajustar salário
          </Button>
        </div>
      </ProjecaoCartao>

      <section v-else class="space-y-2 rounded-lg border border-dashed bg-card p-4">
        <h2 class="text-sm font-medium">Meu mês</h2>
        <p class="text-sm text-muted-foreground">
          Sem o salário, não há o que planejar. Cadastre o valor líquido e quando ele cai — ele
          fica privado, a menos que você compartilhe em
          <NuxtLink to="/espacos" class="text-primary underline-offset-2 hover:underline">Espaços › Seu salário</NuxtLink>.
        </p>
        <Button size="sm" @click="editandoSalario = true">Cadastrar salário</Button>
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

    <!-- A âncora é o destino do cartão "Investido" do painel. -->
    <InvestimentosDoPlanejamento id="investimentos" class="scroll-mt-20" />

    <p class="text-xs text-muted-foreground">
      Aqui o aporte numa meta conta como dinheiro que saiu do mês — mas não é compra: não entra no
      gasto do espaço, no gráfico de categorias nem no acerto de Chico Moedas.
    </p>

    <Dialog v-model:open="editandoSalario">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Seu salário</DialogTitle>
          <DialogDescription>
            O novo valor vale daqui em diante. Os meses já marcados como recebidos guardam o que
            caiu de verdade. Quem vê o salário continua sendo escolhido em Espaços.
          </DialogDescription>
        </DialogHeader>
        <SalarioFormulario
          id-base="planejamento-salario"
          :permite-remover="false"
          @salvo="editandoSalario = false"
          @cancelar="editandoSalario = false"
        />
      </DialogContent>
    </Dialog>
  </div>
</template>
