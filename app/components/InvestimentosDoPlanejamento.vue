<script setup lang="ts">
/**
 * Investimentos no Planejamento: as caixinhas (cadastradas pela pessoa, pessoais
 * ou do espaço) com as aplicações e resgates ligados a elas, e as posições que a
 * Pluggy traz de cada banco conectado.
 *
 * As duas coisas lado a lado porque cada uma sabe uma metade: a caixinha sabe o
 * "para quê" (a meta, o nome), a posição sabe o quanto rende. A Pluggy não diz a
 * qual caixinha cada posição pertence — ver lib/investimentos.ts.
 */
import { toast } from 'vue-sonner'
import { ChevronDownIcon, LandmarkIcon, PencilIcon, PiggyBankIcon, PlusIcon, TrendingUpIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatarDiaCompleto, hojeIso, partesDaData } from '@/lib/datas'
import { formatarPercentual } from '@/lib/dinheiro'
import { useValoresOcultos } from '~/composables/useValoresOcultos'
import { mensagemDeErro } from '@/lib/utils'
import { nomeDoBanco } from '~/lib/instituicoes'
import { movimentosRecentes, resumoPorBanco, saldoDaCaixinha } from '~/lib/investimentos'
import type { Caixinha } from '~/lib/investimentos'
import { useCaixinhas, useInvestimentosDosBancos, useRegistrarMovimentoCaixinha } from '~/composables/useCaixinhas'
import { useSpaceStore } from '~/stores/space'

/** Os valores em dinheiro seguem o olho de Orçamentos (`useValoresOcultos`). */
const { dinheiro } = useValoresOcultos()

const store = useSpaceStore()
const { data: caixinhas, isPending } = useCaixinhas()
const { data: posicoes } = useInvestimentosDosBancos()

/* As do espaço pessoal e as do espaço ativo — a mesma régua das metas. */
const espacoPessoal = computed(() => store.espacos.find(e => e.tipo === 'pessoal')?.id ?? null)
const visiveis = computed(() =>
  (caixinhas.value ?? []).filter(c => !c.arquivada && (c.space_id === espacoPessoal.value || c.space_id === store.espacoAtivo?.id)),
)
const totalDasCaixinhas = computed(() => visiveis.value.reduce((s, c) => s + saldoDaCaixinha(c), 0))

const bancos = computed(() => resumoPorBanco(posicoes.value ?? []))
const bancoAberto = ref<string | null>(null)

const deQuem = (c: Caixinha) => {
  const e = store.espacos.find(x => x.id === c.space_id)
  return !e || e.tipo === 'pessoal' ? '👤 Pessoal' : `👥 ${e.nome}`
}

/** "06/11" — cabe numa linha de celular. */
function diaCurto(iso: string) {
  const { dia, mes } = partesDaData(iso)
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`
}

// ---- caixinha: criar e editar ---------------------------------------------------

const editando = ref<{ caixinha: Caixinha | null } | null>(null)

// ---- movimento à mão ------------------------------------------------------------

const movimentando = ref<Caixinha | null>(null)
const tipoMov = ref<'aplicacao' | 'resgate'>('aplicacao')
const valorMov = ref<number | undefined>(undefined)
const dataMov = ref(hojeIso())
const registrar = useRegistrarMovimentoCaixinha()

function abrirMovimento(c: Caixinha) {
  movimentando.value = c
  tipoMov.value = 'aplicacao'
  valorMov.value = undefined
  dataMov.value = hojeIso()
}

async function onRegistrar() {
  const c = movimentando.value
  if (!c || !valorMov.value || valorMov.value <= 0) return
  try {
    await registrar.mutateAsync({ caixinha: c.id, valor: tipoMov.value === 'aplicacao' ? valorMov.value : -valorMov.value, data: dataMov.value })
    toast.success(tipoMov.value === 'aplicacao' ? `Aplicação registrada em ${c.nome}.` : `Resgate registrado em ${c.nome}.`)
    movimentando.value = null
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para registrar.'))
  }
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="flex items-center gap-2 text-base font-semibold">
          <TrendingUpIcon class="size-4 text-muted-foreground" />
          Investimentos
        </h2>
        <p class="text-sm text-muted-foreground">
          Suas caixinhas — com as aplicações e resgates do extrato ligados a elas — e o que os bancos
          conectados informam.
        </p>
      </div>
      <Button size="sm" class="gap-1.5" @click="editando = { caixinha: null }">
        <PlusIcon class="size-4" />
        Nova caixinha
      </Button>
    </div>

    <!-- O total, o rendimento e a rosca por banco — o antigo cartão do painel. -->
    <ResumoDosInvestimentos />

    <!-- ---- As caixinhas ---- -->
    <div v-if="isPending" class="h-28 animate-pulse rounded-lg border bg-card" />

    <div v-else-if="!visiveis.length" class="rounded-lg border border-dashed bg-card p-4 text-sm text-muted-foreground">
      Nenhuma caixinha ainda. Crie uma para cada investimento ("Reserva", "Viagem") e ligue a ela as
      "Aplicação RDB" e "Resgate RDB" que chegam na caixa de entrada.
    </div>

    <template v-else>
      <p class="text-sm">
        Nas caixinhas: <strong class="tabular-nums">{{ dinheiro(totalDasCaixinhas) }}</strong>
      </p>
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <article v-for="c in visiveis" :key="c.id" class="rounded-xl border bg-card p-4">
          <div class="flex items-start gap-3">
            <SeloDoBanco v-if="c.instituicao" :banco="nomeDoBanco({ instituicao: c.instituicao })" tamanho="sm" />
            <span v-else class="grid size-8 place-items-center rounded-lg bg-muted"><PiggyBankIcon class="size-4 text-muted-foreground" /></span>
            <div class="min-w-0 flex-1">
              <h3 class="truncate font-medium leading-tight">{{ c.nome }}</h3>
              <p class="text-xs text-muted-foreground">
                {{ deQuem(c) }}<template v-if="c.instituicao"> · {{ nomeDoBanco({ instituicao: c.instituicao }) }}</template>
              </p>
            </div>
            <p class="shrink-0 text-lg font-semibold tabular-nums">{{ dinheiro(saldoDaCaixinha(c)) }}</p>
          </div>

          <div v-if="c.meta" class="mt-3">
            <div class="flex justify-between text-xs">
              <span class="text-muted-foreground">Meta <span class="text-foreground">{{ c.meta.titulo }}</span></span>
              <span class="tabular-nums text-muted-foreground">
                {{ formatarPercentual(Math.min(1, Math.max(0, saldoDaCaixinha(c) / c.meta.valor_alvo))) }} de {{ dinheiro(c.meta.valor_alvo) }}
              </span>
            </div>
            <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div class="h-full rounded-full bg-emerald-500" :style="{ width: `${Math.min(100, Math.max(2, saldoDaCaixinha(c) / c.meta.valor_alvo * 100))}%` }" />
            </div>
          </div>

          <ul v-if="c.movimentos.length" class="mt-3 space-y-1 border-t pt-2.5 text-xs">
            <li v-for="m in movimentosRecentes(c)" :key="m.id" class="flex items-baseline justify-between gap-2">
              <span class="min-w-0 truncate text-muted-foreground">
                {{ diaCurto(m.data) }} · {{ m.valor > 0 ? 'Aplicação' : 'Resgate' }}
                <template v-if="m.transacao_id"> do extrato</template>
                <template v-if="m.meta_aporte_id && c.meta"> → {{ m.valor > 0 ? 'aporte' : 'retirada' }} na meta {{ c.meta.titulo }}</template>
              </span>
              <span class="shrink-0 font-medium tabular-nums" :class="m.valor > 0 ? 'text-emerald-600 dark:text-emerald-400' : ''">
                {{ m.valor > 0 ? '+' : '−' }}{{ dinheiro(Math.abs(m.valor)) }}
              </span>
            </li>
          </ul>
          <p v-else class="mt-3 border-t pt-2.5 text-xs text-muted-foreground">
            Sem movimentos. Na caixa de entrada, "Aplicação em investimento" liga uma transação a esta caixinha.
          </p>

          <div class="mt-3 flex justify-end gap-1">
            <Button size="sm" variant="ghost" class="gap-1.5" @click="abrirMovimento(c)">
              <PlusIcon class="size-3.5" />
              Movimento
            </Button>
            <Button size="sm" variant="ghost" class="gap-1.5" @click="editando = { caixinha: c }">
              <PencilIcon class="size-3.5" />
              Editar
            </Button>
          </div>
        </article>
      </div>
    </template>

    <!-- ---- Nos bancos (Open Finance) ---- -->
    <div v-if="bancos.length" class="space-y-2">
      <h3 class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <LandmarkIcon class="size-4" />
        Nos bancos conectados
      </h3>
      <article v-for="b in bancos" :key="b.banco" class="rounded-xl border bg-card">
        <button
          type="button"
          class="flex w-full items-center gap-3 p-4 text-left"
          :aria-expanded="bancoAberto === b.banco"
          @click="bancoAberto = bancoAberto === b.banco ? null : b.banco"
        >
          <SeloDoBanco :banco="b.banco" tamanho="sm" />
          <span class="min-w-0 flex-1">
            <span class="block font-medium">{{ b.banco }}</span>
            <span class="block text-xs text-muted-foreground">
              {{ b.ativas.length }} {{ b.ativas.length === 1 ? 'aplicação' : 'aplicações' }}
              <template v-if="b.proximoVencimento"> · próximo vencimento {{ formatarDiaCompleto(b.proximoVencimento) }}</template>
            </span>
          </span>
          <span class="shrink-0 text-right">
            <span class="block font-semibold tabular-nums">{{ dinheiro(b.saldo) }}</span>
            <span class="block text-xs tabular-nums" :class="b.rendimento >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'">
              {{ b.rendimento >= 0 ? '+' : '−' }}{{ dinheiro(Math.abs(b.rendimento)) }} sobre {{ dinheiro(b.aplicado) }}
            </span>
          </span>
          <ChevronDownIcon class="size-4 shrink-0 text-muted-foreground transition-transform" :class="bancoAberto === b.banco && 'rotate-180'" />
        </button>
        <ul v-if="bancoAberto === b.banco" class="divide-y border-t text-xs">
          <li v-for="p in b.ativas" :key="p.id" class="flex items-baseline justify-between gap-3 px-4 py-2">
            <span class="min-w-0 truncate text-muted-foreground">
              {{ p.subtipo ?? 'Aplicação' }}<template v-if="p.vencimento"> · vence {{ formatarDiaCompleto(p.vencimento) }}</template>
              <template v-if="p.valor_original"> · aplicado {{ dinheiro(p.valor_original) }}</template>
            </span>
            <span class="shrink-0 font-medium tabular-nums">{{ dinheiro(p.saldo ?? 0) }}</span>
          </li>
        </ul>
      </article>
      <p class="text-xs text-muted-foreground">
        O rendimento é o saldo menos o aplicado, antes do IR — o banco não informa. Os bancos não dizem
        a qual caixinha cada aplicação pertence; a ligação é a das caixinhas acima.
      </p>
    </div>

    <CaixinhaDialogo
      :aberto="!!editando"
      :caixinha="editando?.caixinha ?? null"
      :espaco-sugerido="store.espacoAtivo?.id ?? null"
      @fechar="editando = null"
    />

    <Dialog :open="!!movimentando" @update:open="(v) => { if (!v) movimentando = null }">
      <DialogContent class="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Movimento em {{ movimentando?.nome }}</DialogTitle>
          <DialogDescription>
            Para o que não veio pelo extrato. O que veio, liga-se pela caixa de entrada.
          </DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="onRegistrar">
          <div class="flex gap-1 rounded-lg border p-1">
            <Button type="button" size="sm" class="flex-1" :variant="tipoMov === 'aplicacao' ? 'default' : 'ghost'" @click="tipoMov = 'aplicacao'">Aplicação</Button>
            <Button type="button" size="sm" class="flex-1" :variant="tipoMov === 'resgate' ? 'default' : 'ghost'" @click="tipoMov = 'resgate'">Resgate</Button>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label for="mov-valor">Valor</Label>
              <Input id="mov-valor" v-model.number="valorMov" type="number" step="0.01" min="0.01" placeholder="0,00" />
            </div>
            <div class="space-y-1.5">
              <Label for="mov-data">Data</Label>
              <Input id="mov-data" v-model="dataMov" type="date" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" @click="movimentando = null">Cancelar</Button>
            <Button type="submit" :disabled="!valorMov || valorMov <= 0 || registrar.isPending.value">Registrar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </section>
</template>
