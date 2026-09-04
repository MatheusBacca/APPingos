<script setup lang="ts">
/**
 * A engrenagem do painel: onde se ajusta, e onde os cartões escondidos voltam.
 *
 * O menu é o ÚNICO caminho de volta para um cartão escondido, e é por isso que
 * ele lista todos os cartões — inclusive os visíveis, com a marca ligada. Uma
 * lista só dos escondidos ficaria vazia na maior parte do tempo, e a pessoa que
 * escondeu Livros há um mês não teria como saber que o lugar de procurá-lo é
 * aqui.
 *
 * Marcar um cartão não fecha o menu (`@select.prevent`): quem abriu para arrumar
 * a tela costuma mexer em mais de um, e reabrir a cada clique é o tipo de atrito
 * que faz a pessoa desistir no segundo.
 */
import { CheckIcon, RotateCcwIcon, Settings2Icon, SlidersHorizontalIcon } from '@lucide/vue'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { CardDoPainel } from '~/composables/usePainel'

defineProps<{
  cards: CardDoPainel[]
  editando: boolean
  /** Nada mexido = não há o que restaurar, e o item fica desabilitado. */
  ajustado: boolean
}>()

const emit = defineEmits<{
  editar: [boolean]
  mostrar: [slug: string, visivel: boolean]
  restaurar: []
}>()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button
        type="button"
        class="grid size-9 shrink-0 place-items-center rounded-lg border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        :class="editando ? 'border-primary/40 bg-primary/10 text-primary' : ''"
        aria-label="Ajustar o painel"
      >
        <Settings2Icon class="size-4" />
      </button>
    </DropdownMenuTrigger>

    <DropdownMenuContent align="end" class="w-60">
      <DropdownMenuItem class="gap-2" @select="emit('editar', !editando)">
        <component :is="editando ? CheckIcon : SlidersHorizontalIcon" class="size-4" />
        {{ editando ? 'Concluir ajustes' : 'Ajustar o painel' }}
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuLabel class="text-xs text-muted-foreground">
        Cartões na tela
      </DropdownMenuLabel>

      <DropdownMenuCheckboxItem
        v-for="card in cards"
        :key="card.modulo.slug"
        :model-value="!card.escondido"
        @select.prevent="emit('mostrar', card.modulo.slug, card.escondido)"
      >
        {{ card.modulo.rotulo }}
      </DropdownMenuCheckboxItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem class="gap-2" :disabled="!ajustado" @select="emit('restaurar')">
        <RotateCcwIcon class="size-4" />
        Restaurar o padrão
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
