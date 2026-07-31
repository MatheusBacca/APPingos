<script setup lang="ts">
import { STATUS_ROTULO } from '~/types/catalogo'
import type { ItemDoEspaco, StatusItem } from '~/types/catalogo'

useHead({ title: 'Nossa lista · Filmes & Séries · APPingos' })

const usuarioId = useUsuarioId()
const { data: itens, isPending } = useItens(['filme', 'serie'])

/** Status "meu" por item: o que eu marquei, ou 'quero' se eu nunca avaliei. */
function meuStatus(item: ItemDoEspaco): StatusItem {
  return item.avaliacoes.find(a => a.user_id === usuarioId.value)?.status ?? 'quero'
}

const grupos = computed(() => {
  const porStatus = new Map<StatusItem, ItemDoEspaco[]>()
  for (const status of Object.keys(STATUS_ROTULO) as StatusItem[]) porStatus.set(status, [])

  for (const item of itens.value ?? []) {
    porStatus.get(meuStatus(item))!.push(item)
  }

  return porStatus
})
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Filmes & Séries</h1>
        <p class="mt-1 text-sm text-muted-foreground">Agrupado pelo seu status.</p>
      </div>

      <nav class="flex gap-1 rounded-lg border bg-card p-1 text-sm">
        <NuxtLink to="/filmes" class="rounded-md px-3 py-1.5 font-medium text-muted-foreground hover:text-foreground">
          Buscar
        </NuxtLink>
        <NuxtLink to="/filmes/lista" class="rounded-md px-3 py-1.5 font-medium text-primary">
          Nossa lista
        </NuxtLink>
      </nav>
    </header>

    <div v-if="isPending" class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
      <Skeleton v-for="i in 6" :key="i" class="aspect-[2/3] w-full rounded-lg" />
    </div>

    <p v-else-if="!itens?.length" class="text-sm text-muted-foreground">
      Nada por aqui ainda. <NuxtLink to="/filmes" class="text-primary hover:underline">Busque algo</NuxtLink> para começar.
    </p>

    <template v-else>
      <section
        v-for="[status, lista] in grupos"
        :key="status"
        v-show="lista.length"
      >
        <h2 class="mb-3 flex items-center gap-2 text-sm font-medium">
          {{ STATUS_ROTULO[status] }}
          <span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {{ lista.length }}
          </span>
        </h2>

        <div class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
          <NuxtLink v-for="item in lista" :key="item.id" :to="`/filmes/${item.id}`">
            <PosterCard
              :titulo="item.media.titulo"
              :ano="item.media.ano"
              :capa-url="item.media.capa_url"
            />
          </NuxtLink>
        </div>
      </section>
    </template>
  </div>
</template>
