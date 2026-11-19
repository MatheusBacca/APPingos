<script setup lang="ts">
/**
 * O detalhe de uma compra da caixa de entrada — o que a linha não mostra e os
 * destinos que saíram dela.
 *
 * O mesmo conteúdo serve aos dois tamanhos: no celular sobe de baixo como uma
 * folha (a página monta o Dialog), no PC fica numa coluna ao lado da lista,
 * para classificar uma atrás da outra sem abrir e fechar nada.
 *
 * O texto CRU do extrato aparece aqui, inteiro: é ele que se confere contra a
 * fatura do banco, e é o que a linha encurtou para "iFood".
 */
import { ArrowRightIcon, CheckIcon, EyeOffIcon, LinkIcon, PiggyBankIcon, SparklesIcon, UserIcon, UsersIcon, WalletIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { formatarDiaCompleto } from '@/lib/datas'
import { formatarDinheiro } from '@/lib/dinheiro'
import { ROTULO_DESTINO_DA_REGRA, rotuloParaRegra } from '~/lib/auto-tag'
import type { Sugestao } from '~/lib/auto-tag'
import type { ItemDaCaixa, ModoClassificacao } from '~/lib/caixa-de-entrada'
import { textoParaSelo, valorDoItem } from '~/lib/caixa-lista'
import { rotuloDaCategoriaNaCaixa } from '~/lib/categorias-pluggy'

const props = defineProps<{
  item: ItemDaCaixa
  sugestao: Sugestao | null
  podeAceitar: boolean
  banco: string
  conta: string
  /** Por que o Aceitar não aparece, quando há sugestão completa mas o mês já foi acertado. */
  avisoDoAceite?: string | null
  ocupado?: boolean
}>()

const emit = defineEmits<{ escolher: [modo: ModoClassificacao], aceitar: [], ignorar: [] }>()

const titulo = computed(() => rotuloParaRegra(props.item.principal))
const valor = computed(() => valorDoItem(props.item))
const categoriaDoBanco = computed(() => rotuloDaCategoriaNaCaixa(props.item.principal.categoria_pluggy))

const parcelas = computed(() => {
  if (props.item.plano.parcelas <= 1) return null
  const numeros = props.item.transacoes.map(t => t.parcela_numero).join(', ')
  return `Parcela ${numeros} de ${props.item.plano.parcelas} · ${formatarDinheiro(props.item.plano.valor_total)} no total`
})

/** A hora da compra, no fuso de Brasília, quando o banco informa. */
const hora = computed(() => {
  const iso = props.item.principal.data_hora
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
})

function formatarMoeda(valor: number, moeda: string): string {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(valor)
  }
  catch {
    return `${moeda} ${valor.toFixed(2)}`
  }
}

/** "pago com R$ 4,00 de multa e R$ 1,33 de juros" — o que o atraso custou. */
const encargosDoBoleto = computed(() => {
  const b = props.item.principal.boleto
  if (!b) return null
  const partes = [
    b.multa ? `${formatarDinheiro(b.multa)} de multa` : null,
    b.juros ? `${formatarDinheiro(b.juros)} de juros` : null,
  ].filter(Boolean)
  return partes.length ? `pago com ${partes.join(' e ')}` : null
})

const textoDaSugestao = computed(() => {
  const s = props.sugestao
  if (!s) return null
  return [s.destino ? ROTULO_DESTINO_DA_REGRA[s.destino] : null, s.categoriaNome].filter(Boolean).join(' · ')
})

/** O destino que a regra sugere vira o botão cheio; os outros ficam discretos. */
function variante(modo: ModoClassificacao) {
  return props.sugestao?.destino === modo ? 'default' : 'secondary'
}

const DESTINOS_SAIDA = [
  { modo: 'casal' as const, rotulo: 'Compartilhada', detalhe: 'Entra no espaço do casal', icone: UsersIcon },
  { modo: 'pessoal' as const, rotulo: 'Pessoal', detalhe: 'Só nos seus gastos', icone: UserIcon },
  { modo: 'ja-lancei' as const, rotulo: 'Já lancei', detalhe: 'Ligar a uma compra lançada à mão', icone: LinkIcon },
  { modo: 'meta' as const, rotulo: 'Aporte em meta', detalhe: 'Dinheiro guardado numa meta', icone: PiggyBankIcon },
]

const DESTINOS_ENTRADA = [
  { modo: 'salario' as const, rotulo: 'Salário', detalhe: 'Marca o salário do mês como recebido', icone: WalletIcon },
  { modo: 'meta' as const, rotulo: 'Resgate de meta', detalhe: 'Dinheiro que saiu de uma meta', icone: PiggyBankIcon },
]

const destinos = computed(() => (props.item.sentido === 'saida' ? DESTINOS_SAIDA : DESTINOS_ENTRADA))
</script>

<template>
  <div class="space-y-4">
    <header class="flex items-start gap-3">
      <span class="relative shrink-0">
        <IconeDaCompra :descricao="textoParaSelo(item.principal)" :categoria="sugestao?.categoriaNome" />
        <SeloDoBanco v-if="banco" :banco="banco" tamanho="xs" class="absolute -bottom-1 -right-1.5 ring-2 ring-card" />
      </span>
      <div class="min-w-0 flex-1">
        <h2 class="text-lg font-semibold leading-tight">{{ titulo }}</h2>
        <p class="text-sm text-muted-foreground">{{ formatarDiaCompleto(item.data) }} · {{ conta }}</p>
      </div>
      <p
        class="shrink-0 text-lg font-semibold tabular-nums"
        :class="item.sentido === 'entrada' ? 'text-emerald-600 dark:text-emerald-400' : ''"
      >
        {{ item.sentido === 'entrada' ? '+' : '' }}{{ formatarDinheiro(valor) }}
      </p>
    </header>

    <dl class="space-y-1 rounded-lg bg-muted/50 px-3 py-2 text-xs">
      <div class="flex gap-2">
        <dt class="shrink-0 text-muted-foreground">No extrato</dt>
        <dd class="min-w-0 break-words font-mono">{{ item.plano.descricao }}</dd>
      </div>
      <div v-if="parcelas" class="flex gap-2">
        <dt class="shrink-0 text-muted-foreground">Parcelas</dt>
        <dd>{{ parcelas }}</dd>
      </div>
      <div v-if="categoriaDoBanco" class="flex gap-2">
        <dt class="shrink-0 text-muted-foreground">Categoria do banco</dt>
        <dd>{{ categoriaDoBanco }}</dd>
      </div>
      <div v-if="item.principal.contraparte_nome" class="flex gap-2">
        <dt class="shrink-0 text-muted-foreground">{{ item.sentido === 'entrada' ? 'De' : 'Para' }}</dt>
        <dd class="min-w-0 break-words">{{ item.principal.contraparte_nome }}</dd>
      </div>
      <div v-if="item.principal.mensagem" class="flex gap-2">
        <dt class="shrink-0 text-muted-foreground">Mensagem</dt>
        <dd class="min-w-0 break-words italic">“{{ item.principal.mensagem }}”</dd>
      </div>
      <div v-if="item.principal.cartao_final" class="flex gap-2">
        <dt class="shrink-0 text-muted-foreground">Cartão</dt>
        <dd class="tracking-wider">•••• {{ item.principal.cartao_final }}</dd>
      </div>
      <div v-if="hora" class="flex gap-2">
        <dt class="shrink-0 text-muted-foreground">Hora</dt>
        <dd>{{ hora }}</dd>
      </div>
      <div v-if="item.principal.moeda && item.principal.valor_moeda_original" class="flex gap-2">
        <dt class="shrink-0 text-muted-foreground">Moeda original</dt>
        <dd>{{ formatarMoeda(item.principal.valor_moeda_original, item.principal.moeda) }}</dd>
      </div>
      <div v-if="encargosDoBoleto" class="flex gap-2">
        <dt class="shrink-0 text-muted-foreground">Boleto</dt>
        <dd class="text-amber-700 dark:text-amber-400">{{ encargosDoBoleto }}</dd>
      </div>
    </dl>

    <!-- A sugestão, com o porquê, e o atalho quando ela está completa. -->
    <section v-if="sugestao" class="rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p class="flex items-center gap-1.5 text-xs font-medium text-primary">
        <SparklesIcon class="size-3.5" />
        Sugestão
      </p>
      <p class="mt-1 font-medium">{{ textoDaSugestao }}</p>
      <p class="text-xs text-muted-foreground">{{ sugestao.motivo }}</p>
      <Button v-if="podeAceitar" class="mt-3 w-full gap-1.5" :disabled="ocupado" @click="emit('aceitar')">
        <CheckIcon class="size-4" />
        Aceitar sugestão
      </Button>
      <p v-else-if="avisoDoAceite" class="mt-2 text-xs text-amber-600 dark:text-amber-400">{{ avisoDoAceite }}</p>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Para onde vai</h3>
      <div class="grid gap-1.5">
        <Button
          v-for="d in destinos"
          :key="d.modo"
          :variant="variante(d.modo)"
          class="h-auto justify-start gap-3 py-2.5 text-left"
          :disabled="ocupado"
          @click="emit('escolher', d.modo)"
        >
          <component :is="d.icone" class="size-4 shrink-0" />
          <span class="min-w-0 flex-1">
            <span class="block font-medium">{{ d.rotulo }}</span>
            <span class="block text-xs font-normal opacity-70">{{ d.detalhe }}</span>
          </span>
          <ArrowRightIcon class="size-4 shrink-0 opacity-50" />
        </Button>
        <Button variant="ghost" class="justify-start gap-3 text-muted-foreground" :disabled="ocupado" @click="emit('ignorar')">
          <EyeOffIcon class="size-4" />
          {{ item.sentido === 'saida' ? 'Ignorar — não é gasto' : 'Ignorar' }}
        </Button>
      </div>
    </section>
  </div>
</template>
