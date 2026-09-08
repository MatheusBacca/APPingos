<script setup lang="ts">
/**
 * O acerto de contas do mês, agora como uma LINHA da barra do mês.
 *
 * Ele já foi um card próprio, com título, tabela e botão — e o card dizia em
 * quatro blocos o que cabe numa frase. A frase é a resposta ("Fulano deve X a
 * Beltrano"), e é ela que a pessoa veio buscar; o resto é conferência, e
 * conferência não precisa estar aberta o tempo todo.
 *
 * Com duas pessoas a resposta é uma frase só: os saldos são simétricos, então
 * quem tem saldo negativo deve exatamente esse valor a quem tem saldo positivo.
 * Com mais gente não existe uma frase única (o acerto vira um problema de quem
 * paga quem), e aí a tabela abre sozinha em vez de a tela inventar um caminho
 * errado — ela deixa de ser detalhe e passa a ser a única resposta que existe.
 *
 * O botão de marcar como pago NÃO mora aqui: ele é uma ação sobre o mês, e vive
 * no alto da barra, junto do mês a que se refere (ver `AcertoBotao.vue`). Os
 * dois leem o mesmo `useAcertos()` — é uma query compartilhada, não dois estados.
 */
import { toast } from 'vue-sonner'
import { CheckIcon, ChevronDownIcon, CopyIcon } from '@lucide/vue'
import { formatarDia } from '@/lib/datas'
import { formatarDinheiro, valorParaCopiar } from '@/lib/dinheiro'
import { saldoDoMes } from '~/types/orcamento'
import type { CompraDoMes } from '~/types/orcamento'
import type { Membro } from '~/composables/useMembros'
import { useAcertos } from '~/composables/useOrcamento'

const props = defineProps<{
  compras: CompraDoMes[]
  membros: Membro[]
  /** Âncora do mês (YYYY-MM-01) — é o que o acerto marca. */
  competencia: string
  /** Competência já fechada muda o texto de "parcial" para "final". */
  fechado: boolean
}>()

const saldos = computed(() =>
  saldoDoMes(props.compras, props.membros.map(m => m.user_id)),
)

const nomeDoMembro = (id: string) =>
  props.membros.find(m => m.user_id === id)?.exibicao ?? 'Alguém'

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

const { data: acertos } = useAcertos()

const pagamento = computed(() =>
  (acertos.value ?? []).find(a => a.competencia === props.competencia) ?? null,
)

/*
 * A conta fica fechada por padrão — e não fica quando não há frase que a
 * substitua. Com três pessoas ou mais, esconder a tabela seria esconder a
 * resposta inteira atrás de um clique.
 */
const aberta = ref(!acerto.value)

watch(acerto, (a) => { if (!a) aberta.value = true })

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
  <!--
    Mês sem lançamento nenhum não tem acerto, e a linha some inteira: o total da
    barra logo acima já mostra R$ 0,00, e "nada lançado" escrito embaixo dele
    seria a mesma notícia duas vezes.
  -->
  <div v-if="compras.length" class="border-t px-3 py-2">
    <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
      <p v-if="acerto?.quitado" class="font-medium">
        Está quitado — ninguém deve nada.
      </p>
      <p v-else-if="acerto" class="font-medium">
        {{ nomeDoMembro(acerto.devedor.user_id) }} deve
        <!--
          O valor é o botão: um clique copia `283,33` — sem "R$" e sem separador
          de milhar — pronto para colar no app do banco ou na calculadora.
        -->
        <button
          type="button"
          class="group inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :title="`Copiar ${valorParaCopiar(acerto.valor)}`"
          @click="copiarValor(acerto.valor)"
        >
          {{ formatarDinheiro(acerto.valor) }}
          <component
            :is="copiado ? CheckIcon : CopyIcon"
            class="size-3.5 opacity-40 transition-opacity group-hover:opacity-100"
          />
        </button>
        a {{ nomeDoMembro(acerto.credor.user_id) }}.
      </p>
      <p v-else class="font-medium">
        O acerto entre {{ membros.length }} pessoas — os saldos estão na conta abaixo.
      </p>

      <span class="text-xs text-muted-foreground">
        <template v-if="pagamento">
          · pago em {{ formatarDia(pagamento.pago_em.slice(0, 10)) }}
          por {{ nomeDoMembro(pagamento.pago_por) }}
        </template>
        <template v-else>
          · {{ fechado ? 'o mês fechou e ainda não foi acertado' : 'parcial — o mês ainda está aberto' }}
        </template>
      </span>

      <!--
        A conta que sustenta a frase continua a um clique — e não mais ocupando
        um card inteiro. Só existe botão quando existe frase para esconder: ver
        `aberta` no script.
      -->
      <button
        v-if="acerto"
        type="button"
        class="ml-auto flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        :aria-expanded="aberta"
        @click="aberta = !aberta"
      >
        {{ aberta ? 'Esconder a conta' : 'Ver a conta' }}
        <ChevronDownIcon class="size-3.5 transition-transform" :class="aberta ? 'rotate-180' : ''" />
      </button>
    </div>

    <div v-if="aberta" class="mt-2">
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

      <p class="mt-1.5 text-xs text-muted-foreground">
        Saldo positivo significa que essa pessoa adiantou mais do que a parte dela.
        Marque como pago quando o dinheiro for transferido — qualquer um de vocês pode.
      </p>
    </div>
  </div>
</template>
