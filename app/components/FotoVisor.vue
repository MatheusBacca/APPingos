<script setup lang="ts">
/**
 * A foto aberta: grande, com quem já curtiu e o que fazer com ela.
 *
 * É diálogo e não rota própria de propósito. O gesto do módulo é percorrer a
 * galeria decidindo uma a uma; uma rota por foto colocaria uma navegação (e um
 * carregamento) entre cada decisão e a seguinte, e o botão de voltar viraria parte
 * do fluxo normal de curtir cinco fotos.
 *
 * "Marcar como postada" só aparece depois da aprovação porque o banco recusa o
 * contrário (`foto_postada_depois_de_aprovada`) — e um botão que existe para
 * devolver erro é pior que um botão ausente.
 */
import { toast } from 'vue-sonner'
import { CircleCheckIcon, DownloadIcon, HeartIcon, ImageOffIcon, PencilIcon, Trash2Icon } from '@lucide/vue'
import { mensagemDeErro } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ehAdmin } from '~/types/database.types'
import type { Foto } from '~/types/foto'
import { euCurti, formatarTamanho, situacaoDaFoto, temPrevia } from '~/types/foto'
import type { Membro } from '~/composables/useMembros'
import { useAlternarCurtida, useApagarFoto, useAtualizarFoto, useBaixarFotos } from '~/composables/useFotos'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'

const props = defineProps<{
  foto: Foto | null
  url?: string | null
  membros: Membro[]
}>()

const aberto = defineModel<boolean>('aberto', { required: true })

const curtir = useAlternarCurtida()
const atualizar = useAtualizarFoto()
const apagar = useApagarFoto()
const { baixar, baixando } = useBaixarFotos()
const euId = useUsuarioId()
const store = useSpaceStore()

const curtida = computed(() => (props.foto ? euCurti(props.foto, euId.value) : false))
const situacao = computed(() =>
  props.foto ? situacaoDaFoto(props.foto, props.membros.length) : 'esperando',
)
const podeMostrar = computed(() => !!props.url && !!props.foto && temPrevia(props.foto.mime))

/** Apagar é de quem mandou ou do admin — o mesmo que a policy `foto_delete` diz. */
const podeApagar = computed(() =>
  !!props.foto
  && (props.foto.enviada_por === euId.value || ehAdmin(store.espacoAtivo?.papel)),
)

/** Quem já curtiu e quem falta, por nome — é a resposta a "estamos esperando quem?". */
const curtiram = computed(() => {
  if (!props.foto) return { sim: [] as string[], nao: [] as string[] }

  const ids = new Set(props.foto.curtidas.map(c => c.user_id))
  return {
    sim: props.membros.filter(m => ids.has(m.user_id)).map(m => m.exibicao),
    nao: props.membros.filter(m => !ids.has(m.user_id)).map(m => m.exibicao),
  }
})

const editandoLegenda = ref(false)
const legenda = ref('')

watch(() => props.foto, (foto) => {
  editandoLegenda.value = false
  legenda.value = foto?.legenda ?? ''
}, { immediate: true })

async function alternar() {
  if (!props.foto || curtir.isPending.value) return

  try {
    await curtir.mutateAsync(props.foto.id)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para registrar a curtida.'))
  }
}

async function salvarLegenda() {
  if (!props.foto) return

  try {
    await atualizar.mutateAsync({ id: props.foto.id, legenda: legenda.value.trim() || null })
    editandoLegenda.value = false
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para salvar a legenda.'))
  }
}

async function alternarPostada() {
  if (!props.foto) return

  const jaPostada = !!props.foto.postada_em

  try {
    await atualizar.mutateAsync({
      id: props.foto.id,
      postada_em: jaPostada ? null : new Date().toISOString(),
    })
    toast.success(jaPostada ? 'Voltou para a fila.' : 'Marcada como postada.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para marcar.'))
  }
}

/** O arquivo original, sem passar por nenhuma redução — ver `useBaixarFotos`. */
async function baixarEsta() {
  if (!props.foto) return

  const { falhas } = await baixar([props.foto])
  if (falhas) toast.error('Não deu para baixar.')
}

async function remover() {
  if (!props.foto) return

  try {
    await apagar.mutateAsync(props.foto)
    toast.success('Apagada.')
    aberto.value = false
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para apagar.'))
  }
}
</script>

<template>
  <Dialog v-model:open="aberto">
    <DialogContent v-if="foto" class="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ foto.legenda || (foto.tipo === 'video' ? 'Vídeo' : 'Foto') }}</DialogTitle>
        <DialogDescription>
          <template v-if="situacao === 'postada'">Já foi postada.</template>
          <template v-else-if="situacao === 'liberada'">Vocês dois curtiram — pode postar.</template>
          <template v-else-if="curtiram.nao.length">
            Esperando {{ curtiram.nao.join(', ') }}.
          </template>
          <template v-else>Esperando a curtida que falta.</template>
        </DialogDescription>
      </DialogHeader>

      <div class="overflow-hidden rounded-lg border bg-muted">
        <img
          v-if="podeMostrar && foto.tipo === 'imagem'"
          :src="url!"
          :alt="foto.legenda ?? ''"
          class="max-h-[60vh] w-full object-contain"
        >
        <!-- Com controles aqui, ao contrário do card: este é o lugar de assistir. -->
        <video
          v-else-if="podeMostrar"
          :src="url!"
          controls
          playsinline
          class="max-h-[60vh] w-full object-contain"
        />
        <div v-else class="grid h-48 place-items-center gap-2 text-center text-sm text-muted-foreground">
          <ImageOffIcon class="mx-auto size-6" />
          <p>
            Prévia indisponível neste navegador.<br>
            O arquivo está guardado do mesmo jeito.
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          :variant="curtida ? 'default' : 'outline'"
          class="gap-1.5"
          :disabled="curtir.isPending.value"
          @click="alternar"
        >
          <HeartIcon class="size-4" :class="curtida ? 'fill-current' : ''" />
          {{ curtida ? 'Curtido' : 'Curtir' }}
        </Button>

        <Button
          v-if="situacao !== 'esperando'"
          type="button"
          variant="outline"
          class="gap-1.5"
          :disabled="atualizar.isPending.value"
          @click="alternarPostada"
        >
          <CircleCheckIcon class="size-4" />
          {{ foto.postada_em ? 'Não postei ainda' : 'Já postei' }}
        </Button>

        <Button
          type="button"
          variant="outline"
          class="gap-1.5"
          :disabled="baixando"
          @click="baixarEsta"
        >
          <DownloadIcon class="size-4" />
          {{ baixando ? 'Baixando…' : 'Baixar' }}
        </Button>

        <Button
          v-if="!editandoLegenda"
          type="button"
          variant="ghost"
          class="gap-1.5"
          @click="editandoLegenda = true"
        >
          <PencilIcon class="size-4" />
          Legenda
        </Button>

        <Button
          v-if="podeApagar"
          type="button"
          variant="ghost"
          class="ml-auto gap-1.5 text-destructive hover:text-destructive"
          :disabled="apagar.isPending.value"
          @click="remover"
        >
          <Trash2Icon class="size-4" />
          Apagar
        </Button>
      </div>

      <form v-if="editandoLegenda" class="flex gap-2" @submit.prevent="salvarLegenda">
        <Input v-model="legenda" placeholder="praia, domingo de manhã" autocomplete="off" />
        <Button type="submit" :disabled="atualizar.isPending.value">Salvar</Button>
      </form>

      <div class="space-y-1 text-xs text-muted-foreground">
        <p v-if="curtiram.sim.length">Curtiram: {{ curtiram.sim.join(', ') }}</p>
        <p>{{ formatarTamanho(foto.tamanho) }}</p>
      </div>
    </DialogContent>
  </Dialog>
</template>
