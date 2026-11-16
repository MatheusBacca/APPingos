<script setup lang="ts">
/**
 * Guardar ou resgatar dinheiro de uma meta.
 *
 * Aporte é RESERVA NO APP: não aponta para conta nenhuma e não é compra — não
 * entra no gasto do espaço nem no acerto. Ele só sai da sobra do mês no
 * Planejamento. O texto do diálogo diz isso, porque "guardar R$ 500" num app de
 * orçamento soa como um lançamento de gasto.
 *
 * O resgate é limitado ao guardado aqui e na RPC (`registrar_aporte`), que é quem
 * decide de verdade.
 */
import { toast } from 'vue-sonner'
import { mensagemDeErro } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { hojeIso } from '@/lib/datas'
import { formatarDinheiro } from '@/lib/dinheiro'
import { progressoDaMeta } from '~/types/meta'
import type { MetaComAportes } from '~/composables/useMetas'
import { useRegistrarAporte } from '~/composables/useMetas'

const props = defineProps<{
  meta: MetaComAportes | null
  sentido: 'guardar' | 'resgatar'
}>()

const aberto = defineModel<boolean>('aberto', { required: true })

const registrar = useRegistrarAporte()

const valor = ref<number | undefined>(undefined)
const data = ref(hojeIso())

watch(aberto, (a) => {
  if (!a) return
  valor.value = undefined
  data.value = hojeIso()
})

const progresso = computed(() => (props.meta ? progressoDaMeta(props.meta, props.meta.aportes) : null))

const podeSalvar = computed(() => {
  const v = valor.value ?? 0
  if (v <= 0 || !data.value || registrar.isPending.value || !props.meta) return false
  return props.sentido === 'guardar' || v <= (progresso.value?.guardado ?? 0)
})

async function salvar() {
  if (!podeSalvar.value || !props.meta) return
  const v = props.sentido === 'guardar' ? valor.value! : -valor.value!
  try {
    await registrar.mutateAsync({ meta: props.meta, valor: v, data: data.value })
    // Espelha a RPC: só a meta ATIVA vira cumprida sozinha.
    const alcancou = props.sentido === 'guardar'
      && props.meta.estado === 'ativa'
      && (progresso.value?.guardado ?? 0) + valor.value! >= props.meta.valor_alvo
    toast.success(alcancou
      ? `"${props.meta.titulo}" chegou lá. Meta cumprida!`
      : props.sentido === 'guardar' ? 'Guardado.' : 'Resgatado.')
    aberto.value = false
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para registrar.'))
  }
}
</script>

<template>
  <Dialog v-model:open="aberto">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ sentido === 'guardar' ? 'Guardar' : 'Resgatar' }} — {{ meta?.titulo }}</DialogTitle>
        <DialogDescription>
          <template v-if="sentido === 'guardar'">
            Uma reserva no app: sai da sobra do seu mês, mas não é gasto nem entra no acerto.
          </template>
          <template v-else>
            Tira da meta o que foi guardado — para usar na compra, ou porque o plano mudou.
          </template>
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="salvar">
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="aporte-valor">Valor</Label>
            <Input
              id="aporte-valor"
              v-model.number="valor"
              type="number"
              inputmode="decimal"
              step="0.01"
              min="0.01"
              :max="sentido === 'resgatar' ? progresso?.guardado : undefined"
              placeholder="0,00"
            />
          </div>
          <div class="space-y-2">
            <Label for="aporte-data">Quando</Label>
            <Input id="aporte-data" v-model="data" type="date" />
          </div>
        </div>

        <p v-if="progresso" class="text-xs text-muted-foreground">
          Guardado até aqui: {{ formatarDinheiro(progresso.guardado) }} de {{ formatarDinheiro(meta!.valor_alvo) }}.
          <template v-if="sentido === 'resgatar'">Dá para resgatar até esse valor.</template>
        </p>

        <DialogFooter>
          <Button type="button" variant="ghost" @click="aberto = false">Cancelar</Button>
          <Button type="submit" :disabled="!podeSalvar">
            {{ registrar.isPending.value ? 'Salvando…' : sentido === 'guardar' ? 'Guardar' : 'Resgatar' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
