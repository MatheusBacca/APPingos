<script setup lang="ts">
/**
 * Quanto cada um põe nas contas do casal — e a sua linha, editável.
 *
 * A soma é o VALOR CENTRAL, o planejado do mês do casal. Cada um declara em
 * reais ou em percentual do salário, e o que o outro vê depende disso:
 *
 *   - em reais, o valor aparece para todo mundo do espaço;
 *   - em percentual, o espaço vê o valor que ele dá em reais, e o percentual só
 *     aparece se o seu salário estiver compartilhado NESTE espaço. Percentual
 *     mais valor dariam o salário por regra de três.
 *
 * Quem decide o que é visível é a RPC `contribuicoes_do_espaco`; esta tela só
 * desenha o que ela devolveu. O percentual da outra pessoa nunca é calculado aqui.
 */
import { toast } from 'vue-sonner'
import { mensagemDeErro } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatarDinheiro } from '@/lib/dinheiro'
import { valorCentral, valorDaContribuicao } from '~/types/planejamento'
import type { Contribuicao, ContribuicaoDoEspaco, ModoContribuicao } from '~/types/planejamento'
import type { Membro } from '~/composables/useMembros'
import { useDefinirContribuicao } from '~/composables/usePlanejamento'
import { useUsuarioId } from '~/composables/useUsuarioId'

const props = defineProps<{
  spaceId: string
  membros: Membro[]
  /** O que o espaço vê (a RPC). */
  contribuicoes: ContribuicaoDoEspaco[]
  /** A minha linha crua neste espaço, se houver. */
  minha: Contribuicao | null
  meuSalario: number | null
  /** O meu salário está aberto neste espaço? Decide o aviso do modo percentual. */
  salarioAbertoAqui: boolean
}>()

const usuarioId = useUsuarioId()
const definir = useDefinirContribuicao(() => props.spaceId)

const total = computed(() => valorCentral(props.contribuicoes))
const semBase = computed(() => props.contribuicoes.some(c => c.valor_efetivo === null))

const porMembro = computed(() =>
  props.membros.map(m => ({
    membro: m,
    contribuicao: props.contribuicoes.find(c => c.user_id === m.user_id) ?? null,
    souEu: m.user_id === usuarioId.value,
  })),
)

// ---- A minha linha ------------------------------------------------------------

const MODOS: Array<{ valor: ModoContribuicao, rotulo: string }> = [
  { valor: 'valor', rotulo: 'R$' },
  { valor: 'percentual', rotulo: '%' },
]

const modo = ref<ModoContribuicao>('valor')
const valor = ref<number | undefined>(undefined)

watch(() => props.minha, (c) => {
  modo.value = c?.modo ?? 'valor'
  valor.value = c?.valor ?? undefined
}, { immediate: true })

const valido = computed(() => {
  const v = valor.value ?? 0
  return v > 0 && (modo.value === 'valor' || v <= 100)
})

const mudou = computed(() =>
  !props.minha || props.minha.modo !== modo.value || props.minha.valor !== valor.value,
)

const previa = computed(() =>
  valido.value ? valorDaContribuicao({ modo: modo.value, valor: valor.value! }, props.meuSalario) : null,
)

async function onSalvar() {
  if (!valido.value || !mudou.value) return
  try {
    await definir.mutateAsync({ modo: modo.value, valor: valor.value! })
    toast.success('Contribuição salva.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para salvar a contribuição.'))
  }
}

async function onRetirar() {
  try {
    await definir.mutateAsync(null)
    toast.success('Contribuição retirada.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para retirar a contribuição.'))
  }
}

function descreverOutro(c: ContribuicaoDoEspaco | null): string {
  if (!c) return 'Ainda não declarou.'
  if (c.valor_efetivo === null) return 'Em percentual, sem salário cadastrado.'
  if (c.percentual !== null) return `${c.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% do salário`
  return c.modo === 'percentual' ? 'Em percentual do salário.' : 'Valor fixo.'
}
</script>

<template>
  <section class="space-y-4 rounded-lg border bg-card p-4">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 class="text-sm font-medium">Contribuição de cada um</h2>
        <p class="mt-0.5 text-xs text-muted-foreground">
          Quanto do salário cada um põe nas contas do casal. A soma é o valor central do mês.
        </p>
      </div>
      <div class="text-right">
        <p class="text-xs text-muted-foreground">Valor central</p>
        <p class="text-lg font-semibold">{{ formatarDinheiro(total) }}</p>
      </div>
    </div>

    <ul class="divide-y">
      <li v-for="linha in porMembro" :key="linha.membro.user_id" class="py-3 first:pt-0 last:pb-0">
        <div class="flex items-baseline gap-2">
          <span class="min-w-0 flex-1 truncate text-sm font-medium">
            {{ linha.membro.exibicao }}<span v-if="linha.souEu" class="text-muted-foreground"> (você)</span>
          </span>
          <span class="text-sm tabular-nums">
            {{ linha.contribuicao?.valor_efetivo != null ? formatarDinheiro(linha.contribuicao.valor_efetivo) : '—' }}
          </span>
        </div>
        <p v-if="!linha.souEu" class="text-xs text-muted-foreground">{{ descreverOutro(linha.contribuicao) }}</p>

        <!-- A sua linha é a única editável: cada um declara a própria contribuição. -->
        <form v-else class="mt-2 space-y-2" @submit.prevent="onSalvar">
          <div class="flex flex-wrap items-center gap-2">
            <div class="flex gap-1 rounded-lg border p-1">
              <Button
                v-for="m in MODOS"
                :key="m.valor"
                type="button"
                size="sm"
                :variant="modo === m.valor ? 'default' : 'ghost'"
                :aria-pressed="modo === m.valor"
                @click="modo = m.valor"
              >
                {{ m.rotulo }}
              </Button>
            </div>
            <Label for="contribuicao-valor" class="sr-only">Quanto você contribui</Label>
            <Input
              id="contribuicao-valor"
              v-model.number="valor"
              class="w-32"
              type="number"
              inputmode="decimal"
              step="0.01"
              min="0.01"
              :max="modo === 'percentual' ? 100 : undefined"
              :placeholder="modo === 'percentual' ? '30' : '0,00'"
            />
            <Button type="submit" size="sm" variant="secondary" :disabled="!valido || !mudou || definir.isPending.value">
              Salvar
            </Button>
            <Button
              v-if="minha"
              type="button"
              size="sm"
              variant="ghost"
              :disabled="definir.isPending.value"
              @click="onRetirar"
            >
              Retirar
            </Button>
          </div>

          <p class="text-xs text-muted-foreground">
            <template v-if="modo === 'percentual' && !meuSalario">
              Para o percentual virar valor, cadastre seu salário em
              <NuxtLink to="/espacos" class="text-primary underline-offset-2 hover:underline">Espaços › Seu salário</NuxtLink>.
            </template>
            <template v-else-if="modo === 'percentual'">
              <template v-if="previa !== null">= {{ formatarDinheiro(previa) }} por mês. </template>
              <template v-if="salarioAbertoAqui">Seu salário está aberto aqui, então o percentual aparece para todos.</template>
              <template v-else>Os outros veem só o valor em reais — o percentual fica com você.</template>
            </template>
            <template v-else>Um valor fixo por mês, visível para todo mundo do espaço.</template>
          </p>
        </form>
      </li>
    </ul>

    <p v-if="semBase" class="text-xs text-amber-700 dark:text-amber-400">
      Alguém contribui em percentual sem salário cadastrado — essa parte fica fora do valor central até lá.
    </p>
  </section>
</template>
