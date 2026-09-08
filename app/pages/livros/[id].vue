<script setup lang="ts">
/**
 * Um livro — o resumo, a sua avaliação e a saída.
 *
 * A ESTANTE NÃO CABIA TUDO. A grade de capas responde "o que eu tenho e em que
 * pé está", e é boa nisso justamente por ser curta. Sinopse, resenha e a opção
 * de tirar o livro do espaço são coisas de um por vez — cada uma delas na grade
 * viraria um cartão que não cabe no polegar.
 *
 * A AVALIAÇÃO TRAVA DEPOIS DE ENVIADA, e você só vê a do outro depois de mandar
 * a sua. É a mesma mecânica de Filmes e existe pelo mesmo motivo: num espaço de
 * duas pessoas, ler "achei fraco" antes de escrever a sua opinião contamina a
 * opinião. O status, a página e a data seguem editáveis — eles são fato, não
 * juízo.
 */
import { toast } from 'vue-sonner'
import { ArrowLeftIcon, BookOpenIcon, Trash2Icon } from '@lucide/vue'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { capaEmAlta, fundoDaCapa } from '@/lib/capa'
import { formatarDia } from '@/lib/datas'
import { mensagemDeErro } from '@/lib/utils'
import type { StatusItem } from '~/types/catalogo'
import { PRATELEIRAS, paginasDoLivro, progressoDaLeitura } from '~/types/livro'
import { useAvaliar, useItem, useRemoverItem } from '~/composables/useCatalogo'
import { useMembros } from '~/composables/useMembros'
import { useUsuarioId } from '~/composables/useUsuarioId'

const route = useRoute()
const entryId = route.params.id as string

const euId = useUsuarioId()
const { data: item, isPending, isError, error } = useItem(entryId)
const { data: membros } = useMembros()
const avaliar = useAvaliar()
const remover = useRemoverItem()

useHead({ title: () => `${item.value?.media.titulo ?? 'Carregando…'} · APPingos` })

const minhaAvaliacao = computed(() =>
  item.value?.avaliacoes.find(a => a.user_id === euId.value) ?? null,
)

const jaEnviei = computed(() => !!minhaAvaliacao.value?.enviado_em)

/**
 * Só as avaliações de fato enviadas.
 *
 * Pôr um livro na estante já cria a linha de `rating` com o status — ela existe
 * sem ninguém ter opinado. Sem este filtro, a seção "o que acharam" mostraria
 * uma pessoa com nota vazia como se ela tivesse avaliado.
 */
const avaliacoesEnviadas = computed(() =>
  (item.value?.avaliacoes ?? []).filter(a => a.enviado_em),
)

const deOutros = computed(() =>
  avaliacoesEnviadas.value.filter(a => a.user_id !== euId.value),
)

function nomeDoMembro(userId: string): string {
  return membros.value?.find(m => m.user_id === userId)?.exibicao ?? 'Alguém'
}

function autoresDoLivro(): string | null {
  const autores = (item.value?.media.metadados as { autores?: unknown } | null)?.autores
  return Array.isArray(autores) && autores.length ? autores.join(', ') : null
}

// ---- A avaliação -------------------------------------------------------------

const notaRascunho = ref<number | null>(null)
const resenhaRascunho = ref('')
const enviando = ref(false)

/*
 * O rascunho é semeado UMA vez.
 *
 * Re-semear a cada mudança de `minhaAvaliacao` parece inofensivo e apaga o que
 * a pessoa está digitando: anotar a página revalida o item, o watcher dispara, e
 * a resenha meio escrita volta ao estado do banco. Foi o bug que Filmes já
 * tinha documentado — ver o comentário equivalente em filmes/[id].vue.
 */
const rascunhoIniciado = ref(false)

watch([item, jaEnviei], () => {
  if (!item.value || rascunhoIniciado.value || jaEnviei.value) return
  notaRascunho.value = minhaAvaliacao.value?.nota ?? null
  resenhaRascunho.value = minhaAvaliacao.value?.resenha ?? ''
  rascunhoIniciado.value = true
}, { immediate: true })

async function onEnviarAvaliacao() {
  if (notaRascunho.value == null) return
  enviando.value = true
  try {
    await avaliar.mutateAsync({
      entryId,
      nota: notaRascunho.value,
      resenha: resenhaRascunho.value.trim() || null,
      enviado_em: new Date().toISOString(),
    })
    toast.success('Avaliação enviada.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para enviar a avaliação.'))
  }
  finally {
    enviando.value = false
  }
}

// ---- Prateleira e página (seguem editáveis) ---------------------------------

const dialogoLido = ref(false)
const dataDeLeitura = ref('')

async function mover(status: StatusItem, visto_em?: string | null) {
  try {
    await avaliar.mutateAsync({
      entryId,
      status,
      visto_em: status === 'visto' ? (visto_em ?? null) : null,
      pagina_atual: status === 'vendo' ? minhaAvaliacao.value?.pagina_atual ?? null : null,
    })
    const rotulo = PRATELEIRAS.find(p => p.valor === status)?.rotulo ?? status
    toast.success(`Agora em "${rotulo}".`)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para mover.'))
  }
}

function pedirPrateleira(status: StatusItem) {
  if (minhaAvaliacao.value?.status === status) return
  if (status === 'visto') {
    dataDeLeitura.value = new Date().toISOString().slice(0, 10)
    dialogoLido.value = true
    return
  }
  mover(status)
}

const paginaRascunho = ref<number | undefined>(undefined)
const salvandoPagina = ref(false)

watch(minhaAvaliacao, (av) => {
  if (!salvandoPagina.value) paginaRascunho.value = av?.pagina_atual ?? undefined
}, { immediate: true })

async function salvarPagina() {
  salvandoPagina.value = true
  try {
    await avaliar.mutateAsync({ entryId, status: 'vendo', pagina_atual: paginaRascunho.value ?? null })
    toast.success('Anotado.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para anotar a página.'))
  }
  finally {
    salvandoPagina.value = false
  }
}

// ---- Tirar da estante --------------------------------------------------------

const dialogoRemover = ref(false)
const removendo = ref(false)

/**
 * Some para os DOIS, e o diálogo diz isso.
 *
 * "Larguei" é uma prateleira sua; isto apaga a linha do espaço, junto com a
 * nota e a resenha de quem quer que seja. Confirmar num diálogo com o título
 * escrito, e não num `confirm()` do navegador, porque a ação é irreversível e o
 * nome do livro é a única coisa que distingue "este" de "aquele outro".
 */
async function onRemover() {
  removendo.value = true
  try {
    await remover.mutateAsync(entryId)
    toast.success('Tirado da estante.')
    await navigateTo('/livros')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para tirar da estante.'))
    removendo.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <NuxtLink to="/livros" class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeftIcon class="size-4" />
      Estante
    </NuxtLink>

    <div v-if="isPending" class="grid gap-6 sm:grid-cols-[12rem_1fr]">
      <Skeleton class="aspect-[2/3] w-full rounded-lg" />
      <div class="space-y-3">
        <Skeleton class="h-7 w-2/3" />
        <Skeleton class="h-24 w-full" />
      </div>
    </div>

    <p v-else-if="isError" class="text-sm text-destructive">
      {{ mensagemDeErro(error, 'Não deu para carregar o livro.') }}
    </p>

    <template v-else-if="item">
      <div class="grid gap-6 sm:grid-cols-[12rem_1fr] sm:items-start">
        <!--
          A capa, no mesmo desenho da estante: imagem quando há, título composto
          quando não.

          `w-36` no celular porque em coluna única a capa 2:3 em largura total
          fica com quase mil pixels de altura — uma tela inteira de capa antes
          de o resumo começar. A partir de `sm` ela ocupa a coluna de 12rem do
          grid e o `w-auto` devolve o controle para ele.
        -->
        <div class="w-36 overflow-hidden rounded-lg border sm:w-auto">
          <img
            v-if="item.media.capa_url"
            :src="capaEmAlta(item.media.capa_url)!"
            :alt="`Capa de ${item.media.titulo}`"
            class="aspect-[2/3] w-full object-cover"
          >
          <div
            v-else
            class="flex aspect-[2/3] w-full flex-col justify-between p-4 text-white"
            :style="{ background: fundoDaCapa(`${item.media.titulo}${autoresDoLivro() ?? ''}`) }"
            aria-hidden="true"
          >
            <p class="font-display text-base font-semibold leading-tight tracking-tight">
              {{ item.media.titulo }}
            </p>
            <p v-if="autoresDoLivro()" class="text-xs text-white/75">{{ autoresDoLivro() }}</p>
          </div>
        </div>

        <div class="min-w-0 space-y-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h1 class="text-xl font-semibold leading-tight">{{ item.media.titulo }}</h1>
              <p class="mt-1 text-sm text-muted-foreground">
                {{ [autoresDoLivro(), item.media.ano, paginasDoLivro(item) ? `${paginasDoLivro(item)} páginas` : null].filter(Boolean).join(' · ') }}
              </p>
            </div>

            <Button
              variant="ghost"
              size="icon"
              class="shrink-0 text-muted-foreground hover:text-destructive"
              aria-label="Tirar da estante"
              title="Tirar da estante"
              @click="dialogoRemover = true"
            >
              <Trash2Icon class="size-4" />
            </Button>
          </div>

          <!-- O resumo -->
          <section>
            <h2 class="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Resumo
            </h2>
            <p v-if="item.media.sinopse" class="whitespace-pre-line text-sm leading-relaxed">
              {{ item.media.sinopse }}
            </p>
            <p v-else class="text-sm text-muted-foreground">
              O catálogo não trouxe resumo deste livro.
            </p>
          </section>

          <!-- A prateleira -->
          <section class="space-y-2">
            <h2 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Na sua estante
            </h2>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="prateleira in PRATELEIRAS"
                :key="prateleira.valor"
                type="button"
                class="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                :class="minhaAvaliacao?.status === prateleira.valor
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:border-primary/40 hover:text-foreground'"
                @click="pedirPrateleira(prateleira.valor)"
              >
                {{ prateleira.rotulo }}
              </button>
            </div>

            <p v-if="minhaAvaliacao?.visto_em" class="text-xs text-muted-foreground">
              Terminado em {{ formatarDia(minhaAvaliacao.visto_em) }}.
            </p>

            <!-- A página só faz sentido enquanto o livro está na mão -->
            <div v-if="minhaAvaliacao?.status === 'vendo'" class="flex flex-wrap items-end gap-2 pt-1">
              <div class="space-y-1">
                <Label for="pagina" class="text-xs">Página atual</Label>
                <Input id="pagina" v-model.number="paginaRascunho" type="number" min="0" class="h-9 w-28" />
              </div>
              <Button size="sm" variant="outline" :disabled="salvandoPagina" @click="salvarPagina">
                Anotar
              </Button>
              <p v-if="progressoDaLeitura(item, euId ?? null) !== null" class="pb-2 text-xs text-muted-foreground">
                {{ progressoDaLeitura(item, euId ?? null) }}% de {{ paginasDoLivro(item) }} páginas
              </p>
            </div>
          </section>
        </div>
      </div>

      <!-- A resenha -->
      <section class="space-y-3 rounded-lg border bg-card p-4">
        <h2 class="text-sm font-medium">O que você achou</h2>

        <div v-if="jaEnviei" class="space-y-2">
          <NotaEstrelas :nota="minhaAvaliacao!.nota" somente-leitura />
          <p v-if="minhaAvaliacao!.resenha" class="whitespace-pre-line text-sm">
            {{ minhaAvaliacao!.resenha }}
          </p>
          <p class="text-xs text-muted-foreground">
            Avaliação enviada — nota e resenha não mudam mais.
          </p>
        </div>

        <form v-else class="space-y-3" @submit.prevent="onEnviarAvaliacao">
          <div class="space-y-1.5">
            <Label>Sua nota</Label>
            <NotaEstrelas :nota="notaRascunho" @update:nota="notaRascunho = $event" />
          </div>

          <div class="space-y-1.5">
            <Label for="resenha">
              Sua resenha <span class="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea id="resenha" v-model="resenhaRascunho" rows="4" placeholder="O que ficou desse livro?" />
          </div>

          <Button type="submit" :disabled="notaRascunho == null || enviando">
            {{ enviando ? 'Enviando…' : 'Enviar avaliação' }}
          </Button>
          <p class="text-xs text-muted-foreground">
            Depois de enviar, a nota e a resenha ficam fixas — e só então você vê
            a avaliação de quem lê com você.
          </p>
        </form>
      </section>

      <!--
        A do outro, revelada só depois da sua. Ver o comentário do topo: ler a
        opinião alheia antes de escrever a própria contamina a própria.
      -->
      <section v-if="jaEnviei && deOutros.length" class="space-y-3">
        <h2 class="text-sm font-medium">O que acharam</h2>
        <div v-for="avaliacao in deOutros" :key="avaliacao.user_id" class="rounded-lg border bg-card p-4">
          <p class="text-sm font-medium">{{ nomeDoMembro(avaliacao.user_id) }}</p>
          <NotaEstrelas class="mt-1" :nota="avaliacao.nota" somente-leitura tamanho="sm" />
          <p v-if="avaliacao.resenha" class="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {{ avaliacao.resenha }}
          </p>
        </div>
      </section>

      <p v-else-if="jaEnviei" class="text-sm text-muted-foreground">
        Quem lê com você ainda não avaliou este livro.
      </p>
    </template>

    <div v-else class="grid place-items-center rounded-xl border border-dashed bg-card/50 px-6 py-16 text-center">
      <BookOpenIcon class="size-6 text-muted-foreground" />
      <p class="mt-3 font-medium">Este livro não está mais na estante.</p>
      <NuxtLink to="/livros" class="mt-1 text-sm text-primary hover:underline">Voltar</NuxtLink>
    </div>

    <!-- Terminei de ler -->
    <Dialog v-model:open="dialogoLido">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Terminou!</DialogTitle>
          <DialogDescription>
            Quando você terminou? É esta data que faz o livro contar na meta do ano.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-2">
          <Label for="data-fim">Data</Label>
          <Input id="data-fim" v-model="dataDeLeitura" type="date" />
        </div>
        <DialogFooter class="sm:justify-between">
          <Button variant="ghost" @click="dialogoLido = false; mover('visto', null)">Não lembro</Button>
          <span class="flex gap-2">
            <Button variant="ghost" @click="dialogoLido = false">Cancelar</Button>
            <Button :disabled="!dataDeLeitura" @click="dialogoLido = false; mover('visto', dataDeLeitura)">
              Confirmar
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Tirar da estante -->
    <Dialog v-model:open="dialogoRemover">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tirar "{{ item?.media.titulo }}" da estante?</DialogTitle>
          <DialogDescription>
            Some para os dois, junto com as notas e resenhas que já estiverem
            aqui. Não dá para desfazer — mas o livro continua no catálogo, então
            é só buscar de novo se mudar de ideia.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" @click="dialogoRemover = false">Cancelar</Button>
          <Button variant="destructive" :disabled="removendo" @click="onRemover">
            {{ removendo ? 'Tirando…' : 'Tirar da estante' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
