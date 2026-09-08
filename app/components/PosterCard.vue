<script setup lang="ts">
import { fundoDaCapa } from '@/lib/capa'

/**
 * `proporcao` porque cartaz de filme é 2:3 e capa de disco é quadrada —
 * forçar a capa do álbum no formato retrato a cortaria pelas beiradas.
 */
const props = withDefaults(defineProps<{
  titulo: string
  ano?: number | null
  capaUrl?: string | null
  legenda?: string | null
  proporcao?: 'cartaz' | 'quadrada'
}>(), {
  proporcao: 'cartaz',
})

/*
 * Sem imagem, o cartão compõe uma capa com o próprio título — ver app/lib/capa.ts.
 *
 * O `ref` de erro cobre o caso que o `v-if` sozinho não cobre: a URL existe, a
 * tela desenha a imagem, e ela falha ao carregar (capa removida da origem, rede
 * caindo no meio). Sem isto sobra um retângulo vazio, que é pior que a capa
 * composta — e é um estado que só aparece depois do primeiro render.
 */
const falhou = ref(false)

watch(() => props.capaUrl, () => { falhou.value = false })

const temImagem = computed(() => !!props.capaUrl && !falhou.value)

/*
 * A cor sai do título MAIS a legenda, e não só do título.
 *
 * Uma busca por "O Caibalion" devolve três livros diferentes com esse mesmo
 * nome, de autores diferentes — só o título faria os três saírem da mesma cor,
 * que é o oposto do que a capa composta serve para fazer. A legenda (o autor,
 * em Livros) é o que os separa.
 */
const semente = computed(() => `${props.titulo}${props.legenda ?? ''}`)
</script>

<template>
  <div class="group">
    <div
      class="relative overflow-hidden rounded-lg border bg-muted"
      :class="props.proporcao === 'quadrada' ? 'aspect-square' : 'aspect-[2/3]'"
    >
      <img
        v-if="temImagem"
        :src="props.capaUrl!"
        :alt="`Capa de ${props.titulo}`"
        loading="lazy"
        class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        @error="falhou = true"
      >

      <!--
        A capa composta. `aria-hidden` porque o título já é lido logo abaixo do
        cartão: sem isto o leitor de tela anuncia o mesmo texto duas vezes
        seguidas, uma como capa e outra como legenda.
      -->
      <div
        v-else
        class="flex size-full flex-col justify-between p-3 text-white"
        :style="{ background: fundoDaCapa(semente) }"
        aria-hidden="true"
      >
        <p class="line-clamp-4 font-display text-sm font-semibold leading-tight tracking-tight">
          {{ props.titulo }}
        </p>
        <p v-if="props.legenda" class="line-clamp-2 text-[10px] leading-tight text-white/75">
          {{ props.legenda }}
        </p>
      </div>

      <slot name="overlay" />

      <div v-if="$slots.rodape" class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 pt-6">
        <slot name="rodape" />
      </div>
    </div>

    <p class="mt-2 line-clamp-2 text-sm font-medium leading-snug">
      {{ props.titulo }}
    </p>
    <p v-if="props.ano || props.legenda" class="text-xs text-muted-foreground">
      {{ [props.ano, props.legenda].filter(Boolean).join(' · ') }}
    </p>
  </div>
</template>
