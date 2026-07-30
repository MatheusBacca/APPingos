<script setup lang="ts">
import { ArrowRightIcon } from '@lucide/vue'
import { MODULOS } from '~/modules'

useHead({ title: 'Início · APPingos' })

const store = useSpaceStore()
const user = useSupabaseUser()

const primeiroNome = computed(() => {
  const nome = (user.value?.user_metadata?.nome as string | undefined) ?? ''
  return nome.split(' ')[0] || null
})
</script>

<template>
  <div class="space-y-8">
    <header>
      <h1 class="text-2xl font-semibold tracking-tight">
        {{ primeiroNome ? `Oi, ${primeiroNome}` : 'Oi' }}
      </h1>
      <p class="mt-1 text-sm text-muted-foreground">
        Você está em <strong class="text-foreground">{{ store.espacoAtivo?.nome }}</strong>.
      </p>
    </header>

    <section>
      <h2 class="sr-only">Módulos</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <NuxtLink
          v-for="modulo in MODULOS"
          :key="modulo.slug"
          :to="modulo.rota"
          class="group flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
        >
          <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <ModuleIcon :nome="modulo.icone" class="size-5" />
          </span>

          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-2">
              <span class="font-medium">{{ modulo.rotulo }}</span>
              <span
                v-if="!modulo.ativo"
                class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                em breve
              </span>
            </span>
            <span class="mt-0.5 block text-sm text-muted-foreground">
              {{ modulo.descricao }}
            </span>
          </span>

          <ArrowRightIcon
            class="mt-2 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          />
        </NuxtLink>
      </div>
    </section>
  </div>
</template>
