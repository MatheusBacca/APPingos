<script setup lang="ts">
/**
 * "O salário deste mês caiu?" — o fato, ao lado da regra.
 *
 * A projeção do mês usa o salário PREVISTO (o valor de `renda`); marcar como
 * recebido grava o que caiu de verdade em `renda_recebida`, que pode ser outro
 * número (desconto de falta, adiantamento). Os dois aparecem juntos para a
 * diferença ficar visível em vez de corrigir a projeção em silêncio.
 *
 * Com a Pluggy (Frente B), a marcação passa a vir sozinha quando o crédito é
 * reconhecido no extrato (`origem = 'pluggy'`). A mão continua valendo: desmarcar
 * aqui apaga também a marcação automática — quem está olhando sabe mais.
 */
import { toast } from 'vue-sonner'
import { CheckCircle2Icon } from '@lucide/vue'
import { mensagemDeErro } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatarDia, hojeIso, nomeDoMes } from '@/lib/datas'
import { formatarDinheiro } from '@/lib/dinheiro'
import { useMarcarRendaRecebida, useRendaRecebida } from '~/composables/useRenda'

const props = defineProps<{
  competencia: string
  previsto: number
  /** A data em que deveria cair, já com feriados (`dataPrevistaDoSalario`). */
  dataPrevista: string
}>()

const recebida = useRendaRecebida(() => props.competencia)
const marcar = useMarcarRendaRecebida()

const marcando = ref(false)
const valor = ref<number | undefined>(undefined)
const data = ref('')

function abrir() {
  valor.value = props.previsto
  // Hoje, se o salário já devia ter caído; senão, a data prevista.
  data.value = props.dataPrevista <= hojeIso() ? hojeIso() : props.dataPrevista
  marcando.value = true
}

const diferenca = computed(() => {
  const r = recebida.data.value
  return r ? Math.round((r.valor - props.previsto) * 100) / 100 : 0
})

const atrasado = computed(() => !recebida.data.value && props.dataPrevista < hojeIso())

async function confirmar() {
  if (!valor.value || valor.value <= 0 || !data.value) return
  try {
    await marcar.mutateAsync({ competencia: props.competencia, recebido: true, valor: valor.value, recebido_em: data.value })
    marcando.value = false
    toast.success(`Salário de ${nomeDoMes(props.competencia).toLowerCase()} marcado como recebido.`)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para marcar o salário.'))
  }
}

async function desmarcar() {
  try {
    await marcar.mutateAsync({ competencia: props.competencia, recebido: false })
    toast.success('Marcação desfeita.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para desfazer.'))
  }
}
</script>

<template>
  <div class="space-y-2 border-t pt-3 text-sm">
    <template v-if="recebida.data.value">
      <p class="flex items-start gap-2">
        <CheckCircle2Icon class="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span class="min-w-0 flex-1">
          Salário de {{ nomeDoMes(competencia).toLowerCase() }} recebido em
          {{ formatarDia(recebida.data.value.recebido_em) }}:
          <strong>{{ formatarDinheiro(recebida.data.value.valor) }}</strong>
          <span v-if="recebida.data.value.origem === 'pluggy'" class="text-muted-foreground"> · lido do extrato</span>
          <span v-if="diferenca !== 0" class="block text-xs text-muted-foreground">
            {{ formatarDinheiro(Math.abs(diferenca)) }} {{ diferenca < 0 ? 'a menos' : 'a mais' }} que o previsto —
            a projeção continua usando o previsto.
          </span>
        </span>
        <Button size="sm" variant="ghost" :disabled="marcar.isPending.value" @click="desmarcar">Desmarcar</Button>
      </p>
    </template>

    <form v-else-if="marcando" class="flex flex-wrap items-end gap-2" @submit.prevent="confirmar">
      <div class="space-y-1">
        <Label for="recebido-valor" class="text-xs">Quanto caiu</Label>
        <Input id="recebido-valor" v-model.number="valor" class="w-32" type="number" step="0.01" min="0.01" />
      </div>
      <div class="space-y-1">
        <Label for="recebido-data" class="text-xs">Quando</Label>
        <Input id="recebido-data" v-model="data" type="date" />
      </div>
      <Button type="submit" size="sm" :disabled="marcar.isPending.value || !valor || !data">Confirmar</Button>
      <Button type="button" size="sm" variant="ghost" @click="marcando = false">Cancelar</Button>
    </form>

    <p v-else class="flex flex-wrap items-center gap-2">
      <span class="min-w-0 flex-1" :class="atrasado ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'">
        <template v-if="atrasado">Previsto para {{ formatarDia(dataPrevista) }} e ainda não marcado.</template>
        <template v-else>Previsto para {{ formatarDia(dataPrevista) }}.</template>
      </span>
      <Button size="sm" variant="outline" @click="abrir">Marcar como recebido</Button>
    </p>
  </div>
</template>
