<script setup lang="ts">
import { mensagemDeErro } from '@/lib/utils'
import { toast } from 'vue-sonner'
import { formatarDia } from '@/lib/datas'
import {
  RECORTES,
  RECORTE_DESCRICAO,
  RECORTE_ROTULO,
  avaliacaoDe,
  dataDoRecorte,
  ehRecorte,
  itemNoRecorte,
  recorteDa,
  recorteTemData,
} from '@/lib/recortes'
import type { Recorte } from '@/lib/recortes'
import type { ItemDoEspaco } from '~/types/catalogo'
import { useItens, useAvaliar, usePlanejarFilme } from '~/composables/useCatalogo'
import { useMembros } from '~/composables/useMembros'
import { useUsuarioId } from '~/composables/useUsuarioId'

useHead({ title: 'Nossa lista · Filmes & Séries · APPingos' })

const route = useRoute()
const router = useRouter()
const usuarioId = useUsuarioId()

const { data: itens, isPending } = useItens(['filme', 'serie'])
const { data: membros } = useMembros()
const avaliar = useAvaliar()
const planejar = usePlanejarFilme()

/** `?recorte=` vindo do "Ver todos". Sem ele, mostra os três. */
const filtro = computed<Recorte | null>(() => {
  const valor = route.query.recorte
  return ehRecorte(valor) ? valor : null
})

const visiveis = computed(() => (filtro.value ? [filtro.value] : RECORTES))

function selecionar(recorte: Recorte | null) {
  router.replace({ path: '/filmes/lista', query: recorte ? { recorte } : {} })
}

/**
 * Aqui não há mês nem dia: a lista é o acervo inteiro, sem recorte de data.
 * É para isto que o "Ver todos" da agenda aponta.
 */
function doRecorte(recorte: Recorte): ItemDoEspaco[] {
  return (itens.value ?? []).filter(item => itemNoRecorte(item, recorte))
}

/** "12 de agosto · Ana" — o que dá contexto ao cartaz fora do calendário. */
function legenda(item: ItemDoEspaco, recorte: Recorte): string {
  const av = avaliacaoDe(item, usuarioId.value)
  if (recorteDa(av) !== recorte) return ''
  const data = av ? dataDoRecorte(av, recorte) : null
  return data ? formatarDia(data) : ''
}

const emAndamento = ref(new Set<string>())

/**
 * O "+" aqui entra no recorte assumindo a data de quem já está nele — sem
 * diálogo, porque esta tela não tem o calendário ao lado para dar contexto.
 * Ajustes finos de data continuam na agenda e na tela do filme.
 */
async function entrar(item: ItemDoEspaco, recorte: Recorte) {
  const chave = `${item.id}:${recorte}`
  if (emAndamento.value.has(chave)) return
  emAndamento.value = new Set(emAndamento.value).add(chave)

  const datas = item.avaliacoes
    .map(av => dataDoRecorte(av, recorte))
    .filter((d): d is string => !!d)
    .sort()

  try {
    if (recorte === 'disponivel') {
      await avaliar.mutateAsync({ entryId: item.id, status: 'quero', planejado_para: null, visto_em: null })
    }
    else if (recorte === 'vendo') {
      await avaliar.mutateAsync({ entryId: item.id, status: 'vendo', visto_em: null })
    }
    else if (recorte === 'planejado') {
      await planejar.mutateAsync({ entryId: item.id, data: datas[0] ?? new Date().toISOString().slice(0, 10) })
    }
    else {
      await avaliar.mutateAsync({ entryId: item.id, status: 'visto', visto_em: datas[0] ?? null })
    }
    toast.success(`"${item.media.titulo}" em ${RECORTE_ROTULO[recorte]}.`)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para salvar.'))
  }
  finally {
    const copia = new Set(emAndamento.value)
    copia.delete(chave)
    emAndamento.value = copia
  }
}
</script>

<template>
  <div class="space-y-6">
    <FilmesAbas subtitulo="O acervo inteiro do espaço, sem recorte de data." />

    <nav class="flex flex-wrap gap-1 rounded-lg border bg-card p-1 text-sm">
      <button
        type="button"
        class="rounded-md px-3 py-1.5 font-medium"
        :class="!filtro ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'"
        @click="selecionar(null)"
      >
        Todos
      </button>
      <button
        v-for="recorte in RECORTES"
        :key="recorte"
        type="button"
        class="rounded-md px-3 py-1.5 font-medium"
        :class="filtro === recorte ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'"
        @click="selecionar(recorte)"
      >
        {{ RECORTE_ROTULO[recorte] }}
      </button>
    </nav>

    <div v-if="isPending" class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
      <Skeleton v-for="i in 6" :key="i" class="aspect-[2/3] w-full rounded-lg" />
    </div>

    <p v-else-if="!itens?.length" class="text-sm text-muted-foreground">
      Nada por aqui ainda.
      <NuxtLink to="/filmes" class="text-primary hover:underline">Busque algo</NuxtLink> para começar.
    </p>

    <template v-else>
      <section v-for="recorte in visiveis" :key="recorte">
        <h2 class="mb-1 flex items-center gap-2 text-sm font-medium">
          <span
            v-if="recorteTemData(recorte)"
            class="size-1.5 rounded-full"
            :class="recorte === 'visto' ? 'bg-emerald-500' : 'bg-sky-500'"
          />
          {{ RECORTE_ROTULO[recorte] }}
          <span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {{ doRecorte(recorte).length }}
          </span>
        </h2>
        <p class="mb-3 text-xs text-muted-foreground">{{ RECORTE_DESCRICAO[recorte] }}</p>

        <GradeDeCartazes
          v-if="doRecorte(recorte).length"
          :itens="doRecorte(recorte)"
          :recorte="recorte"
          :membros="membros ?? []"
          :em-andamento="emAndamento"
          :arrastavel="false"
          classe-grade="grid-cols-3 sm:grid-cols-4 md:grid-cols-6"
          @entrar="entrar($event, recorte)"
          @mover="entrar"
        />
        <p v-else class="text-sm text-muted-foreground">Nada aqui ainda.</p>
      </section>
    </template>
  </div>
</template>
