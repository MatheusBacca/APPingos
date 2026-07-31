<script setup lang="ts">
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// Uma chamada só, no shell: carrega os espaços e alimenta o store.
// Nenhuma página precisa se preocupar com isso.
const { isPending, isError, error } = useEspacos()
const store = useSpaceStore()

// O link de confirmação de e-mail do Supabase manda direto para a Site URL
// (`/`), não para `/confirmar` — o `callback` do redirectOptions só vale para
// fluxos que a gente mesmo controla o `redirectTo` (OAuth, magic link). Por
// isso o convite pendente é resolvido aqui, na primeira página autenticada
// que carregar, e não só em /confirmar.
const user = useSupabaseUser()
const { resolverSeHouver } = useConvitePendente()
watch(user, async (novo) => {
  if (novo) await resolverSeHouver()
}, { immediate: true })

// Fica no layout, e não numa página, porque o espaço excluído sumiu do seletor:
// não há mais para onde "entrar". O aviso precisa alcançar a pessoa em qualquer
// tela que ela abrir depois.
const { aviso, marcarLido } = useAvisoEspacoDeletado()
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

    <Dialog :open="!!aviso">
      <DialogContent :show-close-button="false" @escape-key-down.prevent @pointer-down-outside.prevent>
        <DialogHeader>
          <DialogTitle>O espaço foi deletado pelo dono.</DialogTitle>
          <DialogDescription>
            "{{ aviso?.space_nome }}" não existe mais — {{ aviso?.deletado_por_nome }} excluiu o
            espaço, e tudo que estava nele foi junto. Os seus outros espaços continuam intactos.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            :disabled="marcarLido.isPending.value"
            @click="aviso && marcarLido.mutate(aviso.id)"
          >
            Entendi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
