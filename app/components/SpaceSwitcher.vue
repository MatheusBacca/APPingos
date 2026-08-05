<script setup lang="ts">
import { CheckIcon, ChevronsUpDownIcon, HeartIcon, PlusIcon, UserIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useSpaceStore } from '~/stores/space'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** Compacto = só o ícone, para a sidebar recolhida. O menu é o mesmo. */
withDefaults(defineProps<{ compacto?: boolean }>(), { compacto: false })

const store = useSpaceStore()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        :class="compacto ? 'size-9 px-0' : 'h-auto w-full justify-between gap-2 px-2 py-2'"
        :title="compacto ? store.espacoAtivo?.nome : undefined"
        :aria-label="compacto ? `Espaço: ${store.espacoAtivo?.nome ?? ''}` : undefined"
      >
        <span class="flex min-w-0 items-center gap-2">
          <component
            :is="store.espacoAtivo?.tipo === 'casal' ? HeartIcon : UserIcon"
            class="size-4 shrink-0 text-muted-foreground"
          />
          <span v-if="!compacto" class="truncate text-sm font-medium">
            {{ store.espacoAtivo?.nome ?? 'Carregando…' }}
          </span>
        </span>
        <ChevronsUpDownIcon v-if="!compacto" class="size-4 shrink-0 text-muted-foreground" />
      </Button>
    </DropdownMenuTrigger>

    <DropdownMenuContent align="start" class="w-56">
      <DropdownMenuLabel class="text-xs text-muted-foreground">
        Espaços
      </DropdownMenuLabel>

      <DropdownMenuItem
        v-for="espaco in store.espacos"
        :key="espaco.id"
        class="gap-2"
        @select="store.selecionar(espaco.id)"
      >
        <component
          :is="espaco.tipo === 'casal' ? HeartIcon : UserIcon"
          class="size-4 text-muted-foreground"
        />
        <span class="flex-1 truncate">{{ espaco.nome }}</span>
        <CheckIcon v-if="espaco.id === store.espacoAtivoId" class="size-4 text-primary" />
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem as-child class="gap-2">
        <NuxtLink to="/espacos">
          <PlusIcon class="size-4 text-muted-foreground" />
          Gerenciar espaços
        </NuxtLink>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
