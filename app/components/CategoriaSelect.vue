<script setup lang="ts">
/**
 * Campo de categoria: digita, reaproveita ou cria.
 *
 * A regra que importa é a de reaproveitamento — "Mercado", "mercado" e
 * "MERCADO" são a mesma categoria, tanto escolhendo da lista quanto só
 * digitando e apertando Enter. O banco garante isso por índice único sobre
 * `nome_norm`; aqui a normalização serve só para a tela não oferecer um
 * "criar" que na verdade seria um reaproveitamento.
 */
import { CheckIcon, TagIcon } from '@lucide/vue'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { CORES_CATEGORIA } from '~/types/database.types'
import type { CorCategoria } from '~/types/database.types'
import { CLASSE_COR, ROTULO_COR, normalizarCategoria } from '~/types/orcamento'
import type { Categoria } from '~/types/orcamento'

const props = defineProps<{
  categorias: Categoria[]
  id?: string
}>()

const nome = defineModel<string>('nome', { required: true })
const cor = defineModel<CorCategoria>('cor', { required: true })

const aberto = ref(false)

/** A categoria existente que o texto digitado já representa, se houver. */
const existente = computed<Categoria | null>(() => {
  const alvo = normalizarCategoria(nome.value)
  if (!alvo) return null
  return props.categorias.find(c => normalizarCategoria(c.nome) === alvo) ?? null
})

const sugestoes = computed(() => {
  const alvo = normalizarCategoria(nome.value)
  const lista = alvo
    ? props.categorias.filter(c => normalizarCategoria(c.nome).includes(alvo))
    : props.categorias
  return lista.slice(0, 6)
})

/**
 * Cor de uma categoria nova. Derivada do nome para ser estável entre sessões —
 * sortear a cada digitação faria a mesma categoria piscar de cor antes de ser
 * salva. A pessoa pode trocar depois.
 */
function corSugerida(texto: string): CorCategoria {
  const alvo = normalizarCategoria(texto)
  let soma = 0
  for (let i = 0; i < alvo.length; i++) soma = (soma + alvo.charCodeAt(i)) % 9973
  return CORES_CATEGORIA[soma % CORES_CATEGORIA.length]!
}

/*
 * Uma categoria existente manda na própria cor: se o texto passa a apontar para
 * ela, a cor do formulário acompanha, senão a tela mostraria a tag de "Mercado"
 * em azul enquanto no resto do app ela é verde.
 */
const corTravada = ref(false)

watch([nome, existente], () => {
  if (existente.value) {
    cor.value = existente.value.cor
    corTravada.value = false
  }
  else if (!corTravada.value) {
    cor.value = corSugerida(nome.value)
  }
})

function escolher(categoria: Categoria) {
  nome.value = categoria.nome
  cor.value = categoria.cor
  corTravada.value = false
  aberto.value = false
}

function escolherCor(nova: CorCategoria) {
  cor.value = nova
  // Só marca como travada para categoria nova — numa existente, a cor é dela.
  corTravada.value = !existente.value
}

/**
 * Enter fecha a lista e adota o nome já gravado quando ele existe, para o campo
 * mostrar "Mercado" mesmo que a pessoa tenha digitado "mercado".
 */
function aoPressionarEnter(e: KeyboardEvent) {
  if (!aberto.value || !sugestoes.value.length) return
  e.preventDefault()
  const exata = existente.value ?? sugestoes.value[0]
  if (exata) escolher(exata)
  else aberto.value = false
}
</script>

<template>
  <div class="relative">
    <div class="flex gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button
            type="button"
            class="grid size-9 shrink-0 place-items-center rounded-md border transition-colors"
            :class="CLASSE_COR[cor]"
            :aria-label="`Cor da categoria: ${ROTULO_COR[cor]}`"
          >
            <TagIcon class="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            v-for="opcao in CORES_CATEGORIA"
            :key="opcao"
            class="gap-2"
            @select="escolherCor(opcao)"
          >
            <span class="size-4 rounded" :class="CLASSE_COR[opcao]" />
            <span class="flex-1">{{ ROTULO_COR[opcao] }}</span>
            <CheckIcon v-if="opcao === cor" class="size-4 text-primary" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Input
        :id="props.id"
        v-model="nome"
        placeholder="Mercado, Farmácia, Lazer…"
        autocomplete="off"
        @focus="aberto = true"
        @blur="aberto = false"
        @keydown.enter="aoPressionarEnter"
      />
    </div>

    <!--
      `mousedown.prevent` em vez de `click`: o blur do input dispara antes do
      click e fecharia a lista, engolindo a escolha.
    -->
    <ul
      v-if="aberto && sugestoes.length"
      class="absolute inset-x-0 top-11 z-20 overflow-hidden rounded-md border bg-popover p-1 shadow-md"
    >
      <li v-for="categoria in sugestoes" :key="categoria.id">
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
          @mousedown.prevent="escolher(categoria)"
        >
          <span class="size-3 rounded-full" :class="CLASSE_COR[categoria.cor]" />
          {{ categoria.nome }}
        </button>
      </li>
    </ul>

    <p v-if="nome.trim() && !existente" class="mt-1 text-xs text-muted-foreground">
      Vai criar a categoria "{{ nome.trim() }}".
    </p>
  </div>
</template>
