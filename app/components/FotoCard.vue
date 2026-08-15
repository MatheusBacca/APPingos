<script setup lang="ts">
/**
 * Um quadrado da galeria: a prévia, o coração e em que pé a foto está.
 *
 * O coração fica SOBRE a mídia, e não numa barra embaixo, porque ele é a ação
 * principal do módulo inteiro e a galeria é rolada com o polegar — um alvo no
 * canto da imagem é alcançável sem mudar a pegada do celular.
 *
 * O card não sabe assinar URL nem contar membros: recebe os dois prontos. É o que
 * permite a galeria pedir as trinta assinaturas de uma vez, em vez de trinta
 * cards pedirem uma cada.
 */
import { HeartIcon, ImageOffIcon, PlayIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import type { Foto } from '~/types/foto'
import { euCurti, situacaoDaFoto, temPrevia } from '~/types/foto'

const props = defineProps<{
  foto: Foto
  /** Nula enquanto as assinaturas carregam, ou quando o arquivo sumiu do bucket. */
  url?: string | null
  euId: string | null
  totalDeMembros: number
  curtindo?: boolean
}>()

const emit = defineEmits<{ curtir: []; abrir: [] }>()

const curtida = computed(() => euCurti(props.foto, props.euId))
const situacao = computed(() => situacaoDaFoto(props.foto, props.totalDeMembros))
const podeMostrar = computed(() => !!props.url && temPrevia(props.foto.mime))

/**
 * "1 de 2" — quantos já curtiram, de quantos precisam.
 *
 * O denominador aparece mesmo quando é 1 (espaço pessoal) porque a fração é a
 * explicação do coração cheio ou vazio: sem ela, uma foto liberada e uma esperando
 * teriam o mesmo rótulo "1".
 */
const contagem = computed(() => `${props.foto.curtidas.length} de ${Math.max(props.totalDeMembros, 1)}`)
</script>

<template>
  <div class="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
    <button type="button" class="absolute inset-0 size-full" @click="emit('abrir')">
      <span class="sr-only">Abrir {{ foto.legenda || 'a foto' }}</span>

      <img
        v-if="podeMostrar && foto.tipo === 'imagem'"
        :src="url!"
        :alt="foto.legenda ?? ''"
        loading="lazy"
        class="size-full object-cover"
      >

      <!--
        O vídeo entra como <video> sem controles e sem autoplay: aqui ele é uma
        miniatura. Trinta vídeos tocando sozinhos ao rolar a galeria queimariam a
        franquia de dados de quem abriu no celular.
      -->
      <video
        v-else-if="podeMostrar"
        :src="url!"
        muted
        playsinline
        preload="metadata"
        class="size-full object-cover"
      />

      <span v-else class="grid size-full place-items-center text-muted-foreground">
        <ImageOffIcon class="size-6" />
      </span>
    </button>

    <span
      v-if="foto.tipo === 'video'"
      class="pointer-events-none absolute left-2 top-2 grid size-7 place-items-center rounded-full bg-black/50 text-white"
    >
      <PlayIcon class="size-3.5 fill-current" />
    </span>

    <Badge
      v-if="situacao === 'liberada'"
      class="pointer-events-none absolute right-2 top-2 bg-emerald-600 text-white hover:bg-emerald-600"
    >
      Pode postar
    </Badge>
    <Badge
      v-else-if="situacao === 'postada'"
      variant="secondary"
      class="pointer-events-none absolute right-2 top-2"
    >
      Postada
    </Badge>

    <!--
      A faixa de baixo é sempre desenhada, e não só no hover: no celular não há
      hover, e sem ela o coração não existiria justamente onde o módulo é usado.
    -->
    <div class="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent p-2">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-full bg-black/40 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
        :disabled="curtindo"
        :aria-pressed="curtida"
        @click.stop="emit('curtir')"
      >
        <HeartIcon class="size-4" :class="curtida ? 'fill-rose-500 text-rose-500' : ''" />
        <span>{{ contagem }}</span>
        <span class="sr-only">{{ curtida ? 'Descurtir' : 'Curtir' }}</span>
      </button>

      <p v-if="foto.legenda" class="min-w-0 flex-1 truncate text-xs text-white/90">
        {{ foto.legenda }}
      </p>
    </div>
  </div>
</template>
