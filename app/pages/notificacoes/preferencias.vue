<script setup lang="ts">
import { mensagemDeErro } from '@/lib/utils'
import { BellIcon, CheckIcon, MailIcon, TriangleAlertIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import type { CategoriaComEstado, EstadoDoInterruptor } from '~/lib/notificacoes'
import { categoriasDePreferencia } from '~/lib/notificacoes'
import {
  usePreferenciasNotificacao,
  useDefinirPreferencia,
  useDefinirEmail,
} from '~/composables/useNotificacoes'

useHead({ title: 'Preferências de notificação · APPingos' })

const { data: estado, isPending, isError, error } = usePreferenciasNotificacao()
const definirPreferencia = useDefinirPreferencia()
const definirEmail = useDefinirEmail()

const categorias = computed(() => categoriasDePreferencia(estado.value?.preferencias ?? []))

const emailLigado = computed(() => estado.value?.email.ativo ?? false)

// ---- Endereço ---------------------------------------------------------------

const endereco = ref('')

// Só sincroniza quando o servidor responde, para não sobrescrever o que a pessoa
// está digitando a cada refetch — mesmo cuidado do apelido em /espacos.
watch(() => estado.value?.email.endereco, (valor) => {
  endereco.value = valor ?? ''
}, { immediate: true })

const enderecoLimpo = computed(() => endereco.value.trim().toLowerCase())

// Vazio é válido: é assim que se volta a usar o e-mail da conta.
const enderecoValido = computed(
  () => enderecoLimpo.value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enderecoLimpo.value),
)

const enderecoMudou = computed(
  () => enderecoLimpo.value !== (estado.value?.email.endereco ?? ''),
)

// ---- Ações ------------------------------------------------------------------

async function alternarEmailMestre() {
  const ligar = !emailLigado.value
  try {
    await definirEmail.mutateAsync({ ativo: ligar, endereco: enderecoLimpo.value || null })
    toast.success(ligar
      ? 'Pronto — os avisos também vão para o seu e-mail.'
      : 'Nenhum e-mail a mais. A caixa do app continua.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para mudar o envio por e-mail.'))
  }
}

async function salvarEndereco() {
  if (!enderecoMudou.value || !enderecoValido.value) return
  try {
    await definirEmail.mutateAsync({
      ativo: emailLigado.value,
      endereco: enderecoLimpo.value || null,
    })
    toast.success(enderecoLimpo.value
      ? `Os avisos vão para ${enderecoLimpo.value}.`
      : 'Voltamos a usar o e-mail da sua conta.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para salvar o endereço.'))
  }
}

async function alternar(cat: CategoriaComEstado, canal: 'app' | 'email') {
  // "Parcial" só existe quando alguém mexeu por SQL. Um clique nele liga tudo:
  // é a leitura mais provável de quem apertou, e mantém o botão previsível.
  const ligar = cat[canal] !== 'ligado'
  try {
    await definirPreferencia.mutateAsync(
      canal === 'app' ? { tipos: cat.tipos, ativo: ligar } : { tipos: cat.tipos, email: ligar },
    )
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para salvar a preferência.'))
  }
}

function classeDoBotao(situacao: EstadoDoInterruptor): string {
  if (situacao === 'ligado') return 'border-primary bg-primary/10 text-foreground'
  if (situacao === 'parcial') return 'border-dashed text-muted-foreground'
  return 'text-muted-foreground'
}
</script>

<template>
  <div class="space-y-6">
    <header class="space-y-1">
      <BotaoVoltar para="/notificacoes" rotulo="Notificações" />
      <h1 class="text-2xl font-semibold tracking-tight">Preferências de notificação</h1>
      <p class="text-sm text-muted-foreground">
        Duas colunas, e elas são independentes: o que aparece no app e o que sai por e-mail.
      </p>
    </header>

    <div v-if="isError" class="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p class="font-medium text-destructive">Não consegui carregar as suas preferências.</p>
      <p class="mt-1 text-muted-foreground">{{ error?.message }}</p>
    </div>

    <template v-else-if="isPending">
      <Skeleton class="h-40 w-full" />
      <Skeleton class="h-64 w-full" />
    </template>

    <template v-else>
      <!--
        O interruptor mestre do e-mail. Ele nasce DESLIGADO, e isso é decisão de
        produto, não esquecimento: uma linha na caixa do próprio app é coisa de
        quem já entrou; um e-mail chega na caixa de entrada de alguém.
      -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2 text-base">
            <MailIcon class="size-4" />
            Receber por e-mail
          </CardTitle>
          <CardDescription>
            O caminho que funciona igual no Android e no iPhone, com o app fechado e sem
            depender de permissão de notificação do sistema. Cada aviso vira um e-mail na
            hora em que acontece.
          </CardDescription>
        </CardHeader>

        <CardContent class="space-y-4">
          <Button
            :variant="emailLigado ? 'default' : 'outline'"
            class="gap-2"
            :disabled="definirEmail.isPending.value"
            @click="alternarEmailMestre"
          >
            <CheckIcon v-if="emailLigado" class="size-4" />
            {{ emailLigado ? 'E-mail ligado' : 'Ligar o e-mail' }}
          </Button>

          <div v-if="emailLigado" class="space-y-2">
            <Label for="endereco">Endereço</Label>
            <div class="flex flex-wrap items-center gap-2">
              <Input
                id="endereco"
                v-model="endereco"
                type="email"
                inputmode="email"
                autocomplete="email"
                placeholder="o e-mail da sua conta"
                class="max-w-xs"
                :aria-invalid="!enderecoValido"
                @keydown.enter="salvarEndereco"
              />
              <Button
                variant="outline"
                :disabled="!enderecoMudou || !enderecoValido || definirEmail.isPending.value"
                @click="salvarEndereco"
              >
                Salvar
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">
              Vazio = o e-mail com que você entra no app. Todo aviso enviado traz um link de
              descadastro que funciona sem login.
            </p>
          </div>

          <p
            v-if="estado?.falhas"
            class="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
          >
            <TriangleAlertIcon class="mt-0.5 size-4 shrink-0 text-amber-600" />
            <span>
              {{ estado.falhas }} e-mail(s) não saíram. Costuma ser endereço com erro de
              digitação ou o remetente ainda sem domínio verificado.
            </span>
          </p>
        </CardContent>
      </Card>

      <!--
        Os ~11 tipos do banco em 5 interruptores: uma caixa com onze chaves é uma
        caixa que ninguém configura. O agrupamento vive em `notificacoes.ts`.
      -->
      <Card>
        <CardHeader>
          <CardTitle class="text-base">O que avisar</CardTitle>
          <CardDescription>
            Desligar aqui não esconde o aviso depois: ele deixa de ser criado.
          </CardDescription>
        </CardHeader>

        <CardContent class="divide-y p-0">
          <div
            v-for="cat in categorias"
            :key="cat.categoria"
            class="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
          >
            <div class="min-w-0 flex-1">
              <p class="font-medium">{{ cat.rotulo }}</p>
              <p class="text-sm text-muted-foreground">{{ cat.descricao }}</p>
            </div>

            <div class="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                class="gap-1.5"
                :class="classeDoBotao(cat.app)"
                :aria-pressed="cat.app === 'ligado'"
                :disabled="definirPreferencia.isPending.value"
                @click="alternar(cat, 'app')"
              >
                <BellIcon class="size-3.5" />
                No app
              </Button>

              <Button
                variant="outline"
                size="sm"
                class="gap-1.5"
                :class="classeDoBotao(cat.email)"
                :aria-pressed="cat.email === 'ligado'"
                :disabled="!emailLigado || definirPreferencia.isPending.value"
                :title="emailLigado ? undefined : 'Ligue o e-mail acima primeiro'"
                @click="alternar(cat, 'email')"
              >
                <MailIcon class="size-3.5" />
                E-mail
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
