<script setup lang="ts">
import { CheckIcon } from '@lucide/vue'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { STATUS_ROTULO } from '~/types/catalogo'
import type { StatusItem } from '~/types/catalogo'

/**
 * `rotulos` existe porque o mesmo estado tem verbos diferentes por mídia —
 * "Assistido" num filme, "Já ouvi" numa faixa. O padrão é o de Filmes, então
 * quem já usava o componente não muda.
 */
const props = withDefaults(defineProps<{
  status: StatusItem
  rotulos?: Record<StatusItem, string>
}>(), {
  rotulos: () => STATUS_ROTULO,
})

const emit = defineEmits<{ 'update:status': [valor: StatusItem] }>()

const opcoes = computed(() => Object.entries(props.rotulos) as Array<[StatusItem, string]>)
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="outline" size="sm">
        {{ props.rotulos[props.status] }}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      <DropdownMenuItem
        v-for="[valor, rotulo] in opcoes"
        :key="valor"
        class="gap-2"
        @select="emit('update:status', valor)"
      >
        <span class="flex-1">{{ rotulo }}</span>
        <CheckIcon v-if="valor === props.status" class="size-4 text-primary" />
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
