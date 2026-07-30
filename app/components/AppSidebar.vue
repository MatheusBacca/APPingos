<script setup lang="ts">
import { LayoutDashboardIcon, LogOutIcon, SettingsIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { MODULOS } from '~/modules'

const { sair } = useAuth()
</script>

<template>
  <aside class="flex h-full w-64 flex-col gap-1 border-r bg-sidebar p-3">
    <div class="px-2 py-3">
      <AppLogo />
    </div>

    <SpaceSwitcher />

    <Separator class="my-2" />

    <nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Módulos">
      <NuxtLink
        to="/"
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        active-class="!bg-sidebar-accent !text-sidebar-accent-foreground"
      >
        <LayoutDashboardIcon class="size-4" />
        Início
      </NuxtLink>

      <NuxtLink
        v-for="modulo in MODULOS"
        :key="modulo.slug"
        :to="modulo.rota"
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        active-class="!bg-sidebar-accent !text-sidebar-accent-foreground"
      >
        <ModuleIcon :nome="modulo.icone" class="size-4" />
        <span class="flex-1">{{ modulo.rotulo }}</span>
        <span
          v-if="!modulo.ativo"
          class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
        >
          em breve
        </span>
      </NuxtLink>
    </nav>

    <Separator class="my-2" />

    <div class="flex items-center gap-1">
      <Button variant="ghost" size="sm" class="flex-1 justify-start gap-2" as-child>
        <NuxtLink to="/espacos">
          <SettingsIcon class="size-4" />
          Espaços
        </NuxtLink>
      </Button>
      <ThemeToggle />
      <Button variant="ghost" size="icon" aria-label="Sair" @click="sair">
        <LogOutIcon class="size-4" />
      </Button>
    </div>
  </aside>
</template>
