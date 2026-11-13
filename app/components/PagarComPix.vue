<script setup lang="ts">
/**
 * "Pagar com Pix" — o acerto do mês pronto para colar no app do banco.
 *
 * Fase 6 do plano de Open Finance: o app gera o Pix copia e cola (BR Code
 * estático) com a chave de quem recebe e o valor do `SaldoDoMes`. Quem paga
 * cola no banco e confirma — a mesma aprovação que a iniciação de pagamento
 * paga da Pluggy exigiria. No dia seguinte, com o banco conectado, a
 * conciliação reconhece o Pix no extrato.
 *
 * Só aparece para quem DEVE: o credor não tem o que pagar, e mostrar a ele o
 * próprio QR seria confuso.
 */
import QRCode from 'qrcode'
import { toast } from 'vue-sonner'
import { CheckIcon, CopyIcon, QrCodeIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatarMes } from '@/lib/datas'
import { formatarDinheiro } from '@/lib/dinheiro'
import { brCodePix, txidDoAcerto } from '~/lib/pix'
import { useChavePixDe } from '~/composables/usePerfil'

const props = defineProps<{
  /** Quem recebe. */
  credorId: string
  credorNome: string
  valor: number
  /** Âncora do mês (YYYY-MM-01). */
  competencia: string
}>()

const aberto = ref(false)
const credor = computed(() => props.credorId)
const { data: chave, isPending } = useChavePixDe(credor)

const codigo = computed(() => {
  if (!chave.value) return null
  return brCodePix({
    chave: chave.value.chave,
    nome: chave.value.nome,
    valor: props.valor,
    txid: txidDoAcerto(props.competencia),
    mensagem: `APPingos - acerto de ${formatarMes(props.competencia)}`,
  })
})

/*
 * O QR é desenhado só com o diálogo aberto: é a parte cara, e quem só olha a
 * frase do acerto não precisa dele.
 */
const qr = ref<string | null>(null)
watch([aberto, codigo], async ([estaAberto, texto]) => {
  if (!estaAberto || !texto) return
  qr.value = await QRCode.toDataURL(texto, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
})

const copiado = ref(false)
async function copiar() {
  if (!codigo.value) return
  try {
    await navigator.clipboard.writeText(codigo.value)
    copiado.value = true
    toast.success('Pix copia e cola copiado. Cole no app do banco.')
    setTimeout(() => { copiado.value = false }, 2000)
  }
  catch {
    toast.error('O navegador não liberou a área de transferência aqui.')
  }
}
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
    @click="aberto = true"
  >
    <QrCodeIcon class="size-3.5" />
    Pagar com Pix
  </button>

  <Dialog v-model:open="aberto">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>Pagar {{ formatarDinheiro(valor) }} a {{ credorNome }}</DialogTitle>
        <DialogDescription>
          Acerto de {{ formatarMes(competencia) }}. Cole no app do seu banco ou leia o QR — o
          valor já vem preenchido. Depois, marque o mês como pago.
        </DialogDescription>
      </DialogHeader>

      <div v-if="isPending" class="mx-auto size-60 animate-pulse rounded-md bg-muted" />

      <p v-else-if="!codigo" class="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
        {{ credorNome }} ainda não cadastrou a chave Pix. Ela fica em Espaços, logo abaixo do
        apelido — sem ela não dá para montar o Pix.
      </p>

      <div v-else class="space-y-3">
        <img
          v-if="qr"
          :src="qr"
          :alt="`QR Code do Pix de ${formatarDinheiro(valor)} para ${credorNome}`"
          class="mx-auto size-60 rounded-md bg-white"
        >
        <div class="rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-snug break-all">
          {{ codigo }}
        </div>
        <Button class="w-full gap-1.5" @click="copiar">
          <component :is="copiado ? CheckIcon : CopyIcon" class="size-4" />
          Copiar Pix copia e cola
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
