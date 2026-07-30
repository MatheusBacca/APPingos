<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Criar conta · APPingos' })

const { cadastrar } = useAuth()
const router = useRouter()

const nome = ref('')
const email = ref('')
const senha = ref('')
const enviando = ref(false)
const erro = ref<string | null>(null)
const aguardandoConfirmacao = ref(false)

async function onSubmit() {
  erro.value = null
  enviando.value = true
  try {
    const { precisaConfirmar } = await cadastrar(nome.value.trim(), email.value.trim(), senha.value)
    if (precisaConfirmar) aguardandoConfirmacao.value = true
    else await router.push('/')
  }
  catch (e) {
    erro.value = e instanceof Error ? e.message : 'Não foi possível criar a conta.'
  }
  finally {
    enviando.value = false
  }
}
</script>

<template>
  <Card>
    <template v-if="aguardandoConfirmacao">
      <CardHeader>
        <CardTitle>Confirme o seu e-mail</CardTitle>
        <CardDescription>
          Mandamos um link para <strong>{{ email }}</strong>. Abra-o para ativar a conta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" class="w-full" as-child>
          <NuxtLink to="/login">Voltar para o login</NuxtLink>
        </Button>
      </CardContent>
    </template>

    <template v-else>
      <CardHeader>
        <CardTitle>Criar conta</CardTitle>
        <CardDescription>Seu espaço pessoal é criado junto.</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="onSubmit">
          <div class="space-y-2">
            <Label for="nome">Nome</Label>
            <Input id="nome" v-model="nome" autocomplete="name" required />
          </div>

          <div class="space-y-2">
            <Label for="email">E-mail</Label>
            <Input id="email" v-model="email" type="email" autocomplete="email" required />
          </div>

          <div class="space-y-2">
            <Label for="senha">Senha</Label>
            <Input
              id="senha"
              v-model="senha"
              type="password"
              autocomplete="new-password"
              minlength="8"
              required
            />
            <p class="text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>
          </div>

          <p v-if="erro" class="text-sm text-destructive">
            {{ erro }}
          </p>

          <Button type="submit" class="w-full" :disabled="enviando">
            {{ enviando ? 'Criando…' : 'Criar conta' }}
          </Button>
        </form>

        <p class="mt-6 text-center text-sm text-muted-foreground">
          Já tem conta?
          <NuxtLink to="/login" class="font-medium text-primary hover:underline">
            Entrar
          </NuxtLink>
        </p>
      </CardContent>
    </template>
  </Card>
</template>
