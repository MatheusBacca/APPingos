<script setup lang="ts">
/**
 * "Marcar como pago" — a ação do mês, na barra do mês.
 *
 * O acerto é o único estado do mês que não vem do calendário: "fechado" é a
 * passagem do tempo, "pago" é uma decisão de gente. Qualquer membro marca e
 * qualquer membro desmarca — quem paga costuma ser quem deve, mas quem confirma
 * é quem recebe.
 *
 * Vive separado da linha de saldos (`SaldoDoMes.vue`) porque os dois foram para
 * lugares diferentes da barra: a frase embaixo do mês, a ação no alto, ao lado
 * do total. Não há estado duplicado — os dois leem o mesmo `useAcertos()`, que
 * é uma query em cache, e só este escreve.
 */
import { toast } from 'vue-sonner'
import { CheckIcon, Undo2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { mensagemDeErro } from '@/lib/utils'
import { useAcertos, useMarcarAcerto } from '~/composables/useOrcamento'

const props = defineProps<{
  /** Âncora do mês (YYYY-MM-01) — é o que o acerto marca. */
  competencia: string
  /** Mês que ainda não começou não oferece o botão: não há o que acertar. */
  futuro: boolean
  /** Mês sem lançamento nenhum também não — não há dívida a quitar. */
  temLancamentos: boolean
}>()

const { data: acertos } = useAcertos()
const marcar = useMarcarAcerto()

const pagamento = computed(() =>
  (acertos.value ?? []).find(a => a.competencia === props.competencia) ?? null,
)

const aparece = computed(() => !props.futuro && props.temLancamentos)

async function alternar(pago: boolean) {
  try {
    await marcar.mutateAsync({ competencia: props.competencia, pago })
    toast.success(pago ? 'Mês marcado como pago.' : 'O mês voltou para pendente.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para mudar o acerto do mês.'))
  }
}
</script>

<template>
  <Button
    v-if="aparece && !pagamento"
    size="sm"
    class="gap-1.5"
    :disabled="marcar.isPending.value"
    @click="alternar(true)"
  >
    <CheckIcon class="size-4" />
    Marcar como pago
  </Button>

  <!--
    Já pago vira o selo mais o desfazer: o selo é a informação (o card que sumiu
    a dava num badge), e o botão continua sendo o caminho de volta.
  -->
  <span v-else-if="aparece" class="flex items-center gap-1.5">
    <span
      class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100"
    >
      Pago
    </span>
    <Button
      variant="ghost"
      size="sm"
      class="gap-1.5"
      :disabled="marcar.isPending.value"
      @click="alternar(false)"
    >
      <Undo2Icon class="size-4" />
      Desfazer
    </Button>
  </span>
</template>
