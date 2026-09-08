<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { useAvisoEspacoDeletado } from '~/composables/useAvisoEspacoDeletado'
import { useConvitePendente } from '~/composables/useConvitePendente'
import { useEspacos } from '~/composables/useEspacos'
import { useSidebar } from '~/composables/useSidebar'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'
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

// A sidebar decide a própria largura; aqui o conteúdo acompanha o recuo.
const { aberta } = useSidebar()

// Para o selo de Pins do cabeçalho do celular.
const euId = useUsuarioId()
</script>

<template>
  <!--
    SEM `bg-background` aqui, e isso é essencial, não economia.

    O brilho é um filho em `z-index: -1`. Um fundo pintado neste `div` ficaria
    POR CIMA dele — a camada continuaria no DOM, do tamanho certo, e invisível.
    O fundo da página vem do `body` (em @layer base), que é canvas e é pintado
    antes de qualquer z-index negativo.
  -->
  <div class="min-h-dvh">
    <!--
      A iluminação do ambiente, atrás de tudo. Duas manchas do acento em
      `position: fixed`, então elas não rolam com a página: é luz do cenário, não
      conteúdo. É o que dá o fundo das referências e o que faz o vidro dos cards
      ter algo colorido para desfocar — sem ela, "vidro" sobre um fundo chapado
      não se distingue de um card comum.
    -->
    <div class="brilho-ambiente" aria-hidden="true" />

    <!-- Desktop: sidebar fixa -->
    <div class="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:block print:hidden">
      <AppSidebar />
    </div>

    <!-- Mobile: header enxuto com o seletor de espaço -->
    <header
      class="vidro sticky top-0 z-30 flex items-center justify-between gap-2 rounded-none border-x-0 border-t-0 px-3 pt-safe md:hidden print:hidden"
    >
      <div class="flex h-14 items-center gap-2">
        <AppLogo :com-texto="false" />
        <div class="w-44">
          <SpaceSwitcher />
        </div>
      </div>
      <div class="flex items-center gap-1">
        <!--
          O saldo de Pins, e é só aqui que ele mora fixo.

          No desktop a barra lateral já desenha o resumo de Pins junto dos outros
          módulos; um selo a mais ao lado do logo repetiria, na mesma coluna, o
          número que está dois blocos abaixo. No celular não há barra lateral, e
          sem isto os Pins só existiriam no cartão do painel — visíveis na tela
          inicial e invisíveis nas outras sete.
        -->
        <NuxtLink
          v-if="euId"
          to="/pins"
          class="rounded-full transition-opacity hover:opacity-80"
          aria-label="Seus Pins"
        >
          <SeloDePins :de="euId" tamanho="md" />
        </NuxtLink>
        <SinoDeNotificacoes />
        <BotaoDeAparencia />
      </div>
    </header>

    <!--
      Na impressão o recuo da sidebar tem que sumir junto com ela: o `md:pl-64`
      continuaria empurrando o conteúdo 16rem para a direita numa folha A4, e a
      memória sairia cortada pela margem direita. `print:max-w-none` e
      `print:p-0` pelo mesmo motivo — a folha traz as próprias medidas.
    -->
    <main
      class="transition-[padding] duration-200 print:pl-0"
      :class="aberta ? 'md:pl-64' : 'md:pl-16'"
    >
      <div class="mx-auto w-full max-w-5xl px-4 pb-24 pt-4 md:px-8 md:pb-12 md:pt-8 print:max-w-none print:p-0">
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
