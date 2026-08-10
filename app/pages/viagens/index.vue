<script setup lang="ts">
import { mensagemDeErro } from '@/lib/utils'
import { PlusIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { RoteiroParaSalvar } from '~/composables/useRoteiros'
import { hojeIso } from '@/lib/datas'
import { roteirosNovos, separarPorTempo } from '~/types/viagem'
import { useRoteiros, useRoteirosVistos, useCriarRoteiro, useSegredosDoEspaco } from '~/composables/useRoteiros'
import { useMembros } from '~/composables/useMembros'

useHead({ title: 'Viagens · APPingos' })

const { data: roteiros, isPending, isError, error } = useRoteiros()
const { data: vistos } = useRoteirosVistos()
const { data: segredos } = useSegredosDoEspaco()
const { data: membros } = useMembros()
const criar = useCriarRoteiro()

const dialogoAberto = ref(false)

/**
 * Só o primeiro nome: "Ana está montando algo" cabe no card, o nome inteiro não.
 * O apelido vai inteiro — quem se apelidou de "Dona Ana" escolheu as duas
 * palavras, e cortar a segunda desfaz a escolha.
 */
function primeiroNome(userId: string): string | null {
  const membro = membros.value?.find(m => m.user_id === userId)
  if (!membro) return null
  return membro.apelido ?? (membro.nome.split(' ')[0] || membro.nome)
}

/** A grade tem conteúdo se há roteiro OU se há segredo alheio a anunciar. */
const temAlgo = computed(() => !!roteiros.value?.length || !!segredos.value?.length)

/*
 * O mês é fixado na montagem em vez de recalculado a cada leitura: a tela pode
 * ficar aberta por horas num app instalado, mas a virada do dia com ela na
 * frente é rara o bastante para não valer um timer. Mesmo critério do painel
 * de resumos.
 */
const hoje = hojeIso()

const separadas = computed(() => separarPorTempo(roteiros.value ?? [], hoje))
const proximas = computed(() => separadas.value.proximas)
const passadas = computed(() => separadas.value.passadas)

/*
 * Os títulos só aparecem quando há de fato as duas metades. Com nada arquivado
 * ainda — que é o estado do módulo recém-nascido —, um "Próximas viagens"
 * sozinho em cima de tudo seria rótulo sem contraste, nomeando a única coisa
 * que existe na tela.
 */
const separar = computed(() => passadas.value.length > 0)

const novos = computed(() =>
  new Set(roteirosNovos(roteiros.value ?? [], vistos.value ?? [])),
)

async function onCriar(campos: RoteiroParaSalvar) {
  try {
    const id = await criar.mutateAsync(campos)
    dialogoAberto.value = false
    // Vai direto para o detalhe: um roteiro sem parada nenhuma não tem o que
    // mostrar na grade, e o próximo passo óbvio é adicionar a primeira.
    await navigateTo(`/viagens/${id}`)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para criar o roteiro.'))
  }
}
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Viagens</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Roteiros com as paradas na ordem, prontos para abrir no Google Maps.
        </p>
      </div>

      <Button class="gap-1.5" @click="dialogoAberto = true">
        <PlusIcon class="size-4" />
        Novo roteiro
      </Button>
    </header>

    <div v-if="isPending" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton v-for="i in 3" :key="i" class="h-28 w-full rounded-lg" />
    </div>

    <p v-else-if="isError" class="text-sm text-destructive">
      {{ mensagemDeErro(error, 'Não deu para carregar os roteiros.') }}
    </p>

    <template v-else-if="temAlgo">
      <section class="space-y-3">
        <h2 v-if="separar" class="text-sm font-medium">Próximas viagens</h2>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <RoteiroCard
            v-for="roteiro in proximas"
            :key="roteiro.id"
            :roteiro="roteiro"
            :novo="novos.has(roteiro.id)"
          />

          <!--
            O segredo alheio é do que ainda vem, por definição: ninguém guarda
            surpresa de viagem que já aconteceu. Vem depois dos roteiros de
            verdade porque é aviso, não conteúdo.
          -->
          <RoteiroSecretoCard
            v-for="segredo in segredos"
            :key="segredo.id"
            :quem="primeiroNome(segredo.criado_por)"
            :desde="segredo.created_at"
          />
        </div>

        <p v-if="!proximas.length && !segredos?.length" class="text-sm text-muted-foreground">
          Nada marcado para frente. Que tal um roteiro novo?
        </p>
      </section>

      <section v-if="separar" class="space-y-3">
        <h2 class="text-sm font-medium">Viagens passadas</h2>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <!--
            Sem o selo "Novo" aqui: um roteiro liberado depois da viagem não é
            novidade que espera resposta, e o destaque só chamaria atenção para
            o que já passou.
          -->
          <RoteiroCard
            v-for="roteiro in passadas"
            :key="roteiro.id"
            :roteiro="roteiro"
          />
        </div>
      </section>
    </template>

    <div v-else class="rounded-xl border border-dashed px-6 py-16 text-center">
      <p class="font-medium">Nenhum roteiro ainda.</p>
      <p class="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Um roteiro é uma sequência de lugares. Monte o primeiro e ele vira um link
        que abre o Google Maps com todas as paradas na ordem.
      </p>
      <Button class="mt-4 gap-1.5" @click="dialogoAberto = true">
        <PlusIcon class="size-4" />
        Novo roteiro
      </Button>
    </div>

    <RoteiroDialogo
      v-model:open="dialogoAberto"
      :salvando="criar.isPending.value"
      @salvar="onCriar"
    />
  </div>
</template>
