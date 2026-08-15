<script setup lang="ts">
/**
 * O envio: escolher arquivos, ver o que foi escolhido, mandar.
 *
 * Aceita VÁRIOS de uma vez porque é assim que fotos existem — ninguém volta de um
 * fim de semana com uma. E a legenda é uma só para o lote, de propósito: um campo
 * por arquivo transformaria "mandar as doze do sábado" num formulário de doze
 * linhas, e a legenda quase sempre é do rolo ("praia, domingo"), não do quadro.
 * Quem quiser legenda própria edita depois, no visor.
 *
 * A validação acontece na ESCOLHA, não no envio. Descobrir que o vídeo passa de
 * 50 MB depois de esperar a barra encher é o pior jeito de dar essa notícia.
 */
import { toast } from 'vue-sonner'
import { ImageOffIcon, UploadIcon, XIcon } from '@lucide/vue'
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
import { MIMES_ACEITOS, ehVideo, formatarTamanho, motivoParaRecusar, temPrevia } from '~/types/foto'
import { useEnviarFotos } from '~/composables/useFotos'

const aberto = defineModel<boolean>('aberto', { required: true })

const enviar = useEnviarFotos()

interface Escolhido {
  arquivo: File
  /** `URL.createObjectURL` do próprio arquivo — prévia local, sem passar pela rede. */
  previa: string
}

const escolhidos = ref<Escolhido[]>([])
const legenda = ref('')
const entrada = useTemplateRef<HTMLInputElement>('entrada')

const aceitos = MIMES_ACEITOS.join(',')

/**
 * Solta as URLs de prévia ao limpar.
 *
 * `createObjectURL` prende o arquivo na memória da aba até alguém revogar. Doze
 * vídeos escolhidos e descartados três vezes seguidas é meio giga preso numa aba
 * que aparenta estar vazia — e o navegador não avisa.
 */
function limpar() {
  for (const e of escolhidos.value) URL.revokeObjectURL(e.previa)
  escolhidos.value = []
  legenda.value = ''
  if (entrada.value) entrada.value.value = ''
}

watch(aberto, (estaAberto) => {
  if (!estaAberto) limpar()
})

onBeforeUnmount(limpar)

function aoEscolher(evento: Event) {
  const lista = (evento.target as HTMLInputElement).files
  if (!lista) return

  const recusados: string[] = []

  for (const arquivo of Array.from(lista)) {
    const motivo = motivoParaRecusar(arquivo)
    if (motivo) {
      recusados.push(motivo)
      continue
    }

    escolhidos.value.push({ arquivo, previa: URL.createObjectURL(arquivo) })
  }

  // Os recusados viram um aviso e os aceitos seguem: rejeitar o lote inteiro por
  // causa de um arquivo faria a pessoa refazer a seleção sabendo menos do que
  // sabe agora.
  if (recusados.length) toast.error(recusados.join('\n'))

  // Zera a entrada para escolher o MESMO arquivo de novo disparar o evento — sem
  // isso, remover um item da lista e reescolhê-lo não faria nada.
  ;(evento.target as HTMLInputElement).value = ''
}

function remover(indice: number) {
  const [fora] = escolhidos.value.splice(indice, 1)
  if (fora) URL.revokeObjectURL(fora.previa)
}

const total = computed(() =>
  escolhidos.value.reduce((soma, e) => soma + e.arquivo.size, 0),
)

async function mandar() {
  if (!escolhidos.value.length || enviar.isPending.value) return

  try {
    const { enviadas, falhas } = await enviar.mutateAsync(
      escolhidos.value.map(e => ({ arquivo: e.arquivo, legenda: legenda.value })),
    )

    if (enviadas) {
      toast.success(enviadas === 1 ? 'Foto enviada.' : `${enviadas} fotos enviadas.`)
    }
    if (falhas.length) {
      toast.error(falhas.join('\n'))
    }

    // Só fecha quando tudo passou: com falhas na lista, fechar levaria embora a
    // seleção que a pessoa precisaria refazer para tentar de novo.
    if (!falhas.length) aberto.value = false
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para enviar.'))
  }
}
</script>

<template>
  <Dialog v-model:open="aberto">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Mandar fotos</DialogTitle>
        <DialogDescription>
          Imagens e vídeos até {{ formatarTamanho(52428800) }} cada. Você já entra curtindo o que mandar.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <div class="space-y-1.5">
          <Label for="foto-arquivos">Arquivos</Label>
          <input
            id="foto-arquivos"
            ref="entrada"
            type="file"
            multiple
            :accept="aceitos"
            class="block w-full cursor-pointer rounded-md border bg-background p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
            @change="aoEscolher"
          >
        </div>

        <div v-if="escolhidos.length" class="space-y-2">
          <div class="grid grid-cols-4 gap-2">
            <div
              v-for="(escolhido, i) in escolhidos"
              :key="escolhido.previa"
              class="relative aspect-square overflow-hidden rounded-md border bg-muted"
            >
              <img
                v-if="!ehVideo(escolhido.arquivo.type) && temPrevia(escolhido.arquivo.type)"
                :src="escolhido.previa"
                alt=""
                class="size-full object-cover"
              >
              <video
                v-else-if="ehVideo(escolhido.arquivo.type)"
                :src="escolhido.previa"
                muted
                playsinline
                preload="metadata"
                class="size-full object-cover"
              />
              <span v-else class="grid size-full place-items-center text-muted-foreground">
                <ImageOffIcon class="size-5" />
              </span>

              <button
                type="button"
                class="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white"
                @click="remover(i)"
              >
                <XIcon class="size-3.5" />
                <span class="sr-only">Tirar da lista</span>
              </button>
            </div>
          </div>

          <p class="text-xs text-muted-foreground">
            {{ escolhidos.length }} {{ escolhidos.length === 1 ? 'arquivo' : 'arquivos' }} ·
            {{ formatarTamanho(total) }}
          </p>
        </div>

        <div class="space-y-1.5">
          <Label for="foto-legenda">
            Legenda do lote <span class="text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            id="foto-legenda"
            v-model="legenda"
            placeholder="praia, domingo de manhã"
            autocomplete="off"
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" @click="aberto = false">Cancelar</Button>
        <Button type="button" class="gap-1.5" :disabled="!escolhidos.length || enviar.isPending.value" @click="mandar">
          <UploadIcon class="size-4" />
          {{ enviar.isPending.value ? 'Enviando…' : 'Mandar' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
