<script setup lang="ts">
/**
 * O que os cartões do casal trouxeram e ainda não entrou no acerto — no Chico
 * Moedas, ao lado do "Gasto do espaço" que essas compras ainda não somam.
 *
 * Com o Open Finance ligado, o gasto do mês só fica completo quando a caixa de
 * entrada da fatura vigente esvazia. Esta seção é o lembrete disso, no lugar em
 * que o casal confere o mês, e não escondido na caixa de cada um.
 *
 * Duas leituras, de propósito diferentes:
 *
 * - A CONTAGEM é de todo mundo (`pendencias_do_espaco`): "Ana tem 3 compras do
 *   cartão do casal esperando". A outra pessoa precisa saber que o acerto ainda
 *   vai mudar — não o que a dona comprou.
 * - A LISTA é só do extrato de quem está vendo (a RLS de `transacao_bancaria`).
 *   Tocar numa compra abre a caixa de entrada já nela.
 *
 * Régua: a competência do Chico Moedas, que para cartão é o mês da fatura. A
 * compra de 30/10 que vence em novembro aparece em novembro — é onde ela vai
 * pesar.
 */
import { ChevronRightIcon, InboxIcon, InfoIcon } from '@lucide/vue'
import { Skeleton } from '@/components/ui/skeleton'
import { nomeDoMes, partesDaData } from '@/lib/datas'
import { useValoresOcultos } from '~/composables/useValoresOcultos'
import { itensDaCaixa } from '~/lib/caixa-de-entrada'
import type { ItemDaCaixa } from '~/lib/caixa-de-entrada'
import { bancoDaConta, mesDoItem, pendentesDoCasal, rotuloDaConta, textoParaSelo, valorDoItem } from '~/lib/caixa-lista'
import { rotuloParaRegra, sugerirClassificacao } from '~/lib/auto-tag'
import { iconeDaCategoria } from '~/lib/icones-categoria'
import { rotuloDaCategoriaNaCaixa } from '~/lib/categorias-pluggy'
import { usePendenciasDoEspaco, useRegrasClassificacao, useTransacoesDaCaixa } from '~/composables/useCaixaDeEntrada'
import { useCategorias } from '~/composables/useOrcamento'
import { useMembros } from '~/composables/useMembros'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'

/** Os valores em dinheiro seguem o olho de Orçamentos (`useValoresOcultos`). */
const { dinheiro } = useValoresOcultos()

const props = defineProps<{
  /** O mês que o Chico Moedas está mostrando (YYYY-MM-01). */
  competencia: string
}>()

/** Quantas linhas antes do "ver todas": a seção lembra, quem resolve é a caixa. */
const LIMITE = 5

const store = useSpaceStore()
const usuarioId = useUsuarioId()
const { data: membros } = useMembros()

const espacoCasal = computed(() => (store.espacoAtivo?.tipo === 'casal' ? store.espacoAtivo.id : null))

const { data: contagens, isPending: contando } = usePendenciasDoEspaco(espacoCasal, () => props.competencia)

/*
 * A MESMA consulta (e o mesmo cache) da caixa de entrada: entrar nela depois de
 * ver esta seção não busca de novo, e classificar lá atualiza aqui.
 */
const { data: transacoes } = useTransacoesDaCaixa()
const { data: regras } = useRegrasClassificacao()
const { data: categorias } = useCategorias()

const contaDe = (contaId: string) => transacoes.value?.find(t => t.conta_id === contaId)?.conta ?? null

const minhas = computed<ItemDaCaixa[]>(() => {
  if (!espacoCasal.value) return []
  return pendentesDoCasal(itensDaCaixa(transacoes.value ?? []), espacoCasal.value, props.competencia, contaDe)
})

const total = computed(() => (contagens.value ?? []).reduce((s, c) => s + c.quantidade, 0))

/** "Você · 12", "Pinga fogo · 3" — você primeiro, e só quem tem algo parado. */
const porPessoa = computed(() =>
  (contagens.value ?? [])
    .filter(c => c.quantidade > 0)
    .map(c => ({
      ...c,
      eu: c.user_id === usuarioId.value,
      nome: c.user_id === usuarioId.value ? 'Você' : (membros.value?.find(m => m.user_id === c.user_id)?.exibicao ?? 'Alguém'),
    }))
    .sort((a, b) => Number(b.eu) - Number(a.eu)),
)

const outros = computed(() => porPessoa.value.filter(p => !p.eu))

const visiveis = computed(() => minhas.value.slice(0, LIMITE))

const valorDasMinhas = computed(() => minhas.value.reduce((s, i) => s + valorDoItem(i), 0))

function categoriaDe(item: ItemDaCaixa): string | null {
  const s = sugerirClassificacao(item.principal, regras.value ?? [], categorias.value ?? [])
  return s?.categoriaNome ?? rotuloDaCategoriaNaCaixa(item.principal.categoria_pluggy)
}

function bancoDe(item: ItemDaCaixa): string {
  return bancoDaConta(contaDe(item.principal.conta_id))
}

/** "22/11" e "Sáb" — o dia como na fatura, e a semana para reconhecer a compra. */
function diaDe(iso: string) {
  const { ano, mes, dia } = partesDaData(iso)
  const semana = new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  return {
    data: `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`,
    semana: semana.charAt(0).toUpperCase() + semana.slice(1),
  }
}

const caixaDoMes = computed(() => `/orcamentos/open-finance/caixa?mes=${props.competencia.slice(0, 7)}`)

function linkDe(item: ItemDaCaixa): string {
  return `/orcamentos/open-finance/caixa?mes=${mesDoItem(item).slice(0, 7)}&compra=${encodeURIComponent(item.chave)}`
}

const nomeDaFatura = computed(() => nomeDoMes(props.competencia).toLowerCase())
</script>

<template>
  <section v-if="espacoCasal && (contando || total > 0)" class="rounded-xl border bg-card p-4" aria-labelledby="pendencias-titulo">
    <Skeleton v-if="contando" class="h-16 w-full rounded-lg" />

    <template v-else>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 items-start gap-3">
          <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
            <InboxIcon class="size-5" />
          </span>
          <div class="min-w-0">
            <h2 id="pendencias-titulo" class="text-sm font-medium">Esperando destino</h2>
            <p class="mt-0.5 text-xs text-muted-foreground">
              Compras dos cartões do casal na fatura de {{ nomeDaFatura }} que ainda não entraram no acerto.
            </p>
          </div>
        </div>
        <div class="text-right">
          <p class="text-2xl font-semibold leading-none tabular-nums">{{ total }}</p>
          <p class="mt-1 text-xs text-muted-foreground">{{ total === 1 ? 'pendente' : 'pendentes' }}</p>
        </div>
      </div>

      <!-- Quem tem o quê: a contagem que os dois veem. -->
      <ul class="mt-3 flex flex-wrap gap-1.5" aria-label="Pendentes por pessoa">
        <li
          v-for="p in porPessoa"
          :key="p.user_id"
          class="rounded-full border px-2.5 py-0.5 text-xs"
          :class="p.eu ? 'border-primary/40 bg-primary/10 text-foreground' : 'text-muted-foreground'"
        >
          {{ p.nome }} <span class="font-semibold tabular-nums text-foreground">{{ p.quantidade }}</span>
        </li>
      </ul>

      <!-- A lista: só o seu extrato. -->
      <ul v-if="visiveis.length" class="mt-3 space-y-2">
        <li v-for="item in visiveis" :key="item.chave">
          <NuxtLink
            :to="linkDe(item)"
            class="flex items-center gap-3 rounded-xl border bg-background/40 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
            :aria-label="`${rotuloParaRegra(item.principal)}, ${dinheiro(valorDoItem(item))}. Classificar na caixa de entrada.`"
          >
            <span class="relative shrink-0">
              <IconeDaCompra :descricao="textoParaSelo(item.principal)" :categoria="categoriaDe(item)" />
              <SeloDoBanco v-if="bancoDe(item)" :banco="bancoDe(item)" tamanho="xs" class="absolute -bottom-1 -right-1.5 ring-2 ring-card" />
            </span>

            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{ rotuloParaRegra(item.principal) }}</span>
              <span class="block truncate text-xs text-muted-foreground">{{ rotuloDaConta(contaDe(item.principal.conta_id), item.principal.cartao_final) }}</span>
            </span>

            <span class="hidden shrink-0 border-l pl-3 text-xs leading-tight sm:block">
              <span class="block font-medium tabular-nums">{{ diaDe(item.data).data }}</span>
              <span class="block text-muted-foreground">{{ diaDe(item.data).semana }}</span>
            </span>

            <span class="flex shrink-0 flex-col items-end gap-1">
              <span class="font-semibold tabular-nums">{{ dinheiro(valorDoItem(item)) }}</span>
              <span
                v-if="categoriaDe(item)"
                class="inline-flex max-w-36 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary"
              >
                <component :is="iconeDaCategoria(categoriaDe(item))" class="size-3 shrink-0" />
                <span class="truncate">{{ categoriaDe(item) }}</span>
              </span>
              <span class="text-[11px] text-muted-foreground sm:hidden">{{ diaDe(item.data).data }} · {{ diaDe(item.data).semana }}</span>
            </span>

            <ChevronRightIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </NuxtLink>
        </li>
      </ul>

      <p v-else-if="outros.length" class="mt-3 text-sm text-muted-foreground">
        São compras do extrato de {{ outros.map(o => o.nome).join(' e ') }} — só quem conectou o cartão vê e decide para onde vão.
      </p>

      <NuxtLink
        v-if="minhas.length"
        :to="caixaDoMes"
        class="mt-3 flex items-center gap-3 rounded-xl border border-dashed px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <InfoIcon class="size-5 shrink-0" />
        <span class="flex-1">
          <template v-if="minhas.length > LIMITE">
            Mais {{ minhas.length - LIMITE }} na caixa de entrada — {{ dinheiro(valorDasMinhas) }} no total.
          </template>
          <template v-else>Toque em uma compra para classificar ou ver mais detalhes.</template>
        </span>
        <ChevronRightIcon class="size-4 shrink-0" />
      </NuxtLink>
    </template>
  </section>
</template>
