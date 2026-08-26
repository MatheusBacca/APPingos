<script setup lang="ts">
/**
 * De onde vem uma foto da memória: do mural, ou do celular agora.
 *
 * As duas abas gravam a MESMA coisa — uma linha em `foto` e um `memoria_item`
 * apontando para ela. A aba "Enviar" não é um caminho paralelo: ela reusa
 * `useEnviarFotos()` inteiro, o mesmo bucket, a mesma convenção de caminho e as
 * mesmas policies de Storage. A consequência é deliberada: a foto mandada aqui
 * entra no mural também. É o comportamento honesto, e evita um segundo lugar de
 * onde fotos somem.
 *
 * Só imagens com prévia entram na lista. Vídeo não se imprime, e HEIC — que é o
 * que o iPhone grava por padrão — não renderiza em `<img>` na maioria dos
 * navegadores: no papel ele sairia como um retângulo cinza, o que é pior do que
 * não estar lá.
 *
 * O que ele emite é o item SEM seção: quem sabe onde a foto cai é a página que
 * abriu o diálogo.
 */
import { toast } from 'vue-sonner'
import { CheckIcon, ImageOffIcon, UploadIcon, XIcon } from '@lucide/vue'
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
import { MIMES_ACEITOS, motivoParaRecusar, temPrevia } from '~/types/foto'
import type { Foto } from '~/types/foto'
import type { ItemAnexavel } from '~/composables/useMemoria'
import { useEnviarFotos, useFotos, useUrlsDasFotos } from '~/composables/useFotos'

const aberto = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{ escolher: [itens: ItemAnexavel[]] }>()

const { data: fotos, isPending } = useFotos()
const enviar = useEnviarFotos()

const doMural = computed(() =>
  (fotos.value ?? []).filter(f => f.tipo === 'imagem' && temPrevia(f.mime)),
)

const { data: urls } = useUrlsDasFotos(doMural)

type Aba = 'mural' | 'enviar'
const aba = ref<Aba>('mural')

const marcadas = ref<string[]>([])

function alternar(id: string) {
  marcadas.value = marcadas.value.includes(id)
    ? marcadas.value.filter(m => m !== id)
    : [...marcadas.value, id]
}

function itemDaFoto(foto: Pick<Foto, 'id' | 'caminho' | 'legenda'>): ItemAnexavel {
  return {
    tipo: 'foto',
    foto_id: foto.id,
    // O `caminho` vai gravado ao lado do id de propósito: `foto_id` é
    // `on delete set null`, e é o caminho que sustenta o documento depois que a
    // linha do mural sumir.
    caminho: foto.caminho,
    playlist_id: null,
    spotify_id: null,
    titulo: null,
    subtitulo: null,
    capa_url: null,
    url_spotify: null,
    legenda: foto.legenda ?? null,
  }
}

function confirmarDoMural() {
  const escolhidas = doMural.value.filter(f => marcadas.value.includes(f.id))
  if (!escolhidas.length) return

  emit('escolher', escolhidas.map(itemDaFoto))
  aberto.value = false
}

// ---- A aba de envio --------------------------------------------------------

interface Escolhido {
  arquivo: File
  /** `URL.createObjectURL` do próprio arquivo — prévia local, sem passar pela rede. */
  previa: string
}

const escolhidos = ref<Escolhido[]>([])
const entrada = useTemplateRef<HTMLInputElement>('entrada')

const aceitos = MIMES_ACEITOS.filter(m => m.startsWith('image/')).join(',')

/*
 * Solta as URLs de prévia ao limpar — `createObjectURL` prende o arquivo na
 * memória da aba até alguém revogar, e o navegador não avisa. Mesma lição de
 * `FotoEnvio.vue`.
 */
function limpar() {
  for (const e of escolhidos.value) URL.revokeObjectURL(e.previa)
  escolhidos.value = []
  marcadas.value = []
  if (entrada.value) entrada.value.value = ''
}

watch(aberto, (estaAberto) => {
  if (!estaAberto) limpar()
})

onBeforeUnmount(limpar)

/** Tira um arquivo da lista e solta a prévia dele — `URL` não existe no template. */
function descartar(i: number) {
  const [fora] = escolhidos.value.splice(i, 1)
  if (fora) URL.revokeObjectURL(fora.previa)
}

function aoEscolher(evento: Event) {
  const lista = (evento.target as HTMLInputElement).files
  if (!lista) return

  const recusados: string[] = []

  for (const arquivo of Array.from(lista)) {
    const motivo = motivoParaRecusar(arquivo)
    if (motivo) {
      recusados.push(motivo)
      continue
    }
    if (!arquivo.type.startsWith('image/') || !temPrevia(arquivo.type)) {
      recusados.push(`${arquivo.name}: não dá para imprimir esse formato`)
      continue
    }

    escolhidos.value.push({ arquivo, previa: URL.createObjectURL(arquivo) })
  }

  if (recusados.length) toast.error(recusados.join('\n'))
}

async function enviarEAnexar() {
  if (!escolhidos.value.length) return

  try {
    const resultado = await enviar.mutateAsync(
      escolhidos.value.map(e => ({ arquivo: e.arquivo })),
    )

    if (resultado.falhas.length) toast.error(resultado.falhas.join('\n'))
    if (!resultado.criadas.length) return

    emit('escolher', resultado.criadas.map(f => itemDaFoto({ ...f, legenda: null })))
    aberto.value = false
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para enviar as fotos.'))
  }
}
</script>

<template>
  <Dialog v-model:open="aberto">
    <DialogContent class="max-h-[85dvh] gap-3 overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Fotos desta parte</DialogTitle>
        <DialogDescription>
          Do mural de vocês, ou direto do celular — o que subir aqui entra no mural também.
        </DialogDescription>
      </DialogHeader>

      <!-- Duas abas à mão: o projeto não tem o componente de abas do shadcn. -->
      <div class="flex gap-1 rounded-lg bg-muted p-1 text-sm">
        <button
          v-for="opcao in ([['mural', 'Do mural'], ['enviar', 'Enviar']] as [Aba, string][])"
          :key="opcao[0]"
          type="button"
          class="flex-1 rounded-md px-3 py-1.5 font-medium transition-colors"
          :class="aba === opcao[0] ? 'bg-background shadow-sm' : 'text-muted-foreground'"
          @click="aba = opcao[0]"
        >
          {{ opcao[1] }}
        </button>
      </div>

      <template v-if="aba === 'mural'">
        <p v-if="isPending" class="py-8 text-center text-sm text-muted-foreground">
          Carregando o mural…
        </p>

        <div v-else-if="!doMural.length" class="rounded-lg border border-dashed px-4 py-10 text-center">
          <ImageOffIcon class="mx-auto size-6 text-muted-foreground" />
          <p class="mt-2 text-sm font-medium">Nenhuma foto no mural ainda.</p>
          <p class="mt-1 text-sm text-muted-foreground">
            Mande pela aba ao lado — ela entra aqui e no mural de vocês.
          </p>
        </div>

        <div v-else class="grid grid-cols-3 gap-2 sm:grid-cols-4">
          <button
            v-for="foto in doMural"
            :key="foto.id"
            type="button"
            class="relative aspect-square overflow-hidden rounded-md border-2 transition-colors"
            :class="marcadas.includes(foto.id) ? 'border-primary' : 'border-transparent'"
            :aria-pressed="marcadas.includes(foto.id)"
            @click="alternar(foto.id)"
          >
            <img
              v-if="urls?.get(foto.caminho)"
              :src="urls.get(foto.caminho)"
              :alt="foto.legenda ?? ''"
              loading="lazy"
              class="size-full object-cover"
            >
            <span v-else class="grid size-full place-items-center bg-muted text-muted-foreground">
              <ImageOffIcon class="size-5" />
            </span>

            <span
              v-if="marcadas.includes(foto.id)"
              class="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground"
            >
              <CheckIcon class="size-3" />
            </span>
          </button>
        </div>

        <DialogFooter>
          <Button variant="ghost" @click="aberto = false">Cancelar</Button>
          <Button :disabled="!marcadas.length" @click="confirmarDoMural">
            Anexar {{ marcadas.length || '' }}
          </Button>
        </DialogFooter>
      </template>

      <template v-else>
        <input
          ref="entrada"
          type="file"
          multiple
          :accept="aceitos"
          class="hidden"
          @change="aoEscolher"
        >

        <button
          type="button"
          class="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
          @click="entrada?.click()"
        >
          <UploadIcon class="size-5" />
          Escolher fotos do aparelho
        </button>

        <div v-if="escolhidos.length" class="grid grid-cols-3 gap-2 sm:grid-cols-4">
          <div v-for="(item, i) in escolhidos" :key="item.previa" class="relative">
            <img :src="item.previa" alt="" class="aspect-square w-full rounded-md border object-cover">
            <button
              type="button"
              class="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-background text-muted-foreground shadow ring-1 ring-border"
              :aria-label="`Tirar ${item.arquivo.name} da lista`"
              @click="descartar(i)"
            >
              <XIcon class="size-3" />
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" @click="aberto = false">Cancelar</Button>
          <Button
            :disabled="!escolhidos.length || enviar.isPending.value"
            @click="enviarEAnexar"
          >
            {{ enviar.isPending.value ? 'Enviando…' : `Enviar ${escolhidos.length || ''}` }}
          </Button>
        </DialogFooter>
      </template>
    </DialogContent>
  </Dialog>
</template>
