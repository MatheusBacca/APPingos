<script setup lang="ts">
/**
 * Um produto candidato dentro de um interesse.
 *
 * Os três preços aparecem juntos porque é a comparação que a loja não faz: ela
 * anuncia "12x de R$ 219,90" ao lado de "R$ 2.399,00" e deixa a soma para quem
 * está comprando. Aqui o total do parcelado é calculado e mostrado, e quando ele
 * passa do preço à vista o card diz quanto isso custa a mais.
 *
 * A imagem é `imagem_url` da loja, carregada de fora. Ela falha com o tempo — link
 * de CDN de e-commerce não é estável — então o `@error` troca por um placeholder
 * em vez de deixar o ícone de imagem quebrada.
 */
import { ExternalLinkIcon, ImageIcon, StarIcon, Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatarDinheiro } from '@/lib/dinheiro'
import { precoEfetivo, totalParcelado } from '~/types/interesse'
import type { InteresseProduto } from '~/types/interesse'

const props = defineProps<{ produto: InteresseProduto, podeEscolher: boolean }>()

const emit = defineEmits<{ escolher: [], remover: [] }>()

const imagemQuebrada = ref(false)

const efetivo = computed(() => precoEfetivo(props.produto))
const parcelado = computed(() => totalParcelado(props.produto))

/**
 * Quanto o parcelamento cobra além do preço à vista.
 *
 * `null` quando não há os dois para comparar, ou quando o parcelado não é maior —
 * "sem juros" de verdade existe, e mostrar "R$ 0,00 a mais" seria ruído.
 */
const jurosDoParcelado = computed(() => {
  if (parcelado.value === null || efetivo.value === null) return null
  const diferenca = parcelado.value - efetivo.value
  return diferenca > 0.01 ? diferenca : null
})
</script>

<template>
  <article
    class="flex gap-3 rounded-lg border bg-card p-3"
    :class="produto.escolhido ? 'border-primary/50' : ''"
  >
    <div class="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
      <img
        v-if="produto.imagem_url && !imagemQuebrada"
        :src="produto.imagem_url"
        :alt="produto.nome"
        class="size-full object-cover"
        loading="lazy"
        referrerpolicy="no-referrer"
        @error="imagemQuebrada = true"
      >
      <ImageIcon v-else class="size-5 text-muted-foreground" />
    </div>

    <div class="min-w-0 flex-1 space-y-1">
      <div class="flex flex-wrap items-start gap-2">
        <p class="min-w-0 flex-1 text-sm font-medium leading-snug">{{ produto.nome }}</p>
        <Badge v-if="produto.escolhido" variant="secondary" class="shrink-0 gap-1">
          <StarIcon class="size-3" />
          Escolhido
        </Badge>
      </div>

      <p v-if="produto.loja" class="text-xs text-muted-foreground">{{ produto.loja }}</p>

      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-0.5 text-sm">
        <span v-if="produto.preco_pix" class="font-semibold">
          {{ formatarDinheiro(produto.preco_pix) }}
          <span class="text-xs font-normal text-muted-foreground">no Pix</span>
        </span>

        <span
          v-if="produto.preco"
          :class="produto.preco_pix ? 'text-xs text-muted-foreground line-through' : 'font-semibold'"
        >
          {{ formatarDinheiro(produto.preco) }}
        </span>

        <span v-if="produto.parcelas && produto.valor_parcela" class="text-xs text-muted-foreground">
          {{ produto.parcelas }}× {{ formatarDinheiro(produto.valor_parcela) }}
          <template v-if="parcelado !== null">
            = {{ formatarDinheiro(parcelado) }}
            <template v-if="jurosDoParcelado !== null">
              ({{ formatarDinheiro(jurosDoParcelado) }} a mais)
            </template>
          </template>
        </span>

        <span v-if="efetivo === null" class="text-xs text-muted-foreground">sem preço ainda</span>
      </div>
    </div>

    <div class="flex shrink-0 flex-col gap-1">
      <Button as-child variant="ghost" size="icon" title="Abrir na loja">
        <a :href="produto.url" target="_blank" rel="noopener noreferrer">
          <ExternalLinkIcon class="size-4" />
          <span class="sr-only">Abrir na loja</span>
        </a>
      </Button>

      <Button
        v-if="podeEscolher && !produto.escolhido"
        variant="ghost"
        size="icon"
        title="Marcar como escolhido"
        @click="emit('escolher')"
      >
        <StarIcon class="size-4" />
        <span class="sr-only">Marcar como escolhido</span>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        class="text-muted-foreground hover:text-destructive"
        title="Remover produto"
        @click="emit('remover')"
      >
        <Trash2Icon class="size-4" />
        <span class="sr-only">Remover produto</span>
      </Button>
    </div>
  </article>
</template>
