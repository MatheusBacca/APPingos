<script setup lang="ts">
/**
 * A galeria, agrupada pelo que falta acontecer com cada foto.
 *
 * O filtro padrão é "esperando curtida", e não "todas": a pergunta que traz alguém
 * a esta tela é "tem algo esperando por mim?". Abrir na galeria inteira responderia
 * "olha, tem 140 fotos" — verdadeiro e inútil, e pior a cada mês de uso.
 *
 * As URLs são pedidas para as fotos VISÍVEIS, não para todas: o filtro corta a
 * lista antes das assinaturas, então abrir em "esperando" não assina as cento e
 * quarenta já postadas.
 */
import { useLocalStorage } from '@vueuse/core'
import { toast } from 'vue-sonner'
import { CameraIcon, DownloadIcon, UploadIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarInstante, tempoRelativo } from '@/lib/datas'
import { mensagemDeErro } from '@/lib/utils'
import type { Foto, GrupoDeLote, SituacaoFoto } from '~/types/foto'
import { SITUACOES, agruparPorLote, agruparPorSituacao, contarPorSituacao } from '~/types/foto'
import { useAlternarCurtida, useBaixarFotos, useFotos, useUrlsDasFotos } from '~/composables/useFotos'
import { nomeDaPessoa, useMembros, usePessoas } from '~/composables/useMembros'
import { useUsuarioId } from '~/composables/useUsuarioId'

useHead({ title: 'Fotos · APPingos' })

const { data: fotos, isPending, isError, error } = useFotos()
const { data: membros } = useMembros()
const { data: pessoas } = usePessoas()
const curtir = useAlternarCurtida()
const { baixar, baixando } = useBaixarFotos()
const euId = useUsuarioId()

const enviando = ref(false)
const aberta = ref<Foto | null>(null)

/**
 * `null` = todas. Guardado como o filtro de Interesses: quem foi ver as postadas
 * costuma olhar mais de uma, e perder o filtro ao abrir e fechar uma foto seria
 * atrito num gesto que se repete.
 */
const filtro = useLocalStorage<SituacaoFoto | null>('appingos:fotos:situacao', 'esperando')

const totalDeMembros = computed(() => membros.value?.length ?? 0)

const visiveis = computed<Foto[]>(() => {
  const todas = fotos.value ?? []
  if (filtro.value === null) return todas
  return agruparPorSituacao(todas, totalDeMembros.value)
    .find(g => g.situacao === filtro.value)?.itens ?? []
})

const grupos = computed(() => agruparPorSituacao(visiveis.value, totalDeMembros.value))

const { data: urls } = useUrlsDasFotos(visiveis)

const contagem = computed(() => contarPorSituacao(fotos.value ?? [], totalDeMembros.value))

const FILTROS = computed(() => [
  { valor: null as SituacaoFoto | null, rotulo: 'Todas', quantas: (fotos.value ?? []).length },
  ...SITUACOES.map(s => ({ valor: s.valor as SituacaoFoto | null, rotulo: s.rotulo, quantas: contagem.value[s.valor] })),
])

/**
 * A foto aberta sai da lista, não de uma cópia.
 *
 * Sem isto, curtir de dentro do visor atualizaria a galeria atrás e deixaria o
 * visor mostrando a contagem velha até ser fechado — a única tela do app onde a
 * curtida pareceria não ter funcionado.
 */
const abertaAtual = computed<Foto | null>(() =>
  aberta.value ? (fotos.value ?? []).find(f => f.id === aberta.value!.id) ?? null : null,
)

async function alternarCurtida(foto: Foto) {
  try {
    await curtir.mutateAsync(foto.id)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para registrar a curtida.'))
  }
}

/**
 * "há 2 horas" enquanto for recente, a data depois disso.
 *
 * `tempoRelativo` devolve `null` acima de uma semana de propósito — "há 43 dias" é
 * pior que "12 de agosto" para localizar um envio na memória.
 */
function quando(iso: string): string {
  return tempoRelativo(iso) ?? formatarInstante(iso)
}

/** "Dai · há 2 horas" — quem mandou e quando, a legenda do lote à parte. */
function autoriaDoLote(lote: GrupoDeLote): string {
  const nome = lote.enviadaPor === euId.value
    ? 'Você'
    : nomeDaPessoa(pessoas.value, lote.enviadaPor) ?? 'Alguém'

  return `${nome} · ${quando(lote.quando)}`
}

async function baixarLote(lote: GrupoDeLote) {
  const { baixadas, falhas } = await baixar(lote.itens)

  if (baixadas) toast.success(baixadas === 1 ? 'Baixada.' : `${baixadas} arquivos baixados.`)
  if (falhas) toast.error(falhas === 1 ? '1 arquivo não veio.' : `${falhas} arquivos não vieram.`)
}
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">Fotos</h1>
        <p class="text-sm text-muted-foreground">
          Mande, curtam os dois, poste. O coração dos dois é o que libera.
        </p>
      </div>

      <Button class="gap-1.5" @click="enviando = true">
        <UploadIcon class="size-4" />
        Mandar fotos
      </Button>
    </header>

    <div class="flex flex-wrap items-center gap-1.5">
      <button
        v-for="opcao in FILTROS"
        :key="opcao.rotulo"
        type="button"
        class="rounded-full border px-3 py-1 text-xs font-medium"
        :class="filtro === opcao.valor
          ? 'border-primary/50 bg-primary/10 text-primary'
          : 'text-muted-foreground hover:text-foreground'"
        @click="filtro = opcao.valor"
      >
        {{ opcao.rotulo }}
        <span class="text-muted-foreground/70">{{ opcao.quantas }}</span>
      </button>
    </div>

    <div v-if="isPending" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <Skeleton v-for="i in 8" :key="i" class="aspect-square w-full rounded-lg" />
    </div>

    <p v-else-if="isError" class="text-sm text-destructive">
      {{ mensagemDeErro(error, 'Não deu para carregar as fotos.') }}
    </p>

    <template v-else-if="visiveis.length">
      <section v-for="grupo in grupos" :key="grupo.situacao" class="space-y-4">
        <!-- Com um filtro ativo há um grupo só, e o cabeçalho repetiria o chip. -->
        <h2 v-if="filtro === null" class="text-sm font-medium">
          {{ grupo.rotulo }}
          <span class="text-muted-foreground">{{ grupo.itens.length }}</span>
        </h2>

        <!--
          Dentro da situação, uma faixa por envio.

          O aninhamento é nessa ordem porque as duas coisas respondem a perguntas
          diferentes: a situação é o que se DECIDE (falta curtir? já pode postar?),
          e o lote é o que se RECONHECE ("aquelas da praia"). Invertido, um envio de
          doze fotos apareceria partido pela situação de cada uma — que é justamente
          a separação que o agrupamento por lote veio desfazer.
        -->
        <article v-for="lote in agruparPorLote(grupo.itens)" :key="lote.loteId" class="space-y-2">
          <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-l-2 border-primary/30 pl-2.5">
            <p class="text-sm font-medium">
              {{ lote.legenda || (lote.itens.length === 1 ? 'Foto avulsa' : `${lote.itens.length} fotos`) }}
            </p>
            <p class="text-xs text-muted-foreground">
              {{ autoriaDoLote(lote) }}
              <template v-if="lote.legenda && lote.itens.length > 1">
                · {{ lote.itens.length }} fotos
              </template>
            </p>

            <button
              type="button"
              class="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
              :disabled="baixando"
              @click="baixarLote(lote)"
            >
              <DownloadIcon class="size-3.5" />
              {{ lote.itens.length === 1 ? 'Baixar' : `Baixar as ${lote.itens.length}` }}
            </button>
          </div>

          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <FotoCard
              v-for="foto in lote.itens"
              :key="foto.id"
              :foto="foto"
              :url="urls?.get(foto.caminho)"
              :eu-id="euId"
              :total-de-membros="totalDeMembros"
              :curtindo="curtir.isPending.value"
              @curtir="alternarCurtida(foto)"
              @abrir="aberta = foto"
            />
          </div>
        </article>
      </section>
    </template>

    <div v-else class="grid place-items-center rounded-xl border border-dashed bg-card/50 px-6 py-16 text-center">
      <span class="grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
        <CameraIcon class="size-6" />
      </span>
      <p class="mt-4 font-medium">
        {{ filtro === null ? 'Nenhuma foto ainda.' : 'Nada aqui.' }}
      </p>
      <p class="mt-1 max-w-sm text-sm text-muted-foreground">
        Mande as fotos do rolo. Quem manda já entra curtindo — falta só o coração
        da outra pessoa para liberar o post.
      </p>
    </div>

    <FotoEnvio v-model:aberto="enviando" />

    <FotoVisor
      :aberto="!!abertaAtual"
      :foto="abertaAtual"
      :url="abertaAtual ? urls?.get(abertaAtual.caminho) : null"
      :membros="membros ?? []"
      @update:aberto="aberta = $event ? aberta : null"
    />
  </div>
</template>
