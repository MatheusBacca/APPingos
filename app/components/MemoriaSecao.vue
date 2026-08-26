<script setup lang="ts">
/**
 * Uma seção da memória, em modo de edição.
 *
 * O componente é BURRO de propósito: não salva, não gera id, não conhece o
 * banco. Ele recebe a seção e os itens dela e emite o que mudou — quem junta
 * isso num rascunho e o manda para `salvar_secoes` com atraso é a página, no
 * mesmo desenho da edição de paradas (`app/pages/viagens/[id]/index.vue`).
 *
 * É o que permite a página comparar o rascunho inteiro com o que de fato foi
 * gravado, em vez de cada seção manter a própria bandeira de "sujo" — o desenho
 * com bandeira perde a mexida que acontece enquanto o salvamento anterior está
 * no ar, sem erro nenhum na tela.
 */
import { ImagePlusIcon, ListMusicIcon, MusicIcon, SplitIcon, Trash2Icon, XIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { rotuloDaData } from '~/lib/memoria'
import type { ItemDaMemoria, SecaoDaMemoria } from '~/lib/memoria'

const props = defineProps<{
  secao: SecaoDaMemoria
  itens: ItemDaMemoria[]
  /** `caminho` no bucket → URL assinada. */
  urls?: Map<string, string>
}>()

const emit = defineEmits<{
  atualizar: [campos: Partial<SecaoDaMemoria>]
  remover: []
  anexarFoto: []
  anexarMusica: []
  removerItem: [id: string]
}>()

/**
 * O que o campo de título mostra quando ele está vazio.
 *
 * Com data, o placeholder NÃO repete a data: ela já está no rótulo logo acima, e
 * repetir os dois faz o campo parecer preenchido quando está vazio. O que o
 * placeholder diz ali é que o título é opcional — sem ele, o rótulo continua
 * derivando da data, que é o comportamento de `rotuloDaSecao`.
 *
 * Sem data não há rótulo nenhum acima, e o campo passa a ser a única coisa que
 * nomeia a seção.
 */
const sugestao = computed(() =>
  props.secao.data ? 'Um nome para este dia (opcional)' : 'Um título para esta parte',
)

const fotos = computed(() => props.itens.filter(i => i.tipo === 'foto'))
const musicas = computed(() => props.itens.filter(i => i.tipo !== 'foto'))
</script>

<template>
  <section class="rounded-xl border bg-card p-3 sm:p-4">
    <div class="flex items-start gap-2">
      <div class="min-w-0 flex-1">
        <p v-if="secao.data" class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {{ rotuloDaData(secao.data) }}
        </p>
        <Input
          :model-value="secao.titulo ?? ''"
          :placeholder="sugestao"
          class="mt-1 border-0 px-0 text-base font-medium shadow-none focus-visible:ring-0"
          @update:model-value="emit('atualizar', { titulo: String($event) || null })"
        />
      </div>

      <div class="flex shrink-0 gap-1">
        <!--
          A válvula manual da paginação. Marcada, esta seção abre uma folha nova
          no PDF — a estimativa de altura não sabe que aquela foto é A foto do
          documento, e este botão é como se diz isso a ela.
        -->
        <Button
          variant="ghost"
          size="icon"
          class="size-8"
          :class="secao.nova_folha ? 'text-primary' : 'text-muted-foreground'"
          :aria-pressed="secao.nova_folha"
          :title="secao.nova_folha ? 'Começa em uma folha nova' : 'Começar em uma folha nova'"
          @click="emit('atualizar', { nova_folha: !secao.nova_folha })"
        >
          <SplitIcon class="size-4 rotate-90" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          class="size-8 text-muted-foreground hover:text-destructive"
          title="Apagar esta parte"
          @click="emit('remover')"
        >
          <Trash2Icon class="size-4" />
        </Button>
      </div>
    </div>

    <Textarea
      :model-value="secao.texto ?? ''"
      placeholder="O que aconteceu, o que vocês comeram, o que deu errado e virou história…"
      class="mt-2 min-h-28 resize-y"
      @update:model-value="emit('atualizar', { texto: String($event) || null })"
    />

    <!-- As fotos anexadas a esta parte. -->
    <div v-if="fotos.length" class="mt-3 flex flex-wrap gap-2">
      <div v-for="foto in fotos" :key="foto.id" class="group relative">
        <img
          v-if="foto.caminho && urls?.get(foto.caminho)"
          :src="urls.get(foto.caminho)"
          :alt="foto.legenda ?? ''"
          class="size-20 rounded-md border object-cover"
        >
        <div v-else class="grid size-20 place-items-center rounded-md border bg-muted text-muted-foreground">
          <ImagePlusIcon class="size-4" />
        </div>

        <button
          type="button"
          class="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-background text-muted-foreground shadow ring-1 ring-border transition-colors hover:bg-destructive hover:text-destructive-foreground"
          :aria-label="`Tirar esta foto de ${secao.titulo || 'esta parte'}`"
          @click="emit('removerItem', foto.id)"
        >
          <XIcon class="size-3" />
        </button>
      </div>
    </div>

    <!-- As músicas e playlists. -->
    <ul v-if="musicas.length" class="mt-3 space-y-1.5">
      <li
        v-for="musica in musicas"
        :key="musica.id"
        class="flex items-center gap-2 rounded-md border bg-background/60 p-1.5"
      >
        <img v-if="musica.capa_url" :src="musica.capa_url" alt="" class="size-9 rounded object-cover">
        <span v-else class="grid size-9 place-items-center rounded bg-muted text-muted-foreground">
          <MusicIcon class="size-4" />
        </span>

        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium">{{ musica.titulo }}</span>
          <span v-if="musica.subtitulo" class="block truncate text-xs text-muted-foreground">
            {{ musica.subtitulo }}
          </span>
        </span>

        <Button
          variant="ghost"
          size="icon"
          class="size-7 shrink-0 text-muted-foreground hover:text-destructive"
          :aria-label="`Tirar ${musica.titulo} desta parte`"
          @click="emit('removerItem', musica.id)"
        >
          <XIcon class="size-3.5" />
        </Button>
      </li>
    </ul>

    <div class="mt-3 flex flex-wrap gap-2">
      <Button variant="outline" size="sm" class="gap-1.5" @click="emit('anexarFoto')">
        <ImagePlusIcon class="size-4" />
        Foto
      </Button>
      <Button variant="outline" size="sm" class="gap-1.5" @click="emit('anexarMusica')">
        <ListMusicIcon class="size-4" />
        Música
      </Button>
    </div>
  </section>
</template>
