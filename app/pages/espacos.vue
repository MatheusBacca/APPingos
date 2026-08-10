<script setup lang="ts">
import { mensagemDeErro } from '@/lib/utils'
import { CheckIcon, ChevronsUpDownIcon, CopyIcon, HeartIcon, LinkIcon, SmileIcon, TriangleAlertIcon, UserIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { APELIDO_MAX, APELIDO_MIN, PAPEL_ROTULO } from '~/types/database.types'
import { useCriarEspaco, useDeletarEspaco, useCriarConvite, useResgatarConvite } from '~/composables/useEspacos'
import { useMembros, useDefinirPapel } from '~/composables/useMembros'
import { usePerfil, useDefinirApelido } from '~/composables/usePerfil'
import { useSpaceQuery } from '~/composables/useSpaceQuery'
import { useSpaceStore } from '~/stores/space'

useHead({ title: 'Espaços · APPingos' })

const supabase = useSupabaseClient()
const store = useSpaceStore()

const criarEspaco = useCriarEspaco()
const criarConvite = useCriarConvite()
const resgatarConvite = useResgatarConvite()
const deletarEspaco = useDeletarEspaco()
const definirPapel = useDefinirPapel()

// Vem de useMembros() e não de uma query local: as duas usariam a chave de
// cache ['membros'] com formatos diferentes, e quem carregasse primeiro
// entregava o objeto errado para a outra tela — era por isso que o nome de quem
// avaliou aparecia como "Alguém" no card do filme.
const membros = useMembros()

// ---- Apelido ---------------------------------------------------------------

const perfil = usePerfil()
const definirApelido = useDefinirApelido()

const apelido = ref('')

// Só sincroniza quando o perfil chega (ou muda no servidor). Um `watch` no
// valor cru sobrescreveria o que a pessoa está digitando a cada refetch.
watch(() => perfil.data.value?.apelido, (valor) => {
  apelido.value = valor ?? ''
}, { immediate: true })

const apelidoLimpo = computed(() => apelido.value.trim())

const apelidoMudou = computed(() =>
  apelidoLimpo.value !== (perfil.data.value?.apelido ?? ''),
)

// Vazio é válido: é assim que se remove o apelido e volta a valer o nome.
const apelidoValido = computed(() =>
  apelidoLimpo.value === '' || apelidoLimpo.value.length >= APELIDO_MIN,
)

async function onSalvarApelido() {
  if (!apelidoMudou.value || !apelidoValido.value) return
  const novo = apelidoLimpo.value || null
  try {
    await definirApelido.mutateAsync(novo)
    toast.success(novo ? `Agora o app te chama de ${novo}.` : 'Apelido removido.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para salvar o apelido.'))
  }
}

const nomeNovoEspaco = ref('')
const codigoGerado = ref<string | null>(null)
const codigoDigitado = ref('')
const copiado = ref(false)
const linkCopiado = ref(false)

const linkConvite = computed(() =>
  codigoGerado.value && import.meta.client
    ? `${location.origin}/convite/${codigoGerado.value}`
    : null,
)

async function onCriarEspaco() {
  const nome = nomeNovoEspaco.value.trim()
  if (!nome) return
  try {
    await criarEspaco.mutateAsync({ nome, tipo: 'casal' })
    nomeNovoEspaco.value = ''
    toast.success(`Espaço "${nome}" criado.`)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para criar o espaço.'))
  }
}

async function onGerarConvite() {
  if (!store.espacoAtivoId) return
  try {
    codigoGerado.value = await criarConvite.mutateAsync(store.espacoAtivoId)
    copiado.value = false
    linkCopiado.value = false
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para gerar o convite.'))
  }
}

async function copiarCodigo() {
  if (!codigoGerado.value) return
  await navigator.clipboard.writeText(codigoGerado.value)
  copiado.value = true
  toast.success('Código copiado.')
}

async function copiarLink() {
  if (!linkConvite.value) return
  await navigator.clipboard.writeText(linkConvite.value)
  linkCopiado.value = true
  toast.success('Link copiado.')
}

// ---- Cargos (só o dono muda) -----------------------------------------------

const souDono = computed(() => store.espacoAtivo?.papel === 'dono')

const PAPEL_DESCRICAO: Record<'admin' | 'membro', string> = {
  admin: 'Pode marcar quem assistiu junto, no lugar da pessoa.',
  membro: 'Só mexe nos próprios registros.',
}

async function onDefinirPapel(userId: string, papel: 'admin' | 'membro') {
  try {
    await definirPapel.mutateAsync({ userId, papel })
    toast.success(`Cargo alterado para ${PAPEL_ROTULO[papel]}.`)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para mudar o cargo.'))
  }
}

// ---- Exclusão do espaço (só o dono) ----------------------------------------

const podeExcluir = computed(() =>
  store.espacoAtivo?.tipo === 'casal' && store.espacoAtivo.papel === 'dono',
)

// Quantos itens vão junto — o número é o que dá peso ao aviso.
const totalItens = useSpaceQuery(['total-itens'], async (spaceId) => {
  const { count, error } = await supabase
    .from('entry')
    .select('id', { count: 'exact', head: true })
    .eq('space_id', spaceId)

  if (error) throw error
  return count ?? 0
}, { enabled: podeExcluir })

const dialogExcluir = ref(false)
const nomeConfirmacao = ref('')

const confirmacaoOk = computed(() =>
  nomeConfirmacao.value.trim() === store.espacoAtivo?.nome,
)

watch(dialogExcluir, () => { nomeConfirmacao.value = '' })

async function onExcluir() {
  const espaco = store.espacoAtivo
  if (!espaco || !confirmacaoOk.value) return
  try {
    await deletarEspaco.mutateAsync(espaco.id)
    dialogExcluir.value = false
    toast.success(`Espaço "${espaco.nome}" excluído.`)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para excluir o espaço.'))
  }
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
    toast.error(mensagemDeErro(e, 'Código inválido.'))
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
                {{ membro.exibicao.charAt(0).toUpperCase() }}
              </span>
              <!--
                O nome de cadastro aparece ao lado do apelido, e só aqui: esta é
                a tela de quem é quem no espaço, e "Bebê" sozinho não responde
                isso para quem acabou de entrar por convite.
              -->
              <span class="min-w-0 flex-1 truncate">
                {{ membro.exibicao }}
                <span v-if="membro.apelido" class="text-muted-foreground">· {{ membro.nome }}</span>
              </span>

              <!-- O dono não muda de cargo por aqui: transferir posse é outra história. -->
              <span v-if="!souDono || membro.papel === 'dono'" class="text-xs text-muted-foreground">
                {{ PAPEL_ROTULO[membro.papel] }}
              </span>

              <DropdownMenu v-else>
                <DropdownMenuTrigger as-child>
                  <button
                    type="button"
                    class="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    :disabled="definirPapel.isPending.value"
                    :aria-label="`Cargo de ${membro.exibicao}`"
                  >
                    {{ PAPEL_ROTULO[membro.papel] }}
                    <ChevronsUpDownIcon class="size-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="w-52">
                  <DropdownMenuItem
                    v-for="papel in (['admin', 'membro'] as const)"
                    :key="papel"
                    class="flex-col items-start gap-0"
                    :disabled="membro.papel === papel"
                    @select="onDefinirPapel(membro.user_id, papel)"
                  >
                    <span class="font-medium">{{ PAPEL_ROTULO[papel] }}</span>
                    <span class="text-xs text-muted-foreground">{{ PAPEL_DESCRICAO[papel] }}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          </ul>
          <Skeleton v-else-if="membros.isPending.value" class="h-7 w-full" />
        </div>

        <template v-if="store.espacoAtivo?.tipo === 'casal'">
          <Separator />
          <div>
            <h3 class="text-sm font-medium">Convidar</h3>
            <p class="mt-1 text-sm text-muted-foreground">
              Gere um link e mande para a outra pessoa — vale por 7 dias e um uso só. Quem
              abrir e ainda não tiver conta, cria uma e já entra direto neste espaço.
            </p>

            <div v-if="linkConvite" class="mt-3 space-y-2">
              <div class="flex items-center gap-2">
                <code class="flex-1 truncate rounded-lg border bg-muted px-3 py-2 text-sm">
                  {{ linkConvite }}
                </code>
                <Button variant="outline" size="icon" aria-label="Copiar link" @click="copiarLink">
                  <CheckIcon v-if="linkCopiado" class="size-4 text-primary" />
                  <LinkIcon v-else class="size-4" />
                </Button>
              </div>

              <details class="text-sm text-muted-foreground">
                <summary class="cursor-pointer select-none">Prefiro passar um código</summary>
                <div class="mt-2 flex items-center gap-2">
                  <code class="flex-1 rounded-lg border bg-muted px-3 py-2 text-center font-semibold tracking-[0.3em]">
                    {{ codigoGerado }}
                  </code>
                  <Button variant="outline" size="icon" aria-label="Copiar código" @click="copiarCodigo">
                    <CheckIcon v-if="copiado" class="size-4 text-primary" />
                    <CopyIcon v-else class="size-4" />
                  </Button>
                </div>
              </details>
            </div>

            <Button
              v-else
              variant="outline"
              class="mt-3"
              :disabled="criarConvite.isPending.value"
              @click="onGerarConvite"
            >
              {{ criarConvite.isPending.value ? 'Gerando…' : 'Gerar convite' }}
            </Button>
          </div>
        </template>

        <template v-if="podeExcluir">
          <Separator />
          <div>
            <h3 class="flex items-center gap-2 text-sm font-medium text-destructive">
              <TriangleAlertIcon class="size-4" />
              Excluir espaço
            </h3>
            <p class="mt-1 text-sm text-muted-foreground">
              Apaga o espaço para todo mundo, com tudo que está dentro. Não dá para desfazer.
            </p>
            <Button variant="destructive" class="mt-3" @click="dialogExcluir = true">
              Excluir "{{ store.espacoAtivo?.nome }}"
            </Button>
          </div>
        </template>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <SmileIcon class="size-4 text-muted-foreground" />
          Seu apelido
        </CardTitle>
        <CardDescription>
          Como o app chama você. Vale em todos os seus espaços, e quem divide um espaço com
          você vê o apelido no lugar do seu nome.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form class="flex flex-col gap-3 sm:flex-row sm:items-start" @submit.prevent="onSalvarApelido">
          <div class="flex-1 space-y-2">
            <Label for="apelido" class="sr-only">Apelido</Label>
            <Input
              id="apelido"
              v-model="apelido"
              :maxlength="APELIDO_MAX"
              autocomplete="nickname"
              :placeholder="perfil.data.value?.nome ?? 'Seu apelido'"
              :disabled="perfil.isPending.value"
            />
            <p class="text-xs text-muted-foreground">
              <template v-if="apelidoLimpo && !apelidoValido">
                Curto demais — precisa de pelo menos {{ APELIDO_MIN }} letras.
              </template>
              <template v-else-if="!apelidoLimpo">
                Sem apelido, o app usa
                <strong class="text-foreground">{{ perfil.data.value?.nome ?? 'seu nome' }}</strong>.
              </template>
              <template v-else>
                Apague o campo e salve para voltar a usar seu nome.
              </template>
            </p>
          </div>

          <Button
            type="submit"
            variant="secondary"
            :disabled="!apelidoMudou || !apelidoValido || definirApelido.isPending.value"
          >
            {{ definirApelido.isPending.value ? 'Salvando…' : 'Salvar' }}
          </Button>
        </form>
      </CardContent>
    </Card>

    <Dialog v-model:open="dialogExcluir">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir "{{ store.espacoAtivo?.nome }}"?</DialogTitle>
          <DialogDescription>
            Isso apaga o espaço para todos os membros, e não tem como voltar atrás.
          </DialogDescription>
        </DialogHeader>

        <ul class="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <li>
            <strong>{{ totalItens.data.value ?? '…' }}</strong> item(ns) do catálogo, com as notas
            e resenhas dos dois
          </li>
          <li>
            <strong>{{ membros.data.value?.length ?? '…' }}</strong> membro(s) perdem o acesso e
            recebem um aviso de que você excluiu o espaço
          </li>
        </ul>

        <div class="space-y-2">
          <Label for="confirmar-nome">
            Digite <strong>{{ store.espacoAtivo?.nome }}</strong> para confirmar
          </Label>
          <Input
            id="confirmar-nome"
            v-model="nomeConfirmacao"
            autocomplete="off"
            :placeholder="store.espacoAtivo?.nome"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" @click="dialogExcluir = false">Cancelar</Button>
          <Button
            variant="destructive"
            :disabled="!confirmacaoOk || deletarEspaco.isPending.value"
            @click="onExcluir"
          >
            {{ deletarEspaco.isPending.value ? 'Excluindo…' : 'Excluir definitivamente' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

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
