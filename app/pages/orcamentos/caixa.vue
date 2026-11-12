<script setup lang="ts">
/**
 * Caixa de entrada — o extrato que chegou do banco, esperando um destino.
 *
 * Fase 5 de docs/notion-plano-open-finance.md: "lançar vira classificar". Cada
 * pessoa vê só as próprias transações (RLS `user_id = auth.uid()`); a outra
 * pessoa do espaço só vê o que vira compra no espaço do casal.
 *
 * Embaixo, o que foi classificado nos últimos 30 dias — inclusive o que a regra
 * de contagem dupla ignorou e o que o cartão do casal lançou sozinho. É de lá
 * que se desfaz ou se muda uma compra de gaveta (`mover_compra`, da Frente A).
 */
import { toast } from 'vue-sonner'
import { ArrowLeftRightIcon, InboxIcon, Undo2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarDia } from '@/lib/datas'
import { formatarDinheiro } from '@/lib/dinheiro'
import { mensagemDeErro } from '@/lib/utils'
import { itensDaCaixa } from '~/lib/caixa-de-entrada'
import type { ItemDaCaixa, ModoClassificacao } from '~/lib/caixa-de-entrada'
import { rateioIgual } from '~/types/orcamento'
import {
  useClassificadasRecentes,
  useClassificar,
  useTransacoesDaCaixa,
} from '~/composables/useCaixaDeEntrada'
import type { LinhaClassificada } from '~/composables/useCaixaDeEntrada'
import { useConciliacaoPix } from '~/composables/useConciliacaoPix'
import { useConexoesBancarias } from '~/composables/useContasBancarias'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'

useHead({ title: 'Caixa de entrada · APPingos' })

const store = useSpaceStore()
const usuarioId = useUsuarioId()
const supabase = useSupabaseClient()

const { data: conexoes } = useConexoesBancarias()
const { data: transacoes, isPending } = useTransacoesDaCaixa()
const { data: classificadas } = useClassificadasRecentes()
const classificar = useClassificar()

// O Pix do acerto marca o mês como pago sozinho — ver useConciliacaoPix.
useConciliacaoPix(transacoes)

const itens = computed(() => itensDaCaixa(transacoes.value ?? []))
const nomeDaConta = (contaId: string) =>
  transacoes.value?.find(t => t.conta_id === contaId)?.conta?.nome ?? ''

const emClassificacao = ref<{ item: ItemDaCaixa, modo: ModoClassificacao } | null>(null)

function abrir(item: ItemDaCaixa, modo: ModoClassificacao) {
  emClassificacao.value = { item, modo }
}

async function ignorar(item: ItemDaCaixa) {
  try {
    await classificar.mutateAsync({ tipo: 'ignorar', transacoes: item.transacoes.map(t => t.id) })
    toast.success('Ignorada — ela fica nas classificadas, se precisar desfazer.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para ignorar.'))
  }
}

async function devolver(linha: LinhaClassificada) {
  try {
    await classificar.mutateAsync({ tipo: 'devolver', transacao: linha.id })
    toast.success('De volta à caixa de entrada.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para desfazer.'))
  }
}

/*
 * Mudar de gaveta: do casal para o pessoal (com 100% seu), ou do pessoal para o
 * primeiro espaço de casal, com metade para cada membro (`rateioIgual`).
 */
const pessoal = computed(() => store.espacos.find(e => e.tipo === 'pessoal') ?? null)
const casais = computed(() => store.espacos.filter(e => e.tipo === 'casal'))

function destinoDaMudanca(linha: LinhaClassificada) {
  if (!linha.compra) return null
  if (linha.compra.space_id === pessoal.value?.id) return casais.value[0] ?? null
  return pessoal.value
}

async function mover(linha: LinhaClassificada) {
  const destino = destinoDaMudanca(linha)
  if (!linha.compra || !destino || !usuarioId.value) return
  try {
    let participantes = rateioIgual([usuarioId.value])
    if (destino.tipo === 'casal') {
      const { data, error } = await supabase.from('membership').select('user_id').eq('space_id', destino.id)
      if (error) throw error
      participantes = rateioIgual((data ?? []).map(m => m.user_id))
    }
    await classificar.mutateAsync({ tipo: 'reclassificar', compra: linha.compra.id, space: destino.id, participantes })
    toast.success(`Movida para ${destino.nome}.`)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para mover a compra.'))
  }
}

const ROTULO_DESTINO: Record<string, string> = {
  compra: 'Compra',
  ignorada: 'Ignorada',
  renda: 'Salário',
  aporte: 'Meta',
}

const ROTULO_MOTIVO: Record<string, string> = {
  pagamento_fatura: 'pagamento de fatura',
  transferencia_propria: 'entre contas suas',
  valor_zero: 'valor zero',
  acerto: 'Pix do acerto do mês',
}

const nomeDoEspaco = (id: string) => store.espacos.find(e => e.id === id)?.nome ?? 'espaço'
</script>

<template>
  <div class="space-y-6">
    <OrcamentosAbas subtitulo="O extrato que chegou do banco, esperando um destino. Só você vê." />

    <Card v-if="conexoes && !conexoes.length">
      <CardContent class="flex flex-wrap items-center justify-between gap-3 py-6 text-sm">
        <p class="text-muted-foreground">
          Nenhum banco conectado. Conectando, as compras chegam sozinhas aqui — e você decide com
          um toque se são do casal ou só suas.
        </p>
        <Button as-child variant="secondary">
          <NuxtLink to="/orcamentos/contas">Conectar banco</NuxtLink>
        </Button>
      </CardContent>
    </Card>

    <div v-if="isPending" class="space-y-2">
      <Skeleton v-for="i in 3" :key="i" class="h-16 w-full" />
    </div>

    <Card v-else-if="!itens.length && conexoes?.length">
      <CardContent class="flex items-center gap-3 py-6 text-sm text-muted-foreground">
        <InboxIcon class="size-5" />
        Nada esperando. O extrato novo chega uma vez por dia.
      </CardContent>
    </Card>

    <ul v-else-if="itens.length" class="divide-y rounded-lg border bg-card">
      <li v-for="item in itens" :key="item.chave" class="space-y-2 p-3">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">{{ item.plano.descricao }}</p>
            <p class="text-xs text-muted-foreground">
              {{ formatarDia(item.data) }} · {{ nomeDaConta(item.principal.conta_id) }}
              <template v-if="item.plano.parcelas > 1">
                · {{ item.transacoes.map(t => t.parcela_numero).join(', ') }} de {{ item.plano.parcelas }} parcelas
                ({{ formatarDinheiro(item.plano.valor_total) }} no total)
              </template>
              <template v-if="item.principal.categoria_pluggy"> · {{ item.principal.categoria_pluggy }}</template>
              <template v-if="item.pendente"> · <strong>pendente no banco</strong></template>
            </p>
          </div>
          <span
            class="text-sm font-semibold tabular-nums"
            :class="item.sentido === 'entrada' ? 'text-emerald-600 dark:text-emerald-400' : ''"
          >
            {{ item.sentido === 'entrada' ? '+' : '' }}{{ formatarDinheiro(item.transacoes.reduce((s, t) => s + Number(t.valor), 0)) }}
          </span>
        </div>

        <div v-if="!item.pendente" class="flex flex-wrap gap-1.5">
          <template v-if="item.sentido === 'saida'">
            <Button size="sm" @click="abrir(item, 'casal')">Compartilhada</Button>
            <Button size="sm" variant="secondary" @click="abrir(item, 'pessoal')">Pessoal</Button>
            <Button size="sm" variant="ghost" @click="abrir(item, 'ja-lancei')">Já lancei</Button>
            <Button size="sm" variant="ghost" @click="abrir(item, 'meta')">Aporte em meta</Button>
          </template>
          <template v-else>
            <Button size="sm" @click="abrir(item, 'salario')">Salário</Button>
            <Button size="sm" variant="ghost" @click="abrir(item, 'meta')">Resgate de meta</Button>
          </template>
          <Button size="sm" variant="ghost" :disabled="classificar.isPending.value" @click="ignorar(item)">
            Ignorar
          </Button>
        </div>
      </li>
    </ul>

    <section v-if="classificadas?.length" class="space-y-2">
      <h2 class="text-sm font-medium text-muted-foreground">Classificadas nos últimos 30 dias</h2>
      <ul class="divide-y rounded-lg border bg-card text-sm">
        <li v-for="linha in classificadas" :key="linha.id" class="flex flex-wrap items-center gap-2 px-3 py-2">
          <span class="min-w-0 flex-1 truncate">
            {{ linha.descricao }}
            <span class="text-xs text-muted-foreground">· {{ formatarDia(linha.data) }} · {{ formatarDinheiro(Number(linha.valor)) }}</span>
          </span>
          <span class="rounded-full bg-muted px-2 py-0.5 text-xs">
            {{ ROTULO_DESTINO[linha.destino ?? ''] }}
            <template v-if="linha.compra"> · {{ nomeDoEspaco(linha.compra.space_id) }}</template>
            <template v-if="linha.motivo_exclusao"> · {{ ROTULO_MOTIVO[linha.motivo_exclusao] }}</template>
          </span>
          <Button
            v-if="linha.compra && destinoDaMudanca(linha)"
            size="sm"
            variant="ghost"
            class="gap-1"
            :disabled="classificar.isPending.value"
            @click="mover(linha)"
          >
            <ArrowLeftRightIcon class="size-3.5" />
            Mover para {{ destinoDaMudanca(linha)!.nome }}
          </Button>
          <Button
            v-if="linha.destino === 'ignorada' || (linha.destino === 'compra' && linha.compra)"
            size="sm"
            variant="ghost"
            class="gap-1"
            :disabled="classificar.isPending.value"
            @click="devolver(linha)"
          >
            <Undo2Icon class="size-3.5" />
            Devolver à caixa
          </Button>
        </li>
      </ul>
    </section>

    <ClassificarDialogo
      :item="emClassificacao?.item ?? null"
      :modo="emClassificacao?.modo ?? null"
      @fechar="emClassificacao = null"
    />
  </div>
</template>
