<script setup lang="ts">
/**
 * A lista de interesses, agrupada por destino.
 *
 * O filtro padrão são os estados ABERTOS (rascunho + amadurecendo), e não tudo:
 * uma lista de vontades cresce para sempre, e o que já foi convertido ou
 * arquivado é histórico. Mostrá-lo por padrão faria a tela ficar menos útil a
 * cada mês de uso — que é o oposto do que se espera de uma lista de desejos.
 *
 * O agrupamento é por destino e não por data porque a pergunta que se faz aqui é
 * "o que a gente quer comprar" / "para onde queremos ir", não "o que anotei na
 * terça". `agruparPorDestino` já devolve só os grupos com conteúdo.
 */
import { useLocalStorage } from '@vueuse/core'
import { GiftIcon, PlusIcon, ShoppingBagIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarDinheiro } from '@/lib/dinheiro'
import { mensagemDeErro } from '@/lib/utils'
import {
  agruparPorDestino,
  ESTADOS,
  ESTADOS_ABERTOS,
  interesseDeFora,
  paraQuemDoInteresse,
  produtosDoInteresse,
  rotuloEstado,
  totalDosInteresses,
  valorDoInteresse,
} from '~/types/interesse'
import type { EstadoInteresse, InteresseComAgrupamentos } from '~/types/interesse'
import { useInteresses, useVista } from '~/composables/useInteresses'
import { nomeDaPessoa, usePessoas } from '~/composables/useMembros'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'

useHead({ title: 'Interesses · APPingos' })

const { data: interesses, isPending, isError, error } = useInteresses()
const { data: pessoas } = usePessoas()
const vista = useVista()
const euId = useUsuarioId()
const store = useSpaceStore()

const dialogoAberto = ref(false)

/**
 * `null` = os abertos (o padrão); um estado = só ele.
 *
 * Guardado em `useLocalStorage` como o alternador de gastos pessoais em
 * Orçamentos: quem foi ver os arquivados normalmente vai olhar mais de um, e
 * perder o filtro a cada navegação para o detalhe e volta seria atrito.
 */
const filtro = useLocalStorage<EstadoInteresse | null>('appingos:interesses:estado', null)

const visiveis = computed<InteresseComAgrupamentos[]>(() => {
  const todos = interesses.value ?? []
  return filtro.value === null
    ? todos.filter(i => ESTADOS_ABERTOS.includes(i.estado))
    : todos.filter(i => i.estado === filtro.value)
})

/**
 * O card diz de onde o interesse vem quando ele é de fora.
 *
 * No espaço pessoal aparecem também os interesses que a pessoa criou no espaço do
 * casal e os que ela assumiu — sem este rótulo, eles pareceriam dado duplicado.
 */
function deOnde(interesse: InteresseComAgrupamentos): string | null {
  if (!interesseDeFora(interesse, vista.value.spaceId)) return null
  return store.espacos.find(e => e.id === interesse.space_id)?.nome ?? 'outro espaço'
}

/** Quem assumiu o presente — só o fato de estar assumido interessa na lista. */
function assumido(interesse: InteresseComAgrupamentos): boolean {
  return !!interesse.assumido_por
}

/**
 * Como chamar o dono do interesse no ícone do card.
 *
 * "Você" para os seus, e o nome para os dos outros: num espaço de casal metade
 * dos cards é sua, e ler o próprio nome repetido vinte vezes é ruído. A inicial
 * do círculo sai daí, então os seus ficam com "V" — que é o que faz um relance
 * separar as duas metades da lista.
 */
function donoDo(interesse: InteresseComAgrupamentos): string {
  if (interesse.criado_por === euId.value) return 'Você'
  return nomeDaPessoa(pessoas.value, interesse.criado_por) ?? 'Alguém'
}

function euAssumi(interesse: InteresseComAgrupamentos): boolean {
  return interesse.assumido_por === euId.value
}

const grupos = computed(() => agruparPorDestino(visiveis.value))

const total = computed(() => totalDosInteresses(visiveis.value))

/** Quantos existem em cada estado — o número no chip do filtro. */
function quantos(estado: EstadoInteresse | null): number {
  const todos = interesses.value ?? []
  return estado === null
    ? todos.filter(i => ESTADOS_ABERTOS.includes(i.estado)).length
    : todos.filter(i => i.estado === estado).length
}

const FILTROS: { valor: EstadoInteresse | null, rotulo: string }[] = [
  { valor: null, rotulo: 'Em aberto' },
  ...ESTADOS.map(e => ({ valor: e.valor as EstadoInteresse | null, rotulo: e.rotulo })),
]

async function onCriado(id: string) {
  // Vai direto para o detalhe: um interesse sem produto nenhum não tem o que
  // mostrar na lista, e o próximo passo óbvio é anexar o primeiro candidato.
  await navigateTo(`/objetivos/interesses/${id}`)
}
</script>

<template>
  <div class="space-y-6">
    <ObjetivosAbas subtitulo="O que a gente quer, com os produtos e os preços que já achamos.">
      <template #acoes>
        <Button class="gap-1.5" @click="dialogoAberto = true">
          <PlusIcon class="size-4" />
          Novo interesse
        </Button>
      </template>
    </ObjetivosAbas>

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
        <span class="text-muted-foreground/70">{{ quantos(opcao.valor) }}</span>
      </button>
    </div>

    <div v-if="isPending" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton v-for="i in 3" :key="i" class="h-24 w-full rounded-lg" />
    </div>

    <p v-else-if="isError" class="text-sm text-destructive">
      {{ mensagemDeErro(error, 'Não deu para carregar os interesses.') }}
    </p>

    <template v-else-if="visiveis.length">
      <p v-if="total > 0" class="text-sm text-muted-foreground">
        Somando os escolhidos: <span class="font-medium text-foreground">{{ formatarDinheiro(total) }}</span>
      </p>

      <section v-for="grupo in grupos" :key="grupo.destino" class="space-y-3">
        <h2 class="text-sm font-medium">{{ grupo.rotulo }}</h2>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <NuxtLink
            v-for="interesse in grupo.itens"
            :key="interesse.id"
            :to="`/objetivos/interesses/${interesse.id}`"
            class="flex flex-col gap-2 rounded-lg border bg-card p-3 hover:border-primary/40"
          >
            <div class="flex items-start justify-between gap-2">
              <p class="min-w-0 flex-1 font-medium leading-snug">{{ interesse.titulo }}</p>

              <!--
                O canto de cima à direita responde "de quem é isto e em que pé
                está": o dono, o estado e o menu que o move. O dono aparece
                sempre, e não só quando é de outra pessoa — no espaço do casal a
                lista mistura as vontades dos dois, e "de quem é este card" é a
                primeira pergunta de quem varre a tela.
              -->
              <div class="flex shrink-0 items-center gap-1.5">
                <PilhaMembros
                  :membros="[{ user_id: interesse.criado_por, exibicao: donoDo(interesse) }]"
                  :rotulo="`Interesse de ${donoDo(interesse)}`"
                />
                <Badge v-if="interesse.estado !== 'rascunho'" variant="secondary">
                  {{ rotuloEstado(interesse.estado) }}
                </Badge>
                <EstadoDoInteresse
                  :id="interesse.id"
                  :estado="interesse.estado"
                  :titulo="interesse.titulo"
                />
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span v-if="paraQuemDoInteresse(interesse, pessoas)">
                para {{ paraQuemDoInteresse(interesse, pessoas) }}
              </span>
              <span v-if="deOnde(interesse)" class="rounded-full border px-1.5">
                de {{ deOnde(interesse) }}
              </span>

              <!--
                Quem se ofereceu para dar entra como ícone, e não só como texto:
                é a informação que evita os dois comprarem o mesmo presente, e
                numa lista de vinte cards um rosto se acha antes de uma frase.
              -->
              <span v-if="assumido(interesse)" class="flex items-center gap-1 text-primary">
                <PilhaMembros
                  :membros="[{
                    user_id: interesse.assumido_por!,
                    exibicao: nomeDaPessoa(pessoas, interesse.assumido_por) ?? 'Alguém',
                  }]"
                  :rotulo="`${nomeDaPessoa(pessoas, interesse.assumido_por)} vai dar de presente`"
                />
                <GiftIcon class="size-3" />
                {{ euAssumi(interesse) ? 'você dá' : 'já tem quem dê' }}
              </span>
            </div>

            <div class="mt-auto flex items-baseline justify-between gap-2 pt-1">
              <span v-if="valorDoInteresse(interesse.agrupamentos) !== null" class="font-semibold">
                {{ formatarDinheiro(valorDoInteresse(interesse.agrupamentos)!) }}
              </span>
              <span v-else class="text-xs text-muted-foreground">sem preço ainda</span>

              <span class="text-xs text-muted-foreground">
                <template v-if="interesse.agrupamentos.length > 1">
                  {{ interesse.agrupamentos.length }} alternativas
                </template>
                <template v-else>
                  {{ produtosDoInteresse(interesse.agrupamentos).length === 1
                    ? '1 produto'
                    : `${produtosDoInteresse(interesse.agrupamentos).length} produtos` }}
                </template>
              </span>
            </div>
          </NuxtLink>
        </div>
      </section>
    </template>

    <div v-else class="grid place-items-center rounded-xl border border-dashed bg-card/50 px-6 py-16 text-center">
      <span class="grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
        <ShoppingBagIcon class="size-6" />
      </span>
      <p class="mt-4 font-medium">
        {{ filtro === null ? 'Nenhum interesse em aberto.' : `Nada em "${rotuloEstado(filtro)}".` }}
      </p>
      <p class="mt-1 max-w-sm text-sm text-muted-foreground">
        Anote uma ideia aqui, ou instale a extensão do Chrome e capture o produto
        direto da página da loja.
      </p>
    </div>

    <InteresseDialogo v-model:aberto="dialogoAberto" @criado="onCriado" />
  </div>
</template>
