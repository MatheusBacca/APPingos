<script setup lang="ts">
/**
 * Objetivos › Metas — "para onde estamos indo".
 *
 * A raiz do módulo deixou de redirecionar para Interesses: Metas, que dá nome ao
 * módulo, nasceu, e a raiz agora tem o que mostrar (o `redirect` saiu, como
 * `ObjetivosAbas.vue` prometia).
 *
 * Duas gavetas, como em Orçamentos. Num espaço compartilhado a lista mostra as
 * metas do espaço e, logo abaixo, as SUAS metas pessoais — o presente surpresa
 * mora no seu espaço pessoal, invisível para a outra pessoa pela RLS de membro, e
 * esconder dela própria o que está guardando seria esconder o dado que o
 * Planejamento já subtrai do seu mês. No espaço pessoal, é a lista só.
 *
 * Abertas primeiro (ativas e pausadas); cumpridas e abandonadas ficam num bloco
 * recolhido. Uma lista de metas cresce para sempre, e o histórico por padrão a
 * tornaria menos útil a cada mês — a mesma regra dos interesses "abertos".
 */
import { PlusIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ehAdmin } from '~/types/database.types'
import type { MetaComAportes } from '~/composables/useMetas'
import { useMetas, useMetasCompartilhadasCom } from '~/composables/useMetas'
import { useGastosPessoais } from '~/composables/useGastosPessoais'
import { usePessoas } from '~/composables/useMembros'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'

useHead({ title: 'Metas · Objetivos · APPingos' })

const store = useSpaceStore()
const { espacoPessoalId } = useGastosPessoais()
const { data: pessoas } = usePessoas()

const ativoEhPessoal = computed(() => store.espacoAtivo?.tipo === 'pessoal')

const { data: doEspaco, isPending } = useMetas(computed(() => store.espacoAtivoId))
// No espaço pessoal, a lista do espaço JÁ é a pessoal — não há segunda gaveta.
const { data: pessoais } = useMetas(computed(() => (ativoEhPessoal.value ? null : espacoPessoalId.value)))

const souAdmin = computed(() => ehAdmin(store.espacoAtivo?.papel))
const nomes = computed(() => pessoas.value ?? new Map<string, string>())

const aberta = (m: MetaComAportes) => m.estado === 'ativa' || m.estado === 'pausada'

const abertasDoEspaco = computed(() => (doEspaco.value ?? []).filter(aberta))
const abertasPessoais = computed(() => (pessoais.value ?? []).filter(aberta))
const encerradas = computed(() =>
  [...(doEspaco.value ?? []), ...(pessoais.value ?? [])].filter(m => !aberta(m)),
)

const ehDaGavetaPessoal = (m: MetaComAportes) => m.space_id === espacoPessoalId.value

// ---- Compartilhadas ------------------------------------------------------------------

/*
 * As metas PESSOAIS que alguém emprestou a este espaço, para acompanhar e
 * comemorar. As suas ficam de fora: você já as vê na sua gaveta, com o selo
 * dizendo onde estão compartilhadas — repeti-las aqui as mostraria duas vezes.
 *
 * Uma seção à parte, e não misturadas às do espaço: são só leitura, e o aporte
 * delas não entra na projeção do casal (continua sendo dinheiro de quem as criou).
 * As cumpridas ficam visíveis aqui, e não recolhidas: comemorar é o ponto.
 */
const eu = useUsuarioId()
const { data: compartilhadasCru } = useMetasCompartilhadasCom(computed(() => (ativoEhPessoal.value ? null : store.espacoAtivoId)))

const compartilhadas = computed(() =>
  (compartilhadasCru.value ?? []).filter(m => m.criado_por !== eu.value && m.estado !== 'abandonada'),
)

/** Onde o dono pode emprestar uma meta pessoal: os espaços conjuntos de que participa. */
const espacosConjuntos = computed(() =>
  store.espacos.filter(e => e.tipo !== 'pessoal').map(e => ({ id: e.id, nome: e.nome })),
)

// ---- Diálogos -------------------------------------------------------------------

const dialogoMeta = ref(false)
const metaEmEdicao = ref<MetaComAportes | null>(null)
const dialogoAporte = ref(false)
const metaDoAporte = ref<MetaComAportes | null>(null)
const sentido = ref<'guardar' | 'resgatar'>('guardar')

function novaMeta() {
  metaEmEdicao.value = null
  dialogoMeta.value = true
}

function editar(meta: MetaComAportes) {
  metaEmEdicao.value = meta
  dialogoMeta.value = true
}

function movimentar(meta: MetaComAportes, s: 'guardar' | 'resgatar') {
  metaDoAporte.value = meta
  sentido.value = s
  dialogoAporte.value = true
}
</script>

<template>
  <div class="space-y-6">
    <ObjetivosAbas subtitulo="Para onde vocês estão indo: quanto juntar, até quando, e quanto já foi guardado.">
      <template #acoes>
        <Button class="gap-1.5" @click="novaMeta">
          <PlusIcon class="size-4" />
          Nova meta
        </Button>
      </template>
    </ObjetivosAbas>

    <div v-if="isPending" class="grid gap-4 sm:grid-cols-2">
      <Skeleton v-for="i in 2" :key="i" class="h-40 w-full rounded-lg" />
    </div>

    <template v-else>
      <section class="space-y-3">
        <h2 v-if="!ativoEhPessoal" class="text-sm font-medium">De {{ store.espacoAtivo?.nome }}</h2>

        <div
          v-if="!abertasDoEspaco.length"
          class="rounded-lg border border-dashed bg-card/50 px-6 py-10 text-center text-sm text-muted-foreground"
        >
          Nenhuma meta em andamento{{ ativoEhPessoal ? '' : ' no espaço' }}. Uma viagem, um sofá, a reserva de
          emergência — ou transforme um interesse em meta, pela tela dele.
        </div>

        <div v-else class="grid gap-4 sm:grid-cols-2">
          <MetaCartao
            v-for="m in abertasDoEspaco"
            :key="m.id"
            :meta="m"
            :nomes="nomes"
            :pessoal="ativoEhPessoal"
            :admin="souAdmin"
            :espacos-conjuntos="espacosConjuntos"
            @guardar="movimentar($event, 'guardar')"
            @resgatar="movimentar($event, 'resgatar')"
            @editar="editar"
          />
        </div>
      </section>

      <section v-if="!ativoEhPessoal && abertasPessoais.length" class="space-y-3">
        <h2 class="text-sm font-medium">
          Suas metas pessoais
          <span class="font-normal text-muted-foreground">· só você vê, a menos que compartilhe pelo menu da meta</span>
        </h2>
        <div class="grid gap-4 sm:grid-cols-2">
          <MetaCartao
            v-for="m in abertasPessoais"
            :key="m.id"
            :meta="m"
            :nomes="nomes"
            pessoal
            admin
            :espacos-conjuntos="espacosConjuntos"
            @guardar="movimentar($event, 'guardar')"
            @resgatar="movimentar($event, 'resgatar')"
            @editar="editar"
          />
        </div>
      </section>

      <section v-if="compartilhadas.length" class="space-y-3">
        <h2 class="text-sm font-medium">
          Compartilhadas com {{ store.espacoAtivo?.nome }}
          <span class="font-normal text-muted-foreground">· metas pessoais de quem divide o espaço, para acompanhar</span>
        </h2>
        <div class="grid gap-4 sm:grid-cols-2">
          <MetaCartao
            v-for="m in compartilhadas"
            :key="m.id"
            :meta="m"
            :nomes="nomes"
            :pessoal="false"
            :admin="false"
            somente-leitura
          />
        </div>
      </section>

      <details v-if="encerradas.length" class="space-y-3">
        <summary class="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
          {{ encerradas.length === 1 ? '1 meta encerrada' : `${encerradas.length} metas encerradas` }}
        </summary>
        <div class="mt-3 grid gap-4 sm:grid-cols-2">
          <MetaCartao
            v-for="m in encerradas"
            :key="m.id"
            :meta="m"
            :nomes="nomes"
            :pessoal="ehDaGavetaPessoal(m)"
            :admin="ehDaGavetaPessoal(m) || souAdmin"
            :espacos-conjuntos="espacosConjuntos"
            @guardar="movimentar($event, 'guardar')"
            @resgatar="movimentar($event, 'resgatar')"
            @editar="editar"
          />
        </div>
      </details>
    </template>

    <MetaDialogo v-model:aberto="dialogoMeta" :meta="metaEmEdicao" />
    <AporteDialogo v-model:aberto="dialogoAporte" :meta="metaDoAporte" :sentido="sentido" />
  </div>
</template>
