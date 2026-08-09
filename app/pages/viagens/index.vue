<script setup lang="ts">
import { mensagemDeErro } from '@/lib/utils'
import { PlusIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { RoteiroParaSalvar } from '~/composables/useRoteiros'
import { roteirosNovos } from '~/types/viagem'
import { useRoteiros, useRoteirosVistos, useCriarRoteiro } from '~/composables/useRoteiros'

useHead({ title: 'Viagens · APPingos' })

const { data: roteiros, isPending, isError, error } = useRoteiros()
const { data: vistos } = useRoteirosVistos()
const criar = useCriarRoteiro()

const dialogoAberto = ref(false)

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

    <div v-else-if="roteiros?.length" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <RoteiroCard
        v-for="roteiro in roteiros"
        :key="roteiro.id"
        :roteiro="roteiro"
        :novo="novos.has(roteiro.id)"
      />
    </div>

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
