<script setup lang="ts">
import { mensagemDeErro } from '@/lib/utils'
import { useQuery } from '@tanstack/vue-query'
import { refDebounced } from '@vueuse/core'
import { CalendarOffIcon, PlusIcon, SearchIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatarDia, formatarMes, hojeIso, mesmoMes, primeiroDoMes } from '@/lib/datas'
import { RECORTES, RECORTE_ROTULO, avaliacaoDe, dataDoRecorte, itemNoRecorte, recorteDa, recorteTemData } from '@/lib/recortes'
import type { Recorte } from '@/lib/recortes'
import type { ResultadoBusca } from '~~/server/utils/tmdb'
import type { ItemDoEspaco, ItemParaAdicionar, MarcadorDia } from '~/types/catalogo'
import { useItens, useAdicionarItem, useAvaliar, usePlanejarFilme } from '~/composables/useCatalogo'
import { useConvitesFilme, useResponderConvite } from '~/composables/useConvitesFilme'
import { useMembros } from '~/composables/useMembros'
import { useUsuarioId } from '~/composables/useUsuarioId'

useHead({ title: 'Filmes & Séries · APPingos' })

const usuarioId = useUsuarioId()
const { data: itens, isPending } = useItens(['filme', 'serie'])
const { data: membros } = useMembros()
const avaliar = useAvaliar()
const planejar = usePlanejarFilme()

// ---- Convites para assistir junto -------------------------------------------

const { data: convites } = useConvitesFilme()
const responder = useResponderConvite()
const respondendo = ref(new Set<string>())

function nomeDoMembro(userId: string): string {
  return membros.value?.find(m => m.user_id === userId)?.nome ?? 'Alguém'
}

async function onResponder(id: string, aceito: boolean) {
  respondendo.value = new Set(respondendo.value).add(id)
  try {
    await responder.mutateAsync({ id, aceito })
    toast.success(aceito ? 'Combinado!' : 'Convite recusado.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para responder.'))
  }
  finally {
    const copia = new Set(respondendo.value)
    copia.delete(id)
    respondendo.value = copia
  }
}

// ---- Busca -----------------------------------------------------------------

const termo = ref('')
const termoDebounced = refDebounced(termo, 350)
const adicionar = useAdicionarItem()
const idsAdicionando = ref(new Set<string>())

const busca = useQuery({
  queryKey: computed(() => ['tmdb', 'busca', termoDebounced.value]),
  enabled: computed(() => termoDebounced.value.trim().length >= 2),
  queryFn: () => $fetch<ResultadoBusca[]>('/api/tmdb/busca', {
    query: { q: termoDebounced.value.trim() },
  }),
})

const buscando = computed(() => termoDebounced.value.trim().length >= 2)

const jaNoEspaco = computed(() =>
  new Set((itens.value ?? []).map(i => `${i.media.tipo}:${i.media.titulo}:${i.media.ano ?? ''}`)),
)

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
    toast.success(`"${resultado.titulo}" adicionado à lista de interesse.`)
    termo.value = ''
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para adicionar.'))
  }
  finally {
    idsAdicionando.value.delete(resultado.fonte_id)
  }
}

// ---- Calendário ------------------------------------------------------------

const mes = ref(primeiroDoMes(hojeIso()))
const diaSelecionado = ref<string | null>(null)

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

/**
 * O recorte do dia/mês visível.
 *
 * "Queremos ver" e "Assistidos" seguem o calendário: só entra o que está
 * datado no dia selecionado (ou no mês, quando nenhum dia está). Um assistido
 * sem data ("não lembro") não tem mês a que pertencer e por isso não aparece
 * aqui — ele vive em Nossa lista, onde não há recorte de data.
 *
 * "Disponível" e "Assistindo" não têm data — o primeiro é estoque de interesse,
 * o segundo é um intervalo em andamento. Os dois ignoram o filtro.
 */
function noRecorteVisivel(item: ItemDoEspaco, recorte: Recorte): boolean {
  if (!recorteTemData(recorte)) return true

  return item.avaliacoes.some((av) => {
    if (recorteDa(av) !== recorte) return false
    const data = dataDoRecorte(av, recorte)
    if (!data) return false
    return diaSelecionado.value ? data === diaSelecionado.value : mesmoMes(data, mes.value)
  })
}

const porRecorte = computed<Record<Recorte, ItemDoEspaco[]>>(() => {
  const grupos = { planejado: [], vendo: [], visto: [], disponivel: [] } as Record<Recorte, ItemDoEspaco[]>
  for (const item of itens.value ?? []) {
    for (const recorte of RECORTES) {
      if (itemNoRecorte(item, recorte) && noRecorteVisivel(item, recorte)) grupos[recorte].push(item)
    }
  }
  return grupos
})

const VAZIO: Record<Recorte, string> = {
  planejado: 'Nada marcado neste recorte.',
  vendo: 'Nada em andamento.',
  visto: 'Nada assistido neste recorte.',
  disponivel: 'Nenhum interesse sem data.',
}

/**
 * Assistidos sem data ficam fora do painel por não terem mês. Sem este aviso
 * eles simplesmente sumiriam da tela ao serem marcados como "não lembro".
 */
const assistidosSemData = computed(() =>
  (itens.value ?? []).filter(item =>
    item.avaliacoes.some(av => recorteDa(av) === 'visto' && !av.visto_em),
  ).length,
)

const tituloDoPainel = computed(() =>
  diaSelecionado.value ? formatarDia(diaSelecionado.value) : formatarMes(mes.value),
)

// ---- Mover entre recortes ---------------------------------------------------

const emAndamento = ref(new Set<string>())
const alvoDoArraste = ref<Recorte | null>(null)

const dialogoData = ref<{ item: ItemDoEspaco, recorte: Recorte } | null>(null)
const dataEscolhida = ref(hojeIso())

/** Data que alguém já escolheu neste recorte — ir junto é o caso comum. */
function dataSugerida(item: ItemDoEspaco, recorte: Recorte): string {
  const datas = item.avaliacoes
    .map(av => dataDoRecorte(av, recorte))
    .filter((d): d is string => !!d)
    .sort()
  return datas[0] ?? diaSelecionado.value ?? hojeIso()
}

function pedirData(item: ItemDoEspaco, recorte: Recorte) {
  dataEscolhida.value = dataSugerida(item, recorte)
  dialogoData.value = { item, recorte }
}

async function mover(item: ItemDoEspaco, recorte: Recorte, data: string | null) {
  const chave = `${item.id}:${recorte}`
  if (emAndamento.value.has(chave)) return
  emAndamento.value = new Set(emAndamento.value).add(chave)

  try {
    if (recorte === 'disponivel') {
      await avaliar.mutateAsync({ entryId: item.id, status: 'quero', planejado_para: null, visto_em: null })
      toast.success(`"${item.media.titulo}" na sua lista de interesse.`)
    }
    else if (recorte === 'vendo') {
      // Sem data: "assistindo" é um intervalo, não um dia. `visto_em` sai para
      // o item não cair de volta em "assistidos" na próxima leitura.
      await avaliar.mutateAsync({ entryId: item.id, status: 'vendo', visto_em: null })
      toast.success(`"${item.media.titulo}" em andamento.`)
    }
    else if (recorte === 'planejado') {
      const convidados = await planejar.mutateAsync({ entryId: item.id, data: data! })
      toast.success(convidados
        ? `Marcado — ${convidados === 1 ? 'um convite enviado' : `${convidados} convites enviados`}.`
        : `"${item.media.titulo}" marcado para ${formatarDia(data!)}.`)
    }
    else {
      await avaliar.mutateAsync({ entryId: item.id, status: 'visto', visto_em: data })
      toast.success(data
        ? `"${item.media.titulo}" assistido em ${formatarDia(data)}.`
        : `"${item.media.titulo}" marcado como assistido.`)
    }

    // Sem isto o cartaz "some" ao ser movido para uma data de outro mês.
    if (data && !mesmoMes(data, mes.value)) {
      mes.value = primeiroDoMes(data)
      diaSelecionado.value = null
    }
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para mover.'))
  }
  finally {
    const copia = new Set(emAndamento.value)
    copia.delete(chave)
    emAndamento.value = copia
  }
}

function acionar(item: ItemDoEspaco, recorte: Recorte) {
  if (recorteDa(avaliacaoDe(item, usuarioId.value)) === recorte) return
  if (recorteTemData(recorte)) pedirData(item, recorte)
  else mover(item, recorte, null)
}

function aoSoltar(e: DragEvent, recorte: Recorte) {
  alvoDoArraste.value = null
  const entryId = e.dataTransfer?.getData('text/plain')
  const item = (itens.value ?? []).find(i => i.id === entryId)
  if (item) acionar(item, recorte)
}

function confirmarData(semData = false) {
  const alvo = dialogoData.value
  if (!alvo) return
  dialogoData.value = null
  mover(alvo.item, alvo.recorte, semData ? null : dataEscolhida.value)
}
</script>

<template>
  <div class="space-y-6">
    <FilmesAbas subtitulo="Busque, marquem as datas e avaliem juntos." />

    <!-- Convites para assistir junto -->
    <section v-if="convites?.length" class="space-y-2">
      <div
        v-for="convite in convites"
        :key="convite.id"
        class="flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3"
      >
        <div class="min-w-0 flex-1 text-sm">
          <p>
            <strong>{{ nomeDoMembro(convite.de_user_id) }}</strong> quer ver
            <strong>{{ convite.entry?.media?.titulo ?? 'um filme' }}</strong>
            em <strong>{{ formatarDia(convite.data_proposta) }}</strong>. Topa?
          </p>
        </div>
        <div class="flex shrink-0 gap-2">
          <Button
            size="sm"
            :disabled="respondendo.has(convite.id)"
            @click="onResponder(convite.id, true)"
          >
            Topo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            :disabled="respondendo.has(convite.id)"
            @click="onResponder(convite.id, false)"
          >
            Dessa vez não
          </Button>
        </div>
      </div>
    </section>

    <!-- Busca -->
    <section class="space-y-4">
      <div class="relative">
        <SearchIcon class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          v-model="termo"
          placeholder="Buscar filme ou série…"
          class="pl-9"
          autocomplete="off"
        />
      </div>

      <template v-if="buscando">
        <div v-if="busca.isPending.value" class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
          <Skeleton v-for="i in 6" :key="i" class="aspect-[2/3] w-full rounded-lg" />
        </div>

        <p v-else-if="busca.isError.value" class="text-sm text-destructive">
          {{ mensagemDeErro(busca.error.value, 'Falha na busca.') }}
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
                {{ idsAdicionando.has(resultado.fonte_id) ? 'Adicionando…' : 'Tenho interesse' }}
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
      </template>
    </section>

    <!-- Calendário + recortes -->
    <section v-if="!buscando">
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

        <div class="min-w-0 space-y-4 rounded-lg border bg-card p-4">
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

          <section
            v-for="recorte in RECORTES"
            :key="recorte"
            class="rounded-lg border border-dashed p-2 transition-colors"
            :class="alvoDoArraste === recorte ? 'border-primary bg-primary/5' : 'border-transparent'"
            @dragover.prevent="alvoDoArraste = recorte"
            @dragleave="alvoDoArraste = alvoDoArraste === recorte ? null : alvoDoArraste"
            @drop.prevent="aoSoltar($event, recorte)"
          >
            <div class="mb-2 flex items-center justify-between gap-2">
              <h3 class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <!-- Só os recortes com data têm marcador no calendário. -->
                <span
                  v-if="recorteTemData(recorte)"
                  class="size-1.5 rounded-full"
                  :class="recorte === 'visto' ? 'bg-emerald-500' : 'bg-sky-500'"
                />
                {{ RECORTE_ROTULO[recorte] }}
                <span class="rounded-full bg-muted px-1.5 text-[10px]">{{ porRecorte[recorte].length }}</span>
              </h3>

              <NuxtLink
                :to="{ path: '/filmes/lista', query: { recorte } }"
                class="shrink-0 text-xs text-primary hover:underline"
              >
                Ver todos
              </NuxtLink>
            </div>

            <!-- Uma linha de cinco: o painel é um resumo; o resto vive em Nossa lista. -->
            <GradeDeCartazes
              v-if="porRecorte[recorte].length"
              :itens="porRecorte[recorte].slice(0, 5)"
              :recorte="recorte"
              :membros="membros ?? []"
              :em-andamento="emAndamento"
              @entrar="acionar($event, recorte)"
              @mover="acionar"
            />
            <p v-else class="px-1 pb-1 text-sm text-muted-foreground">
              {{ VAZIO[recorte] }}
            </p>

            <p v-if="recorte === 'visto' && assistidosSemData" class="mt-1 px-1 text-xs text-muted-foreground">
              +{{ assistidosSemData }} sem data, em
              <NuxtLink
                :to="{ path: '/filmes/lista', query: { recorte: 'visto' } }"
                class="text-primary hover:underline"
              >Nossa lista</NuxtLink>.
            </p>
          </section>

          <p class="text-xs text-muted-foreground">
            Arraste um cartaz entre os grupos para marcar a data.
          </p>

          <p v-if="!itens?.length" class="text-sm text-muted-foreground">
            Ainda não há nada na lista — busque um filme acima para começar.
          </p>
        </div>
      </div>
    </section>

    <Dialog :open="!!dialogoData" @update:open="dialogoData = null">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {{ dialogoData ? RECORTE_ROTULO[dialogoData.recorte] : '' }}
          </DialogTitle>
          <DialogDescription>
            {{ dialogoData?.recorte === 'visto'
              ? `Quando você assistiu "${dialogoData?.item.media.titulo}"?`
              : `Para quando querem ver "${dialogoData?.item.media.titulo}"?` }}
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-2">
          <Label for="data-recorte">Data</Label>
          <Input id="data-recorte" v-model="dataEscolhida" type="date" />
        </div>

        <p v-if="dialogoData?.recorte === 'planejado'" class="text-xs text-muted-foreground">
          Quem já tinha interesse recebe um convite para ir junto.
        </p>

        <DialogFooter class="sm:justify-between">
          <!-- Só faz sentido em "assistidos": um plano sem data não é um plano. -->
          <Button
            v-if="dialogoData?.recorte === 'visto'"
            variant="ghost"
            class="gap-1.5"
            @click="confirmarData(true)"
          >
            <CalendarOffIcon class="size-4" />
            Não lembro
          </Button>
          <span v-else />

          <span class="flex gap-2">
            <Button variant="ghost" @click="dialogoData = null">Cancelar</Button>
            <Button :disabled="!dataEscolhida" @click="confirmarData()">Confirmar</Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
