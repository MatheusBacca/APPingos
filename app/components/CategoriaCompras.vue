<script setup lang="ts">
/**
 * As compras de uma categoria, abertas a partir da barra do gráfico.
 *
 * É a segunda pergunta da tela: o gráfico diz quanto "Mercado" pesou no mês, e
 * aqui está de que compras esse peso é feito. A ordem é decrescente pelo valor,
 * e não pela data — quem abre a fatia quer saber o que puxou o número para cima,
 * e a resposta é a primeira linha.
 *
 * Cada cartão traz a porcentagem DENTRO da categoria, não no mês: no mês ela já
 * apareceu na barra, e repetir a mesma base aqui faria dois números que não
 * respondem a pergunta desta lista ("qual delas é a grande?").
 */
import { Trash2Icon, UserIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatarDinheiro, formatarPercentual } from '@/lib/dinheiro'
import { CLASSE_COR, fracaoNaFatia } from '~/types/orcamento'
import type { CompraDoMes, FatiaCategoria } from '~/types/orcamento'
import { useGastosPessoais } from '~/composables/useGastosPessoais'

const props = defineProps<{
  /** `null` enquanto o diálogo está fechado — a fatia é o conteúdo inteiro. */
  fatia: FatiaCategoria | null
  /** Mês a que a fatia se refere, já formatado. */
  periodo: string
  /** Espelha a policy de `compra`: quem não pode editar também não abre nem remove. */
  podeEditar: (compra: CompraDoMes) => boolean
  /** A linha miúda do cartão: data, quem pagou, como divide. */
  detalhe: (compra: CompraDoMes) => string
}>()

const aberto = defineModel<boolean>('aberto', { required: true })

const emit = defineEmits<{
  selecionar: [compra: CompraDoMes]
  remover: [compra: CompraDoMes]
}>()

const { ehPessoal } = useGastosPessoais()

const compras = computed(() => props.fatia?.compras ?? [])
</script>

<template>
  <Dialog v-model:open="aberto">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle class="flex flex-wrap items-center gap-2">
          <span
            v-if="fatia?.cor"
            class="rounded-full px-2 py-0.5 text-sm"
            :class="CLASSE_COR[fatia.cor]"
          >
            {{ fatia.nome }}
          </span>
          <span v-else>{{ fatia?.nome }}</span>
        </DialogTitle>
        <DialogDescription>
          {{ formatarDinheiro(fatia?.total ?? 0) }} em {{ periodo }} —
          {{ compras.length === 1 ? '1 compra' : `${compras.length} compras` }},
          da maior para a menor.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-2">
        <article
          v-for="compra in compras"
          :key="compra.id"
          class="flex items-center gap-3 rounded-lg border bg-card p-3 outline-none transition-colors"
          :class="[
            podeEditar(compra) ? 'cursor-pointer hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring' : '',
            ehPessoal(compra) ? 'border-dashed' : '',
          ]"
          :tabindex="podeEditar(compra) ? 0 : undefined"
          :role="podeEditar(compra) ? 'button' : undefined"
          :aria-label="podeEditar(compra) ? `Ver ${compra.descricao}` : undefined"
          @click="podeEditar(compra) && emit('selecionar', compra)"
          @keydown.enter="podeEditar(compra) && emit('selecionar', compra)"
        >
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-medium">{{ compra.descricao }}</span>

              <span
                v-if="ehPessoal(compra)"
                class="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground"
                title="Só você vê esta compra"
              >
                <UserIcon class="size-3" />
                Pessoal
              </span>
            </div>

            <p class="mt-0.5 text-xs text-muted-foreground">{{ detalhe(compra) }}</p>
          </div>

          <div class="shrink-0 text-right">
            <p class="font-semibold tabular-nums">{{ formatarDinheiro(compra.valor) }}</p>

            <!--
              A parcela fica junto do valor porque é ela que explica o número:
              "R$ 200,00" numa compra de R$ 1.200 só faz sentido com o "2/6" ao
              lado.
            -->
            <p v-if="compra.parcelas > 1" class="text-xs tabular-nums text-muted-foreground">
              {{ compra.numero }}/{{ compra.parcelas }} de {{ formatarDinheiro(compra.valor_total) }}
            </p>

            <p class="text-xs tabular-nums text-muted-foreground">
              {{ formatarPercentual(fracaoNaFatia(fatia!, compra)) }} da categoria
            </p>
          </div>

          <!-- `.stop`: sem ele, remover também abre o diálogo da compra que sumiu. -->
          <Button
            v-if="podeEditar(compra)"
            variant="ghost"
            size="icon"
            class="shrink-0"
            :aria-label="`Remover ${compra.descricao}`"
            @click.stop="emit('remover', compra)"
          >
            <Trash2Icon class="size-4" />
          </Button>
        </article>
      </div>
    </DialogContent>
  </Dialog>
</template>
