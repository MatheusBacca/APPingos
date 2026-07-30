<script setup lang="ts">
import { CheckIcon, CopyIcon, HeartIcon, UserIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

useHead({ title: 'Espaços · APPingos' })

const supabase = useSupabaseClient()
const store = useSpaceStore()

const criarEspaco = useCriarEspaco()
const criarConvite = useCriarConvite()
const resgatarConvite = useResgatarConvite()

// Membros do espaço ativo. A policy de membership devolve todo mundo do espaço,
// então aqui não filtramos por usuário.
const membros = useSpaceQuery(['membros'], async (spaceId) => {
  const { data, error } = await supabase
    .from('membership')
    .select('user_id, papel, profile:profile(nome, avatar_url)')
    .eq('space_id', spaceId)

  if (error) throw error
  return data as unknown as Array<{
    user_id: string
    papel: string
    profile: { nome: string, avatar_url: string | null } | null
  }>
})

const nomeNovoEspaco = ref('')
const codigoGerado = ref<string | null>(null)
const codigoDigitado = ref('')
const copiado = ref(false)

async function onCriarEspaco() {
  const nome = nomeNovoEspaco.value.trim()
  if (!nome) return
  try {
    await criarEspaco.mutateAsync({ nome, tipo: 'casal' })
    nomeNovoEspaco.value = ''
    toast.success(`Espaço "${nome}" criado.`)
  }
  catch (e) {
    toast.error(e instanceof Error ? e.message : 'Não deu para criar o espaço.')
  }
}

async function onGerarConvite() {
  if (!store.espacoAtivoId) return
  try {
    codigoGerado.value = await criarConvite.mutateAsync(store.espacoAtivoId)
    copiado.value = false
  }
  catch (e) {
    toast.error(e instanceof Error ? e.message : 'Não deu para gerar o convite.')
  }
}

async function copiarCodigo() {
  if (!codigoGerado.value) return
  await navigator.clipboard.writeText(codigoGerado.value)
  copiado.value = true
  toast.success('Código copiado.')
}

async function onResgatar() {
  const codigo = codigoDigitado.value.trim()
  if (!codigo) return
  try {
    await resgatarConvite.mutateAsync(codigo)
    codigoDigitado.value = ''
    toast.success('Pronto — você entrou no espaço.')
  }
  catch (e) {
    toast.error(e instanceof Error ? e.message : 'Código inválido.')
  }
}
</script>

<template>
  <div class="space-y-6">
    <header>
      <h1 class="text-2xl font-semibold tracking-tight">Espaços</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        Um espaço decide de quem são os dados. O pessoal é só seu; o de casal, dos dois.
      </p>
    </header>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <component
            :is="store.espacoAtivo?.tipo === 'casal' ? HeartIcon : UserIcon"
            class="size-4 text-muted-foreground"
          />
          {{ store.espacoAtivo?.nome }}
        </CardTitle>
        <CardDescription>
          {{ store.espacoAtivo?.tipo === 'casal' ? 'Espaço compartilhado' : 'Espaço pessoal' }}
        </CardDescription>
      </CardHeader>

      <CardContent class="space-y-4">
        <div>
          <h3 class="mb-2 text-sm font-medium">Membros</h3>
          <ul v-if="membros.data.value?.length" class="space-y-2">
            <li
              v-for="membro in membros.data.value"
              :key="membro.user_id"
              class="flex items-center gap-2 text-sm"
            >
              <span class="grid size-7 place-items-center rounded-full bg-muted text-xs font-medium">
                {{ (membro.profile?.nome ?? '?').charAt(0).toUpperCase() }}
              </span>
              <span class="flex-1">{{ membro.profile?.nome ?? 'Sem nome' }}</span>
              <span class="text-xs text-muted-foreground">{{ membro.papel }}</span>
            </li>
          </ul>
          <Skeleton v-else-if="membros.isPending.value" class="h-7 w-full" />
        </div>

        <template v-if="store.espacoAtivo?.tipo === 'casal'">
          <Separator />
          <div>
            <h3 class="text-sm font-medium">Convidar</h3>
            <p class="mt-1 text-sm text-muted-foreground">
              Gere um código e passe para a outra pessoa. Vale por 7 dias e um uso só.
            </p>

            <div v-if="codigoGerado" class="mt-3 flex items-center gap-2">
              <code class="flex-1 rounded-lg border bg-muted px-3 py-2 text-center text-lg font-semibold tracking-[0.3em]">
                {{ codigoGerado }}
              </code>
              <Button variant="outline" size="icon" aria-label="Copiar código" @click="copiarCodigo">
                <CheckIcon v-if="copiado" class="size-4 text-primary" />
                <CopyIcon v-else class="size-4" />
              </Button>
            </div>

            <Button
              v-else
              variant="outline"
              class="mt-3"
              :disabled="criarConvite.isPending.value"
              @click="onGerarConvite"
            >
              {{ criarConvite.isPending.value ? 'Gerando…' : 'Gerar código de convite' }}
            </Button>
          </div>
        </template>
      </CardContent>
    </Card>

    <div class="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle class="text-base">Criar espaço de casal</CardTitle>
          <CardDescription>Depois convide a outra pessoa por código.</CardDescription>
        </CardHeader>
        <CardContent>
          <form class="space-y-3" @submit.prevent="onCriarEspaco">
            <div class="space-y-2">
              <Label for="nome-espaco">Nome</Label>
              <Input id="nome-espaco" v-model="nomeNovoEspaco" placeholder="Nós dois" required />
            </div>
            <Button type="submit" class="w-full" :disabled="criarEspaco.isPending.value">
              {{ criarEspaco.isPending.value ? 'Criando…' : 'Criar' }}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">Tenho um código</CardTitle>
          <CardDescription>Entre no espaço de alguém que te convidou.</CardDescription>
        </CardHeader>
        <CardContent>
          <form class="space-y-3" @submit.prevent="onResgatar">
            <div class="space-y-2">
              <Label for="codigo">Código</Label>
              <Input
                id="codigo"
                v-model="codigoDigitado"
                class="text-center text-lg tracking-[0.3em] uppercase"
                maxlength="6"
                placeholder="ABC123"
                required
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              class="w-full"
              :disabled="resgatarConvite.isPending.value"
            >
              {{ resgatarConvite.isPending.value ? 'Entrando…' : 'Entrar no espaço' }}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
