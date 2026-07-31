<script setup lang="ts">
import { Trash2Icon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { StatusItem } from '~/types/catalogo'

const route = useRoute()
const entryId = route.params.id as string
const router = useRouter()
const usuarioId = useUsuarioId()

const { data: item, isPending, isError, error } = useItem(entryId)
const { data: membros } = useMembros()
const avaliar = useAvaliar()
const remover = useRemoverItem()

useHead({ title: () => `${item.value?.media.titulo ?? 'Carregando…'} · APPingos` })

const minhaAvaliacao = computed(() =>
  item.value?.avaliacoes.find(a => a.user_id === usuarioId.value) ?? null,
)

const resenhaRascunho = ref('')
watch(minhaAvaliacao, (av) => {
  resenhaRascunho.value = av?.resenha ?? ''
}, { immediate: true })

const salvandoResenha = ref(false)

async function onMudarStatus(status: StatusItem) {
  try {
    await avaliar.mutateAsync({ entryId, status })
  }
  catch (e) {
    toast.error(e instanceof Error ? e.message : 'Não deu para salvar.')
  }
}

async function onMudarNota(nota: number | null) {
  try {
    await avaliar.mutateAsync({ entryId, nota })
  }
  catch (e) {
    toast.error(e instanceof Error ? e.message : 'Não deu para salvar a nota.')
  }
}

async function onSalvarResenha() {
  salvandoResenha.value = true
  try {
    await avaliar.mutateAsync({ entryId, resenha: resenhaRascunho.value.trim() || null })
    toast.success('Resenha salva.')
  }
  catch (e) {
    toast.error(e instanceof Error ? e.message : 'Não deu para salvar a resenha.')
  }
  finally {
    salvandoResenha.value = false
  }
}

async function onRemover() {
  if (!confirm(`Remover "${item.value?.media.titulo}" da lista de vocês?`)) return
  try {
    await remover.mutateAsync(entryId)
    toast.success('Removido.')
    await router.push('/filmes/lista')
  }
  catch (e) {
    toast.error(e instanceof Error ? e.message : 'Não deu para remover.')
  }
}

function nomeDoMembro(userId: string): string {
  return membros.value?.find(m => m.user_id === userId)?.nome ?? 'Alguém'
}
</script>

<template>
  <div v-if="isPending" class="space-y-4">
    <Skeleton class="h-8 w-2/3" />
    <div class="flex gap-4">
      <Skeleton class="aspect-[2/3] w-40 shrink-0 rounded-lg" />
      <Skeleton class="h-40 flex-1" />
    </div>
  </div>

  <div v-else-if="isError || !item" class="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
    <p class="font-medium text-destructive">Não encontrei este item.</p>
    <p class="mt-1 text-muted-foreground">
      {{ error instanceof Error ? error.message : 'Ele pode ter sido removido.' }}
    </p>
  </div>

  <div v-else class="space-y-8">
    <div class="flex flex-col gap-4 sm:flex-row">
      <div class="w-40 shrink-0">
        <PosterCard :titulo="item.media.titulo" :capa-url="item.media.capa_url" />
      </div>

      <div class="min-w-0 flex-1 space-y-3">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h1 class="text-xl font-semibold leading-tight">{{ item.media.titulo }}</h1>
            <p v-if="item.media.titulo_original && item.media.titulo_original !== item.media.titulo" class="text-sm text-muted-foreground">
              {{ item.media.titulo_original }}
            </p>
            <p class="mt-1 text-sm text-muted-foreground">
              {{ [item.media.ano, item.media.tipo === 'serie' ? 'Série' : 'Filme'].filter(Boolean).join(' · ') }}
            </p>
          </div>

          <Button variant="ghost" size="icon" aria-label="Remover da lista" @click="onRemover">
            <Trash2Icon class="size-4 text-muted-foreground" />
          </Button>
        </div>

        <p v-if="item.media.sinopse" class="text-sm text-muted-foreground">
          {{ item.media.sinopse }}
        </p>

        <StatusSelect
          :status="minhaAvaliacao?.status ?? 'quero'"
          @update:status="onMudarStatus"
        />
      </div>
    </div>

    <section>
      <h2 class="mb-3 text-sm font-medium">Avaliações</h2>

      <div class="space-y-3">
        <div
          v-for="avaliacao in item.avaliacoes"
          :key="avaliacao.user_id"
          class="flex items-start gap-3 rounded-lg border bg-card p-3"
        >
          <span class="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium">
            {{ nomeDoMembro(avaliacao.user_id).charAt(0).toUpperCase() }}
          </span>

          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">{{ nomeDoMembro(avaliacao.user_id) }}</p>

            <NotaEstrelas
              v-if="avaliacao.user_id === user?.id"
              class="mt-1"
              :nota="avaliacao.nota"
              @update:nota="onMudarNota"
            />
            <NotaEstrelas v-else class="mt-1" :nota="avaliacao.nota" somente-leitura tamanho="sm" />

            <p v-if="avaliacao.resenha && avaliacao.user_id !== user?.id" class="mt-1 text-sm text-muted-foreground">
              {{ avaliacao.resenha }}
            </p>
          </div>
        </div>

        <p v-if="item.avaliacoes.length <= 1" class="text-xs text-muted-foreground">
          Ainda só você avaliou — convide seu par em
          <NuxtLink to="/espacos" class="text-primary hover:underline">Espaços</NuxtLink>.
        </p>
      </div>
    </section>

    <section>
      <h2 class="mb-2 text-sm font-medium">Sua resenha</h2>
      <Textarea
        v-model="resenhaRascunho"
        rows="3"
        placeholder="O que você achou?"
        @blur="onSalvarResenha"
      />
      <p class="mt-1 text-xs text-muted-foreground">
        {{ salvandoResenha ? 'Salvando…' : 'Salva ao sair do campo.' }}
      </p>
    </section>
  </div>
</template>
