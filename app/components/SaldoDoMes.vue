<script setup lang="ts">
/**
 * O acerto de contas do mês — a conta que hoje é feita à mão no WhatsApp.
 *
 * Com duas pessoas a resposta é uma frase só, e é isso que a tela mostra em
 * destaque: os saldos são simétricos, então quem tem saldo negativo deve
 * exatamente esse valor a quem tem saldo positivo. Com mais gente não existe
 * uma frase única (o acerto vira um problema de quem paga quem), então a tela
 * cai para a lista de saldos por pessoa em vez de inventar um caminho errado.
 */
import { toast } from 'vue-sonner'
import { CheckIcon, CopyIcon, Undo2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { formatarDia } from '@/lib/datas'
import { formatarDinheiro, valorParaCopiar } from '@/lib/dinheiro'
import { mensagemDeErro } from '@/lib/utils'
import { saldoDoMes } from '~/types/orcamento'
import type { CompraDoMes } from '~/types/orcamento'
import type { Membro } from '~/composables/useMembros'
import { useAcertos, useMarcarAcerto } from '~/composables/useOrcamento'

const props = defineProps<{
  compras: CompraDoMes[]
  membros: Membro[]
  /** Âncora do mês (YYYY-MM-01) — é o que o acerto marca. */
  competencia: string
  /** Competência já fechada muda o texto de "parcial" para "final". */
  fechado: boolean
  /** Mês que ainda não começou não oferece o botão de acerto. */
  futuro: boolean
}>()

const saldos = computed(() =>
  saldoDoMes(props.compras, props.membros.map(m => m.user_id)),
)

const nomeDoMembro = (id: string) =>
  props.membros.find(m => m.user_id === id)?.nome ?? 'Alguém'

/** Só existe frase única quando são exatamente duas pessoas no espaço. */
const acerto = computed(() => {
  if (saldos.value.length !== 2) return null

  const [a, b] = saldos.value
  if (!a || !b) return null

  const credor = a.saldo >= b.saldo ? a : b
  const devedor = credor === a ? b : a
  /*
   * O saldo do credor JÁ é a dívida: `saldoDoMes` garante que os dois saldos
   * somam zero, então são simétricos. Tirar a média dos dois reintroduziria um
   * arredondamento e poderia devolver um centavo a mais do que a tabela mostra.
   */
  const valor = credor.saldo

  if (valor < 0.01) return { quitado: true, valor: 0, credor, devedor }
  return { quitado: false, valor, credor, devedor }
})

// ---- Pendente | Pago --------------------------------------------------------

/*
 * O acerto é o único estado do mês que não vem do calendário: "fechado" é a
 * passagem do tempo, "pago" é uma decisão de gente. Qualquer membro marca e
 * qualquer membro desmarca — quem paga costuma ser quem deve, mas quem confirma
 * é quem recebe.
 */
const { data: acertos } = useAcertos()
const marcar = useMarcarAcerto()

const pagamento = computed(() =>
  (acertos.value ?? []).find(a => a.competencia === props.competencia) ?? null,
)

async function alternarAcerto(pago: boolean) {
  try {
    await marcar.mutateAsync({ competencia: props.competencia, pago })
    toast.success(pago ? 'Mês marcado como pago.' : 'O mês voltou para pendente.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para mudar o acerto do mês.'))
  }
}

/*
 * Copiar o valor cru para colar no app do banco.
 *
 * `navigator.clipboard` só existe em contexto seguro — localhost e https, que
 * cobrem o uso real, mas não um acesso por IP na rede local (o `npm run dev --host`
 * usado para testar no celular). Por isso o catch avisa em vez de falhar calado.
 */
const copiado = ref(false)

async function copiarValor(valor: number) {
  try {
    await navigator.clipboard.writeText(valorParaCopiar(valor))
    copiado.value = true
    toast.success(`${valorParaCopiar(valor)} copiado.`)
    setTimeout(() => { copiado.value = false }, 2000)
  }
  catch {
    toast.error('O navegador não liberou a área de transferência aqui.')
  }
}
</script>

<template>
  <section class="space-y-3 rounded-lg border bg-card p-4">
    <div class="flex items-baseline justify-between gap-2">
      <h2 class="text-sm font-medium">Acerto do mês</h2>

      <span
        v-if="pagamento"
        class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100"
      >
        Pago
      </span>
      <span v-else class="text-xs text-muted-foreground">
        {{ fechado ? 'Pendente — fechou e ainda não foi acertado' : 'Parcial — o mês ainda está aberto' }}
      </span>
    </div>

    <p v-if="!compras.length" class="text-sm text-muted-foreground">
      Nada lançado neste mês.
    </p>

    <template v-else>
      <!-- A resposta, quando ela cabe numa frase -->
      <p v-if="acerto?.quitado" class="text-lg font-semibold">
        Está quitado — ninguém deve nada.
      </p>
      <p v-else-if="acerto" class="text-lg font-semibold">
        {{ nomeDoMembro(acerto.devedor.user_id) }} deve
        <!--
          O valor é o botão: um clique copia `283,33` — sem "R$" e sem separador
          de milhar — pronto para colar no app do banco ou na calculadora.
        -->
        <button
          type="button"
          class="group inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :title="`Copiar ${valorParaCopiar(acerto.valor)}`"
          @click="copiarValor(acerto.valor)"
        >
          {{ formatarDinheiro(acerto.valor) }}
          <component
            :is="copiado ? CheckIcon : CopyIcon"
            class="size-4 opacity-40 transition-opacity group-hover:opacity-100"
          />
        </button>
        a {{ nomeDoMembro(acerto.credor.user_id) }}.
      </p>

      <!-- De onde o número saiu -->
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b text-left text-xs text-muted-foreground">
            <th scope="col" class="py-1.5 font-medium">Pessoa</th>
            <th scope="col" class="py-1.5 text-right font-medium">Pagou</th>
            <th scope="col" class="py-1.5 text-right font-medium">Parte dela</th>
            <th scope="col" class="py-1.5 text-right font-medium">Saldo</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="linha in saldos" :key="linha.user_id" class="border-b border-dashed last:border-0">
            <td class="py-1.5">{{ nomeDoMembro(linha.user_id) }}</td>
            <td class="py-1.5 text-right tabular-nums">{{ formatarDinheiro(linha.pago) }}</td>
            <td class="py-1.5 text-right tabular-nums">{{ formatarDinheiro(linha.devido) }}</td>
            <td
              class="py-1.5 text-right font-medium tabular-nums"
              :class="linha.saldo > 0 ? 'text-emerald-600 dark:text-emerald-400' : linha.saldo < 0 ? 'text-destructive' : ''"
            >
              {{ formatarDinheiro(linha.saldo) }}
            </td>
          </tr>
        </tbody>
      </table>

      <p class="text-xs text-muted-foreground">
        Saldo positivo significa que essa pessoa adiantou mais do que a parte dela.
      </p>

      <!--
        O botão que fecha o ciclo do módulo: até aqui o mês só sabia que tinha
        fechado (calendário), não que já tinha sido pago (gente). É esta marca
        que faz o painel de resumos parar de cobrar a competência e passar a
        mostrar o mês seguinte. Mês que ainda nem começou não oferece o botão —
        não há o que acertar.
      -->
      <div v-if="!futuro" class="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p class="text-xs text-muted-foreground">
          <template v-if="pagamento">
            Pago em {{ formatarDia(pagamento.pago_em.slice(0, 10)) }} por {{ nomeDoMembro(pagamento.pago_por) }}.
          </template>
          <template v-else>
            Marque quando o dinheiro for transferido — qualquer um de vocês pode.
          </template>
        </p>

        <Button
          v-if="!pagamento"
          size="sm"
          class="gap-1.5"
          :disabled="marcar.isPending.value"
          @click="alternarAcerto(true)"
        >
          <CheckIcon class="size-4" />
          Marcar como pago
        </Button>
        <Button
          v-else
          variant="ghost"
          size="sm"
          class="gap-1.5"
          :disabled="marcar.isPending.value"
          @click="alternarAcerto(false)"
        >
          <Undo2Icon class="size-4" />
          Desfazer
        </Button>
      </div>
    </template>
  </section>
</template>
