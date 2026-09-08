<script setup lang="ts">
/**
 * A estante — o que cada um quer ler, está lendo, leu e largou.
 *
 * SEM CALENDÁRIO, e essa é a diferença deliberada para Filmes. Lá o calendário
 * existe porque filme é uma noite marcada, e "sábado" é a informação que
 * organiza a tela. Livro leva semanas e é solitário: a pergunta não é "quando",
 * é "em que pé está". Por isso o eixo aqui é a prateleira, e a data só aparece
 * onde ela significa alguma coisa — o dia em que você terminou, que é o que
 * alimenta a meta do ano.
 *
 * A estante é COMPARTILHADA e as prateleiras são PESSOAIS. O livro entra no
 * espaço uma vez; a partir daí cada um diz o que ele é para si. É o que permite
 * um estar lendo enquanto o outro ainda nem começou, sem duas listas separadas.
 */
import { useQuery } from '@tanstack/vue-query'
import { refDebounced } from '@vueuse/core'
import { toast } from 'vue-sonner'
import { BookOpenIcon, PlusIcon, SearchIcon, TargetIcon } from '@lucide/vue'
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
import { formatarDia, hojeIso } from '@/lib/datas'
import { capaEmAlta } from '@/lib/capa'
import { mensagemDeErro } from '@/lib/utils'
import type { ResultadoBuscaLivro } from '~~/server/utils/livros'
import type { ItemDoEspaco, ItemParaAdicionar, StatusItem } from '~/types/catalogo'
import {
  PRATELEIRAS,
  avaliacaoDe,
  fraseDaMeta,
  paginasDoLivro,
  porPrateleira,
  prateleiraDe,
  progressoDaLeitura,
  progressoDaMeta,
  semPrateleira,
} from '~/types/livro'
import { useAdicionarItem, useAvaliar, useItens } from '~/composables/useCatalogo'
import { useApagarMeta, useDefinirMeta, useMetasDeLeitura } from '~/composables/useLivros'
import { useMembros } from '~/composables/useMembros'
import { useUsuarioId } from '~/composables/useUsuarioId'

useHead({ title: 'Livros · APPingos' })

const ANO = new Date().getFullYear()

const euId = useUsuarioId()
const { data: itens, isPending } = useItens(['livro'])
const { data: membros } = useMembros()
const { data: metas } = useMetasDeLeitura(ANO)
const adicionar = useAdicionarItem()
const avaliar = useAvaliar()
const definirMeta = useDefinirMeta()
const apagarMeta = useApagarMeta()

// ---- Busca ------------------------------------------------------------------

const termo = ref('')
const termoDebounced = refDebounced(termo, 350)
const idsAdicionando = ref(new Set<string>())

const busca = useQuery({
  queryKey: computed(() => ['livros', 'busca', termoDebounced.value]),
  enabled: computed(() => termoDebounced.value.trim().length >= 2),
  queryFn: () => $fetch<ResultadoBuscaLivro[]>('/api/livros/busca', {
    query: { q: termoDebounced.value.trim() },
  }),
})

const buscando = computed(() => termoDebounced.value.trim().length >= 2)

/*
 * O que já está no espaço, por `fonte_id`.
 *
 * Pelo id do Google, e não por título+ano como Filmes faz: o mesmo livro tem
 * dezenas de edições com títulos idênticos, e comparar texto marcaria "já está
 * na lista" para uma edição que ninguém adicionou.
 */
const jaNoEspaco = computed(() =>
  new Set((itens.value ?? []).map(i => i.media.fonte_id)),
)

async function onAdicionar(livro: ResultadoBuscaLivro) {
  idsAdicionando.value = new Set(idsAdicionando.value).add(livro.fonte_id)
  try {
    /*
     * A sinopse só custa uma segunda chamada quando a fonte não a trouxe.
     *
     * O Google Books já devolve a descrição na própria busca; a Open Library
     * não, e nela isso vira uma ida a `/works/{id}` — feita aqui e não durante a
     * busca, senão seriam vinte requisições por tecla digitada para um texto que
     * a lista nem mostra.
     *
     * Falhar não impede nada: o endpoint devolve `null` em vez de estourar, e o
     * livro entra na estante do mesmo jeito.
     */
    const sinopse = livro.sinopse ?? (livro.fonte === 'open-library'
      ? (await $fetch<{ sinopse: string | null }>(
          `/api/livros/${encodeURIComponent(livro.fonte_id)}`,
        )).sinopse
      : null)

    const item: ItemParaAdicionar = {
      tipo: 'livro',
      fonte: livro.fonte,
      fonte_id: livro.fonte_id,
      titulo: livro.titulo,
      titulo_original: null,
      ano: livro.ano,
      capa_url: livro.capa_url,
      sinopse,
      // `paginas` é o que a barra de progresso da leitura precisa; sem ele a
      // tela mostra "pág. 80" sem barra. Ver progressoDaLeitura.
      metadados: {
        paginas: livro.paginas,
        autores: livro.autores,
      },
    }
    await adicionar.mutateAsync(item)
    toast.success(`"${livro.titulo}" entrou na estante.`)
    termo.value = ''
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para adicionar.'))
  }
  finally {
    const copia = new Set(idsAdicionando.value)
    copia.delete(livro.fonte_id)
    idsAdicionando.value = copia
  }
}

// ---- Prateleiras ------------------------------------------------------------

const estante = computed(() => porPrateleira(itens.value ?? [], euId.value ?? null))
const sugestoes = computed(() => semPrateleira(itens.value ?? [], euId.value ?? null))

const emAndamento = ref(new Set<string>())

/**
 * O diálogo de "Lido" pede a data porque é ela que faz a meta contar.
 *
 * Marcar sem data é permitido (o "não lembro" de Filmes), mas o livro fica fora
 * do ano — e é melhor a pessoa escolher isso do que descobrir depois que a
 * barra não mexeu.
 */
const dialogoLido = ref<ItemDoEspaco | null>(null)
const dataDeLeitura = ref(hojeIso())

function pedirPrateleira(item: ItemDoEspaco, status: StatusItem) {
  if (prateleiraDe(item, euId.value ?? null) === status) return

  if (status === 'visto') {
    dataDeLeitura.value = hojeIso()
    dialogoLido.value = item
    return
  }

  mover(item, status, null)
}

async function mover(item: ItemDoEspaco, status: StatusItem, visto_em: string | null) {
  const chave = `${item.id}:${status}`
  if (emAndamento.value.has(chave)) return
  emAndamento.value = new Set(emAndamento.value).add(chave)

  try {
    /*
     * Sair de "Lido" limpa a data, e sair de "Lendo" limpa a página.
     *
     * Sem isso, um livro devolvido para "Quero ler" continuaria contando na
     * meta do ano (a data ficou lá) e voltaria com a página velha se fosse
     * retomado — dois estados que a tela não mostraria e ninguém entenderia.
     */
    await avaliar.mutateAsync({
      entryId: item.id,
      status,
      visto_em: status === 'visto' ? visto_em : null,
      pagina_atual: status === 'vendo' ? avaliacaoDe(item, euId.value ?? null)?.pagina_atual ?? null : null,
    })

    const rotulo = PRATELEIRAS.find(p => p.valor === status)?.rotulo ?? status
    toast.success(`"${item.media.titulo}" → ${rotulo}.`)
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

function confirmarLido(semData = false) {
  const item = dialogoLido.value
  if (!item) return
  dialogoLido.value = null
  mover(item, 'visto', semData ? null : dataDeLeitura.value)
}

// ---- Em que página estou ----------------------------------------------------

const dialogoPagina = ref<ItemDoEspaco | null>(null)

/*
 * `undefined` e não `null` para o campo vazio: o `Input` do shadcn aceita
 * `string | number | undefined` no v-model, e `null` não passa no typecheck. O
 * banco continua guardando `null` — a conversão acontece na hora de salvar.
 */
const paginaDigitada = ref<number | undefined>(undefined)

function pedirPagina(item: ItemDoEspaco) {
  paginaDigitada.value = avaliacaoDe(item, euId.value ?? null)?.pagina_atual ?? undefined
  dialogoPagina.value = item
}

async function salvarPagina() {
  const item = dialogoPagina.value
  if (!item) return
  dialogoPagina.value = null

  try {
    await avaliar.mutateAsync({
      entryId: item.id,
      status: 'vendo',
      pagina_atual: paginaDigitada.value ?? null,
    })
    toast.success('Anotado.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para anotar a página.'))
  }
}

// ---- A meta do ano ----------------------------------------------------------

const dialogoMeta = ref(false)
const alvoDigitado = ref<number | undefined>(undefined)

const minhaMeta = computed(() => metas.value?.find(m => m.user_id === euId.value) ?? null)

const meuProgresso = computed(() =>
  progressoDaMeta(itens.value ?? [], euId.value ?? null, minhaMeta.value),
)

/** As metas das OUTRAS pessoas do espaço — a barra de quem lê com você. */
const progressoDosOutros = computed(() =>
  (metas.value ?? [])
    .filter(m => m.user_id !== euId.value)
    .map(meta => ({
      userId: meta.user_id,
      nome: membros.value?.find(m => m.user_id === meta.user_id)?.exibicao ?? 'Alguém',
      progresso: progressoDaMeta(itens.value ?? [], meta.user_id, meta),
    }))
    .filter(m => m.progresso),
)

function abrirMeta() {
  alvoDigitado.value = minhaMeta.value?.alvo ?? 12
  dialogoMeta.value = true
}

async function salvarMeta() {
  const alvo = alvoDigitado.value
  dialogoMeta.value = false
  if (!alvo || alvo < 1) return

  try {
    await definirMeta.mutateAsync({ ano: ANO, alvo })
    toast.success(`Meta de ${ANO}: ${alvo} ${alvo === 1 ? 'livro' : 'livros'}.`)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para salvar a meta.'))
  }
}

async function removerMeta() {
  dialogoMeta.value = false
  try {
    await apagarMeta.mutateAsync({ ano: ANO })
    toast.success('Meta removida.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para remover a meta.'))
  }
}

/** "Ana Silva" → "Ana". A barra é estreita, e o primeiro nome basta. */
function primeiroNome(nome: string): string {
  return nome.split(' ')[0] || nome
}

function autoresDe(item: ItemDoEspaco): string | null {
  const autores = (item.media.metadados as { autores?: unknown } | null)?.autores
  return Array.isArray(autores) && autores.length ? autores.join(', ') : null
}
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">Livros</h1>
        <p class="text-sm text-muted-foreground">
          A estante de vocês: o que quer ler, o que está lendo e o que já leu.
        </p>
      </div>

      <Button variant="outline" class="gap-1.5" @click="abrirMeta">
        <TargetIcon class="size-4" />
        {{ minhaMeta ? 'Mudar a meta' : 'Definir meta' }}
      </Button>
    </header>

    <!-- A meta do ano, sua e de quem lê com você -->
    <section v-if="meuProgresso || progressoDosOutros.length" class="space-y-3 rounded-lg border bg-card p-4">
      <h2 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Meta de {{ ANO }}
      </h2>

      <div v-if="meuProgresso" class="space-y-1.5">
        <div class="flex items-baseline justify-between gap-2 text-sm">
          <span class="font-medium">Você</span>
          <span :class="meuProgresso.cumprida ? 'font-medium text-primary' : 'text-muted-foreground'">
            {{ fraseDaMeta(meuProgresso) }}
          </span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-muted">
          <div class="h-full rounded-full bg-primary transition-[width]" :style="{ width: `${meuProgresso.percentual}%` }" />
        </div>
      </div>

      <div v-for="outro in progressoDosOutros" :key="outro.userId" class="space-y-1.5">
        <div class="flex items-baseline justify-between gap-2 text-sm">
          <span class="font-medium">{{ primeiroNome(outro.nome) }}</span>
          <span class="text-muted-foreground">{{ fraseDaMeta(outro.progresso!) }}</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-muted">
          <div class="h-full rounded-full bg-primary/50 transition-[width]" :style="{ width: `${outro.progresso!.percentual}%` }" />
        </div>
      </div>
    </section>

    <!-- Busca -->
    <section class="space-y-4">
      <div class="relative">
        <SearchIcon class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          v-model="termo"
          placeholder="Buscar livro ou autor…"
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
            v-for="livro in busca.data.value"
            :key="livro.fonte_id"
            :titulo="livro.titulo"
            :ano="livro.ano"
            :capa-url="capaEmAlta(livro.capa_url)"
            :legenda="livro.autores[0] ?? null"
          >
            <template #overlay>
              <button
                v-if="!jaNoEspaco.has(livro.fonte_id)"
                type="button"
                class="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1 rounded-md bg-primary py-1.5 text-xs font-medium text-primary-foreground shadow-sm disabled:opacity-60"
                :disabled="idsAdicionando.has(livro.fonte_id)"
                @click="onAdicionar(livro)"
              >
                <PlusIcon class="size-3.5" />
                {{ idsAdicionando.has(livro.fonte_id) ? 'Colocando…' : 'Pôr na estante' }}
              </button>
              <span
                v-else
                class="absolute inset-x-2 bottom-2 rounded-md bg-background/90 py-1.5 text-center text-xs font-medium"
              >
                Já está na estante
              </span>
            </template>
          </PosterCard>
        </div>
      </template>
    </section>

    <!-- A estante -->
    <template v-if="!buscando">
      <div v-if="isPending" class="space-y-6">
        <Skeleton v-for="i in 2" :key="i" class="h-48 w-full rounded-lg" />
      </div>

      <template v-else>
        <!-- Sugestões: o outro pôs na estante e você ainda não disse nada -->
        <section v-if="sugestoes.length" class="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
          <h2 class="text-sm font-medium">
            Na estante, esperando o que você acha
            <span class="text-muted-foreground">{{ sugestoes.length }}</span>
          </h2>

          <div class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
            <div v-for="item in sugestoes" :key="item.id" class="space-y-1.5">
              <NuxtLink :to="`/livros/${item.id}`">
                <PosterCard
                  :titulo="item.media.titulo"
                  :ano="item.media.ano"
                  :capa-url="capaEmAlta(item.media.capa_url)"
                  :legenda="autoresDe(item)"
                />
              </NuxtLink>
              <button
                type="button"
                class="w-full rounded-md border py-1 text-[11px] font-medium hover:border-primary/50 disabled:opacity-60"
                :disabled="emAndamento.has(`${item.id}:quero`)"
                @click="pedirPrateleira(item, 'quero')"
              >
                Quero ler
              </button>
            </div>
          </div>
        </section>

        <section
          v-for="prateleira in PRATELEIRAS"
          :key="prateleira.valor"
          class="space-y-3"
        >
          <h2 class="flex items-center gap-2 text-sm font-medium">
            {{ prateleira.rotulo }}
            <span class="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">
              {{ estante[prateleira.valor].length }}
            </span>
          </h2>

          <div
            v-if="estante[prateleira.valor].length"
            class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6"
          >
            <div v-for="item in estante[prateleira.valor]" :key="item.id" class="space-y-1.5">
              <!--
                A capa leva ao detalhe — resumo, resenha e a saída da estante.
                O link envolve só a capa: os botões abaixo dela mudam a
                prateleira sem sair da tela, que é o gesto rápido do dia a dia.
              -->
              <NuxtLink :to="`/livros/${item.id}`">
                <PosterCard
                  :titulo="item.media.titulo"
                  :ano="item.media.ano"
                  :capa-url="capaEmAlta(item.media.capa_url)"
                  :legenda="autoresDe(item)"
                >
                  <template v-if="prateleira.valor === 'vendo' && progressoDaLeitura(item, euId ?? null) !== null" #rodape>
                    <div class="h-1 overflow-hidden rounded-full bg-white/30">
                      <div
                        class="h-full rounded-full bg-white"
                        :style="{ width: `${progressoDaLeitura(item, euId ?? null)}%` }"
                      />
                    </div>
                  </template>
                </PosterCard>
              </NuxtLink>

              <!-- "Lendo" ganha a linha da página; as outras, o próximo passo -->
              <button
                v-if="prateleira.valor === 'vendo'"
                type="button"
                class="w-full rounded-md border py-1 text-[11px] font-medium hover:border-primary/50"
                @click="pedirPagina(item)"
              >
                <template v-if="avaliacaoDe(item, euId ?? null)?.pagina_atual">
                  pág. {{ avaliacaoDe(item, euId ?? null)!.pagina_atual }}<template v-if="paginasDoLivro(item)"> de {{ paginasDoLivro(item) }}</template>
                </template>
                <template v-else>Em que página?</template>
              </button>

              <div class="flex gap-1">
                <button
                  v-for="destino in PRATELEIRAS.filter(p => p.valor !== prateleira.valor)"
                  :key="destino.valor"
                  type="button"
                  class="flex-1 rounded-md border py-1 text-[10px] font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground disabled:opacity-60"
                  :title="`Mover para ${destino.rotulo}`"
                  :disabled="emAndamento.has(`${item.id}:${destino.valor}`)"
                  @click="pedirPrateleira(item, destino.valor)"
                >
                  {{ destino.rotulo }}
                </button>
              </div>
            </div>
          </div>

          <p v-else class="text-sm text-muted-foreground">{{ prateleira.vazio }}</p>
        </section>

        <div
          v-if="!itens?.length"
          class="grid place-items-center rounded-xl border border-dashed bg-card/50 px-6 py-16 text-center"
        >
          <span class="grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
            <BookOpenIcon class="size-6" />
          </span>
          <p class="mt-4 font-medium">A estante está vazia.</p>
          <p class="mt-1 max-w-sm text-sm text-muted-foreground">
            Busque um livro acima. O que um põe aqui, o outro vê — e cada um marca
            o que ele é para si.
          </p>
        </div>
      </template>
    </template>

    <!-- Terminei de ler -->
    <Dialog :open="!!dialogoLido" @update:open="dialogoLido = null">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Terminou!</DialogTitle>
          <DialogDescription>
            Quando você terminou "{{ dialogoLido?.media.titulo }}"? É esta data que
            faz o livro contar na meta de {{ ANO }}.
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-2">
          <Label for="data-leitura">Data</Label>
          <Input id="data-leitura" v-model="dataDeLeitura" type="date" />
        </div>

        <DialogFooter class="sm:justify-between">
          <Button variant="ghost" @click="confirmarLido(true)">Não lembro</Button>
          <span class="flex gap-2">
            <Button variant="ghost" @click="dialogoLido = null">Cancelar</Button>
            <Button :disabled="!dataDeLeitura" @click="confirmarLido()">Confirmar</Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Em que página estou -->
    <Dialog :open="!!dialogoPagina" @update:open="dialogoPagina = null">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Em que página você está?</DialogTitle>
          <DialogDescription>
            {{ dialogoPagina?.media.titulo }}<template v-if="dialogoPagina && paginasDoLivro(dialogoPagina)"> · {{ paginasDoLivro(dialogoPagina) }} páginas</template>
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-2">
          <Label for="pagina-atual">Página</Label>
          <Input id="pagina-atual" v-model.number="paginaDigitada" type="number" min="0" />
        </div>

        <DialogFooter>
          <Button variant="ghost" @click="dialogoPagina = null">Cancelar</Button>
          <Button @click="salvarPagina">Anotar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- A meta -->
    <Dialog v-model:open="dialogoMeta">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Meta de {{ ANO }}</DialogTitle>
          <DialogDescription>
            Quantos livros você quer ler este ano? A meta é sua — quem lê com você
            tem a dela, e as duas aparecem lado a lado.
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-2">
          <Label for="alvo-meta">Livros</Label>
          <Input id="alvo-meta" v-model.number="alvoDigitado" type="number" min="1" max="999" />
        </div>

        <DialogFooter class="sm:justify-between">
          <Button v-if="minhaMeta" variant="ghost" @click="removerMeta">Remover meta</Button>
          <span v-else />
          <span class="flex gap-2">
            <Button variant="ghost" @click="dialogoMeta = false">Cancelar</Button>
            <Button :disabled="!alvoDigitado || alvoDigitado < 1" @click="salvarMeta">Salvar</Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
