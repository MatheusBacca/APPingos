<script setup lang="ts">
/**
 * O detalhe de um interesse: a ideia em cima, os candidatos embaixo.
 *
 * É o destino do link que a extensão do Chrome mostra depois de capturar, então
 * "não encontrado" é caso comum e não borda — um link colado no celular de quem
 * está com outro espaço ativo cai aqui, e a RLS torna o interesse invisível. Por
 * isso o estado de erro é uma tela explicada, e não o erro cru do PostgREST.
 *
 * A comparação entre candidatos é o valor da tela: `economiaPossivel` diz quanto
 * o escolhido custa a mais que o mais barato da lista, e só aparece quando há de
 * fato uma escolha a questionar.
 */
import { PencilIcon, PlusIcon, Trash2Icon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarDinheiro } from '@/lib/dinheiro'
import { mensagemDeErro } from '@/lib/utils'
import {
  economiaPossivel,
  precoEfetivo,
  rotuloDestino,
  rotuloEstado,
  valorDoInteresse,
} from '~/types/interesse'
import {
  useApagarInteresse,
  useEscolherProduto,
  useInteresse,
  useRemoverProduto,
} from '~/composables/useInteresses'

const route = useRoute()
const interesseId = route.params.id as string

const { data: interesse, isPending, isError, error } = useInteresse(interesseId)
const apagar = useApagarInteresse()
const escolher = useEscolherProduto()
const remover = useRemoverProduto()

useHead({
  title: () => {
    if (interesse.value) return `${interesse.value.titulo} · APPingos`
    // Sem isto a aba fica "Carregando…" para sempre num interesse de outro espaço.
    return isPending.value ? 'Carregando… · APPingos' : 'Interesse não encontrado · APPingos'
  },
})

const dialogoInteresse = ref(false)
const dialogoProduto = ref(false)

const produtos = computed(() => interesse.value?.produtos ?? [])

/** Ordem: o escolhido primeiro, depois do mais barato ao mais caro. */
const produtosOrdenados = computed(() =>
  [...produtos.value].sort((a, b) => {
    if (a.escolhido !== b.escolhido) return a.escolhido ? -1 : 1
    // Sem preço vai para o fim: `Infinity` os empurra sem inventar um valor.
    return (precoEfetivo(a) ?? Infinity) - (precoEfetivo(b) ?? Infinity)
  }),
)

const valor = computed(() => valorDoInteresse(produtos.value))
const economia = computed(() => economiaPossivel(produtos.value))

async function onEscolher(produtoId: string) {
  try {
    await escolher.mutateAsync(produtoId)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para marcar o produto.'))
  }
}

async function onRemoverProduto(produtoId: string) {
  try {
    await remover.mutateAsync(produtoId)
    toast.success('Produto removido.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para remover o produto.'))
  }
}

async function onApagar() {
  try {
    await apagar.mutateAsync(interesseId)
    toast.success('Interesse apagado.')
    await navigateTo('/objetivos/interesses')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para apagar o interesse.'))
  }
}
</script>

<template>
  <div class="space-y-6">
    <BotaoVoltar para="/objetivos/interesses" rotulo="Interesses" />

    <div v-if="isPending" class="space-y-3">
      <Skeleton class="h-8 w-2/3" />
      <Skeleton class="h-24 w-full rounded-lg" />
    </div>

    <p v-else-if="isError" class="text-sm text-destructive">
      {{ mensagemDeErro(error, 'Não deu para carregar o interesse.') }}
    </p>

    <div
      v-else-if="!interesse"
      class="grid place-items-center rounded-xl border border-dashed bg-card/50 px-6 py-16 text-center"
    >
      <p class="font-medium">Este interesse não existe aqui.</p>
      <p class="mt-1 max-w-sm text-sm text-muted-foreground">
        Ou ele foi apagado, ou pertence a outro espaço — troque de espaço no menu
        do topo e tente de novo.
      </p>
    </div>

    <template v-else>
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold tracking-tight">{{ interesse.titulo }}</h1>

          <div class="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{{ rotuloDestino(interesse.destino) }}</Badge>
            <Badge variant="outline">{{ rotuloEstado(interesse.estado) }}</Badge>
            <span v-if="interesse.para_quem">para {{ interesse.para_quem }}</span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" class="gap-1.5" @click="dialogoInteresse = true">
            <PencilIcon class="size-4" />
            Editar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="gap-1.5 text-muted-foreground hover:text-destructive"
            @click="onApagar"
          >
            <Trash2Icon class="size-4" />
            Apagar
          </Button>
        </div>
      </header>

      <p v-if="interesse.observacao" class="whitespace-pre-line text-sm text-muted-foreground">
        {{ interesse.observacao }}
      </p>

      <section class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-medium">
              {{ produtos.length === 1 ? '1 produto' : `${produtos.length} produtos` }}
            </h2>
            <p v-if="valor !== null" class="text-xs text-muted-foreground">
              Vale {{ formatarDinheiro(valor) }}
              <template v-if="economia !== null">
                — o mais barato sai {{ formatarDinheiro(economia) }} menos
              </template>
            </p>
          </div>

          <Button variant="outline" size="sm" class="gap-1.5" @click="dialogoProduto = true">
            <PlusIcon class="size-4" />
            Adicionar produto
          </Button>
        </div>

        <div v-if="produtos.length" class="space-y-2">
          <ProdutoDoInteresse
            v-for="produto in produtosOrdenados"
            :key="produto.id"
            :produto="produto"
            :pode-escolher="produtos.length > 1"
            @escolher="onEscolher(produto.id)"
            @remover="onRemoverProduto(produto.id)"
          />
        </div>

        <p v-else class="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum produto ainda. Adicione um pelo botão acima, ou capture da página
          da loja com a extensão do Chrome.
        </p>
      </section>

      <InteresseDialogo v-model:aberto="dialogoInteresse" :interesse="interesse" />
      <ProdutoDialogo v-model:aberto="dialogoProduto" :interesse-id="interesseId" />
    </template>
  </div>
</template>
