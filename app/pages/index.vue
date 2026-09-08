<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { LayoutGridIcon, SlidersHorizontalIcon } from '@lucide/vue'
import { usePainel } from '~/composables/usePainel'
import { usePerfil } from '~/composables/usePerfil'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'

useHead({ title: 'Início · APPingos' })

const store = useSpaceStore()
const user = useSupabaseUser()
const usuarioId = useUsuarioId()
const { data: perfil } = usePerfil()

/*
 * O apelido vai inteiro; do nome de cadastro sai só o primeiro pedaço, porque
 * "Oi, Matheus Bacca" soa como cobrança de banco. O `user_metadata` fica de
 * reserva para o primeiro carregamento, antes de o perfil chegar do banco.
 */
const primeiroNome = computed(() => {
  if (perfil.value?.apelido) return perfil.value.apelido

  const nome = perfil.value?.nome
    ?? (user.value?.user_metadata?.nome as string | undefined)
    ?? ''

  return nome.split(' ')[0] || null
})

const painel = usePainel()

/*
 * O modo de ajuste não é guardado: ele acaba quando a pessoa sai da tela.
 *
 * O que ela ARRUMOU fica (isso mora no localStorage); estar arrumando, não. Um
 * painel que reabrisse em modo de edição dias depois faria a tela inicial do app
 * parecer quebrada — cartões tracejados, nada clicável — sem que ninguém tivesse
 * pedido nada.
 */
const editando = ref(false)

/** Só faz sentido escolher largura onde a grade tem duas colunas (o `sm:` dela). */
const podeLargura = useMediaQuery('(min-width: 640px)')

/*
 * Arrastar é o atalho de quem está no mouse — as setas de cada cartão são o
 * mecanismo de verdade. `arrastando` é o cartão que saiu do lugar; `alvo`, o que
 * está sob o ponteiro agora e vai receber a posição.
 */
const arrastando = ref<string | null>(null)
const alvo = ref<string | null>(null)

function comecarArraste(slug: string) {
  if (editando.value) arrastando.value = slug
}

/*
 * Só realça quando é UM CARTÃO que está vindo. Sem esta guarda, arrastar um
 * arquivo qualquer da área de trabalho por cima da janela acendia os cartões
 * como se eles fossem receber alguma coisa.
 */
function passarPorCima(slug: string) {
  if (arrastando.value) alvo.value = slug
}

function soltar(slug: string) {
  if (arrastando.value) painel.soltar(arrastando.value, slug)
  arrastando.value = null
  alvo.value = null
}
</script>

<template>
  <div class="space-y-8">
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <!--
          O saudar e o placar na mesma linha: os Pins são a única coisa do app
          que fala de VOCÊ, e não do espaço, então o lugar deles é junto do seu
          nome. O fogo só acende quando há hotspot — ver `SeloDeMultiplicador`.

          `items-center` e não `items-baseline`: os dois selos são pílulas com
          altura própria, e alinhá-los pela linha de base do título de 24px os
          jogaria para baixo do texto.
        -->
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-2xl font-semibold tracking-tight">
            {{ primeiroNome ? `Oi, ${primeiroNome}` : 'Oi' }}
          </h1>

          <NuxtLink
            v-if="usuarioId"
            to="/pins"
            class="rounded-full transition-opacity hover:opacity-80"
            aria-label="Seus Pins"
          >
            <SeloDePins :de="usuarioId" tamanho="md" />
          </NuxtLink>

          <SeloDeMultiplicador />
        </div>
        <p class="mt-1 text-sm text-muted-foreground">
          Você está em <strong class="text-foreground">{{ store.espacoAtivo?.nome }}</strong>.
        </p>
      </div>

      <PainelEngrenagem
        :cards="painel.cards.value"
        :editando="editando"
        :ajustado="painel.ajustado.value"
        @editar="editando = $event"
        @mostrar="painel.mostrar"
        @restaurar="painel.restaurar"
      />
    </header>

    <section class="space-y-3">
      <h2 class="sr-only">Módulos</h2>

      <!--
        A faixa explica o que mudou na tela. Sem ela, o modo de ajuste é um monte
        de ícone novo aparecendo sem aviso — e o jeito de sair dele estaria
        escondido atrás da engrenagem, que é justo onde quem não sabe não procura.
      -->
      <p
        v-if="editando"
        class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
      >
        <SlidersHorizontalIcon class="size-4 shrink-0" />
        <span>
          As setas reordenam e o canto de cada cartão redimensiona. No mouse, dá
          para arrastar o cartão inteiro.
        </span>
        <button
          type="button"
          class="ml-auto rounded-md border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
          @click="editando = false"
        >
          Concluir
        </button>
      </p>

      <!--
        A malha fina: linhas de 4px e nenhum `row-gap` — o vão vertical é margem
        de cada cartão. É o que permite as duas colunas correrem em alturas
        independentes, sem o buraco que sobrava embaixo do cartão mais baixo de
        cada fileira. O porquê inteiro está em `linhasDoCartao`.
      -->
      <div class="grid auto-rows-[4px] gap-x-3 sm:grid-cols-2">
        <CartaoDoPainel
          v-for="(card, i) in painel.visiveis.value"
          :key="card.modulo.slug"
          :modulo="card.modulo"
          :largura="card.largura"
          :altura="card.altura"
          :editando="editando"
          :primeiro="i === 0"
          :ultimo="i === painel.visiveis.value.length - 1"
          :pode-largura="podeLargura"
          :alvo="alvo === card.modulo.slug"
          :arrastando="arrastando === card.modulo.slug"
          @mover="painel.mover(card.modulo.slug, $event)"
          @largura="painel.largura(card.modulo.slug, $event)"
          @altura="painel.altura(card.modulo.slug, $event)"
          @esconder="painel.alternar(card.modulo.slug)"
          @dragstart="comecarArraste(card.modulo.slug)"
          @dragover.prevent="passarPorCima(card.modulo.slug)"
          @dragleave="alvo = alvo === card.modulo.slug ? null : alvo"
          @drop.prevent="soltar(card.modulo.slug)"
          @dragend="arrastando = null; alvo = null"
        />
      </div>

      <!-- Esconder tudo é uma escolha legítima; ficar sem saída, não. -->
      <div
        v-if="!painel.visiveis.value.length"
        class="grid place-items-center rounded-xl border border-dashed bg-card/50 px-6 py-16 text-center"
      >
        <span class="grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
          <LayoutGridIcon class="size-6" />
        </span>
        <p class="mt-4 font-medium">Nenhum cartão no painel.</p>
        <p class="mt-1 max-w-sm text-sm text-muted-foreground">
          Eles continuam aqui — a engrenagem no canto de cima traz de volta os que
          você escondeu.
        </p>
      </div>
    </section>
  </div>
</template>
