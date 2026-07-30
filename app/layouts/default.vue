<script setup lang="ts">
// Uma chamada só, no shell: carrega os espaços e alimenta o store.
// Nenhuma página precisa se preocupar com isso.
const { isPending, isError, error } = useEspacos()
const store = useSpaceStore()
</script>

<template>
  <div class="min-h-dvh bg-background">
    <!-- Desktop: sidebar fixa -->
    <div class="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:block">
      <AppSidebar />
    </div>

    <!-- Mobile: header enxuto com o seletor de espaço -->
    <header
      class="sticky top-0 z-30 flex items-center justify-between gap-2 border-b bg-background/95 px-3 pt-safe backdrop-blur md:hidden"
    >
      <div class="flex h-14 items-center gap-2">
        <AppLogo :com-texto="false" />
        <div class="w-44">
          <SpaceSwitcher />
        </div>
      </div>
      <ThemeToggle />
    </header>

    <main class="md:pl-64">
      <div class="mx-auto w-full max-w-5xl px-4 pb-24 pt-4 md:px-8 md:pb-12 md:pt-8">
        <div v-if="isError" class="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p class="font-medium text-destructive">Não consegui carregar os seus espaços.</p>
          <p class="mt-1 text-muted-foreground">{{ error?.message }}</p>
        </div>

        <div v-else-if="isPending || !store.pronto" class="space-y-4">
          <Skeleton class="h-8 w-48" />
          <Skeleton class="h-32 w-full" />
          <Skeleton class="h-32 w-full" />
        </div>

        <slot v-else />
      </div>
    </main>

    <AppBottomBar />
  </div>
</template>
