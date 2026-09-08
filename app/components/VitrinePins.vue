<script setup lang="ts">
/**
 * O placar dos Pins, no cartão do painel.
 *
 * Barras e não números soltos: a pergunta que se faz olhando o painel de um app
 * de casal não é "quantos Pins eu tenho", é "como a gente está" — e a resposta
 * disso é a comparação, que uma barra dá de relance e dois números lado a lado
 * obrigam a fazer de cabeça.
 *
 * A barra é proporcional ao MAIOR saldo do espaço, não a um teto fixo: não
 * existe "cheio" aqui, o livro-razão só cresce. Quem lidera fica com a barra
 * inteira, e a do outro diz a distância.
 *
 * A sequência entra embaixo, e só a SUA — é a única linha do cartão que pede uma
 * ação hoje, e mostrar a do outro seria transformar um lembrete em cobrança.
 */
import { Skeleton } from '@/components/ui/skeleton'
import { hojeIso } from '@/lib/datas'
import { pinsEmTexto, sequenciaDeDias } from '~/types/pin'
import { useMembros } from '~/composables/useMembros'
import { usePins, useSaldoDePins } from '~/composables/usePins'
import { useUsuarioId } from '~/composables/useUsuarioId'

const { data: saldos, isPending } = useSaldoDePins()
const { data: membros } = useMembros()
const { data: pins } = usePins()
const usuarioId = useUsuarioId()

const hoje = hojeIso()

const nomes = computed(() =>
  new Map((membros.value ?? []).map(m => [m.user_id, m.exibicao])),
)

/* Você primeiro, e não o líder primeiro: o painel é seu. */
const placar = computed(() => {
  const lista = saldos.value ?? []
  const meu = lista.filter(s => s.user_id === usuarioId.value)
  const outros = lista.filter(s => s.user_id !== usuarioId.value)

  const maior = Math.max(1, ...lista.map(s => s.pontos))

  return [...meu, ...outros].map(s => ({
    ...s,
    sou: s.user_id === usuarioId.value,
    nome: s.user_id === usuarioId.value ? 'Você' : (nomes.value.get(s.user_id) ?? 'Alguém'),
    fracao: s.pontos / maior,
  }))
})

const sequencia = computed(() =>
  sequenciaDeDias(
    (pins.value ?? []).filter(p => p.user_id === usuarioId.value),
    hoje,
  ),
)
</script>

<template>
  <div class="mt-3 space-y-3">
    <div v-if="isPending" class="space-y-2">
      <Skeleton v-for="i in 2" :key="i" class="h-9 w-full rounded-lg" />
    </div>

    <p v-else-if="!placar.length" class="text-sm text-muted-foreground">
      Nenhum Pin ainda — registrar qualquer coisa já começa a contar.
    </p>

    <template v-else>
      <div v-for="linha in placar" :key="linha.user_id" class="space-y-1">
        <div class="flex items-baseline justify-between gap-2 text-sm">
          <span class="truncate" :class="linha.sou ? 'font-medium' : 'text-muted-foreground'">
            {{ linha.nome }}
          </span>
          <!--
            A gota entra só na SUA linha. Ela é a moeda (ver SeloDePins.vue), e
            repeti-la em toda linha do placar transformaria a coluna de números
            numa fileira de ícones idênticos — o cartão inteiro já é sobre Pins.
          -->
          <span
            class="flex shrink-0 items-center gap-1 font-medium tabular-nums"
            :class="linha.sou ? 'text-primary' : ''"
          >
            <PingoIcone v-if="linha.sou" class="size-3" />
            {{ linha.pontos }}
            <span class="sr-only">{{ pinsEmTexto(linha.pontos) }}</span>
          </span>
        </div>

        <!--
          `aria-hidden` porque a barra é a MESMA informação do número ao lado, em
          outra forma. Um leitor de tela que anunciasse as duas leria o saldo
          duas vezes por pessoa.
        -->
        <div class="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div
            class="h-full rounded-full transition-[width]"
            :class="linha.sou ? 'bg-primary' : 'bg-primary/40'"
            :style="{ width: `${Math.max(linha.fracao * 100, 4)}%` }"
          />
        </div>
      </div>

      <p v-if="sequencia > 0" class="text-xs text-muted-foreground">
        {{ sequencia === 1 ? '1 dia seguido' : `${sequencia} dias seguidos` }} — a sequência
        está valendo.
      </p>
    </template>
  </div>
</template>
