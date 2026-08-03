<script setup lang="ts">
import { mensagemDeErro } from '@/lib/utils'
import { useQuery } from '@tanstack/vue-query'
import { refDebounced } from '@vueuse/core'
import { PlusIcon, SearchIcon } from '@lucide/vue'
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
import { STATUS_ROTULO } from '~/types/catalogo'
import type { Membro } from '~/composables/useMembros'
import type { ResultadoBusca } from '~~/server/utils/tmdb'
import type { Avaliacao, ItemDoEspaco, ItemParaAdicionar, MarcadorDia, StatusItem } from '~/types/catalogo'

useHead({ title: 'Filmes & Séries · APPingos' })

const usuarioId = useUsuarioId()
const { data: itens, isPending } = useItens(['filme', 'serie'])
const { data: membros } = useMembros()
const avaliar = useAvaliar()

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
    toast.success(`"${resultado.titulo}" adicionado.`)
    termo.value = ''
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para adicionar.'))
  }
  finally {
    idsAdicionando.value.delete(resultado.fonte_id)
  }
}

// ---- Estado de cada pessoa num item ----------------------------------------

type Topico = 'disponivel' | 'planejado' | 'visto'

const TOPICO_ROTULO: Record<Topico, string> = {
  disponivel: 'Disponível',
  planejado: 'Queremos ver',
  visto: 'Assistidos',
}

/**
 * Em que tópico a avaliação de UMA pessoa coloca o item.
 *
 * Quem já viu não continua em "queremos ver" mesmo tendo planejado antes — o
 * plano foi cumprido, e manter os dois lugares faria o mesmo cartaz aparecer
 * duas vezes para a mesma pessoa.
 */
function topicoDa(av: Avaliacao | undefined): Topico {
  if (av?.visto_em) return 'visto'
  if (av?.planejado_para) return 'planejado'
  return 'disponivel'
}

function avaliacaoDe(item: ItemDoEspaco, userId: string | null): Avaliacao | undefined {
  return item.avaliacoes.find(a => a.user_id === userId)
}

/**
 * Quem está neste tópico para este item.
 *
 * Em "disponível" contam também os membros que nunca tocaram no item: não ter
 * avaliação é o mesmo que não ter data.
 */
function membrosNoTopico(item: ItemDoEspaco, topico: Topico): Membro[] {
  return (membros.value ?? []).filter(m => topicoDa(avaliacaoDe(item, m.user_id)) === topico)
}

function euEstouEm(item: ItemDoEspaco, topico: Topico): boolean {
  return topicoDa(avaliacaoDe(item, usuarioId.value)) === topico
}

// ---- Calendário ------------------------------------------------------------

const mes = ref(primeiroDoMes(hojeIso()))
const diaSelecionado = ref<string | null>(null)

function nomeDoMembro(userId: string): string {
  return membros.value?.find(m => m.user_id === userId)?.nome ?? 'Alguém'
}

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

/** Um item entra no recorte do calendário se QUALQUER pessoa o datou ali. */
function noRecorte(item: ItemDoEspaco, tom: 'planejado' | 'visto'): boolean {
  return item.avaliacoes.some((av) => {
    const data = tom === 'visto' ? av.visto_em : av.planejado_para
    if (!data) return false
    return diaSelecionado.value ? data === diaSelecionado.value : mesmoMes(data, mes.value)
  })
}

/**
 * Os três tópicos são a UNIÃO do que as duas pessoas marcaram — se ela quer
 * ver e eu ainda não, o cartaz aparece em "queremos ver" com a bolinha dela e
 * o "+" para eu entrar junto. É o que faz o espaço ser compartilhado de fato.
 *
 * "Disponível" é a exceção: só entra o que ninguém datou, e por isso ele
 * ignora o mês visível — é o estoque, não uma data.
 */
const porTopico = computed<Record<Topico, ItemDoEspaco[]>>(() => {
  const grupos: Record<Topico, ItemDoEspaco[]> = { disponivel: [], planejado: [], visto: [] }

  for (const item of itens.value ?? []) {
    const topicos = new Set(item.avaliacoes.map(av => topicoDa(av)))

    if (!topicos.has('planejado') && !topicos.has('visto')) {
      grupos.disponivel.push(item)
      continue
    }
    if (topicos.has('planejado') && noRecorte(item, 'planejado')) grupos.planejado.push(item)
    if (topicos.has('visto') && noRecorte(item, 'visto')) grupos.visto.push(item)
  }

  return grupos
})

const tituloDoPainel = computed(() =>
  diaSelecionado.value ? formatarDia(diaSelecionado.value) : formatarMes(mes.value),
)

// ---- Mover entre tópicos ---------------------------------------------------

const emAndamento = ref(new Set<string>())
const alvoDoArraste = ref<Topico | null>(null)

const dialogoData = ref<{ item: ItemDoEspaco, topico: Topico } | null>(null)
const dataEscolhida = ref(hojeIso())

/** Data que já existe no tópico (a da outra pessoa) — entrar junto é o padrão. */
function dataSugerida(item: ItemDoEspaco, topico: Topico): string {
  const campo = topico === 'visto' ? 'visto_em' : 'planejado_para'
  const datas = item.avaliacoes.map(av => av[campo]).filter((d): d is string => !!d).sort()
  return datas[0] ?? diaSelecionado.value ?? hojeIso()
}

function pedirData(item: ItemDoEspaco, topico: Topico) {
  dataEscolhida.value = dataSugerida(item, topico)
  dialogoData.value = { item, topico }
}

async function mover(item: ItemDoEspaco, topico: Topico, data?: string) {
  const chave = `${item.id}:${topico}`
  if (emAndamento.value.has(chave)) return
  emAndamento.value = new Set(emAndamento.value).add(chave)

  try {
    if (topico === 'disponivel') {
      await avaliar.mutateAsync({ entryId: item.id, planejado_para: null, visto_em: null, status: 'quero' })
    }
    else if (topico === 'planejado') {
      await avaliar.mutateAsync({ entryId: item.id, planejado_para: data!, visto_em: null, status: 'quero' })
    }
    else {
      await avaliar.mutateAsync({ entryId: item.id, visto_em: data!, status: 'visto' })
    }

    // Sem isto o cartaz "some" ao ser movido para uma data de outro mês.
    if (data && !mesmoMes(data, mes.value)) {
      mes.value = primeiroDoMes(data)
      diaSelecionado.value = null
    }
    toast.success(`"${item.media.titulo}" em ${TOPICO_ROTULO[topico]}.`)
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

/** Soltar em "disponível" limpa as datas; nos outros dois, pergunta a data. */
function aoSoltar(e: DragEvent, topico: Topico) {
  alvoDoArraste.value = null
  const entryId = e.dataTransfer?.getData('text/plain')
  const item = (itens.value ?? []).find(i => i.id === entryId)
  if (!item || euEstouEm(item, topico)) return

  if (topico === 'disponivel') mover(item, topico)
  else pedirData(item, topico)
}

function confirmarData() {
  const alvo = dialogoData.value
  if (!alvo) return
  dialogoData.value = null
  mover(alvo.item, alvo.topico, dataEscolhida.value)
}

/** O "+" do rodapé: entrar no tópico onde o cartaz já está. */
function entrarNoTopico(item: ItemDoEspaco, topico: Topico) {
  if (topico === 'disponivel') mover(item, topico)
  else pedirData(item, topico)
}

// ---- Segmentação por status (a lista de sempre) ----------------------------

function meuStatus(item: ItemDoEspaco): StatusItem {
  return avaliacaoDe(item, usuarioId.value)?.status ?? 'quero'
}

const porStatus = computed(() => {
  const grupos = new Map<StatusItem, ItemDoEspaco[]>()
  for (const status of Object.keys(STATUS_ROTULO) as StatusItem[]) grupos.set(status, [])
  for (const item of itens.value ?? []) grupos.get(meuStatus(item))!.push(item)
  return grupos
})

function membrosComStatus(item: ItemDoEspaco, status: StatusItem): Membro[] {
  return (membros.value ?? []).filter(m => (avaliacaoDe(item, m.user_id)?.status ?? 'quero') === status)
}

async function assumirStatus(item: ItemDoEspaco, status: StatusItem) {
  const chave = `${item.id}:${status}`
  if (emAndamento.value.has(chave)) return
  emAndamento.value = new Set(emAndamento.value).add(chave)
  try {
    await avaliar.mutateAsync({ entryId: item.id, status })
    toast.success(`"${item.media.titulo}" em ${STATUS_ROTULO[status]}.`)
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
  <div class="space-y-8">
    <header>
      <h1 class="text-2xl font-semibold tracking-tight">Filmes & Séries</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        Busque, marquem as datas e avaliem juntos.
      </p>
    </header>

    <!-- 1. Busca -->
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
      </template>
    </section>

    <!-- 2. Calendário + tópicos -->
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

          <p class="text-xs text-muted-foreground">
            Arraste um cartaz entre os grupos para marcar a data.
          </p>

          <section
            v-for="topico in (['disponivel', 'planejado', 'visto'] as Topico[])"
            :key="topico"
            class="rounded-lg border border-dashed p-2 transition-colors"
            :class="alvoDoArraste === topico ? 'border-primary bg-primary/5' : 'border-transparent'"
            @dragover.prevent="alvoDoArraste = topico"
            @dragleave="alvoDoArraste = alvoDoArraste === topico ? null : alvoDoArraste"
            @drop.prevent="aoSoltar($event, topico)"
          >
            <h3 class="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span
                v-if="topico !== 'disponivel'"
                class="size-1.5 rounded-full"
                :class="topico === 'visto' ? 'bg-emerald-500' : 'bg-sky-500'"
              />
              {{ TOPICO_ROTULO[topico] }}
              <span class="rounded-full bg-muted px-1.5 text-[10px]">{{ porTopico[topico].length }}</span>
            </h3>

            <div v-if="porTopico[topico].length" class="grid grid-cols-5 gap-2">
              <CartazDoEspaco
                v-for="item in porTopico[topico]"
                :key="item.id"
                :item="item"
                :membros-no-estado="membrosNoTopico(item, topico)"
                :pode-entrar="!euEstouEm(item, topico)"
                :entrando="emAndamento.has(`${item.id}:${topico}`)"
                @entrar="entrarNoTopico(item, topico)"
              />
            </div>
            <p v-else class="px-1 pb-1 text-sm text-muted-foreground">
              {{ topico === 'disponivel' ? 'Tudo já tem data.' : 'Nada neste recorte.' }}
            </p>
          </section>

          <p v-if="!itens?.length" class="text-sm text-muted-foreground">
            Ainda não há nada na lista — busque um filme acima para começar.
          </p>
        </div>
      </div>
    </section>

    <!-- 3. Segmentado pelo meu status -->
    <section v-if="!buscando && itens?.length" class="space-y-6">
      <template v-for="[status, lista] in porStatus" :key="status">
        <section v-if="lista.length">
          <h2 class="mb-3 flex items-center gap-2 text-sm font-medium">
            {{ STATUS_ROTULO[status] }}
            <span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {{ lista.length }}
            </span>
          </h2>

          <div class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
            <CartazDoEspaco
              v-for="item in lista"
              :key="item.id"
              :item="item"
              :arrastavel="false"
              :membros-no-estado="membrosComStatus(item, status)"
              :pode-entrar="meuStatus(item) !== status"
              :entrando="emAndamento.has(`${item.id}:${status}`)"
              @entrar="assumirStatus(item, status)"
            />
          </div>
        </section>
      </template>
    </section>

    <Dialog :open="!!dialogoData" @update:open="dialogoData = null">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {{ dialogoData ? TOPICO_ROTULO[dialogoData.topico] : '' }}
          </DialogTitle>
          <DialogDescription>
            {{ dialogoData?.topico === 'visto'
              ? `Quando você assistiu "${dialogoData?.item.media.titulo}"?`
              : `Para quando querem ver "${dialogoData?.item.media.titulo}"?` }}
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-2">
          <Label for="data-topico">Data</Label>
          <Input id="data-topico" v-model="dataEscolhida" type="date" />
        </div>

        <DialogFooter>
          <Button variant="ghost" @click="dialogoData = null">Cancelar</Button>
          <Button :disabled="!dataEscolhida" @click="confirmarData">Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
