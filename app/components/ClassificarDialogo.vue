<script setup lang="ts">
/**
 * Dar um destino a um item da caixa de entrada.
 *
 * Um diálogo para os cinco destinos que pedem mais que um toque: Compartilhada,
 * Pessoal, Já lancei, Salário e Aporte em meta. "Ignorar" não passa por aqui —
 * é um toque só, na própria linha.
 *
 * Compartilhada oferece as três divisões rápidas (igual, só eu, só o outro). Um
 * rateio diferente se ajusta depois, editando a compra em Chico Moedas — a
 * caixa de entrada existe para classificar rápido, não para repetir o
 * formulário inteiro.
 *
 * Compartilhada e Pessoal abrem com a categoria SUGERIDA já preenchida
 * (`sugerirClassificacao`: o que a pessoa escolheu antes para o estabelecimento,
 * a marca conhecida ou a categoria da Pluggy) — preenchida, nunca salva: só o
 * Confirmar grava, e só ele cria a categoria se ela ainda não existir no espaço.
 * Confirmar também ensina a escolha (`aprender_classificacao`).
 */
import { toast } from 'vue-sonner'
import { AlertTriangleIcon, SparklesIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatarDia, formatarMes, somarMeses } from '@/lib/datas'
import { formatarDinheiro } from '@/lib/dinheiro'
import { mensagemDeErro } from '@/lib/utils'
import {
  avisoDeMesAcertado,
  candidatasJaLancei,
  competenciaDoSalario,
  participantesDaDivisao,
} from '~/lib/caixa-de-entrada'
import type { DivisaoRapida, ItemDaCaixa, ModoClassificacao } from '~/lib/caixa-de-entrada'
import { chaveDoEstabelecimento } from '~/lib/estabelecimentos'
import { ROTULO_DESTINO_DA_REGRA, rotuloParaRegra, sugerirClassificacao } from '~/lib/auto-tag'
import { rateioIgual } from '~/types/orcamento'
import { useCategorias } from '~/composables/useOrcamento'
import {
  useAcertosDoEspaco,
  useClassificar,
  useComprasCandidatas,
  useMembrosDoEspaco,
  useMetasAtivas,
  useRegrasClassificacao,
} from '~/composables/useCaixaDeEntrada'
import { useMinhaRenda, useRendaRecebida } from '~/composables/useRenda'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'

const props = defineProps<{
  item: ItemDaCaixa | null
  modo: ModoClassificacao | null
}>()

const emit = defineEmits<{ fechar: [] }>()

const store = useSpaceStore()
const usuarioId = useUsuarioId()
const classificar = useClassificar()

const espacosDeCasal = computed(() => store.espacos.filter(e => e.tipo === 'casal'))
const espacoPessoal = computed(() => store.espacos.find(e => e.tipo === 'pessoal')?.id ?? null)

// ---- estado do formulário ----------------------------------------------------

const espacoCasal = ref<string | null>(null)
const descricao = ref('')
const categoria = ref('')
const divisao = ref<DivisaoRapida>('igual')
const compraEscolhida = ref<string | null>(null)
const competenciaSalario = ref('')
const metaEscolhida = ref<string | null>(null)
/** A pessoa mexeu na categoria: a sugestão para de sobrescrever o campo. */
const categoriaTocada = ref(false)

const { data: renda } = useMinhaRenda()

watch(() => [props.item, props.modo] as const, ([item]) => {
  if (!item) return
  const ativo = store.espacoAtivo
  espacoCasal.value = ativo?.tipo === 'casal' ? ativo.id : (espacosDeCasal.value[0]?.id ?? null)
  // O nome de onde foi ("iFood"), não o texto cru do extrato ("IFD*IFOOD.COM
  // AGENCIA DE"): é o que aparece depois na lista de compras do espaço.
  descricao.value = rotuloParaRegra(item.principal)
  categoria.value = ''
  categoriaTocada.value = false
  divisao.value = 'igual'
  compraEscolhida.value = null
  metaEscolhida.value = null
  competenciaSalario.value = competenciaDoSalario(item.principal.data, renda.value ?? null)
}, { immediate: true })

const espacoDestino = computed(() =>
  props.modo === 'casal' ? espacoCasal.value : props.modo === 'pessoal' ? espacoPessoal.value : null,
)

const { data: membros } = useMembrosDoEspaco(() => (props.modo === 'casal' ? espacoCasal.value : null))
const { data: acertos } = useAcertosDoEspaco(() => (props.modo === 'casal' ? espacoCasal.value : null))
const { data: categorias } = useCategorias(espacoDestino)
const { data: candidatasBrutas, isPending: buscandoCandidatas } = useComprasCandidatas(
  () => (props.modo === 'ja-lancei' && props.item ? props.item.plano : null),
)
const { data: metas } = useMetasAtivas()
const { data: regras } = useRegrasClassificacao()

/*
 * A sugestão com as categorias do espaço de DESTINO: "Mercado" no pessoal e
 * "Supermercado" no casal são nomes diferentes para a mesma coisa. Só para
 * saída — Compartilhada e Pessoal são compras.
 */
const sugestao = computed(() => {
  const item = props.item
  if (!item || item.sentido !== 'saida') return null
  return sugerirClassificacao(item.principal, regras.value ?? [], categorias.value ?? [])
})

/*
 * Preenche (e repreenche quando as categorias ou as regras chegam do banco),
 * até a pessoa digitar no campo.
 */
watch([sugestao, () => props.modo], ([s, modo]) => {
  if (categoriaTocada.value || (modo !== 'casal' && modo !== 'pessoal')) return
  categoria.value = s?.categoriaNome ?? ''
}, { immediate: true })

/** A categoria preenchida ainda não existe no espaço: Confirmar vai criá-la. */
const categoriaNova = computed(() => {
  const nome = categoria.value.trim().toLowerCase()
  return !!nome && !!categorias.value && !categorias.value.some(c => c.nome.trim().toLowerCase() === nome)
})

/** A regra diz outro destino ("da última vez foi Pessoal") — aviso, a pessoa decide. */
const destinoDiferente = computed(() => {
  const d = sugestao.value?.destino
  return d && d !== props.modo ? ROTULO_DESTINO_DA_REGRA[d] : null
})

const outro = computed(() => membros.value?.find(m => m.user_id !== usuarioId.value) ?? null)

const candidatas = computed(() =>
  props.item ? candidatasJaLancei(props.item.plano, candidatasBrutas.value ?? []) : [],
)

/* Uma só candidata (o caso comum) já vem marcada: sobra só confirmar. O mesmo para meta. */
watch([candidatas, () => props.item, () => props.modo], ([lista]) => {
  if (lista.length === 1 && !compraEscolhida.value) compraEscolhida.value = lista[0]!.id
}, { immediate: true })
watch([() => metas.value, () => props.item, () => props.modo], ([lista]) => {
  if (props.modo === 'meta' && lista?.length === 1 && !metaEscolhida.value) metaEscolhida.value = lista[0]!.id
}, { immediate: true })

/*
 * O salário do mês já marcado: confirmar troca a marcação pelo crédito do extrato
 * (é upsert). Antes trocava em silêncio — agora a tela diz o que vai acontecer.
 */
const { data: salarioJaMarcado } = useRendaRecebida(() => (props.modo === 'salario' ? competenciaSalario.value : ''))

const nomeDoEspaco = (id: string) => store.espacos.find(e => e.id === id)?.nome ?? 'Espaço'

const aviso = computed(() =>
  props.modo === 'casal' && props.item ? avisoDeMesAcertado(props.item.plano, acertos.value ?? []) : null,
)

const titulo = computed(() => ({
  'casal': 'Compra compartilhada',
  'pessoal': 'Compra pessoal',
  'ja-lancei': 'Já lancei esta compra',
  'salario': 'Salário recebido',
  'meta': props.item?.sentido === 'entrada' ? 'Resgate de meta' : 'Aporte em meta',
} as const)[props.modo ?? 'casal'])

// ---- salvar --------------------------------------------------------------------

const podeSalvar = computed(() => {
  if (!props.item || classificar.isPending.value) return false
  switch (props.modo) {
    case 'casal': return !!espacoCasal.value && !!descricao.value.trim() && !!membros.value?.length
    case 'pessoal': return !!espacoPessoal.value && !!descricao.value.trim()
    case 'ja-lancei': return !!compraEscolhida.value
    case 'salario': return !!competenciaSalario.value
    case 'meta': return !!metaEscolhida.value
    default: return false
  }
})

async function salvar() {
  const item = props.item
  if (!item || !podeSalvar.value || !usuarioId.value) return
  const eu = usuarioId.value

  try {
    switch (props.modo) {
      case 'casal':
      case 'pessoal': {
        const casal = props.modo === 'casal'
        await classificar.mutateAsync({
          tipo: 'compra',
          transacao: item.principal.id,
          space: casal ? espacoCasal.value! : espacoPessoal.value!,
          descricao: descricao.value.trim(),
          plano: item.plano,
          participantes: casal
            ? participantesDaDivisao(divisao.value, eu, (membros.value ?? []).map(m => m.user_id))
            : rateioIgual([eu]),
          categoria: categoria.value.trim() || null,
          aprender: item.sentido === 'saida'
            ? {
                chave: sugestao.value?.chave ?? chaveDoEstabelecimento(item.principal.descricao),
                rotulo: rotuloParaRegra(item.principal),
                destino: casal ? 'casal' : 'pessoal',
                categoria: categoria.value.trim() || null,
              }
            : undefined,
        })
        toast.success(casal ? `Lançada em ${nomeDoEspaco(espacoCasal.value!)}.` : 'Lançada nos seus gastos pessoais.')
        break
      }
      case 'ja-lancei':
        await classificar.mutateAsync({ tipo: 'vincular', transacao: item.principal.id, compra: compraEscolhida.value! })
        toast.success('Vinculada à compra que você já tinha lançado.')
        break
      case 'salario':
        await classificar.mutateAsync({ tipo: 'renda', transacao: item.principal.id, competencia: competenciaSalario.value })
        toast.success(`Salário de ${formatarMes(competenciaSalario.value)} marcado como recebido.`)
        break
      case 'meta':
        await classificar.mutateAsync({ tipo: 'aporte', transacao: item.principal.id, meta: metaEscolhida.value! })
        toast.success(item.sentido === 'entrada' ? 'Resgate registrado na meta.' : 'Aporte registrado na meta.')
        break
    }
    emit('fechar')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para classificar.'))
  }
}
</script>

<template>
  <Dialog :open="!!item && !!modo" @update:open="(v) => { if (!v) emit('fechar') }">
    <DialogContent v-if="item && modo" class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ titulo }}</DialogTitle>
        <DialogDescription>
          {{ item.principal.descricao }} · {{ formatarDia(item.principal.data) }} ·
          {{ formatarDinheiro(Number(item.principal.valor)) }}
        </DialogDescription>
      </DialogHeader>

      <!-- Compartilhada / Pessoal -->
      <div v-if="modo === 'casal' || modo === 'pessoal'" class="space-y-4">
        <div v-if="modo === 'casal' && espacosDeCasal.length > 1" class="space-y-1.5">
          <Label for="caixa-espaco">Espaço</Label>
          <select id="caixa-espaco" v-model="espacoCasal" class="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option v-for="e in espacosDeCasal" :key="e.id" :value="e.id">{{ e.nome }}</option>
          </select>
        </div>
        <p v-else-if="modo === 'casal' && !espacosDeCasal.length" class="text-sm text-destructive">
          Você ainda não está em nenhum espaço de casal.
        </p>

        <div class="space-y-1.5">
          <Label for="caixa-descricao">Descrição</Label>
          <Input id="caixa-descricao" v-model="descricao" />
        </div>

        <div class="space-y-1.5">
          <Label for="caixa-categoria">Categoria <span class="font-normal text-muted-foreground">(opcional)</span></Label>
          <Input
            id="caixa-categoria"
            v-model="categoria"
            list="caixa-categorias"
            placeholder="Mercado, Casa…"
            @input="categoriaTocada = true"
          />
          <datalist id="caixa-categorias">
            <option v-for="c in categorias ?? []" :key="c.id" :value="c.nome" />
          </datalist>
          <p
            v-if="sugestao && !categoriaTocada && categoria === (sugestao.categoriaNome ?? '')"
            class="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <SparklesIcon class="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span>
              Sugestão: {{ sugestao.motivo }}<template v-if="categoriaNova"> · a categoria é criada ao confirmar</template>.
            </span>
          </p>
          <p v-else-if="categoriaNova" class="text-xs text-muted-foreground">
            Categoria nova — é criada ao confirmar.
          </p>
        </div>

        <p v-if="destinoDiferente" class="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          <template v-if="sugestao?.destino === 'ignorar'">Da última vez, você ignorou este estabelecimento.</template>
          <template v-else>Da última vez, este estabelecimento foi para <strong>{{ destinoDiferente }}</strong>.</template>
        </p>

        <fieldset v-if="modo === 'casal'" class="space-y-1.5">
          <legend class="text-sm font-medium">Quem deve</legend>
          <div class="flex flex-wrap gap-2 text-sm">
            <label class="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5">
              <input v-model="divisao" type="radio" value="igual" class="accent-primary"> Metade cada
            </label>
            <label class="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5">
              <input v-model="divisao" type="radio" value="so-eu" class="accent-primary"> Só eu
            </label>
            <label v-if="outro" class="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5">
              <input v-model="divisao" type="radio" value="so-outro" class="accent-primary"> Só {{ outro.exibicao }}
            </label>
          </div>
          <p class="text-xs text-muted-foreground">Outro rateio se ajusta depois, editando a compra.</p>
        </fieldset>

        <p v-if="item.plano.parcelas > 1" class="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Compra de {{ formatarDinheiro(item.plano.valor_total) }} em {{ item.plano.parcelas }}x, a partir de
          {{ formatarMes(item.plano.competencia_inicial) }}.
          <template v-if="item.plano.recuo_meses">
            A primeira parcela que chegou do banco é a {{ item.plano.recuo_meses + 1 }}ª, então a compra começa
            {{ item.plano.recuo_meses === 1 ? '1 mês' : `${item.plano.recuo_meses} meses` }} antes — uma linha só, como
            se tivesse sido lançada no dia.
          </template>
        </p>

        <p v-if="aviso" class="flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangleIcon class="mt-0.5 size-3.5 shrink-0" />
          {{ aviso }}
        </p>
      </div>

      <!-- Já lancei -->
      <div v-else-if="modo === 'ja-lancei'" class="space-y-2">
        <p v-if="buscandoCandidatas" class="text-sm text-muted-foreground">Procurando…</p>
        <p v-else-if="!candidatas.length" class="text-sm text-muted-foreground">
          Nenhuma compra de {{ formatarDinheiro(item.plano.valor_total) }} lançada perto de
          {{ formatarDia(item.plano.data_compra) }}.
        </p>
        <label
          v-for="c in candidatas"
          :key="c.id"
          class="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm"
        >
          <input
            v-model="compraEscolhida"
            type="radio"
            :value="c.id"
            class="accent-primary"
            :aria-label="`${c.descricao}, ${nomeDoEspaco(c.space_id)}, ${formatarDia(c.data_compra)}`"
          >
          <span class="min-w-0 flex-1 truncate">{{ c.descricao }}</span>
          <span class="text-xs text-muted-foreground">{{ nomeDoEspaco(c.space_id) }} · {{ formatarDia(c.data_compra) }}</span>
        </label>
      </div>

      <!-- Salário -->
      <div v-else-if="modo === 'salario'" class="space-y-2 text-sm">
        <div class="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
          <Button variant="ghost" size="sm" @click="competenciaSalario = somarMeses(competenciaSalario, -1)">‹</Button>
          <span class="font-medium">Salário de {{ formatarMes(competenciaSalario) }}</span>
          <Button variant="ghost" size="sm" @click="competenciaSalario = somarMeses(competenciaSalario, 1)">›</Button>
        </div>
        <p class="text-xs text-muted-foreground">
          <template v-if="renda">O mês sai da data prevista do seu salário; ajuste se o crédito for de outro.</template>
          <template v-else>Sem salário cadastrado em Espaços, o mês é o do crédito.</template>
        </p>
        <p
          v-if="salarioJaMarcado && salarioJaMarcado.transacao_id !== item.principal.id"
          class="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
        >
          <AlertTriangleIcon class="mt-0.5 size-3.5 shrink-0" />
          <span>
            {{ formatarMes(competenciaSalario) }} já estava marcado como recebido
            ({{ formatarDinheiro(salarioJaMarcado.valor) }} em {{ formatarDia(salarioJaMarcado.recebido_em) }}).
            Confirmar troca essa marcação por este crédito do extrato.
          </span>
        </p>
      </div>

      <!-- Meta -->
      <div v-else-if="modo === 'meta'" class="space-y-2">
        <p v-if="!metas?.length" class="text-sm text-muted-foreground">Nenhuma meta ativa em Objetivos.</p>
        <label
          v-for="m in metas"
          :key="m.id"
          class="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm"
        >
          <input v-model="metaEscolhida" type="radio" :value="m.id" class="accent-primary" :aria-label="m.titulo">
          <span class="min-w-0 flex-1 truncate">{{ m.titulo }}</span>
          <span class="text-xs text-muted-foreground">{{ nomeDoEspaco(m.space_id) }}</span>
        </label>
        <p class="text-xs text-muted-foreground">
          A meta é uma reserva no app: isto registra que
          {{ formatarDinheiro(Number(item.principal.valor)) }} {{ item.sentido === 'entrada' ? 'saiu da' : 'foi para a' }} meta.
        </p>
      </div>

      <DialogFooter>
        <Button variant="ghost" @click="emit('fechar')">Cancelar</Button>
        <Button :disabled="!podeSalvar" @click="salvar">
          {{ classificar.isPending.value ? 'Salvando…' : 'Confirmar' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
