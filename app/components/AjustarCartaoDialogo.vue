<script setup lang="ts">
/**
 * Limite e dias do cartão digitados à mão.
 *
 * Existe porque o banco nem sempre informa (no Open Finance o limite é
 * opcional), e porque às vezes informa errado — o limite que o app mostra
 * precisa bater com o que a pessoa vê no app do banco. O que for digitado aqui
 * ganha do que vier da Pluggy; apagar o campo volta a valer o do banco.
 */
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatarDia } from '@/lib/datas'
import { formatarDinheiro } from '@/lib/dinheiro'
import { mensagemDeErro } from '@/lib/utils'
import { useAjustarCartao } from '~/composables/useCartoes'
import type { CartaoDaPessoa } from '~/composables/useCartoes'

const aberto = defineModel<boolean>('aberto', { required: true })
const props = defineProps<{ cartao: CartaoDaPessoa | null }>()

const ajustar = useAjustarCartao()

const limite = ref('')
const fechamento = ref('')
const vencimento = ref('')

watch(() => [aberto.value, props.cartao] as const, ([abrindo, c]) => {
  if (!abrindo || !c) return
  limite.value = c.limite_manual != null ? String(c.limite_manual).replace('.', ',') : ''
  fechamento.value = c.dia_fechamento_manual ? String(c.dia_fechamento_manual) : ''
  vencimento.value = c.dia_vencimento_manual ? String(c.dia_vencimento_manual) : ''
}, { immediate: true })

function numero(texto: string): number | null {
  const limpo = texto.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  if (!limpo) return null
  const n = Number(limpo)
  return Number.isFinite(n) ? n : Number.NaN
}

function dia(texto: string): number | null {
  if (!texto.trim()) return null
  const n = Number(texto)
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : Number.NaN
}

async function salvar() {
  if (!props.cartao) return
  const l = numero(limite.value)
  const f = dia(fechamento.value)
  const v = dia(vencimento.value)
  if (Number.isNaN(l) || (l !== null && l <= 0)) return toast.error('O limite precisa ser um valor maior que zero.')
  if (Number.isNaN(f) || Number.isNaN(v)) return toast.error('Os dias vão de 1 a 31.')

  try {
    await ajustar.mutateAsync({ id: props.cartao.id, limite_manual: l, dia_fechamento_manual: f, dia_vencimento_manual: v })
    toast.success('Cartão ajustado.')
    aberto.value = false
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para salvar.'))
  }
}
</script>

<template>
  <Dialog v-model:open="aberto">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ cartao?.nome ?? 'Cartão' }}</DialogTitle>
        <DialogDescription>
          O que você digitar aqui vale mais que o informado pelo banco. Deixe em branco para usar o do banco.
        </DialogDescription>
      </DialogHeader>

      <form class="grid gap-4" @submit.prevent="salvar()">
        <div class="grid gap-1.5">
          <Label for="limite">Limite</Label>
          <Input id="limite" v-model="limite" inputmode="decimal" placeholder="Ex.: 5.000,00" />
          <p v-if="cartao?.limite" class="text-xs text-muted-foreground">
            O banco informa {{ formatarDinheiro(cartao.limite) }}.
          </p>
          <p v-else class="text-xs text-muted-foreground">O banco não informou o limite deste cartão.</p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="grid gap-1.5">
            <Label for="fecha">Dia do fechamento</Label>
            <Input id="fecha" v-model="fechamento" inputmode="numeric" placeholder="1 a 31" />
            <p v-if="cartao?.fecha_em" class="text-xs text-muted-foreground">Banco: {{ formatarDia(cartao.fecha_em) }}</p>
          </div>
          <div class="grid gap-1.5">
            <Label for="vence">Dia do vencimento</Label>
            <Input id="vence" v-model="vencimento" inputmode="numeric" placeholder="1 a 31" />
            <p v-if="cartao?.vence_em" class="text-xs text-muted-foreground">Banco: {{ formatarDia(cartao.vence_em) }}</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" @click="aberto = false">Cancelar</Button>
          <Button type="submit" :disabled="ajustar.isPending.value">Salvar</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
