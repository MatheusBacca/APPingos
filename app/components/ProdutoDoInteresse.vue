<script setup lang="ts">
/**
 * Um produto dentro de um agrupamento.
 *
 * Os três preços aparecem juntos porque é a comparação que a loja não faz: ela
 * anuncia "12x de R$ 219,90" ao lado de "R$ 2.399,00" e deixa a soma para quem
 * está comprando. Aqui o total do parcelado é calculado e mostrado, e quando ele
 * passa do preço à vista o card diz quanto isso custa a mais.
 *
 * O card inteiro é clicável e abre a edição — é o caminho de corrigir o que a
 * raspagem leu errado, que é frequente o bastante para não merecer um botão
 * escondido. O link para a loja e o botão de remover são `<a>`/`<button>` de
 * verdade por cima, e param a propagação: clicar em "abrir na loja" não pode abrir
 * o modal por baixo da aba nova.
 *
 * A imagem é `imagem_url` da loja, carregada de fora. Ela falha com o tempo — link
 * de CDN de e-commerce não é estável — então o `@error` troca por um placeholder
 * em vez de deixar o ícone de imagem quebrada.
 */
import { ExternalLinkIcon, ImageIcon, Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { formatarDia, tempoRelativo } from '@/lib/datas'
import { formatarDinheiro } from '@/lib/dinheiro'
import { FALHAS_ATE_AVISAR, precoEfetivo, totalParcelado } from '~/types/interesse'
import type { InteresseProduto } from '~/types/interesse'

const props = defineProps<{ produto: InteresseProduto }>()

const emit = defineEmits<{ editar: [], remover: [] }>()

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

/**
 * Há quanto tempo o preço foi conferido pela última vez.
 *
 * Sem isto o número na tela não distingue "custa isso" de "custava isso em
 * agosto" — e a diferença é tudo, na hora de decidir. `capturado_em` serve de
 * base quando nunca houve rechecagem: a captura também foi uma leitura.
 *
 * `tempoRelativo` devolve `null` acima de uma semana, e aí a data absoluta é mais
 * útil: "há 43 dias" é pior que "12 de agosto" para julgar se ainda vale.
 */
const verificado = computed(() => {
  const quando = props.produto.verificado_em ?? props.produto.capturado_em
  return tempoRelativo(quando) ?? `em ${formatarDia(quando.slice(0, 10))}`
})

/**
 * A loja parou de deixar ler.
 *
 * Só depois de algumas tentativas seguidas: uma falha isolada é rede instável ou
 * a loja de mau humor, e avisar sobre isso seria ruído a cada rechecagem.
 */
const lojaBloqueando = computed(() => props.produto.falhas_seguidas >= FALHAS_ATE_AVISAR)
</script>

<template>
  <!--
    `role="button"` num `<article>` em vez de um `<button>` envolvendo tudo: um
    botão não pode conter link nem outro botão, e aqui há os dois dentro.
  -->
  <article
    class="flex cursor-pointer gap-3 rounded-lg border bg-card p-3 text-left hover:border-primary/40"
    role="button"
    tabindex="0"
    :aria-label="`Editar ${produto.nome}`"
    @click="emit('editar')"
    @keydown.enter.prevent="emit('editar')"
    @keydown.space.prevent="emit('editar')"
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
      <p class="text-sm font-medium leading-snug">{{ produto.nome }}</p>

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

      <p class="text-xs text-muted-foreground">
        <template v-if="lojaBloqueando">
          A loja não está deixando reler o preço — o valor acima é de {{ verificado }}.
        </template>
        <template v-else>
          Preço verificado {{ verificado }}.
        </template>
      </p>
    </div>

    <div class="flex shrink-0 flex-col gap-1">
      <Button as-child variant="ghost" size="icon" title="Abrir na loja">
        <a
          :href="produto.url"
          target="_blank"
          rel="noopener noreferrer"
          @click.stop
        >
          <ExternalLinkIcon class="size-4" />
          <span class="sr-only">Abrir na loja</span>
        </a>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        class="text-muted-foreground hover:text-destructive"
        title="Remover produto"
        @click.stop="emit('remover')"
      >
        <Trash2Icon class="size-4" />
        <span class="sr-only">Remover produto</span>
      </Button>
    </div>
  </article>
</template>
