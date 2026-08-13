<script setup lang="ts">
/**
 * O detalhe de um interesse: a ideia em cima, as saídas possíveis embaixo.
 *
 * É o destino do link que a extensão do Chrome mostra depois de capturar, então
 * "não encontrado" é caso comum e não borda — um link colado no celular de quem
 * está com outro espaço ativo cai aqui, e a RLS torna o interesse invisível. Por
 * isso o estado de erro é uma tela explicada, e não o erro cru do PostgREST.
 *
 * A comparação é o valor da tela, e ela é entre AGRUPAMENTOS: "monitor 27 + braço"
 * contra "monitor 24 + base", não produto contra produto. `economiaPossivel` diz
 * quanto o favorito custa a mais que a saída mais barata, e só aparece quando há de
 * fato uma escolha a questionar.
 *
 * Quem não é dono vê a tela inteira e mexe em quase tudo — produtos, favorito,
 * estado — mas não na intenção (título, destino, para quem, observação). Quem impõe
 * isso é o trigger `interesse_intencao_protegida`; aqui os botões que ele recusaria
 * simplesmente não aparecem, para o erro não ser a forma de descobrir a regra.
 */
import { GiftIcon, PencilIcon, PlusIcon, Trash2Icon, UndoIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarDinheiro } from '@/lib/dinheiro'
import { mensagemDeErro } from '@/lib/utils'
import {
  economiaPossivel,
  interesseDeFora,
  paraQuemDoInteresse,
  produtosDoInteresse,
  rotuloDestino,
  rotuloEstado,
  somaDoAgrupamento,
  valorDoInteresse,
} from '~/types/interesse'
import type { Agrupamento, InteresseProduto } from '~/types/interesse'
import {
  useApagarInteresse,
  useAssumirInteresse,
  useEscolherAgrupamento,
  useInteresse,
  useJuntarProduto,
  useLiberarInteresse,
  useRemoverAgrupamento,
  useRemoverProduto,
  useRenomearAgrupamento,
  useSepararProduto,
  useVista,
} from '~/composables/useInteresses'
import { nomeDaPessoa, usePessoas } from '~/composables/useMembros'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'

const route = useRoute()
const interesseId = route.params.id as string

const { data: interesse, isPending, isError, error } = useInteresse(interesseId)
const { data: pessoas } = usePessoas()
const euId = useUsuarioId()
const vista = useVista()
const store = useSpaceStore()

const apagar = useApagarInteresse()
const escolher = useEscolherAgrupamento()
const renomear = useRenomearAgrupamento()
const removerAgrupamento = useRemoverAgrupamento()
const removerProduto = useRemoverProduto()
const juntar = useJuntarProduto()
const separar = useSepararProduto()
const assumir = useAssumirInteresse()
const liberar = useLiberarInteresse()

useHead({
  title: () => {
    if (interesse.value) return `${interesse.value.titulo} · APPingos`
    // Sem isto a aba fica "Carregando…" para sempre num interesse de outro espaço.
    return isPending.value ? 'Carregando… · APPingos' : 'Interesse não encontrado · APPingos'
  },
})

const dialogoInteresse = ref(false)
const dialogoProduto = ref(false)

/** O que o diálogo de produto vai fazer quando abrir. */
const produtoEmEdicao = ref<InteresseProduto | null>(null)
const agrupamentoAlvo = ref<string | null>(null)

const souDono = computed(() => !!interesse.value && interesse.value.criado_por === euId.value)

/** Interesse visto de fora da casa dele — a tela diz de onde ele vem. */
const casa = computed(() => {
  if (!interesse.value || !interesseDeFora(interesse.value, vista.value.spaceId)) return null
  return store.espacos.find(e => e.id === interesse.value!.space_id)?.nome ?? 'outro espaço'
})

const agrupamentos = computed(() => interesse.value?.agrupamentos ?? [])
const produtos = computed(() => produtosDoInteresse(agrupamentos.value))

/** Ordem: o favorito primeiro, depois do mais barato ao mais caro. */
const ordenados = computed(() =>
  [...agrupamentos.value].sort((a, b) => {
    if (a.escolhido !== b.escolhido) return a.escolhido ? -1 : 1
    // Sem soma vai para o fim: `Infinity` os empurra sem inventar um valor.
    return (somaDoAgrupamento(a) ?? Infinity) - (somaDoAgrupamento(b) ?? Infinity)
  }),
)

const valor = computed(() => valorDoInteresse(agrupamentos.value))
const economia = computed(() => economiaPossivel(agrupamentos.value))

/**
 * Os destinos possíveis para os produtos deste conjunto: todos os outros.
 *
 * O cálculo é por conjunto, e não por produto, porque todo produto de um mesmo
 * conjunto tem exatamente o mesmo leque de destinos — perguntar por produto daria a
 * mesma lista N vezes.
 */
function outrosQue(agrupamento: Agrupamento): Agrupamento[] {
  return ordenados.value.filter(a => a.id !== agrupamento.id)
}

const paraQuem = computed(() =>
  interesse.value ? paraQuemDoInteresse(interesse.value, pessoas.value) : null,
)

const quemAssumiu = computed(() =>
  nomeDaPessoa(pessoas.value, interesse.value?.assumido_por ?? null),
)

const euAssumi = computed(
  () => !!interesse.value?.assumido_por && interesse.value.assumido_por === euId.value,
)

function abrirNovoAgrupamento() {
  produtoEmEdicao.value = null
  agrupamentoAlvo.value = null
  dialogoProduto.value = true
}

function abrirAdicionarAoAgrupamento(agrupamento: Agrupamento) {
  produtoEmEdicao.value = null
  agrupamentoAlvo.value = agrupamento.id
  dialogoProduto.value = true
}

function abrirEdicaoDeProduto(produto: InteresseProduto) {
  produtoEmEdicao.value = produto
  agrupamentoAlvo.value = null
  dialogoProduto.value = true
}

/** Um envelope só para os erros das ações de uma linha. */
async function tentar(acao: () => Promise<unknown>, sucesso: string, falha: string) {
  try {
    await acao()
    toast.success(sucesso)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, falha))
  }
}

function onEscolher(agrupamento: Agrupamento) {
  return tentar(
    () => escolher.mutateAsync(agrupamento.id),
    'Favorito trocado.',
    'Não deu para marcar o favorito.',
  )
}

function onRenomear(agrupamento: Agrupamento, nome: string | null) {
  return tentar(
    () => renomear.mutateAsync({ id: agrupamento.id, nome }),
    'Nome salvo.',
    'Não deu para renomear.',
  )
}

function onRemoverAgrupamento(agrupamento: Agrupamento) {
  return tentar(
    () => removerAgrupamento.mutateAsync(agrupamento.id),
    'Conjunto apagado.',
    'Não deu para apagar o conjunto.',
  )
}

/**
 * Remover o último produto de um agrupamento leva o agrupamento junto — senão
 * sobraria um cartão vazio que não custa nada e ainda concorre a favorito.
 */
function onRemoverProduto(agrupamento: Agrupamento, produto: InteresseProduto) {
  return tentar(
    () => removerProduto.mutateAsync({
      id: produto.id,
      agrupamentoId: agrupamento.id,
      ultimo: agrupamento.produtos.length === 1,
    }),
    'Produto removido.',
    'Não deu para remover o produto.',
  )
}

/**
 * Juntar um produto a outro conjunto.
 *
 * A mensagem diz o que de fato mudou. Juntar pode apagar o conjunto de origem e
 * mover o favorito com ele, e mudar o favorito em silêncio é o tipo de coisa que a
 * pessoa descobre depois olhando o total e não entendendo por quê.
 */
async function onJuntar(produtoId: string, agrupamentoId: string) {
  try {
    const r = await juntar.mutateAsync({ produtoId, agrupamentoId })

    // Soltou em cima de onde já estava: gesto desistido, não falha.
    if (!r.mudou) return

    toast.success(r.favorito_movido ? 'Juntado — e este conjunto virou o favorito.' : 'Juntado.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para juntar.'))
  }
}

function onSeparar(produto: InteresseProduto) {
  return tentar(
    () => separar.mutateAsync(produto.id),
    'Separado num conjunto próprio.',
    'Não deu para separar.',
  )
}

function onAssumir() {
  return tentar(
    () => assumir.mutateAsync(interesseId),
    'Você assumiu este presente.',
    'Não deu para assumir.',
  )
}

function onLiberar() {
  return tentar(
    () => liberar.mutateAsync(interesseId),
    'Responsabilidade liberada.',
    'Não deu para liberar.',
  )
}

async function onApagar() {
  try {
    await apagar.mutateAsync(interesseId)
    toast.success('Interesse apagado.')
    await navigateTo('/objetivos/interesses')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para apagar o interesse.'))
  }
}
</script>

<template>
  <div class="space-y-6">
    <BotaoVoltar para="/objetivos/interesses" rotulo="Interesses" />

    <div v-if="isPending" class="space-y-3">
      <Skeleton class="h-8 w-2/3" />
      <Skeleton class="h-24 w-full rounded-lg" />
    </div>

    <p v-else-if="isError" class="text-sm text-destructive">
      {{ mensagemDeErro(error, 'Não deu para carregar o interesse.') }}
    </p>

    <div
      v-else-if="!interesse"
      class="grid place-items-center rounded-xl border border-dashed bg-card/50 px-6 py-16 text-center"
    >
      <p class="font-medium">Este interesse não existe aqui.</p>
      <p class="mt-1 max-w-sm text-sm text-muted-foreground">
        Ou ele foi apagado, ou pertence a outro espaço — troque de espaço no menu
        do topo e tente de novo.
      </p>
    </div>

    <template v-else>
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold tracking-tight">{{ interesse.titulo }}</h1>

          <div class="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{{ rotuloDestino(interesse.destino) }}</Badge>
            <Badge variant="outline">{{ rotuloEstado(interesse.estado) }}</Badge>
            <span v-if="paraQuem">para {{ paraQuem }}</span>
            <!--
              De onde ele vem, quando é de fora: sem isso um interesse do casal
              aparecendo no espaço pessoal parece dado duplicado, e quem editar vai
              estranhar a mudança acontecer nos dois lugares.
            -->
            <Badge v-if="casa" variant="outline" class="font-normal">de {{ casa }}</Badge>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <CompartilharInteresse v-if="souDono" :interesse="interesse" />

          <!--
            "Darei de presente para ele" só para quem não criou: assumir o próprio
            interesse não quer dizer nada, e o banco recusa.
          -->
          <Button
            v-if="!souDono && !interesse.assumido_por"
            variant="outline"
            size="sm"
            class="gap-1.5"
            @click="onAssumir"
          >
            <GiftIcon class="size-4" />
            Darei de presente
          </Button>

          <Button
            v-if="euAssumi || (souDono && interesse.assumido_por)"
            variant="ghost"
            size="sm"
            class="gap-1.5 text-muted-foreground"
            @click="onLiberar"
          >
            <UndoIcon class="size-4" />
            Liberar
          </Button>

          <Button
            v-if="souDono"
            variant="outline"
            size="sm"
            class="gap-1.5"
            @click="dialogoInteresse = true"
          >
            <PencilIcon class="size-4" />
            Editar
          </Button>

          <Button
            v-if="souDono"
            variant="ghost"
            size="sm"
            class="gap-1.5 text-muted-foreground hover:text-destructive"
            @click="onApagar"
          >
            <Trash2Icon class="size-4" />
            Apagar
          </Button>
        </div>
      </header>

      <!--
        Quem assumiu aparece para todos, inclusive para quem criou: o app é de gente
        que coordena, não que faz surpresa. Esconder isso do dono deixaria os dois
        comprando o mesmo presente.
      -->
      <p
        v-if="interesse.assumido_por"
        class="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
      >
        <GiftIcon class="size-4 shrink-0 text-primary" />
        <span>
          <template v-if="euAssumi">Você vai dar isto de presente.</template>
          <template v-else>{{ quemAssumiu }} vai dar isto de presente.</template>
        </span>
      </p>

      <p v-if="interesse.observacao" class="whitespace-pre-line text-sm text-muted-foreground">
        {{ interesse.observacao }}
      </p>

      <section class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-medium">
              {{ agrupamentos.length === 1 ? '1 saída possível' : `${agrupamentos.length} saídas possíveis` }}
              <span v-if="produtos.length !== agrupamentos.length" class="font-normal text-muted-foreground">
                · {{ produtos.length }} produtos
              </span>
            </h2>
            <p v-if="valor !== null" class="text-xs text-muted-foreground">
              Vale {{ formatarDinheiro(valor) }}
              <template v-if="economia !== null">
                — a saída mais barata sai {{ formatarDinheiro(economia) }} menos
              </template>
            </p>
          </div>

          <Button variant="outline" size="sm" class="gap-1.5" @click="abrirNovoAgrupamento">
            <PlusIcon class="size-4" />
            Nova alternativa
          </Button>
        </div>

        <!--
          A dica em texto existe porque arrastar não se descobre sozinho — a mesma
          razão pela qual a barra do Maps em Viagens explica o "segurar para
          selecionar". Só aparece havendo para onde arrastar.
        -->
        <p v-if="agrupamentos.length > 1" class="text-xs text-muted-foreground">
          Arraste um produto para outro conjunto para dizer que eles vão juntos — ou
          use o botão de juntar no card, que funciona no celular.
        </p>

        <div v-if="agrupamentos.length" class="space-y-3">
          <AgrupamentoDoInteresse
            v-for="agrupamento in ordenados"
            :key="agrupamento.id"
            :agrupamento="agrupamento"
            :pode-escolher="agrupamentos.length > 1"
            :outros-agrupamentos="outrosQue(agrupamento)"
            @escolher="onEscolher(agrupamento)"
            @renomear="nome => onRenomear(agrupamento, nome)"
            @remover="onRemoverAgrupamento(agrupamento)"
            @adicionar-produto="abrirAdicionarAoAgrupamento(agrupamento)"
            @editar-produto="abrirEdicaoDeProduto"
            @remover-produto="produto => onRemoverProduto(agrupamento, produto)"
            @soltar-produto="produtoId => onJuntar(produtoId, agrupamento.id)"
            @juntar-produto="({ produtoId, agrupamentoId }) => onJuntar(produtoId, agrupamentoId)"
            @separar-produto="onSeparar"
          />
        </div>

        <p v-else class="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum produto ainda. Adicione um pelo botão acima, ou capture da página
          da loja com a extensão do Chrome.
        </p>
      </section>

      <InteresseDialogo v-model:aberto="dialogoInteresse" :interesse="interesse" />
      <ProdutoDialogo
        v-model:aberto="dialogoProduto"
        :produto="produtoEmEdicao"
        :agrupamento-id="agrupamentoAlvo"
        :interesse-id="interesseId"
      />
    </template>
  </div>
</template>
