<script setup lang="ts">
/**
 * O formulário de um produto — para criar e para editar, no mesmo lugar.
 *
 * Três destinos possíveis, e é o que os props dizem:
 *
 * - `produto`        → edita esse produto
 * - `agrupamentoId`  → acrescenta a um agrupamento que já existe ("e também o suporte")
 * - `interesseId`    → cria um agrupamento novo com este produto como primeiro
 *
 * ## O link não é editável na edição
 *
 * É por `url` que a extensão reabre a página para reler o preço. Trocar a url à mão
 * faria a próxima rechecagem ler OUTRO produto e sobrescrever o preço e o histórico
 * deste com os de outra coisa — sem erro visível, e sem como descobrir depois que o
 * gráfico virou dois produtos misturados. Produto errado se remove e captura de
 * novo; é uma ação a mais e mantém o histórico honesto.
 *
 * `loja` não é digitada — sai do hostname da url por `lojaDaUrl`. Pedir a loja
 * depois de pedir o link seria pedir duas vezes a mesma informação, e é assim que a
 * extensão faz também.
 */
import { toast } from 'vue-sonner'
import { LockIcon } from '@lucide/vue'
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
import type { InteresseProduto } from '~/types/interesse'
import {
  useAdicionarProduto,
  useAtualizarProduto,
  useCriarAgrupamento,
} from '~/composables/useInteresses'

const props = defineProps<{
  produto?: InteresseProduto | null
  agrupamentoId?: string | null
  interesseId?: string | null
  /** Nome sugerido para o agrupamento novo, quando é o caso. */
  nomeDoAgrupamento?: string | null
}>()

const aberto = defineModel<boolean>('aberto', { required: true })

const adicionar = useAdicionarProduto()
const atualizar = useAtualizarProduto()
const criarAgrupamento = useCriarAgrupamento()

const editando = computed(() => !!props.produto)

const salvando = computed(() =>
  adicionar.isPending.value || atualizar.isPending.value || criarAgrupamento.isPending.value,
)

const nome = ref('')
const url = ref('')
// `undefined` e não `null`: o Input do shadcn não aceita null em model-value.
const preco = ref<number | undefined>(undefined)
const precoPix = ref<number | undefined>(undefined)
const parcelas = ref<number | undefined>(undefined)
const valorParcela = ref<number | undefined>(undefined)
const imagemUrl = ref('')

/** Numa edição, `null` no campo numérico significa apagar o valor, não "não mexi". */
function comoNumero(valor: number | null): number | undefined {
  return valor ?? undefined
}

watch(aberto, (estaAberto) => {
  if (!estaAberto) return

  const p = props.produto
  nome.value = p?.nome ?? ''
  url.value = p?.url ?? ''
  preco.value = comoNumero(p?.preco ?? null)
  precoPix.value = comoNumero(p?.preco_pix ?? null)
  parcelas.value = comoNumero(p?.parcelas ?? null)
  valorParcela.value = comoNumero(p?.valor_parcela ?? null)
  imagemUrl.value = p?.imagem_url ?? ''
})

const loja = computed(() => lojaDaUrl(url.value.trim()))

const podeSalvar = computed(() => {
  if (salvando.value) return false
  if (!nome.value.trim()) return false
  return editando.value || url.value.trim().length > 0
})

/** Os campos que os três caminhos têm em comum. */
function valores() {
  return {
    nome: nome.value.trim(),
    imagem_url: imagemUrl.value.trim() || null,
    preco: preco.value ?? null,
    preco_pix: precoPix.value ?? null,
    parcelas: parcelas.value ?? null,
    valor_parcela: valorParcela.value ?? null,
  }
}

async function salvar() {
  if (!podeSalvar.value) return

  try {
    if (props.produto) {
      await atualizar.mutateAsync({ id: props.produto.id, ...valores() })
      toast.success('Produto atualizado.')
    }
    else {
      const produto = {
        ...valores(),
        url: url.value.trim(),
        loja: loja.value,
        origem: 'manual' as const,
      }

      if (props.agrupamentoId) {
        await adicionar.mutateAsync({ agrupamentoId: props.agrupamentoId, produto })
      }
      else if (props.interesseId) {
        await criarAgrupamento.mutateAsync({
          interesseId: props.interesseId,
          nome: props.nomeDoAgrupamento ?? null,
          produto,
        })
      }
      else {
        throw new Error('Sem agrupamento nem interesse para receber o produto.')
      }

      toast.success('Produto adicionado.')
    }

    aberto.value = false
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para salvar o produto.'))
  }
}
</script>

<template>
  <Dialog v-model:open="aberto">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ editando ? 'Editar produto' : 'Adicionar produto' }}</DialogTitle>
        <DialogDescription>
          <template v-if="editando">
            Corrija o que a captura leu errado. O link fica travado — é por ele que o
            preço é relido.
          </template>
          <template v-else-if="agrupamentoId">
            Um item que faz parte do mesmo conjunto — o preço deles é somado.
          </template>
          <template v-else>
            Uma alternativa para este interesse. Só o nome e o link são obrigatórios.
          </template>
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="salvar">
        <div class="space-y-1.5">
          <Label for="produto-nome">Nome</Label>
          <Input id="produto-nome" v-model="nome" autocomplete="off" required />
        </div>

        <div class="space-y-1.5">
          <Label for="produto-url">Link</Label>

          <!--
            Travado com `readonly` em vez de escondido: o link é a informação mais
            importante do card, e ver de onde o produto veio ajuda a decidir se é
            este mesmo que se quer corrigir.
          -->
          <Input
            v-if="editando"
            id="produto-url"
            :model-value="url"
            readonly
            class="text-muted-foreground"
          />
          <Input
            v-else
            id="produto-url"
            v-model="url"
            type="url"
            inputmode="url"
            placeholder="https://…"
            autocomplete="off"
            required
          />

          <p v-if="editando" class="flex items-start gap-1.5 text-xs text-muted-foreground">
            <LockIcon class="mt-0.5 size-3 shrink-0" />
            <span>
              É por este link que a extensão relê o preço. Para trocar de produto,
              remova este e capture o novo.
            </span>
          </p>
          <p v-else-if="loja" class="text-xs text-muted-foreground">Loja: {{ loja }}</p>
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
            {{ salvando ? 'Salvando…' : editando ? 'Salvar' : 'Adicionar' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
