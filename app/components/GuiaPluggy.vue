<script setup lang="ts">
/**
 * O guia da integração com a Pluggy (Open Finance) — apresentação e passo a passo.
 *
 * Dois públicos. O guia DO MEMBRO é para todo mundo: criar a conta no MeuPluggy,
 * conectar os bancos lá, ligar ao APPingos e escolher o que compartilhar. O SETUP
 * DO ADMINISTRADOR (dashboard da Pluggy, chaves, trial) só aparece para quem
 * administra (`mostraSetupDoAdministrador`); o passo a passo inteiro dele está em
 * docs/pluggy-setup-administrador.md.
 *
 * Os passos seguem o README do MeuPluggy (github.com/pluggyai/meu-pluggy) e a
 * documentação v2 da Pluggy, lidos em 13/11/2026. Telas e botões de sites de
 * terceiros não são nomeados aqui de propósito: eles mudam sem aviso, e um nome
 * errado confunde mais do que a descrição do passo.
 */
import { ArrowRightIcon, CheckCircle2Icon, LandmarkIcon, LockIcon, ShieldAlertIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { hojeIso } from '@/lib/datas'
import { estadoDoGuia, mostraSetupDoAdministrador } from '~/lib/guia-pluggy'
import { situacaoDaConexao } from '~/lib/contas-bancarias'
import { useConexoesBancarias, usePluggyConfigurada } from '~/composables/useContasBancarias'
import { useSpaceStore } from '~/stores/space'

const { data: conexoes } = useConexoesBancarias()
const { data: configurada } = usePluggyConfigurada()
const store = useSpaceStore()

const hoje = hojeIso()
const estado = computed(() => estadoDoGuia(configurada.value, conexoes.value ?? [], hoje))
const administrador = computed(() => mostraSetupDoAdministrador(store.espacos))
const pedindoAtencao = computed(() =>
  (conexoes.value ?? []).filter(c => situacaoDaConexao(c, hoje).reconectar))

/* Conectado, o passo a passo vira referência: fica recolhido. */
const passoAPassoAberto = computed(() => estado.value === 'sem-conexao' || estado.value === 'nao-configurada')
</script>

<template>
  <div class="space-y-4">
    <!-- Consentimento perto de vencer, ou banco pedindo login -->
    <Card v-if="estado === 'renovar'" class="border-amber-300 dark:border-amber-800">
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <ShieldAlertIcon class="size-4 text-amber-600" />
          Uma conexão precisa de você
        </CardTitle>
        <CardDescription>
          <template v-for="c in pedindoAtencao" :key="c.id">
            <strong>{{ c.banco || 'Banco' }}</strong>: {{ situacaoDaConexao(c, hoje).texto }}
          </template>
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-3 text-sm">
        <p>
          O consentimento do Open Finance tem validade. Vencido, o banco para de mandar o extrato — e o
          app passaria a mostrar dados velhos como se fossem de hoje. A renovação é feita no MeuPluggy
          (ou no app do banco); depois, use "Reconectar" em Contas conectadas.
        </p>
        <Button as-child size="sm" class="gap-1.5">
          <NuxtLink to="/orcamentos/contas">Ir para Contas conectadas <ArrowRightIcon class="size-4" /></NuxtLink>
        </Button>
      </CardContent>
    </Card>

    <!-- Conectado -->
    <Card v-if="estado === 'conectado' || estado === 'renovar'">
      <CardContent class="flex flex-wrap items-center justify-between gap-3 py-5 text-sm">
        <p class="flex items-center gap-2">
          <CheckCircle2Icon class="size-4 text-emerald-600" />
          {{ conexoes?.length === 1 ? '1 banco conectado' : `${conexoes?.length} bancos conectados` }}.
          O extrato novo chega uma vez por dia na caixa de entrada.
        </p>
        <div class="flex gap-2">
          <Button as-child size="sm" variant="secondary">
            <NuxtLink to="/orcamentos/caixa">Caixa de entrada</NuxtLink>
          </Button>
          <Button as-child size="sm" variant="ghost">
            <NuxtLink to="/orcamentos/contas">Contas conectadas</NuxtLink>
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Apresentação -->
    <Card v-if="estado === 'sem-conexao' || estado === 'nao-configurada'">
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <LandmarkIcon class="size-4 text-muted-foreground" />
          Seus bancos no APPingos, pelo Open Finance
        </CardTitle>
        <CardDescription>
          {{ estado === 'nao-configurada'
            ? 'A integração existe, mas ainda não foi ativada neste app — falta o administrador configurar a Pluggy.'
            : 'A integração com a Pluggy está disponível. Conecte o seu banco e pare de digitar cada compra.' }}
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-3 text-sm">
        <p>
          <strong>Lançar vira classificar.</strong> As compras do cartão e da conta chegam sozinhas numa
          caixa de entrada, e você decide com um toque: compartilhada, pessoal, já lancei, salário,
          aporte numa meta ou ignorar. Parcelado vira uma compra só, e o pagamento da fatura não conta
          duas vezes.
        </p>
        <p class="flex gap-2">
          <LockIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            <strong>O extrato é só seu.</strong> Nem quem divide o espaço com você o vê. A outra pessoa só
            enxerga o que você mandar para o espaço compartilhado — e aí vê a compra, não a transação.
          </span>
        </p>
        <Button v-if="estado === 'sem-conexao'" as-child size="sm" class="gap-1.5">
          <NuxtLink to="/orcamentos/contas">Conectar meu banco <ArrowRightIcon class="size-4" /></NuxtLink>
        </Button>
      </CardContent>
    </Card>

    <!-- Guia do membro -->
    <details class="rounded-lg border bg-card p-4 text-sm" :open="passoAPassoAberto">
      <summary class="cursor-pointer font-medium">Passo a passo para conectar</summary>

      <ol class="mt-4 list-decimal space-y-4 pl-5">
        <li>
          <p class="font-medium">Crie a sua conta no MeuPluggy</p>
          <p class="text-muted-foreground">
            Em <a href="https://meu.pluggy.ai" target="_blank" rel="noopener" class="underline">meu.pluggy.ai</a>.
            É gratuito e é da Pluggy: é lá que fica guardado o consentimento de cada banco, e não no
            APPingos.
          </p>
        </li>
        <li>
          <p class="font-medium">Conecte os seus bancos no MeuPluggy</p>
          <p class="text-muted-foreground">
            Escolha a instituição e siga a autorização dela. Na maioria dos bancos a conexão é pelo
            Open Finance oficial: você confirma o consentimento no app do próprio banco. Um consentimento
            por banco.
          </p>
        </li>
        <li>
          <p class="font-medium">Ligue o MeuPluggy ao APPingos</p>
          <p class="text-muted-foreground">
            Em Orçamentos › Contas, "Conectar banco" abre o widget da Pluggy. Escolha o MeuPluggy e
            autorize. Com vários bancos no MeuPluggy, a autorização é feita uma vez para cada banco.
            Se quem administra o app já ligou a sua conexão por fora e te passou o id dela, cole em
            "Já tenho o id da conexão", na mesma tela.
          </p>
        </li>
        <li>
          <p class="font-medium">Escolha o que compartilhar</p>
          <p class="text-muted-foreground">
            Tudo começa privado. Em Contas conectadas, marque "Compartilhar com" nos cartões que são do
            casal e escolha o espaço — um, vários ou nenhum. As compras novas desses cartões entram
            direto no espaço, metade para cada um, editáveis depois. Desmarcar volta a ser privado e não
            mexe no que já entrou.
          </p>
        </li>
      </ol>

      <div class="mt-5 space-y-2 border-t pt-4">
        <p class="font-medium">O que esperar</p>
        <ul class="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>O MeuPluggy atualiza uma vez por dia. A compra de hoje chega amanhã, na caixa de entrada.</li>
          <li>Lançar à mão continua valendo para quem quer ver o gasto na hora; depois, "Já lancei" junta os dois.</li>
          <li>O acerto pago por Pix é reconhecido no extrato do dia seguinte e o mês fica marcado como pago.</li>
          <li>O consentimento tem validade. O app avisa 30 dias antes de vencer, aqui e em Contas conectadas.</li>
          <li>Desconectar no APPingos apaga o extrato importado daqui; revogar o consentimento é no MeuPluggy ou no banco.</li>
        </ul>
      </div>
    </details>

    <!-- Setup do administrador -->
    <details v-if="administrador" class="rounded-lg border border-dashed bg-card p-4 text-sm">
      <summary class="cursor-pointer font-medium">
        Para quem administra o app
        <span class="ml-1 text-xs font-normal" :class="configurada ? 'text-emerald-600' : 'text-muted-foreground'">
          {{ configurada ? '· Pluggy configurada' : '· ainda não configurada' }}
        </span>
      </summary>

      <div class="mt-3 space-y-3 text-muted-foreground">
        <p class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <strong>O relógio do trial.</strong> Criar a conta de desenvolvedor no dashboard da Pluggy
          inicia um trial de 15 dias, e só dá para ligar contas do MeuPluggy enquanto ele dura. Antes de
          criar, combine o dia com todo mundo que vai conectar.
        </p>
        <ol class="list-decimal space-y-1 pl-5">
          <li>Conta em <a href="https://dashboard.pluggy.ai" target="_blank" rel="noopener" class="underline">dashboard.pluggy.ai</a>.</li>
          <li>Uma Application de desenvolvimento, com o conector MeuPluggy na lista de conectores — ela dá o client id e o client secret.</li>
          <li><code>NUXT_PLUGGY_CLIENT_ID</code> e <code>NUXT_PLUGGY_CLIENT_SECRET</code> no <code>.env</code> e no Vercel.</li>
          <li>Os mesmos valores como secrets da Edge Function <code>sincronizar-pluggy</code>, o deploy dela e os dois segredos do Vault que o cron diário usa.</li>
        </ol>
        <p>
          O passo a passo completo, com os comandos, está em
          <code>docs/pluggy-setup-administrador.md</code> no repositório.
        </p>
      </div>
    </details>
  </div>
</template>
