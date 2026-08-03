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
    <FilmesAbas subtitulo="Agrupado pelo seu status." />

    <div v-if="isPending" class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
      <Skeleton v-for="i in 6" :key="i" class="aspect-[2/3] w-full rounded-lg" />
    </div>

    <p v-else-if="!itens?.length" class="text-sm text-muted-foreground">
      Nada por aqui ainda. <NuxtLink to="/filmes/buscar" class="text-primary hover:underline">Busque algo</NuxtLink> para começar.
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
