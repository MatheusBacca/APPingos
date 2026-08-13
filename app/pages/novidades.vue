<script setup lang="ts">
import { RocketIcon } from '@lucide/vue'
import { formatarDiaCompleto } from '@/lib/datas'
import { formatarVersao } from '~/lib/notificacoes'
import { LANCAMENTOS, VERSAO_ATUAL_EXIBICAO } from '~/changelog'

/**
 * A timeline das versões.
 *
 * Sem consulta, sem skeleton, sem estado de erro: o changelog é constante do
 * build (`app/changelog.ts`), então a tela abre pronta e abre offline — que é o
 * mínimo para a tela que explica o app instalado no celular.
 *
 * A ordem vem do registro, e não de um `sort` aqui: o `npm run release` insere
 * sempre no topo, e `test/changelog.test.ts` trava que o registro está em ordem
 * decrescente de versão. Ordenar na tela esconderia um registro torto em vez de
 * fazer o teste apontá-lo.
 */
useHead({ title: 'Novidades · APPingos' })
</script>

<template>
  <div class="space-y-6">
    <header class="space-y-1">
      <BotaoVoltar para="/" rotulo="Início" />

      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 class="text-2xl font-semibold tracking-tight">Novidades</h1>
        <span
          class="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary"
        >
          {{ VERSAO_ATUAL_EXIBICAO }}
        </span>
      </div>

      <p class="text-sm text-muted-foreground">
        Tudo o que chegou no APPingos, do mais recente para o começo.
      </p>
    </header>

    <!--
      A timeline é uma <ol>: é uma lista ordenada de verdade, e com isso o leitor
      de tela anuncia "1 de 9" em vez de deixar a pessoa adivinhar onde está.

      A linha vertical é o `border-l` da própria lista, e cada pingo é
      posicionado em cima dela (`-left-12` = a metade da largura do ponto além do
      `pl-8`). Um `<div>` absoluto de altura calculada faria o mesmo desenho e
      quebraria no primeiro item de duas linhas.
    -->
    <ol class="relative ml-4 space-y-8 border-l pl-8">
      <li v-for="(lancamento, i) in LANCAMENTOS" :key="lancamento.versao" class="relative">
        <!--
          O pingo em cada parada. A versão atual é o quadrado primário do logo; as
          anteriores ficam apagadas, com a mesma marca. É a única diferença
          visual entre "onde você está" e "por onde o app passou" — e ela dispensa
          legenda.
        -->
        <span
          class="absolute -left-12 top-0 grid size-8 place-items-center rounded-xl border"
          :class="i === 0
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-background text-muted-foreground/70'"
          aria-hidden="true"
        >
          <PingoIcone class="size-4" />
        </span>

        <div class="space-y-1 pt-0.5">
          <p class="font-semibold leading-snug">
            <span class="tabular-nums">{{ formatarVersao(lancamento.versao) }}</span>
            <span class="text-muted-foreground"> — </span>{{ lancamento.titulo }}
          </p>

          <p class="text-sm leading-relaxed text-muted-foreground">
            {{ lancamento.descricao }}
          </p>

          <p class="text-xs text-muted-foreground/80">
            {{ formatarDiaCompleto(lancamento.data) }}
            <template v-if="i === 0"> · versão atual</template>
          </p>
        </div>
      </li>
    </ol>

    <!--
      O rodapé fecha a timeline com o que ela não pode contar: o aviso chega
      sozinho, e quem não quiser desliga. Sem isto, a única forma de descobrir a
      preferência nova seria vasculhar a tela de notificações.
    -->
    <footer class="flex items-start gap-3 rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
      <RocketIcon class="mt-0.5 size-4 shrink-0" />
      <p>
        Toda versão nova avisa por aqui — a notificação aparece no sino junto com o que
        chegou. Para não receber, desligue "Novidades do app" em
        <NuxtLink to="/notificacoes/preferencias" class="font-medium text-foreground underline underline-offset-4">
          preferências de notificação
        </NuxtLink>.
      </p>
    </footer>
  </div>
</template>
