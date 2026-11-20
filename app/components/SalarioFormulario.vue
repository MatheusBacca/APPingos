<script setup lang="ts">
/**
 * O formulário do salário: valor líquido e quando cai.
 *
 * Mora em dois lugares — Espaços › Seu salário (com o "Quem vê") e o diálogo do
 * Planejamento —, e por isso é um componente só: a regra do dia útil, o limite
 * de 23 e a prévia das datas não podem divergir entre as duas telas.
 *
 * `renda` é uma linha por pessoa, sem histórico: salvar muda o valor dali em
 * diante. Os meses já marcados como recebidos guardam o que caiu de verdade em
 * `renda_recebida`, e esse número não muda.
 */
import { toast } from 'vue-sonner'
import { mensagemDeErro } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatarDia, hojeIso, nomeDoMes, primeiroDoMes, somarMeses } from '@/lib/datas'
import { dataPrevistaDoSalario } from '@/lib/salario'
import { diaMaximoDoRecebimento, recebimentoValido } from '~/types/planejamento'
import type { RecebimentoTipo } from '~/types/planejamento'
import { useMinhaRenda, useRemoverRenda, useSalvarRenda } from '~/composables/useRenda'

withDefaults(defineProps<{
  /** O diálogo do Planejamento não oferece "Remover": lá a pergunta é só o valor. */
  permiteRemover?: boolean
  /** Prefixo dos ids, para as duas instâncias poderem coexistir na mesma página. */
  idBase?: string
}>(), { permiteRemover: true, idBase: 'salario' })

const emit = defineEmits<{ salvo: [], cancelar: [] }>()

const renda = useMinhaRenda()
const salvar = useSalvarRenda()
const remover = useRemoverRenda()

const TIPOS: Array<{ valor: RecebimentoTipo, rotulo: string }> = [
  { valor: 'dia_util', rotulo: 'Dia útil' },
  { valor: 'dia_fixo', rotulo: 'Dia fixo' },
]

// `undefined` e não `null`: o Input do shadcn não aceita null em model-value.
const valor = ref<number | undefined>(undefined)
const tipo = ref<RecebimentoTipo>('dia_util')
const dia = ref<number>(5)

/*
 * Só sincroniza quando a linha chega (ou muda no servidor): um `watch` no valor
 * cru sobrescreveria o que a pessoa está digitando a cada refetch.
 */
watch(() => renda.data.value, (r) => {
  valor.value = r?.valor_liquido ?? undefined
  tipo.value = r?.recebimento_tipo ?? 'dia_util'
  dia.value = r?.recebimento_dia ?? 5
}, { immediate: true })

// Espelha o CHECK do banco, para o erro de constraint não ser a forma de descobrir a regra.
const diaMaximo = computed(() => diaMaximoDoRecebimento(tipo.value))

const valido = computed(() => (valor.value ?? 0) > 0 && recebimentoValido(tipo.value, dia.value))

const mudou = computed(() => {
  const r = renda.data.value
  if (!r) return true
  return r.valor_liquido !== valor.value
    || r.recebimento_tipo !== tipo.value
    || r.recebimento_dia !== dia.value
})

/**
 * A regra em datas de verdade, para a pessoa conferir que "5º dia útil" quer dizer
 * o que ela acha: este mês e o próximo, já com feriados e Carnaval.
 */
const previstas = computed(() => {
  if (!valido.value) return []
  const mes = primeiroDoMes(hojeIso())
  return [mes, somarMeses(mes, 1)].map(m => ({
    mes: nomeDoMes(m),
    data: formatarDia(dataPrevistaDoSalario(m, tipo.value, dia.value)),
  }))
})

async function onSalvar() {
  if (!valido.value || !mudou.value) return
  try {
    await salvar.mutateAsync({
      valor_liquido: valor.value!,
      recebimento_tipo: tipo.value,
      recebimento_dia: dia.value,
    })
    toast.success('Salário salvo. Vale daqui em diante.')
    emit('salvo')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para salvar o salário.'))
  }
}

async function onRemover() {
  try {
    await remover.mutateAsync()
    toast.success('Salário removido.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para remover o salário.'))
  }
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="onSalvar">
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="space-y-2">
        <Label :for="`${idBase}-valor`">Valor líquido</Label>
        <Input
          :id="`${idBase}-valor`"
          v-model.number="valor"
          type="number"
          inputmode="decimal"
          step="0.01"
          min="0.01"
          placeholder="0,00"
          :disabled="renda.isPending.value"
        />
      </div>

      <div class="space-y-2">
        <Label :for="`${idBase}-dia`">Quando cai</Label>
        <div class="flex gap-2">
          <div class="flex gap-1 rounded-lg border p-1">
            <Button
              v-for="t in TIPOS"
              :key="t.valor"
              type="button"
              size="sm"
              :variant="tipo === t.valor ? 'default' : 'ghost'"
              :aria-pressed="tipo === t.valor"
              @click="tipo = t.valor"
            >
              {{ t.rotulo }}
            </Button>
          </div>
          <Input
            :id="`${idBase}-dia`"
            v-model.number="dia"
            class="w-20"
            type="number"
            inputmode="numeric"
            min="1"
            :max="diaMaximo"
          />
        </div>
      </div>
    </div>

    <p class="text-xs text-muted-foreground">
      <template v-if="!valido && dia > diaMaximo">
        {{ tipo === 'dia_util'
          ? 'Um mês tem no máximo 23 dias úteis.'
          : 'O dia vai de 1 a 31.' }}
      </template>
      <template v-else-if="previstas.length">
        {{ tipo === 'dia_util' ? `Até o ${dia}º dia útil` : `Todo dia ${dia}` }}:
        <template v-for="(p, i) in previstas" :key="p.mes">
          {{ i ? ' · ' : '' }}{{ p.mes }} em <strong class="text-foreground">{{ p.data }}</strong>
        </template>.
        <template v-if="tipo === 'dia_util'">Conta só segunda a sexta, sem feriados nacionais.</template>
        <template v-else>Num mês sem esse dia, vale o último.</template>
      </template>
    </p>

    <div class="flex flex-wrap gap-2">
      <Button type="submit" variant="secondary" :disabled="!valido || !mudou || salvar.isPending.value">
        {{ salvar.isPending.value ? 'Salvando…' : renda.data.value ? 'Salvar' : 'Cadastrar salário' }}
      </Button>
      <Button
        v-if="permiteRemover && renda.data.value"
        type="button"
        variant="ghost"
        :disabled="remover.isPending.value"
        @click="onRemover"
      >
        Remover
      </Button>
      <Button v-if="!permiteRemover" type="button" variant="ghost" @click="emit('cancelar')">
        Cancelar
      </Button>
    </div>
  </form>
</template>
