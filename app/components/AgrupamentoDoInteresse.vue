<script setup lang="ts">
/**
 * Um agrupamento: uma das saídas possíveis para o interesse.
 *
 * A maioria tem um produto só ("o sofá") e o card se parece com um card de produto
 * com uma moldura. O caso que justifica a moldura é o outro: "monitor novo" =
 * monitor **+** braço de mesa, dois produtos que não valem separados. Aí a soma no
 * cabeçalho é o custo real da saída, e é ela que concorre com as outras.
 *
 * ## Por que a soma some quando falta um preço
 *
 * `somaDoAgrupamento` devolve `null` enquanto qualquer item estiver sem preço, e o
 * cabeçalho mostra o parcial com a ressalva em vez do número sozinho. Um "R$ 1.800"
 * limpo num conjunto que ainda vai custar mais faria este agrupamento parecer o
 * mais barato — exatamente a comparação que a tela existe para acertar.
 */
import {
  CheckIcon,
  MoreVerticalIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
} from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { formatarDinheiro } from '@/lib/dinheiro'
import {
  nomeDoAgrupamento,
  produtosSemPreco,
  somaDoAgrupamento,
  somaParcial,
} from '~/types/interesse'
import type { Agrupamento, InteresseProduto } from '~/types/interesse'

const props = defineProps<{
  agrupamento: Agrupamento
  /** Só faz sentido escolher favorito havendo mais de uma saída. */
  podeEscolher: boolean
}>()

const emit = defineEmits<{
  escolher: []
  renomear: [nome: string | null]
  remover: []
  adicionarProduto: []
  editarProduto: [produto: InteresseProduto]
  removerProduto: [produto: InteresseProduto]
}>()

const soma = computed(() => somaDoAgrupamento(props.agrupamento))
const parcial = computed(() => somaParcial(props.agrupamento))
const semPreco = computed(() => produtosSemPreco(props.agrupamento))
const titulo = computed(() => nomeDoAgrupamento(props.agrupamento))

const conjunto = computed(() => props.agrupamento.produtos.length > 1)

const renomeando = ref(false)
const nomeRascunho = ref('')

function abrirRenomear() {
  nomeRascunho.value = props.agrupamento.nome ?? ''
  renomeando.value = true
}

function confirmarRenomear() {
  if (!renomeando.value) return
  renomeando.value = false

  const novo = nomeRascunho.value.trim() || null
  if (novo !== props.agrupamento.nome) emit('renomear', novo)
}
</script>

<template>
  <section
    class="space-y-3 rounded-xl border bg-card/50 p-3"
    :class="agrupamento.escolhido ? 'border-primary/50' : ''"
  >
    <header class="flex flex-wrap items-start gap-2">
      <div class="min-w-0 flex-1 space-y-1">
        <Input
          v-if="renomeando"
          v-model="nomeRascunho"
          placeholder="Monitor + suporte"
          autocomplete="off"
          class="h-8"
          aria-label="Nome do conjunto"
          @keydown.enter.prevent="confirmarRenomear"
          @keydown.esc="renomeando = false"
          @blur="confirmarRenomear"
        />

        <div v-else class="flex flex-wrap items-center gap-2">
          <h3 class="min-w-0 text-sm font-medium leading-snug">{{ titulo }}</h3>
          <Badge v-if="agrupamento.escolhido" variant="secondary" class="shrink-0 gap-1">
            <StarIcon class="size-3" />
            Favorito
          </Badge>
          <Badge v-if="conjunto" variant="outline" class="shrink-0">
            {{ agrupamento.produtos.length }} itens juntos
          </Badge>
        </div>

        <p class="text-xs text-muted-foreground">
          <template v-if="soma !== null">
            <span class="font-semibold text-foreground">{{ formatarDinheiro(soma) }}</span>
            <template v-if="conjunto"> somando o conjunto</template>
          </template>
          <template v-else-if="semPreco && parcial > 0">
            {{ formatarDinheiro(parcial) }} até agora —
            {{ semPreco === 1 ? '1 item sem preço' : `${semPreco} itens sem preço` }}
          </template>
          <template v-else-if="agrupamento.produtos.length">
            sem preço ainda
          </template>
          <template v-else>
            nenhum produto aqui — adicione um ou apague este conjunto
          </template>
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-1">
        <Button
          v-if="podeEscolher && !agrupamento.escolhido"
          variant="outline"
          size="sm"
          class="gap-1.5"
          @click="emit('escolher')"
        >
          <CheckIcon class="size-3.5" />
          Escolher
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon" title="Mais opções do conjunto">
              <MoreVerticalIcon class="size-4" />
              <span class="sr-only">Mais opções do conjunto</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem class="gap-2" @select="emit('adicionarProduto')">
              <PlusIcon class="size-4" />
              Adicionar item ao conjunto
            </DropdownMenuItem>
            <DropdownMenuItem class="gap-2" @select="abrirRenomear">
              <PencilIcon class="size-4" />
              {{ agrupamento.nome ? 'Renomear conjunto' : 'Dar um nome' }}
            </DropdownMenuItem>
            <DropdownMenuItem class="gap-2 text-destructive" @select="emit('remover')">
              <Trash2Icon class="size-4" />
              Apagar o conjunto
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>

    <div v-if="agrupamento.produtos.length" class="space-y-2">
      <ProdutoDoInteresse
        v-for="produto in agrupamento.produtos"
        :key="produto.id"
        :produto="produto"
        @editar="emit('editarProduto', produto)"
        @remover="emit('removerProduto', produto)"
      />
    </div>

    <Button
      variant="ghost"
      size="sm"
      class="w-full justify-start gap-1.5 text-muted-foreground"
      @click="emit('adicionarProduto')"
    >
      <PlusIcon class="size-3.5" />
      Adicionar item que vem junto
    </Button>
  </section>
</template>
