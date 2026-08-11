<script setup lang="ts">
import { CheckCircle2Icon, Loader2Icon, TriangleAlertIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * O rodapé de todo e-mail leva para cá.
 *
 * Excluída do redirect de auth em nuxt.config.ts: quem clica está na caixa de
 * entrada, provavelmente no celular, provavelmente sem sessão aberta. Exigir
 * login para parar de receber e-mail é o que faz gente marcar como spam em vez
 * de descadastrar — e aí o domínio inteiro passa a entregar pior.
 *
 * O token na URL é a credencial, e a RPC `descadastrar_email` só sabe desligar:
 * não lê, não lista, não devolve endereço nenhum, e responde igual para token
 * inválido — para não virar um oráculo de "este token existe".
 */
definePageMeta({ layout: 'auth' })
useHead({ title: 'Parar de receber e-mails · APPingos' })

const supabase = useSupabaseClient()
const route = useRoute()

const token = computed(() => String(route.query.token ?? '').trim())

type Estado = 'confirmar' | 'enviando' | 'pronto' | 'semToken'
const estado = ref<Estado>(token.value ? 'confirmar' : 'semToken')
const erro = ref<string | null>(null)

/*
 * Um clique, e não descadastro automático ao abrir: pré-visualizador de e-mail e
 * varredor de links de segurança abrem URLs sozinhos, e um GET que já desliga
 * tudo faria a pessoa parar de receber sem nunca ter pedido.
 */
async function confirmar() {
  estado.value = 'enviando'
  erro.value = null

  const { error } = await supabase.rpc('descadastrar_email', { p_token: token.value })

  if (error) {
    erro.value = error.message
    estado.value = 'confirmar'
    return
  }

  estado.value = 'pronto'
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Parar de receber e-mails</CardTitle>
      <CardDescription v-if="estado !== 'pronto'">
        As notificações continuam aparecendo dentro do APPingos — só param de chegar na sua
        caixa de entrada.
      </CardDescription>
    </CardHeader>

    <CardContent class="space-y-4">
      <p v-if="estado === 'semToken'" class="flex items-start gap-2 text-sm text-muted-foreground">
        <TriangleAlertIcon class="mt-0.5 size-4 shrink-0" />
        Este link está incompleto. Abra o app e desligue o e-mail em
        Notificações › Preferências.
      </p>

      <template v-else-if="estado === 'pronto'">
        <p class="flex items-start gap-2 text-sm">
          <CheckCircle2Icon class="mt-0.5 size-4 shrink-0 text-emerald-600" />
          Pronto. Não mandamos mais e-mails para você.
        </p>
        <Button variant="outline" class="w-full" as-child>
          <NuxtLink to="/notificacoes/preferencias">Escolher só alguns tipos</NuxtLink>
        </Button>
      </template>

      <template v-else>
        <Button class="w-full gap-2" :disabled="estado === 'enviando'" @click="confirmar">
          <Loader2Icon v-if="estado === 'enviando'" class="size-4 animate-spin" />
          Confirmar
        </Button>
        <p v-if="erro" class="text-sm text-destructive">{{ erro }}</p>
      </template>
    </CardContent>
  </Card>
</template>
