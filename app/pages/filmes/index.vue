<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { refDebounced } from '@vueuse/core'
import { PlusIcon, SearchIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { ResultadoBusca } from '~~/server/utils/tmdb'
import type { ItemParaAdicionar } from '~/types/catalogo'

useHead({ title: 'Filmes & Séries · APPingos' })

const termo = ref('')
const termoDebounced = refDebounced(termo, 350)
const adicionar = useAdicionarItem()
const idsAdicionando = ref(new Set<string>())

const { data: itens, isPending: carregandoItens } = useItens(['filme', 'serie'])

const busca = useQuery({
  queryKey: computed(() => ['tmdb', 'busca', termoDebounced.value]),
  enabled: computed(() => termoDebounced.value.trim().length >= 2),
  queryFn: () => $fetch<ResultadoBusca[]>('/api/tmdb/busca', {
    query: { q: termoDebounced.value.trim() },
  }),
})

const jaNoEspaco = computed(() => {
  const chaves = new Set(
    (itens.value ?? []).map(i => `${i.media.tipo}:${i.media.titulo}:${i.media.ano ?? ''}`),
  )
  return chaves
})

const recentes = computed(() => (itens.value ?? []).slice(0, 12))

async function onAdicionar(resultado: ResultadoBusca) {
  idsAdicionando.value.add(resultado.fonte_id)
  try {
    const item: ItemParaAdicionar = {
      tipo: resultado.tipo,
      fonte: resultado.fonte,
      fonte_id: resultado.fonte_id,
      titulo: resultado.titulo,
      titulo_original: resultado.titulo_original,
      ano: resultado.ano,
      capa_url: resultado.capa_url,
      sinopse: resultado.sinopse,
      metadados: { nota_tmdb: resultado.nota_tmdb },
    }
    await adicionar.mutateAsync(item)
    toast.success(`"${resultado.titulo}" adicionado.`)
    termo.value = ''
  }
  catch (e) {
    toast.error(e instanceof Error ? e.message : 'Não deu para adicionar.')
  }
  finally {
    idsAdicionando.value.delete(resultado.fonte_id)
  }
}
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Filmes & Séries</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Busque, adicione e avaliem juntos.
        </p>
      </div>

      <nav class="flex gap-1 rounded-lg border bg-card p-1 text-sm">
        <NuxtLink
          to="/filmes"
          class="rounded-md px-3 py-1.5 font-medium text-primary"
        >
          Buscar
        </NuxtLink>
        <NuxtLink
          to="/filmes/lista"
          class="rounded-md px-3 py-1.5 font-medium text-muted-foreground hover:text-foreground"
        >
          Nossa lista
        </NuxtLink>
      </nav>
    </header>

    <div class="relative">
      <SearchIcon class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        v-model="termo"
        placeholder="Buscar filme ou série…"
        class="pl-9"
        autocomplete="off"
      />
    </div>

    <section v-if="termoDebounced.trim().length >= 2">
      <div v-if="busca.isPending.value" class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
        <Skeleton v-for="i in 6" :key="i" class="aspect-[2/3] w-full rounded-lg" />
      </div>

      <p v-else-if="busca.isError.value" class="text-sm text-destructive">
        {{ busca.error.value instanceof Error ? busca.error.value.message : 'Falha na busca.' }}
      </p>

      <p v-else-if="!busca.data.value?.length" class="text-sm text-muted-foreground">
        Nada encontrado para "{{ termoDebounced }}".
      </p>

      <div v-else class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
        <PosterCard
          v-for="resultado in busca.data.value"
          :key="`${resultado.fonte}:${resultado.fonte_id}`"
          :titulo="resultado.titulo"
          :ano="resultado.ano"
          :capa-url="resultado.capa_url"
          :legenda="resultado.tipo === 'serie' ? 'Série' : 'Filme'"
        >
          <template #overlay>
            <button
              v-if="!jaNoEspaco.has(`${resultado.tipo}:${resultado.titulo}:${resultado.ano ?? ''}`)"
              type="button"
              class="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1 rounded-md bg-primary py-1.5 text-xs font-medium text-primary-foreground shadow-sm disabled:opacity-60"
              :disabled="idsAdicionando.has(resultado.fonte_id)"
              @click="onAdicionar(resultado)"
            >
              <PlusIcon class="size-3.5" />
              {{ idsAdicionando.has(resultado.fonte_id) ? 'Adicionando…' : 'Adicionar' }}
            </button>
            <span
              v-else
              class="absolute inset-x-2 bottom-2 rounded-md bg-background/90 py-1.5 text-center text-xs font-medium"
            >
              Já está na lista
            </span>
          </template>
        </PosterCard>
      </div>
    </section>

    <section v-else>
      <h2 class="mb-3 text-sm font-medium text-muted-foreground">Adicionados recentemente</h2>

      <div v-if="carregandoItens" class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
        <Skeleton v-for="i in 6" :key="i" class="aspect-[2/3] w-full rounded-lg" />
      </div>

      <p v-else-if="!recentes.length" class="text-sm text-muted-foreground">
        Ainda não há nada por aqui — busque um filme ou série acima.
      </p>

      <div v-else class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
        <NuxtLink v-for="item in recentes" :key="item.id" :to="`/filmes/${item.id}`">
          <PosterCard
            :titulo="item.media.titulo"
            :ano="item.media.ano"
            :capa-url="item.media.capa_url"
          />
        </NuxtLink>
      </div>
    </section>
  </div>
</template>
