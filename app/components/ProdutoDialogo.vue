<script setup lang="ts">
/**
 * Acrescenta um produto candidato a um interesse, à mão.
 *
 * É o caminho de quem está no computador sem a extensão instalada, ou de quem viu
 * o preço numa loja física. Os mesmos campos que a extensão manda, com os mesmos
 * opcionais: só nome e link são obrigatórios.
 *
 * `loja` não é digitada — sai do hostname da url por `lojaDaUrl`. Pedir a loja
 * depois de pedir o link seria pedir duas vezes a mesma informação, e é assim que
 * a extensão faz também.
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
import { lojaDaUrl } from '~/types/interesse'
import { useAdicionarProduto } from '~/composables/useInteresses'

const props = defineProps<{ interesseId: string }>()

const aberto = defineModel<boolean>('aberto', { required: true })

const adicionar = useAdicionarProduto()

const nome = ref('')
const url = ref('')
// `undefined` e não `null`: o Input do shadcn não aceita null em model-value.
const preco = ref<number | undefined>(undefined)
const precoPix = ref<number | undefined>(undefined)
const parcelas = ref<number | undefined>(undefined)
const valorParcela = ref<number | undefined>(undefined)
const imagemUrl = ref('')

watch(aberto, (estaAberto) => {
  if (!estaAberto) return
  nome.value = ''
  url.value = ''
  preco.value = undefined
  precoPix.value = undefined
  parcelas.value = undefined
  valorParcela.value = undefined
  imagemUrl.value = ''
})

const loja = computed(() => lojaDaUrl(url.value.trim()))

const podeSalvar = computed(() =>
  nome.value.trim().length > 0 && url.value.trim().length > 0 && !adicionar.isPending.value,
)

async function salvar() {
  if (!podeSalvar.value) return

  try {
    await adicionar.mutateAsync({
      interesseId: props.interesseId,
      produto: {
        nome: nome.value.trim(),
        url: url.value.trim(),
        loja: loja.value,
        imagem_url: imagemUrl.value.trim() || null,
        preco: preco.value ?? null,
        preco_pix: precoPix.value ?? null,
        parcelas: parcelas.value ?? null,
        valor_parcela: valorParcela.value ?? null,
        origem: 'manual',
      },
    })
    toast.success('Produto adicionado.')
    aberto.value = false
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para adicionar o produto.'))
  }
}
</script>

<template>
  <Dialog v-model:open="aberto">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Adicionar produto</DialogTitle>
        <DialogDescription>
          Um candidato para este interesse. Só o nome e o link são obrigatórios.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="salvar">
        <div class="space-y-1.5">
          <Label for="produto-nome">Nome</Label>
          <Input id="produto-nome" v-model="nome" autocomplete="off" required />
        </div>

        <div class="space-y-1.5">
          <Label for="produto-url">Link</Label>
          <Input
            id="produto-url"
            v-model="url"
            type="url"
            inputmode="url"
            placeholder="https://…"
            autocomplete="off"
            required
          />
          <p v-if="loja" class="text-xs text-muted-foreground">Loja: {{ loja }}</p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1.5">
            <Label for="produto-preco">Preço</Label>
            <Input id="produto-preco" v-model="preco" type="number" step="0.01" min="0" />
          </div>

          <div class="space-y-1.5">
            <Label for="produto-pix">Preço no Pix</Label>
            <Input id="produto-pix" v-model="precoPix" type="number" step="0.01" min="0" />
          </div>

          <div class="space-y-1.5">
            <Label for="produto-parcelas">Parcelas</Label>
            <Input id="produto-parcelas" v-model="parcelas" type="number" step="1" min="1" max="120" />
          </div>

          <div class="space-y-1.5">
            <Label for="produto-valor-parcela">Valor da parcela</Label>
            <Input id="produto-valor-parcela" v-model="valorParcela" type="number" step="0.01" min="0" />
          </div>
        </div>

        <div class="space-y-1.5">
          <Label for="produto-imagem">Imagem <span class="text-muted-foreground">(opcional)</span></Label>
          <Input id="produto-imagem" v-model="imagemUrl" type="url" placeholder="https://…" />
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" @click="aberto = false">Cancelar</Button>
          <Button type="submit" :disabled="!podeSalvar">
            {{ adicionar.isPending.value ? 'Salvando…' : 'Adicionar' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
