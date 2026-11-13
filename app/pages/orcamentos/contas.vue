<script setup lang="ts">
/**
 * Contas conectadas — Open Finance pela Pluggy (fase 3 do plano).
 *
 * Tudo aqui é da PESSOA logada: a RLS de `conexao_bancaria` e `conta_bancaria`
 * devolve só as suas, e a outra pessoa do espaço nunca vê esta tela com os seus
 * bancos. O que ela vê são as compras que nascerem daqui.
 *
 * O ponto da tela, além de conectar, é DESIGNAR cada cartão: "do casal" faz as
 * compras dele entrarem no espaço do casal com 50% para cada um (decisão nº 3 de
 * 12/11/2026); "perguntar" manda cada uma para a caixa de entrada.
 */
import { toast } from 'vue-sonner'
import { BanknoteIcon, CreditCardIcon, LandmarkIcon, PlugZapIcon, RefreshCwIcon, UnplugIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatarDia, hojeIso } from '@/lib/datas'
import { mensagemDeErro } from '@/lib/utils'
import {
  ROTULO_DESTINO,
  designacaoAoMarcar,
  designacaoParaEspaco,
  designacaoPrivada,
  estaCompartilhada,
  situacaoDaConexao,
} from '~/lib/contas-bancarias'
import type { Designacao, ModoPrivado } from '~/lib/contas-bancarias'
import { dataLocal } from '~/lib/importacao-bancaria'
import {
  abrirWidgetPluggy,
  useConexoesBancarias,
  useDesconectarBanco,
  useDesignarConta,
  usePluggyConfigurada,
  useRegistrarConexao,
} from '~/composables/useContasBancarias'
import type { ConexaoBancaria, ContaBancaria } from '~/composables/useContasBancarias'
import { useSpaceStore } from '~/stores/space'

useHead({ title: 'Contas conectadas · APPingos' })

const { data: conexoes, isPending } = useConexoesBancarias()
const { data: configurada } = usePluggyConfigurada()
const designar = useDesignarConta()
const desconectar = useDesconectarBanco()
const registrar = useRegistrarConexao()
const store = useSpaceStore()

const hoje = hojeIso()
const espacosDeCasal = computed(() => store.espacos.filter(e => e.tipo === 'casal'))

const conectando = ref(false)

async function conectar(itemId?: string) {
  conectando.value = true
  try {
    const novo = await abrirWidgetPluggy(itemId)
    if (!novo) return
    const { contas } = await registrar.mutateAsync(novo)
    toast.success(contas
      ? `Banco conectado — ${contas === 1 ? '1 conta' : `${contas} contas`}. O extrato chega na próxima sincronização.`
      : 'Banco conectado. As contas aparecem assim que a Pluggy terminar de buscar.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para conectar o banco.'))
  }
  finally {
    conectando.value = false
  }
}

/*
 * O caminho manual da pegadinha 1 do plano: os itemIds das conexões feitas no
 * MeuPluggy podem ser copiados do dashboard da Pluggy, sem depender do widget.
 */
const itemColado = ref('')

async function cadastrarColado() {
  const id = itemColado.value.trim()
  if (!id) return
  try {
    await registrar.mutateAsync(id)
    itemColado.value = ''
    toast.success('Conexão cadastrada.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para cadastrar esta conexão.'))
  }
}

/*
 * Compartilhar é opt-in de cada pessoa, cartão a cartão: privado por padrão,
 * e desmarcar volta a ser privado sem mexer nas compras que já entraram (a
 * designação só vale para o que for importado depois — `designada_em`).
 */
async function onDesignar(conta: ContaBancaria, designacao: Designacao) {
  if (designacao.destino === conta.destino && designacao.space_id === conta.space_id) return
  try {
    await designar.mutateAsync({ id: conta.id, ...designacao })
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para mudar o destino.'))
  }
}

const desconectando = ref<ConexaoBancaria | null>(null)

async function onDesconectar() {
  if (!desconectando.value) return
  try {
    await desconectar.mutateAsync(desconectando.value.id)
    desconectando.value = null
    toast.success('Banco desconectado.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para desconectar.'))
  }
}

const CLASSE_TOM = {
  ok: 'text-muted-foreground',
  aviso: 'text-amber-700 dark:text-amber-400',
  erro: 'text-destructive',
} as const
</script>

<template>
  <div class="space-y-6">
    <OrcamentosAbas subtitulo="Os seus bancos, pelo Open Finance. Só você vê esta tela.">
      <template #acoes>
        <Button
          v-if="configurada"
          class="gap-1.5"
          :disabled="conectando"
          @click="conectar()"
        >
          <PlugZapIcon class="size-4" />
          {{ conectando ? 'Abrindo…' : 'Conectar banco' }}
        </Button>
      </template>
    </OrcamentosAbas>

    <Card v-if="configurada === false">
      <CardHeader>
        <CardTitle class="text-base">A Pluggy ainda não foi configurada</CardTitle>
        <CardDescription>
          Faltam <code>NUXT_PLUGGY_CLIENT_ID</code> e <code>NUXT_PLUGGY_CLIENT_SECRET</code> no
          ambiente. O resto do app funciona igual — o lançamento manual continua sendo o caminho.
        </CardDescription>
      </CardHeader>
    </Card>

    <div v-if="isPending" class="space-y-3">
      <Skeleton class="h-32 w-full" />
    </div>

    <Card v-else-if="!conexoes?.length && configurada">
      <CardContent class="space-y-2 py-6 text-sm text-muted-foreground">
        <p>
          Conecte o banco para as compras chegarem sozinhas: elas caem numa caixa de entrada e
          você decide, com um toque, se são do casal ou só suas.
        </p>
        <p>
          O extrato é só seu. Quem divide o espaço com você vê apenas as compras que você
          mandar para o espaço do casal.
        </p>
        <p>
          Primeira vez? O <NuxtLink to="/orcamentos/open-finance" class="underline">passo a passo</NuxtLink>
          mostra como criar a conta no MeuPluggy e ligar ao APPingos.
        </p>
      </CardContent>
    </Card>

    <Card v-for="conexao in conexoes" :key="conexao.id">
      <CardHeader class="pb-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <img
              v-if="conexao.banco_logo_url"
              :src="conexao.banco_logo_url"
              alt=""
              class="size-9 rounded-md border bg-white object-contain p-1"
            >
            <LandmarkIcon v-else class="size-9 rounded-md border p-2 text-muted-foreground" />
            <div>
              <CardTitle class="text-base">{{ conexao.banco || 'Banco' }}</CardTitle>
              <p class="text-xs" :class="CLASSE_TOM[situacaoDaConexao(conexao, hoje).tom]">
                {{ situacaoDaConexao(conexao, hoje).texto }}
              </p>
            </div>
          </div>

          <div class="flex gap-1">
            <Button
              v-if="configurada"
              :variant="situacaoDaConexao(conexao, hoje).reconectar ? 'default' : 'ghost'"
              size="sm"
              class="gap-1.5"
              :disabled="conectando"
              @click="conectar(conexao.item_id)"
            >
              <RefreshCwIcon class="size-4" />
              Reconectar
            </Button>
            <Button variant="ghost" size="sm" class="gap-1.5" @click="desconectando = conexao">
              <UnplugIcon class="size-4" />
              Desconectar
            </Button>
          </div>
        </div>

        <p class="text-xs text-muted-foreground">
          <template v-if="conexao.sincronizado_em">
            Extrato atualizado em {{ formatarDia(dataLocal(conexao.sincronizado_em)) }}.
          </template>
          <template v-else>Ainda não sincronizado — o extrato chega uma vez por dia.</template>
          <template v-if="conexao.consentimento_expira_em">
            Consentimento válido até {{ formatarDia(dataLocal(conexao.consentimento_expira_em)) }}.
          </template>
        </p>
      </CardHeader>

      <CardContent>
        <p v-if="!conexao.contas.length" class="text-sm text-muted-foreground">
          Nenhuma conta ainda — elas aparecem quando a Pluggy terminar de buscar.
        </p>

        <ul v-else class="divide-y">
          <li
            v-for="conta in conexao.contas"
            :key="conta.id"
            class="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div class="flex min-w-0 items-center gap-2">
              <CreditCardIcon v-if="conta.tipo === 'cartao'" class="size-4 shrink-0 text-muted-foreground" />
              <BanknoteIcon v-else class="size-4 shrink-0 text-muted-foreground" />
              <span class="truncate text-sm font-medium">{{ conta.nome }}</span>
              <span v-if="conta.numero" class="text-xs text-muted-foreground">
                {{ conta.tipo === 'cartao' ? `•••• ${conta.numero}` : conta.numero }}
              </span>
            </div>

            <div class="flex flex-col items-end gap-1.5 text-xs text-muted-foreground">
              <label class="flex items-center gap-2">
                <input
                  type="checkbox"
                  class="size-4 accent-primary"
                  :checked="estaCompartilhada(conta)"
                  :disabled="designar.isPending.value || !espacosDeCasal.length"
                  @change="onDesignar(conta, designacaoAoMarcar(($event.target as HTMLInputElement).checked, conta, espacosDeCasal))"
                >
                Compartilhar com
                <select
                  v-if="estaCompartilhada(conta)"
                  class="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
                  :value="conta.space_id ?? undefined"
                  :disabled="designar.isPending.value"
                  aria-label="Espaço que recebe as compras"
                  @change="onDesignar(conta, designacaoParaEspaco(($event.target as HTMLSelectElement).value))"
                >
                  <option v-for="espaco in espacosDeCasal" :key="espaco.id" :value="espaco.id">{{ espaco.nome }}</option>
                </select>
                <span v-else>um espaço</span>
              </label>

              <label v-if="!estaCompartilhada(conta)" class="flex items-center gap-2">
                Privado:
                <select
                  class="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
                  :value="conta.destino"
                  :disabled="designar.isPending.value"
                  aria-label="O que fazer com as compras privadas"
                  @change="onDesignar(conta, designacaoPrivada(($event.target as HTMLSelectElement).value as ModoPrivado))"
                >
                  <option value="perguntar">{{ ROTULO_DESTINO.perguntar }}</option>
                  <option value="pessoal">{{ ROTULO_DESTINO.pessoal }}</option>
                </select>
              </label>
            </div>
          </li>
        </ul>

        <p
          class="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground"
        >
          Tudo começa privado: o extrato é só seu. Um cartão compartilhado manda as compras novas
          direto para o espaço escolhido, metade para cada um, editáveis depois como uma compra
          lançada à mão. Desmarcar volta a ser privado e não mexe no que já entrou.
          <template v-if="!espacosDeCasal.length">Para compartilhar, você precisa estar num espaço de casal.</template>
        </p>
      </CardContent>
    </Card>

    <details v-if="configurada" class="rounded-lg border bg-card p-4 text-sm">
      <summary class="cursor-pointer font-medium">Já tenho o id da conexão</summary>
      <p class="mt-2 text-xs text-muted-foreground">
        As conexões feitas no MeuPluggy aparecem no dashboard da Pluggy com um id (o
        <code>itemId</code>). Colar aqui cadastra a conexão sem passar pelo widget.
      </p>
      <form class="mt-3 flex gap-2" @submit.prevent="cadastrarColado">
        <Input v-model="itemColado" placeholder="itemId" class="max-w-sm font-mono text-xs" />
        <Button type="submit" variant="secondary" :disabled="!itemColado.trim() || registrar.isPending.value">
          Cadastrar
        </Button>
      </form>
    </details>

    <Dialog :open="!!desconectando" @update:open="(v) => { if (!v) desconectando = null }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desconectar {{ desconectando?.banco || 'este banco' }}?</DialogTitle>
          <DialogDescription>
            O extrato importado sai do APPingos. As compras que já nasceram dele continuam no
            espaço onde estão. O consentimento em si se revoga no MeuPluggy ou no app do banco.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" @click="desconectando = null">Cancelar</Button>
          <Button variant="destructive" :disabled="desconectar.isPending.value" @click="onDesconectar">
            {{ desconectar.isPending.value ? 'Desconectando…' : 'Desconectar' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
