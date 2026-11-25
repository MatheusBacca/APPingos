<script setup lang="ts">
/**
 * O salário na tela de perfil: valor líquido, quando cai e com quem está aberto.
 *
 * Mora aqui, ao lado do apelido, porque é dado da PESSOA — vale em todos os
 * espaços. Mas não é coluna de `profile`: a policy `profile_select` deixa quem
 * divide um espaço ler a linha inteira, e o salário vazaria. Ele vive em `renda`,
 * e o compartilhamento é uma escolha explícita, espaço por espaço.
 *
 * O padrão é privado, e a tela diz isso antes de qualquer outra coisa: a primeira
 * pergunta de quem vai digitar o salário num app de casal é "ela vai ver?".
 */
import { toast } from 'vue-sonner'
import { GaugeIcon, LockIcon, UsersIcon, WalletIcon } from '@lucide/vue'
import { mensagemDeErro } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FAIXAS_PADRAO, problemaNasFaixas } from '~/lib/painel-orcamentos'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatarDinheiro } from '@/lib/dinheiro'
import {
  useCompartilharRenda,
  useMeusCompartilhamentos,
  useMinhaRenda,
  useSalvarFaixasDoSalario,
} from '~/composables/useRenda'
import { useSpaceStore } from '~/stores/space'

const store = useSpaceStore()

const renda = useMinhaRenda()
const compartilhamentos = useMeusCompartilhamentos()
const compartilhar = useCompartilharRenda()

// ---- Quem vê -----------------------------------------------------------------

/** Só os compartilhados: no pessoal não há mais ninguém para ver. */
const espacosCompartilhados = computed(() => store.espacos.filter(e => e.tipo !== 'pessoal'))

const abertoEm = (spaceId: string) => compartilhamentos.data.value?.has(spaceId) ?? false

const nenhumAberto = computed(() => !espacosCompartilhados.value.some(e => abertoEm(e.id)))

// ---- Faixas da barra "A pagar do salário" --------------------------------------

/*
 * Digitadas em percentual (70, 100) e gravadas como fração (0,7; 1). O
 * formulário recomeça do que está salvo sempre que a renda chega ou muda.
 */
const salvarFaixas = useSalvarFaixasDoSalario()
const atencaoPct = ref(FAIXAS_PADRAO.atencao * 100)
const alertaPct = ref(FAIXAS_PADRAO.alerta * 100)

watch(() => renda.data.value, (r) => {
  if (!r) return
  atencaoPct.value = Math.round(r.faixa_atencao * 100)
  alertaPct.value = Math.round(r.faixa_alerta * 100)
}, { immediate: true })

/*
 * Percentual inteiro: a coluna guarda a fração com duas casas (`numeric(4,2)`),
 * então 70,5% viraria 0,71 e o formulário nunca bateria com o salvo. Campo vazio
 * (o `v-model.number` deixa '') é NaN — "preencha", e não "maior que 0%".
 */
const pct = (v: number | string) => (v === '' || v == null ? Number.NaN : Math.round(Number(v)))

const problemaDasFaixas = computed(() => problemaNasFaixas(pct(atencaoPct.value), pct(alertaPct.value)))
const faixasMudaram = computed(() => {
  const r = renda.data.value
  return !!r && (Math.round(r.faixa_atencao * 100) !== pct(atencaoPct.value) || Math.round(r.faixa_alerta * 100) !== pct(alertaPct.value))
})

async function gravarFaixas() {
  if (problemaDasFaixas.value) return
  try {
    await salvarFaixas.mutateAsync({ faixa_atencao: pct(atencaoPct.value) / 100, faixa_alerta: pct(alertaPct.value) / 100 })
    toast.success('Faixas do salário salvas.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para salvar as faixas.'))
  }
}

async function alternar(spaceId: string, nome: string) {
  const vaiAbrir = !abertoEm(spaceId)
  try {
    await compartilhar.mutateAsync({ spaceId, compartilhar: vaiAbrir })
    toast.success(vaiAbrir
      ? `Quem está em "${nome}" agora vê o seu salário.`
      : `Seu salário voltou a ser só seu em "${nome}".`)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para mudar quem vê o salário.'))
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2 text-base">
        <WalletIcon class="size-4 text-muted-foreground" />
        Seu salário
      </CardTitle>
      <CardDescription>
        O valor líquido que cai na sua conta, e quando. É a base do Planejamento em Orçamentos.
      </CardDescription>
    </CardHeader>

    <CardContent class="space-y-5">
      <!--
        A privacidade vem antes do formulário, e não num rodapé: é a pergunta que a
        pessoa faz antes de digitar o número.
      -->
      <p class="flex items-start gap-2 rounded-md border bg-muted/40 p-2.5 text-xs text-muted-foreground">
        <LockIcon class="mt-0.5 size-3.5 shrink-0" />
        <span>
          <template v-if="nenhumAberto">
            <strong class="text-foreground">Só você vê.</strong>
          </template>
          <template v-else>
            <strong class="text-foreground">Aberto só onde você escolheu, abaixo.</strong>
          </template>
          Sem compartilhar, quem divide um espaço com você vê apenas quanto você põe nas contas
          dele — nunca o salário, nem um percentual que permita calcular.
        </span>
      </p>

      <SalarioFormulario />

      <!--
        As faixas da barra "A pagar do salário" do painel de Orçamentos: só
        existem com salário cadastrado, porque são uma fração dele.
      -->
      <form v-if="renda.data.value" class="space-y-3 border-t pt-4" @submit.prevent="gravarFaixas">
        <div>
          <h3 class="flex items-center gap-2 text-sm font-medium">
            <GaugeIcon class="size-4 text-muted-foreground" />
            Alertas do salário
          </h3>
          <p class="mt-0.5 text-xs text-muted-foreground">
            No painel de Orçamentos, a barra "A pagar do salário" compara as faturas abertas com o
            salário e muda de cor nestas faixas.
          </p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <label class="space-y-1 text-xs">
            <span class="flex items-center gap-1.5 font-medium">
              <span class="size-2 rounded-full bg-amber-500" aria-hidden="true" />
              Atenção a partir de
            </span>
            <span class="relative block">
              <Input v-model.number="atencaoPct" type="number" min="1" max="299" step="1" inputmode="numeric" class="pr-7" />
              <span class="pointer-events-none absolute inset-y-0 right-2.5 grid place-items-center text-muted-foreground">%</span>
            </span>
          </label>
          <label class="space-y-1 text-xs">
            <span class="flex items-center gap-1.5 font-medium">
              <span class="size-2 rounded-full bg-red-500" aria-hidden="true" />
              Alerta a partir de
            </span>
            <span class="relative block">
              <Input v-model.number="alertaPct" type="number" min="2" max="300" step="1" inputmode="numeric" class="pr-7" />
              <span class="pointer-events-none absolute inset-y-0 right-2.5 grid place-items-center text-muted-foreground">%</span>
            </span>
          </label>
        </div>
        <p v-if="problemaDasFaixas" class="text-xs text-destructive">{{ problemaDasFaixas }}</p>
        <p v-else class="text-xs text-muted-foreground">
          Abaixo de {{ atencaoPct }}% a barra fica verde.
        </p>
        <Button type="submit" size="sm" :disabled="!faixasMudaram || !!problemaDasFaixas || salvarFaixas.isPending.value">
          Salvar faixas
        </Button>
      </form>

      <div class="space-y-2 border-t pt-4">
        <h3 class="flex items-center gap-2 text-sm font-medium">
          <UsersIcon class="size-4 text-muted-foreground" />
          Quem vê
        </h3>

        <p v-if="!espacosCompartilhados.length" class="text-xs text-muted-foreground">
          Você ainda não divide nenhum espaço — não há com quem compartilhar.
        </p>

        <template v-else>
          <ul class="space-y-2">
            <li v-for="espaco in espacosCompartilhados" :key="espaco.id" class="flex items-center gap-3">
              <span class="min-w-0 flex-1 truncate text-sm">{{ espaco.nome }}</span>
              <Button
                type="button"
                size="sm"
                :variant="abertoEm(espaco.id) ? 'default' : 'outline'"
                :aria-pressed="abertoEm(espaco.id)"
                :disabled="compartilhar.isPending.value || compartilhamentos.isPending.value"
                @click="alternar(espaco.id, espaco.nome)"
              >
                {{ abertoEm(espaco.id) ? 'Compartilhado' : 'Compartilhar' }}
              </Button>
            </li>
          </ul>
          <p class="text-xs text-muted-foreground">
            Compartilhar mostra o valor{{ renda.data.value ? ` (${formatarDinheiro(renda.data.value.valor_liquido)})` : '' }}
            a quem está naquele espaço, e o percentual da sua contribuição passa a aparecer lá. Vale
            só para aquele espaço, e você desfaz quando quiser.
          </p>
        </template>
      </div>
    </CardContent>
  </Card>
</template>
