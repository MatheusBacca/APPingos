<script setup lang="ts">
import { useColorMode } from '@vueuse/core'
import { MoonIcon, SunIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const mode = useColorMode({ storageKey: 'appingos:tema' })

function alternar() {
  mode.value = mode.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <Button variant="ghost" size="icon" :aria-label="`Mudar para tema ${mode === 'dark' ? 'claro' : 'escuro'}`" @click="alternar">
    <SunIcon v-if="mode === 'dark'" class="size-4" />
    <MoonIcon v-else class="size-4" />
  </Button>
</template>
