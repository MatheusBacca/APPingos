<script setup lang="ts">
/**
 * As compras do mês em fila, da mais recente para a mais antiga.
 *
 * É o outro modo de "Em que foi", e ele responde a outra pergunta. As barras por
 * categoria respondem "em que a gente gastou" — peso relativo, com o detalhe a um
 * clique. Esta lista responde "o que a gente comprou", que é a pergunta de quem
 * está conferindo o cartão contra o app e precisa varrer linha a linha sem abrir
 * uma categoria de cada vez.
 *
 * Por isso a ordem aqui é a DATA, e não o valor: quem confere fatura lê na ordem
 * em que as coisas aconteceram. Dentro da categoria (`CategoriaCompras.vue`) a
 * ordem é o valor, porque lá a pergunta é "qual delas puxou o número para cima".
 *
 * A categoria vira um selo na linha em vez de um cabeçalho de grupo: agrupar aqui
 * refaria o outro modo, e o valor desta vista é justamente ver tudo misturado, na
 * ordem do tempo.
 */
import { Trash2Icon, UserIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { formatarDinheiro } from '@/lib/dinheiro'
import { CLASSE_COR } from '~/types/orcamento'
import type { CompraDoMes } from '~/types/orcamento'
import { useGastosPessoais } from '~/composables/useGastosPessoais'

const props = defineProps<{
  compras: CompraDoMes[]
  /** Espelha a policy de `compra`: quem não pode editar também não abre nem remove. */
  podeEditar: (compra: CompraDoMes) => boolean
  /** A linha miúda do cartão: data, quem pagou, como divide. */
  detalhe: (compra: CompraDoMes) => string
  vazio: string
}>()

const emit = defineEmits<{
  selecionar: [compra: CompraDoMes]
  remover: [compra: CompraDoMes]
}>()

const { ehPessoal } = useGastosPessoais()

/*
 * Desempate por descrição, e não pela ordem em que a consulta devolveu: várias
 * compras do mesmo dia são o caso comum (a ida ao mercado, o posto na volta), e
 * sem desempate estável a lista se reordena sozinha a cada revalidação.
 */
const ordenadas = computed(() =>
  [...props.compras].sort((a, b) =>
    b.data_compra.localeCompare(a.data_compra) || a.descricao.localeCompare(b.descricao, 'pt-BR'),
  ),
)

const total = computed(() => props.compras.reduce((t, c) => t + c.valor, 0))
</script>

<template>
  <div>
    <p v-if="!ordenadas.length" class="rounded-lg border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
      {{ vazio }}
    </p>

    <div v-else class="space-y-1.5">
      <article
        v-for="compra in ordenadas"
        :key="compra.id"
        class="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 outline-none transition-colors"
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
              v-if="compra.categoria"
              class="rounded-full px-2 py-0.5 text-[11px]"
              :class="CLASSE_COR[compra.categoria.cor]"
            >
              {{ compra.categoria.nome }}
            </span>

            <span
              v-if="ehPessoal(compra)"
              class="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground"
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
            "R$ 200,00" numa compra de R$ 1.200 só faz sentido com o "2/6" ao lado.
          -->
          <p v-if="compra.parcelas > 1" class="text-xs tabular-nums text-muted-foreground">
            {{ compra.numero }}/{{ compra.parcelas }} de {{ formatarDinheiro(compra.valor_total) }}
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

      <!-- A mesma régua do modo tabela: as linhas somam um total, e ele é escrito. -->
      <p class="border-t pt-2 text-right text-xs text-muted-foreground">
        Total do período: <span class="font-medium tabular-nums text-foreground">{{ formatarDinheiro(total) }}</span>
      </p>
    </div>
  </div>
</template>
