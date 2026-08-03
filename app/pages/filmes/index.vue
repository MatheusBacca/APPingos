<script setup lang="ts">
import { CalendarPlusIcon } from '@lucide/vue'
import { formatarDia, formatarMes, hojeIso, mesmoMes, primeiroDoMes } from '@/lib/datas'
import type { ItemDoEspaco, MarcadorDia } from '~/types/catalogo'

useHead({ title: 'Agenda · Filmes & Séries · APPingos' })

const { data: itens, isPending } = useItens(['filme', 'serie'])
const { data: membros } = useMembros()

const mes = ref(primeiroDoMes(hojeIso()))
const diaSelecionado = ref<string | null>(null)

function nomeDoMembro(userId: string): string {
  return membros.value?.find(m => m.user_id === userId)?.nome ?? 'Alguém'
}

/**
 * Um marcador por data preenchida em cada avaliação.
 *
 * As datas são pessoais, então no espaço de casal o mesmo filme pode aparecer
 * duas vezes num mês — uma por pessoa. É de propósito: o calendário mostra quem
 * marcou o quê, não uma agenda única do casal.
 */
const marcadores = computed<MarcadorDia[]>(() => {
  const lista: MarcadorDia[] = []

  for (const item of itens.value ?? []) {
    for (const av of item.avaliacoes) {
      const base = { entryId: item.id, titulo: item.media.titulo, quem: nomeDoMembro(av.user_id) }
      if (av.planejado_para) lista.push({ ...base, data: av.planejado_para, tom: 'planejado' })
      if (av.visto_em) lista.push({ ...base, data: av.visto_em, tom: 'visto' })
    }
  }

  return lista
})

const doMesVisivel = computed(() => marcadores.value.filter(m => mesmoMes(m.data, mes.value)))

const visiveis = computed(() =>
  diaSelecionado.value
    ? marcadores.value.filter(m => m.data === diaSelecionado.value)
    : doMesVisivel.value,
)

const queremosVer = computed(() =>
  visiveis.value.filter(m => m.tom === 'planejado').sort((a, b) => a.data.localeCompare(b.data)),
)

const assistidos = computed(() =>
  visiveis.value.filter(m => m.tom === 'visto').sort((a, b) => b.data.localeCompare(a.data)),
)

const tituloDoPainel = computed(() =>
  diaSelecionado.value ? formatarDia(diaSelecionado.value) : formatarMes(mes.value),
)

/** Itens da lista que ninguém datou ainda — o convite para usar a agenda. */
const semData = computed(() => {
  const comData = new Set<string>()
  for (const m of marcadores.value) comData.add(m.entryId)
  return (itens.value ?? []).filter((i: ItemDoEspaco) => !comData.has(i.id))
})
</script>

<template>
  <div class="space-y-6">
    <FilmesAbas subtitulo="Quando querem ver e quando já viram." />

    <div v-if="isPending" class="grid gap-4 lg:grid-cols-[20rem_1fr]">
      <Skeleton class="h-80 w-full rounded-lg" />
      <Skeleton class="h-80 w-full rounded-lg" />
    </div>

    <div v-else class="grid gap-4 lg:grid-cols-[20rem_1fr] lg:items-start">
      <CalendarioMes
        v-model:mes="mes"
        v-model:dia-selecionado="diaSelecionado"
        :marcadores="marcadores"
      />

      <div class="min-w-0 space-y-5 rounded-lg border bg-card p-4">
        <div class="flex items-baseline justify-between gap-2">
          <h2 class="text-sm font-medium">{{ tituloDoPainel }}</h2>
          <button
            v-if="diaSelecionado"
            type="button"
            class="text-xs text-primary hover:underline"
            @click="diaSelecionado = null"
          >
            Ver o mês inteiro
          </button>
        </div>

        <section>
          <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Queremos ver
          </h3>
          <ul v-if="queremosVer.length" class="space-y-1">
            <li v-for="(m, i) in queremosVer" :key="`p${i}`">
              <NuxtLink
                :to="`/filmes/${m.entryId}`"
                class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <span class="size-1.5 shrink-0 rounded-full bg-sky-500" />
                <span class="min-w-0 flex-1 truncate">{{ m.titulo }}</span>
                <span class="shrink-0 text-xs text-muted-foreground">
                  {{ formatarDia(m.data) }} · {{ m.quem }}
                </span>
              </NuxtLink>
            </li>
          </ul>
          <p v-else class="px-2 text-sm text-muted-foreground">Nada marcado.</p>
        </section>

        <section>
          <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Assistidos
          </h3>
          <ul v-if="assistidos.length" class="space-y-1">
            <li v-for="(m, i) in assistidos" :key="`v${i}`">
              <NuxtLink
                :to="`/filmes/${m.entryId}`"
                class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <span class="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span class="min-w-0 flex-1 truncate">{{ m.titulo }}</span>
                <span class="shrink-0 text-xs text-muted-foreground">
                  {{ formatarDia(m.data) }} · {{ m.quem }}
                </span>
              </NuxtLink>
            </li>
          </ul>
          <p v-else class="px-2 text-sm text-muted-foreground">Nada por aqui.</p>
        </section>

        <section v-if="semData.length" class="border-t pt-4">
          <h3 class="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <CalendarPlusIcon class="size-3.5" />
            Sem data ({{ semData.length }})
          </h3>
          <ul class="space-y-1">
            <li v-for="item in semData.slice(0, 6)" :key="item.id">
              <NuxtLink
                :to="`/filmes/${item.id}`"
                class="block truncate rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {{ item.media.titulo }}
              </NuxtLink>
            </li>
          </ul>
          <p v-if="semData.length > 6" class="mt-1 px-2 text-xs text-muted-foreground">
            e mais {{ semData.length - 6 }} em
            <NuxtLink to="/filmes/lista" class="text-primary hover:underline">Nossa lista</NuxtLink>.
          </p>
        </section>

        <p v-if="!itens?.length" class="text-sm text-muted-foreground">
          Ainda não há nada na lista.
          <NuxtLink to="/filmes/buscar" class="text-primary hover:underline">Busque um filme</NuxtLink>
          para começar.
        </p>
      </div>
    </div>
  </div>
</template>
