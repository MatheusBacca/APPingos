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

const props = defineProps<{ status: StatusItem }>()
const emit = defineEmits<{ 'update:status': [valor: StatusItem] }>()

const opcoes = Object.entries(STATUS_ROTULO) as Array<[StatusItem, string]>
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="outline" size="sm">
        {{ STATUS_ROTULO[props.status] }}
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
