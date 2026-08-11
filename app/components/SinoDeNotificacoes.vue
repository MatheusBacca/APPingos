<script setup lang="ts">
import { BellIcon, CheckCheckIcon, SettingsIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { textoDaNotificacao, tempoRelativo, textoDoBadge } from '~/lib/notificacoes'
import { useNotificacoes, useNaoLidas, useMarcarLidas } from '~/composables/useNotificacoes'

/**
 * O sino, com o contador de não-lidas.
 *
 * No desktop ele abre a caixa curta ali mesmo; no mobile é um link para
 * `/notificacoes`, porque um menu suspenso com dez linhas num celular é uma
 * página disfarçada de menu. São dois gatilhos com o mesmo visual, alternados
 * por CSS, e não um `useMediaQuery`: assim não há um frame com o gatilho errado
 * enquanto o JS decide qual é a largura.
 *
 * Ele NÃO entra na bottom bar do mobile — a grade tem 5 células e está cheia
 * desde que Viagens ativou. Vive no header, ao lado do alternador de tema.
 */
const props = withDefaults(defineProps<{ ultimas?: number }>(), { ultimas: 6 })

const { data: notificacoes } = useNotificacoes()
const naoLidas = useNaoLidas()
const marcarLidas = useMarcarLidas()

const badge = computed(() => textoDoBadge(naoLidas.value.length))

const recentes = computed(() => (notificacoes.value ?? []).slice(0, props.ultimas))

/*
 * Congelado na montagem: "há 5 min" que se recalcula a cada render precisaria de
 * um timer para valer a pena, e o menu é aberto por segundos.
 */
const agora = Date.now()

/*
 * Abrir o menu NÃO marca nada como lido: quem quer zerar aperta "marcar todas",
 * e tocar num aviso marca aquele. Zerar na abertura faria o contador sumir para
 * quem só passou o olho — o jeito mais rápido de perder uma notificação.
 */
</script>

<template>
  <!-- Mobile: leva para a página -->
  <Button
    variant="ghost"
    size="icon"
    class="relative md:hidden"
    aria-label="Notificações"
    title="Notificações"
    as-child
  >
    <NuxtLink to="/notificacoes">
      <BellIcon class="size-4" />
      <span
        v-if="badge"
        class="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground"
      >
        {{ badge }}
      </span>
    </NuxtLink>
  </Button>

  <!-- Desktop: a caixa curta no próprio menu -->
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        class="relative hidden md:inline-flex"
        aria-label="Notificações"
        title="Notificações"
      >
        <BellIcon class="size-4" />
        <span
          v-if="badge"
          class="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground"
        >
          {{ badge }}
        </span>
      </Button>
    </DropdownMenuTrigger>

    <DropdownMenuContent align="end" side="top" class="w-80">
      <div class="flex items-center justify-between px-2 py-1.5">
        <span class="text-sm font-medium">Notificações</span>
        <Button
          v-if="naoLidas.length"
          variant="ghost"
          size="sm"
          class="h-7 gap-1 px-2 text-xs"
          :disabled="marcarLidas.isPending.value"
          @click="marcarLidas.mutate(undefined)"
        >
          <CheckCheckIcon class="size-3.5" />
          Marcar todas
        </Button>
      </div>

      <DropdownMenuSeparator />

      <p v-if="!recentes.length" class="px-2 py-6 text-center text-sm text-muted-foreground">
        Nada por aqui ainda.
      </p>

      <DropdownMenuItem
        v-for="n in recentes"
        :key="n.id"
        as-child
        class="items-start gap-2 py-2"
      >
        <NuxtLink :to="textoDaNotificacao(n).rota" @click="marcarLidas.mutate([n.id])">
          <IconeDeNotificacao
            :nome="textoDaNotificacao(n).icone"
            class="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <span class="flex-1 space-y-0.5">
            <span class="block text-sm leading-snug" :class="n.lida_em ? 'text-muted-foreground' : 'font-medium'">
              {{ textoDaNotificacao(n).titulo }}
            </span>
            <span class="block text-xs text-muted-foreground">
              {{ tempoRelativo(n.created_at, agora) }}
            </span>
          </span>
          <span v-if="!n.lida_em" class="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
        </NuxtLink>
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem as-child class="gap-2">
        <NuxtLink to="/notificacoes">Ver todas</NuxtLink>
      </DropdownMenuItem>
      <DropdownMenuItem as-child class="gap-2">
        <NuxtLink to="/notificacoes/preferencias">
          <SettingsIcon class="size-4 text-muted-foreground" />
          Preferências
        </NuxtLink>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
