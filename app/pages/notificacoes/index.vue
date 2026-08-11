<script setup lang="ts">
import { mensagemDeErro } from '@/lib/utils'
import { BellIcon, CheckCheckIcon, SettingsIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { hojeIso } from '@/lib/datas'
import { agruparPorDia, textoDaNotificacao, tempoRelativo } from '~/lib/notificacoes'
import { useNotificacoes, useNaoLidas, useMarcarLidas } from '~/composables/useNotificacoes'
import { useSpaceStore } from '~/stores/space'

useHead({ title: 'Notificações · APPingos' })

const { data: notificacoes, isPending, isError, error } = useNotificacoes()
const naoLidas = useNaoLidas()
const marcarLidas = useMarcarLidas()

// A lista de espaços já está no store, carregada uma vez pelo layout — aqui ela
// serve só para nomear de onde veio cada aviso.
const store = useSpaceStore()

/*
 * Fixados na montagem, como no painel de resumos: a tela pode ficar aberta por
 * horas num app instalado, mas a virada do dia com ela na frente é rara o
 * bastante para não valer um timer.
 */
const hoje = hojeIso()
const agora = Date.now()

const dias = computed(() => agruparPorDia(notificacoes.value ?? [], hoje))

/*
 * O nome do espaço só aparece para quem tem mais de um — e o pessoal não conta,
 * porque ele existe para todo mundo. Com um espaço só, repetir "Nós dois" em
 * cada linha é ruído sem informação.
 */
const mostrarEspaco = computed(() => store.espacos.length > 1)

function nomeDoEspaco(id: string | null): string {
  if (!id) return ''
  return store.espacos.find(e => e.id === id)?.nome ?? ''
}

async function onMarcarTodas() {
  try {
    await marcarLidas.mutateAsync(undefined)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para marcar como lidas.'))
  }
}
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Notificações</h1>
        <p class="text-sm text-muted-foreground">
          {{ naoLidas.length ? `${naoLidas.length} não lida(s)` : 'Tudo em dia por aqui.' }}
        </p>
      </div>

      <div class="flex items-center gap-2">
        <Button
          v-if="naoLidas.length"
          variant="outline"
          size="sm"
          class="gap-2"
          :disabled="marcarLidas.isPending.value"
          @click="onMarcarTodas"
        >
          <CheckCheckIcon class="size-4" />
          Marcar todas
        </Button>
        <Button variant="ghost" size="sm" class="gap-2" as-child>
          <NuxtLink to="/notificacoes/preferencias">
            <SettingsIcon class="size-4" />
            Preferências
          </NuxtLink>
        </Button>
      </div>
    </header>

    <div v-if="isError" class="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p class="font-medium text-destructive">Não consegui carregar as notificações.</p>
      <p class="mt-1 text-muted-foreground">{{ error?.message }}</p>
    </div>

    <div v-else-if="isPending" class="space-y-3">
      <Skeleton v-for="i in 4" :key="i" class="h-16 w-full" />
    </div>

    <div
      v-else-if="!dias.length"
      class="rounded-xl border border-dashed p-10 text-center"
    >
      <BellIcon class="mx-auto size-8 text-muted-foreground/60" />
      <p class="mt-3 font-medium">Nenhuma notificação ainda.</p>
      <p class="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Gasto novo, roteiro liberado, filme adicionado — o que o outro fizer no espaço
        aparece aqui. E também no seu e-mail, se você quiser.
      </p>
    </div>

    <section v-for="dia in dias" v-else :key="dia.dia" class="space-y-2">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {{ dia.rotulo }}
      </h2>

      <ul class="divide-y rounded-xl border">
        <li v-for="n in dia.itens" :key="n.id">
          <NuxtLink
            :to="textoDaNotificacao(n).rota"
            class="flex items-start gap-3 p-3 transition-colors hover:bg-accent/50"
            :class="n.lida_em ? '' : 'bg-primary/[0.04]'"
            @click="marcarLidas.mutate([n.id])"
          >
            <IconeDeNotificacao
              :nome="textoDaNotificacao(n).icone"
              class="mt-0.5 size-4 shrink-0 text-muted-foreground"
            />

            <div class="min-w-0 flex-1">
              <p class="text-sm leading-snug" :class="n.lida_em ? '' : 'font-medium'">
                {{ textoDaNotificacao(n).titulo }}
              </p>
              <p v-if="textoDaNotificacao(n).corpo" class="mt-0.5 text-sm text-muted-foreground">
                {{ textoDaNotificacao(n).corpo }}
              </p>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ tempoRelativo(n.created_at, agora) }}
                <template v-if="mostrarEspaco && nomeDoEspaco(n.space_id)">
                  · {{ nomeDoEspaco(n.space_id) }}
                </template>
              </p>
            </div>

            <span v-if="!n.lida_em" class="mt-2 size-2 shrink-0 rounded-full bg-primary" />
          </NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>
