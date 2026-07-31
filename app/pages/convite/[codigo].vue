<script setup lang="ts">
import { HeartIcon, Loader2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// Excluída do redirect de auth em nuxt.config.ts (supabase.redirectOptions.exclude)
// — precisa ser vista tanto por quem já tem conta quanto por quem não tem.
definePageMeta({ layout: 'auth' })
useHead({ title: 'Convite · APPingos' })

const route = useRoute()
const router = useRouter()
const user = useSupabaseUser()
const { salvar, resolverSeHouver } = useConvitePendente()

const codigo = String(route.params.codigo ?? '').toUpperCase()

type Estado = 'checando' | 'resgatando' | 'escolhaAuth' | 'erro'
const estado = ref<Estado>('checando')
const erro = ref<string | null>(null)

onMounted(async () => {
  if (!codigo) {
    estado.value = 'erro'
    erro.value = 'Link de convite inválido.'
    return
  }

  if (user.value) {
    // Já logado: resgata na hora, sem passar por login/cadastro.
    estado.value = 'resgatando'
    salvar(codigo) // resolverSeHouver lê daqui — evita duplicar a chamada da RPC
    await resolverSeHouver()
    await router.replace('/')
    return
  }

  // Sem sessão: guarda o código para o login/cadastro resolver depois,
  // e mostra a escolha entre criar conta ou entrar.
  salvar(codigo)
  estado.value = 'escolhaAuth'
})
</script>

<template>
  <Card>
    <CardHeader v-if="estado !== 'erro'">
      <CardTitle class="flex items-center gap-2">
        <HeartIcon class="size-5 text-primary" />
        Convite para um espaço
      </CardTitle>
      <CardDescription>
        Alguém te convidou para compartilhar dados no APPingos.
      </CardDescription>
    </CardHeader>

    <CardContent>
      <div v-if="estado === 'checando' || estado === 'resgatando'" class="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2Icon class="size-4 animate-spin" />
        {{ estado === 'resgatando' ? 'Entrando no espaço…' : 'Verificando o convite…' }}
      </div>

      <div v-else-if="estado === 'escolhaAuth'" class="space-y-3">
        <p class="text-sm text-muted-foreground">
          Crie uma conta ou entre na sua para aceitar o convite.
        </p>
        <Button class="w-full" as-child>
          <NuxtLink to="/cadastro">Criar conta</NuxtLink>
        </Button>
        <Button variant="outline" class="w-full" as-child>
          <NuxtLink to="/login">Já tenho conta — entrar</NuxtLink>
        </Button>
      </div>

      <div v-else class="space-y-3">
        <p class="text-sm text-destructive">{{ erro }}</p>
        <Button variant="outline" class="w-full" as-child>
          <NuxtLink to="/login">Ir para o login</NuxtLink>
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
