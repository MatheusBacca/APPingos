<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Entrar · APPingos' })

const { entrar } = useAuth()

const email = ref('')
const senha = ref('')
const enviando = ref(false)
const erro = ref<string | null>(null)

async function onSubmit() {
  erro.value = null
  enviando.value = true
  try {
    await entrar(email.value.trim(), senha.value)
  }
  catch (e) {
    erro.value = e instanceof Error ? e.message : 'Não foi possível entrar.'
  }
  finally {
    enviando.value = false
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Entrar</CardTitle>
      <CardDescription>Bem-vindo de volta.</CardDescription>
    </CardHeader>
    <CardContent>
      <form class="space-y-4" @submit.prevent="onSubmit">
        <div class="space-y-2">
          <Label for="email">E-mail</Label>
          <Input id="email" v-model="email" type="email" autocomplete="email" required />
        </div>

        <div class="space-y-2">
          <Label for="senha">Senha</Label>
          <Input id="senha" v-model="senha" type="password" autocomplete="current-password" required />
        </div>

        <p v-if="erro" class="text-sm text-destructive">
          {{ erro }}
        </p>

        <Button type="submit" class="w-full" :disabled="enviando">
          {{ enviando ? 'Entrando…' : 'Entrar' }}
        </Button>
      </form>

      <p class="mt-6 text-center text-sm text-muted-foreground">
        Ainda não tem conta?
        <NuxtLink to="/cadastro" class="font-medium text-primary hover:underline">
          Criar conta
        </NuxtLink>
      </p>
    </CardContent>
  </Card>
</template>
