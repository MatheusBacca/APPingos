<script setup lang="ts">
import { MODULOS } from '~/modules'

const props = defineProps<{ slug: string }>()

const modulo = computed(() => MODULOS.find(m => m.slug === props.slug))

useHead({ title: () => `${modulo.value?.rotulo ?? 'Módulo'} · APPingos` })
</script>

<template>
  <div class="space-y-6">
    <header>
      <h1 class="text-2xl font-semibold tracking-tight">
        {{ modulo?.rotulo }}
      </h1>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ modulo?.descricao }}
      </p>
    </header>

    <div class="grid place-items-center rounded-xl border border-dashed bg-card/50 px-6 py-16 text-center">
      <span class="grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
        <ModuleIcon :nome="modulo?.icone ?? ''" class="size-6" />
      </span>
      <p class="mt-4 font-medium">Ainda não construímos este módulo.</p>
      <p class="mt-1 max-w-sm text-sm text-muted-foreground">
        A fundação já suporta ele — falta a tela. Ative em
        <code class="rounded bg-muted px-1 py-0.5 text-xs">app/modules.ts</code>
        quando estiver pronto.
      </p>
    </div>
  </div>
</template>
