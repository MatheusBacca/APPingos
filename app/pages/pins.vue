<script setup lang="ts">
/**
 * O extrato dos Pins — a tela que responde "por que eu tenho 340".
 *
 * É a razão de o livro-razão existir (ver 20260907120100_pins.sql): saldo sem
 * extrato é um número que ninguém consegue conferir, e um app de pontos que não
 * se explica vira um app de pontos em que ninguém acredita.
 *
 * Duas coisas moram na mesma tela, por decisão:
 *
 *   - O EXTRATO, de todo mundo do espaço. O jogo é compartilhado; ver só o
 *     próprio ganho transformaria os Pins num contador solitário.
 *   - AS REGRAS, lidas do banco. Regra escondida não muda comportamento — quem
 *     não sabe que fechar o mês rende não vai fechar o mês por causa disso.
 *
 * As abas são estado local, e não rotas: são duas leituras da mesma coisa, e
 * duas páginas pediriam dois carregamentos para uma tela que cabe em memória.
 */
import { SparklesIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarDiaCompleto, hojeIso } from '@/lib/datas'
import { mensagemDeErro } from '@/lib/utils'
import { MODULOS } from '~/modules'
import {
  agruparPorDia,
  assuntoDoPin,
  formatarConta,
  pinsEmTexto,
  sequenciaDeDias,
} from '~/types/pin'
import { usePins, useRegrasDePins, useSaldoDePins } from '~/composables/usePins'
import { useMembros } from '~/composables/useMembros'
import { useUsuarioId } from '~/composables/useUsuarioId'

useHead({ title: 'Pins · APPingos' })

const { data: pins, isPending, isError, error } = usePins()
const { data: saldos } = useSaldoDePins()
const { data: membros } = useMembros()
const { data: economia } = useRegrasDePins()
const usuarioId = useUsuarioId()

const aba = ref<'extrato' | 'regras'>('extrato')

/*
 * Fixado na montagem, como no painel e na caixa de notificações: a tela pode
 * ficar aberta por horas num app instalado, mas a virada do dia com ela na
 * frente é rara o bastante para não valer um timer.
 */
const hoje = hojeIso()

const nomes = computed(() =>
  new Map((membros.value ?? []).map(m => [m.user_id, m.exibicao])),
)

function nomeDe(id: string): string {
  return nomes.value.get(id) ?? 'Alguém'
}

/** Chave da regra → rótulo. Inclui as desligadas: elas ainda têm linhas no extrato. */
const rotuloDaRegra = computed(() =>
  new Map((economia.value?.regras ?? []).map(r => [r.chave, r.rotulo])),
)

const rotuloDoHotspot = computed(() =>
  new Map((economia.value?.hotspots ?? []).map(h => [h.chave, h.rotulo])),
)

const dias = computed(() => agruparPorDia(pins.value ?? []))

const minhaSequencia = computed(() =>
  sequenciaDeDias(
    (pins.value ?? []).filter(p => p.user_id === usuarioId.value),
    hoje,
  ),
)

/* O placar, com você primeiro — o painel é seu. */
const placar = computed(() => {
  const lista = saldos.value ?? []
  const meu = lista.filter(s => s.user_id === usuarioId.value)
  const outros = lista.filter(s => s.user_id !== usuarioId.value)
  return [...meu, ...outros]
})

/*
 * As regras ativas, agrupadas pelo módulo a que pertencem — e na ordem em que os
 * módulos aparecem no app, não na do banco. `MODULOS` é a fonte única da
 * navegação; deixar esta tela inventar uma segunda ordem faria "Fotos" vir antes
 * de "Orçamentos" aqui e depois lá, sem motivo que a pessoa consiga adivinhar.
 */
const regrasPorModulo = computed(() => {
  const ativas = (economia.value?.regras ?? []).filter(r => r.ativa)

  return MODULOS
    .map(m => ({
      slug: m.slug,
      rotulo: m.rotulo,
      icone: m.icone,
      regras: ativas.filter(r => r.modulo === m.slug),
    }))
    .filter(g => g.regras.length > 0)
})

const hotspotsAtivos = computed(() =>
  (economia.value?.hotspots ?? []).filter(h => h.ativo),
)

/** `0.15` → `"+15%"`. O fator é sempre um acréscimo; o sinal deixa isso explícito. */
function comoPercentual(fator: number): string {
  return `+${Math.round(fator * 100)}%`
}
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <PingoIcone class="size-6 text-primary" />
          Pins
        </h1>
        <p class="mt-1 text-sm text-muted-foreground">
          A moeda do APPingos — registrar rende, e o combinado rende mais.
        </p>
      </div>

      <nav class="flex gap-1 rounded-lg border bg-card p-1 text-sm">
        <button
          v-for="opcao in [
            { valor: 'extrato' as const, rotulo: 'Extrato' },
            { valor: 'regras' as const, rotulo: 'Como ganhar' },
          ]"
          :key="opcao.valor"
          type="button"
          class="rounded-md px-3 py-1.5 font-medium"
          :class="aba === opcao.valor
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'"
          :aria-current="aba === opcao.valor ? 'page' : undefined"
          @click="aba = opcao.valor"
        >
          {{ opcao.rotulo }}
        </button>
      </nav>
    </header>

    <!-- O placar -->
    <div v-if="placar.length" class="grid gap-3 sm:grid-cols-2">
      <Card v-for="saldo in placar" :key="saldo.user_id">
        <CardContent class="flex items-baseline justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">
              {{ saldo.user_id === usuarioId ? 'Você' : nomeDe(saldo.user_id) }}
            </p>
            <p class="text-xs text-muted-foreground">
              {{ saldo.conquistas === 1 ? '1 conquista' : `${saldo.conquistas} conquistas` }}
              <template v-if="saldo.user_id === usuarioId && minhaSequencia > 0">
                · {{ minhaSequencia === 1 ? '1 dia seguido' : `${minhaSequencia} dias seguidos` }}
              </template>
            </p>
          </div>

          <!-- A gota é a moeda; ver o cabeçalho de SeloDePins.vue. -->
          <p class="flex shrink-0 items-center gap-1.5 text-2xl font-semibold tabular-nums text-primary">
            <PingoIcone class="size-5" />
            {{ saldo.pontos }}
            <span class="sr-only">{{ pinsEmTexto(saldo.pontos) }}</span>
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Extrato -->
    <section v-if="aba === 'extrato'" class="space-y-4">
      <div v-if="isPending" class="space-y-2">
        <Skeleton v-for="i in 5" :key="i" class="h-14 w-full rounded-lg" />
      </div>

      <p v-else-if="isError" class="text-sm text-destructive">
        {{ mensagemDeErro(error, 'Não deu para carregar o extrato.') }}
      </p>

      <Card v-else-if="!dias.length">
        <CardContent class="flex flex-col items-center gap-2 py-10 text-center">
          <SparklesIcon class="size-8 text-muted-foreground" />
          <p class="text-sm font-medium">Nenhum Pin por aqui ainda.</p>
          <p class="text-sm text-muted-foreground">
            Lance um gasto, marque um filme ou mande uma foto — os primeiros vêm rápido.
          </p>
        </CardContent>
      </Card>

      <div v-for="dia in dias" v-else :key="dia.dia" class="space-y-2">
        <div class="flex items-baseline justify-between gap-3">
          <h2 class="text-sm font-medium text-muted-foreground">
            {{ formatarDiaCompleto(dia.dia) }}
          </h2>
          <span class="text-sm font-medium tabular-nums text-muted-foreground">
            +{{ dia.total }}
          </span>
        </div>

        <Card>
          <CardContent class="divide-y p-0">
            <div
              v-for="pin in dia.pins"
              :key="pin.id"
              class="flex items-start justify-between gap-3 px-4 py-3"
            >
              <div class="min-w-0 space-y-1">
                <p class="text-sm font-medium">
                  {{ rotuloDaRegra.get(pin.regra) ?? pin.regra }}
                </p>

                <p v-if="assuntoDoPin(pin)" class="truncate text-sm text-muted-foreground">
                  {{ assuntoDoPin(pin) }}
                </p>

                <p class="text-xs text-muted-foreground">
                  {{ pin.user_id === usuarioId ? 'Você' : nomeDe(pin.user_id) }}
                </p>

                <!--
                  Os hotspots que entraram. É o que faz o multiplicador deixar de
                  ser um número mágico: "1,50×" sozinho não explica nada, "Fim de
                  semana · Modo viagem" explica tudo.
                -->
                <div v-if="pin.hotspots.length" class="flex flex-wrap gap-1 pt-0.5">
                  <Badge v-for="h in pin.hotspots" :key="h" variant="secondary" class="text-[11px]">
                    {{ rotuloDoHotspot.get(h) ?? h }}
                  </Badge>
                </div>
              </div>

              <div class="shrink-0 text-right">
                <p class="text-sm font-semibold tabular-nums">+{{ pin.pontos }}</p>
                <p
                  v-if="pin.multiplicador > 1"
                  class="text-xs tabular-nums text-muted-foreground"
                >
                  {{ formatarConta(pin) }}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>

    <!-- Como ganhar -->
    <section v-else class="space-y-6">
      <div v-for="grupo in regrasPorModulo" :key="grupo.slug" class="space-y-2">
        <h2 class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <ModuleIcon :nome="grupo.icone" class="size-4" />
          {{ grupo.rotulo }}
        </h2>

        <Card>
          <CardContent class="divide-y p-0">
            <div
              v-for="regra in grupo.regras"
              :key="regra.chave"
              class="flex items-start justify-between gap-3 px-4 py-3"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ regra.rotulo }}</p>
                <p class="text-sm text-muted-foreground">{{ regra.descricao }}</p>
                <p v-if="regra.teto_dia" class="text-xs text-muted-foreground">
                  No máximo {{ regra.teto_dia }} por dia.
                </p>
              </div>

              <p class="shrink-0 text-sm font-semibold tabular-nums">+{{ regra.base }}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div class="space-y-2">
        <h2 class="text-sm font-medium text-muted-foreground">Hotspots</h2>
        <p class="text-sm text-muted-foreground">
          Multiplicam o que você ganhou, somam entre si e valem pelo momento em que
          você agiu — não pela data do que aconteceu.
        </p>

        <Card>
          <CardContent class="divide-y p-0">
            <div
              v-for="hotspot in hotspotsAtivos"
              :key="hotspot.chave"
              class="flex items-start justify-between gap-3 px-4 py-3"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ hotspot.rotulo }}</p>
                <p class="text-sm text-muted-foreground">{{ hotspot.descricao }}</p>
              </div>

              <div class="shrink-0 text-right">
                <p class="text-sm font-semibold tabular-nums">
                  {{ comoPercentual(hotspot.fator) }}<span v-if="hotspot.por_dia" class="font-normal text-muted-foreground"> por dia</span>
                </p>
                <p v-if="hotspot.por_dia" class="text-xs tabular-nums text-muted-foreground">
                  até {{ comoPercentual(hotspot.teto) }}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  </div>
</template>
