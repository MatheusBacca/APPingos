<script setup lang="ts">
/**
 * O painel de aparência: modo de cor e acento.
 *
 * As amostras são botões de rádio de verdade (`role="radio"` num `radiogroup`),
 * e não `<div>`s clicáveis. São oito opções mutuamente exclusivas — exatamente o
 * que rádio significa —, e é isso que dá navegação por seta no teclado e o
 * anúncio de "3 de 8" no leitor de tela sem escrever nada a mais.
 *
 * Não há botão de salvar. A troca vale na hora e já fica guardada; um "aplicar"
 * só adiaria o efeito de uma escolha cujo resultado é a própria tela ao redor.
 */
import { CheckIcon, MoonIcon, PaletteIcon, SunIcon } from '@lucide/vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ACENTOS, MODOS, corDaAmostra } from '~/lib/tema'
import type { ModoDeCor } from '~/lib/tema'
import { useAparencia } from '~/composables/useAparencia'

const aberto = defineModel<boolean>('aberto', { required: true })

const { modo, acento, definirModo } = useAparencia()

/*
 * `modo` do VueUse guarda o que foi ESCOLHIDO ('auto'), enquanto o que está
 * valendo agora pode ser outro. O chip precisa marcar a escolha, não o
 * resultado: com 'auto' selecionado à noite, destacar "Escuro" faria a pessoa
 * achar que o automático não pegou.
 */
function modoAtivo(valor: ModoDeCor): boolean {
  return modo.value === valor
}

const ICONES = { light: SunIcon, dark: MoonIcon, auto: PaletteIcon } as const
</script>

<template>
  <Dialog v-model:open="aberto">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Aparência</DialogTitle>
        <DialogDescription>
          O tema e a cor de destaque. Vale só neste aparelho.
        </DialogDescription>
      </DialogHeader>

      <section class="space-y-3">
        <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Tema
        </h3>

        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="opcao in MODOS"
            :key="opcao.valor"
            type="button"
            class="flex flex-col items-center gap-2 rounded-lg border p-3 text-xs font-medium transition-colors"
            :class="modoAtivo(opcao.valor)
              ? 'border-primary bg-primary/10 text-primary'
              : 'text-muted-foreground hover:border-primary/40 hover:text-foreground'"
            :aria-pressed="modoAtivo(opcao.valor)"
            @click="definirModo(opcao.valor)"
          >
            <component :is="ICONES[opcao.valor]" class="size-4" />
            {{ opcao.rotulo }}
          </button>
        </div>
      </section>

      <section class="space-y-3">
        <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Cor de destaque
        </h3>

        <div class="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Cor de destaque">
          <button
            v-for="cor in ACENTOS"
            :key="cor.valor"
            type="button"
            role="radio"
            :aria-checked="acento === cor.valor"
            :aria-label="cor.rotulo"
            class="flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors"
            :class="acento === cor.valor
              ? 'border-primary bg-primary/10'
              : 'hover:border-primary/40'"
            @click="acento = cor.valor"
          >
            <span
              class="grid size-7 place-items-center rounded-full"
              :style="{ backgroundColor: corDaAmostra(cor) }"
            >
              <!--
                O tique some para quem não enxerga cor bem, então ele não é a
                única marca: a borda e o fundo do botão também mudam. Duas
                pistas para a mesma informação.
              -->
              <CheckIcon v-if="acento === cor.valor" class="size-4 text-white" />
            </span>
            <span class="text-[0.7rem] text-muted-foreground">{{ cor.rotulo }}</span>
          </button>
        </div>
      </section>
    </DialogContent>
  </Dialog>
</template>
