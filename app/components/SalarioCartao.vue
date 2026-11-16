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
import { LockIcon, UsersIcon, WalletIcon } from '@lucide/vue'
import { mensagemDeErro } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatarDia, hojeIso, nomeDoMes, primeiroDoMes, somarMeses } from '@/lib/datas'
import { formatarDinheiro } from '@/lib/dinheiro'
import { dataPrevistaDoSalario } from '@/lib/salario'
import { diaMaximoDoRecebimento, recebimentoValido } from '~/types/planejamento'
import type { RecebimentoTipo } from '~/types/planejamento'
import {
  useCompartilharRenda,
  useMeusCompartilhamentos,
  useMinhaRenda,
  useRemoverRenda,
  useSalvarRenda,
} from '~/composables/useRenda'
import { useSpaceStore } from '~/stores/space'

const store = useSpaceStore()

const renda = useMinhaRenda()
const compartilhamentos = useMeusCompartilhamentos()
const salvar = useSalvarRenda()
const remover = useRemoverRenda()
const compartilhar = useCompartilharRenda()

const TIPOS: Array<{ valor: RecebimentoTipo, rotulo: string }> = [
  { valor: 'dia_util', rotulo: 'Dia útil' },
  { valor: 'dia_fixo', rotulo: 'Dia fixo' },
]

// `undefined` e não `null`: o Input do shadcn não aceita null em model-value.
const valor = ref<number | undefined>(undefined)
const tipo = ref<RecebimentoTipo>('dia_util')
const dia = ref<number>(5)

/*
 * Só sincroniza quando a linha chega (ou muda no servidor) — mesmo cuidado do
 * apelido: um `watch` no valor cru sobrescreveria o que a pessoa está digitando a
 * cada refetch.
 */
watch(() => renda.data.value, (r) => {
  valor.value = r?.valor_liquido ?? undefined
  tipo.value = r?.recebimento_tipo ?? 'dia_util'
  dia.value = r?.recebimento_dia ?? 5
}, { immediate: true })

// Espelha o CHECK do banco, para o erro de constraint não ser a forma de descobrir a regra.
const diaMaximo = computed(() => diaMaximoDoRecebimento(tipo.value))

const valido = computed(() => (valor.value ?? 0) > 0 && recebimentoValido(tipo.value, dia.value))

const mudou = computed(() => {
  const r = renda.data.value
  if (!r) return true
  return r.valor_liquido !== valor.value
    || r.recebimento_tipo !== tipo.value
    || r.recebimento_dia !== dia.value
})

/**
 * A regra em datas de verdade, para a pessoa conferir que "5º dia útil" quer dizer
 * o que ela acha: este mês e o próximo, já com feriados e Carnaval.
 */
const previstas = computed(() => {
  if (!valido.value) return []
  const mes = primeiroDoMes(hojeIso())
  return [mes, somarMeses(mes, 1)].map(m => ({
    mes: nomeDoMes(m),
    data: formatarDia(dataPrevistaDoSalario(m, tipo.value, dia.value)),
  }))
})

async function onSalvar() {
  if (!valido.value || !mudou.value) return
  try {
    await salvar.mutateAsync({
      valor_liquido: valor.value!,
      recebimento_tipo: tipo.value,
      recebimento_dia: dia.value,
    })
    toast.success('Salário salvo.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para salvar o salário.'))
  }
}

async function onRemover() {
  try {
    await remover.mutateAsync()
    toast.success('Salário removido.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para remover o salário.'))
  }
}

// ---- Quem vê -----------------------------------------------------------------

/** Só os compartilhados: no pessoal não há mais ninguém para ver. */
const espacosCompartilhados = computed(() => store.espacos.filter(e => e.tipo !== 'pessoal'))

const abertoEm = (spaceId: string) => compartilhamentos.data.value?.has(spaceId) ?? false

const nenhumAberto = computed(() => !espacosCompartilhados.value.some(e => abertoEm(e.id)))

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

      <form class="space-y-4" @submit.prevent="onSalvar">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-2">
            <Label for="salario-valor">Valor líquido</Label>
            <Input
              id="salario-valor"
              v-model.number="valor"
              type="number"
              inputmode="decimal"
              step="0.01"
              min="0.01"
              placeholder="0,00"
              :disabled="renda.isPending.value"
            />
          </div>

          <div class="space-y-2">
            <Label for="salario-dia">Quando cai</Label>
            <div class="flex gap-2">
              <div class="flex gap-1 rounded-lg border p-1">
                <Button
                  v-for="t in TIPOS"
                  :key="t.valor"
                  type="button"
                  size="sm"
                  :variant="tipo === t.valor ? 'default' : 'ghost'"
                  :aria-pressed="tipo === t.valor"
                  @click="tipo = t.valor"
                >
                  {{ t.rotulo }}
                </Button>
              </div>
              <Input
                id="salario-dia"
                v-model.number="dia"
                class="w-20"
                type="number"
                inputmode="numeric"
                min="1"
                :max="diaMaximo"
              />
            </div>
          </div>
        </div>

        <p class="text-xs text-muted-foreground">
          <template v-if="!valido && dia > diaMaximo">
            {{ tipo === 'dia_util'
              ? 'Um mês tem no máximo 23 dias úteis.'
              : 'O dia vai de 1 a 31.' }}
          </template>
          <template v-else-if="previstas.length">
            {{ tipo === 'dia_util' ? `Até o ${dia}º dia útil` : `Todo dia ${dia}` }}:
            <template v-for="(p, i) in previstas" :key="p.mes">
              {{ i ? ' · ' : '' }}{{ p.mes }} em <strong class="text-foreground">{{ p.data }}</strong>
            </template>.
            <template v-if="tipo === 'dia_util'">Conta só segunda a sexta, sem feriados nacionais.</template>
            <template v-else>Num mês sem esse dia, vale o último.</template>
          </template>
        </p>

        <div class="flex flex-wrap gap-2">
          <Button type="submit" variant="secondary" :disabled="!valido || !mudou || salvar.isPending.value">
            {{ salvar.isPending.value ? 'Salvando…' : renda.data.value ? 'Salvar' : 'Cadastrar salário' }}
          </Button>
          <Button
            v-if="renda.data.value"
            type="button"
            variant="ghost"
            :disabled="remover.isPending.value"
            @click="onRemover"
          >
            Remover
          </Button>
        </div>
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
