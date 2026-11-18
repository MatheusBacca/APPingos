<script setup lang="ts">
/**
 * Regras aprendidas — o que o auto-tag lembra de cada estabelecimento.
 *
 * Cada linha de `regra_classificacao` nasce de uma classificação na caixa de
 * entrada (`aprender_classificacao`): "iFood → Pessoal, Delivery". `vezes` conta
 * as escolhas iguais seguidas, e mudar de ideia recomeça do 1 — por isso uma
 * regra só fica confiante com uma escolha que se repete.
 *
 * "Classificar sozinha" é o opt-in de cada regra, e só existe para o espaço
 * PESSOAL depois de três escolhas iguais (o check `regra_automatica_so_pessoal`
 * da migration 20261117120000). Para o espaço do casal nunca: nada entra lá sem
 * um toque humano (docs/notion-plano-open-finance.md, "Lembrar a escolha por
 * estabelecimento").
 *
 * Tudo aqui é da pessoa logada (RLS `user_id = auth.uid()`).
 */
import { toast } from 'vue-sonner'
import { SearchIcon, SparklesIcon, Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { mensagemDeErro } from '@/lib/utils'
import { ROTULO_DESTINO_DA_REGRA, podeSerAutomatica } from '~/lib/auto-tag'
import { reconhecerEstabelecimento } from '~/lib/estabelecimentos'
import {
  useApagarRegra,
  useAutomatizarRegra,
  useRegrasClassificacao,
} from '~/composables/useCaixaDeEntrada'
import type { RegraClassificacao } from '~/composables/useCaixaDeEntrada'

useHead({ title: 'Regras aprendidas · APPingos' })

const { data: regras, isPending } = useRegrasClassificacao()
const automatizar = useAutomatizarRegra()
const apagar = useApagarRegra()

const busca = ref('')

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const filtradas = computed(() => {
  const termo = semAcento(busca.value.trim())
  const lista = regras.value ?? []
  if (!termo) return lista
  return lista.filter(r => semAcento(`${r.rotulo} ${r.categoria_nome ?? ''} ${r.chave}`).includes(termo))
})

/** O selo da marca, quando o dicionário a conhece; senão a inicial num círculo neutro. */
function seloDe(r: RegraClassificacao) {
  return reconhecerEstabelecimento(r.rotulo) ?? reconhecerEstabelecimento(r.chave)
}

const CLASSE_DESTINO = {
  casal: 'bg-primary/10 text-primary',
  pessoal: 'bg-secondary text-secondary-foreground',
  ignorar: 'bg-muted text-muted-foreground',
} as const

/** Desligar sempre pode; ligar só quando a regra se qualifica. */
const podeAlternar = (r: RegraClassificacao) => r.automatica || podeSerAutomatica(r)

function porQueNaoAutomatica(r: RegraClassificacao): string {
  if (r.destino !== 'pessoal') return 'Só compras pessoais classificam sozinhas — o casal sempre confirma.'
  const faltam = 3 - r.vezes
  return faltam === 1 ? 'Disponível depois de mais 1 escolha igual.' : `Disponível depois de mais ${faltam} escolhas iguais.`
}

async function alternar(r: RegraClassificacao) {
  if (!podeAlternar(r)) return
  try {
    await automatizar.mutateAsync({ id: r.id, automatica: !r.automatica })
    toast.success(r.automatica
      ? `${r.rotulo} volta a esperar na caixa de entrada.`
      : `${r.rotulo} vai direto para os seus gastos pessoais.`)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para mudar a regra.'))
  }
}

async function esquecer(r: RegraClassificacao) {
  try {
    await apagar.mutateAsync(r.id)
    toast.success(`Regra de ${r.rotulo} esquecida.`)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para apagar a regra.'))
  }
}
</script>

<template>
  <div class="space-y-6">
    <OrcamentosAbas subtitulo="O que o app aprendeu de cada estabelecimento para sugerir sozinho. Só você vê." />
    <OpenFinanceSecoes />

    <p class="text-sm text-muted-foreground">
      Cada vez que você classifica uma compra na caixa de entrada, o app lembra a escolha para aquele
      estabelecimento e a sugere da próxima vez — já preenchida, esperando o seu toque.
    </p>

    <div v-if="isPending" class="space-y-2">
      <Skeleton v-for="i in 4" :key="i" class="h-16 w-full" />
    </div>

    <Card v-else-if="!regras?.length">
      <CardContent class="flex items-start gap-3 text-sm text-muted-foreground">
        <SparklesIcon class="mt-0.5 size-5 shrink-0" />
        <p>
          Nenhuma regra ainda. Classifique algumas compras na
          <NuxtLink to="/orcamentos/open-finance/caixa" class="underline">caixa de entrada</NuxtLink>
          e elas aparecem aqui.
        </p>
      </CardContent>
    </Card>

    <template v-else>
      <div class="relative">
        <SearchIcon class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input v-model="busca" type="search" placeholder="Buscar estabelecimento ou categoria" class="pl-8" aria-label="Buscar regras" />
      </div>

      <p v-if="!filtradas.length" class="text-sm text-muted-foreground">Nenhuma regra com “{{ busca }}”.</p>

      <ul v-else class="divide-y rounded-lg border bg-card">
        <!--
          No celular, nome e detalhes ocupam a linha inteira e o interruptor e o
          apagar descem para a de baixo; a partir de sm, tudo numa linha só.
        -->
        <li
          v-for="r in filtradas"
          :key="r.id"
          class="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3"
        >
          <div class="flex min-w-0 basis-full items-center gap-3 sm:basis-0 sm:flex-1">
            <span
              v-if="seloDe(r)"
              class="grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold"
              :style="{ backgroundColor: seloDe(r)!.cor, color: seloDe(r)!.corTexto }"
              aria-hidden="true"
            >{{ seloDe(r)!.sigla }}</span>
            <span
              v-else
              class="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
              aria-hidden="true"
            >{{ r.rotulo.trim().charAt(0).toUpperCase() || '?' }}</span>

            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ r.rotulo }}</p>
              <p class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                <span class="rounded-full px-1.5 py-px font-medium" :class="CLASSE_DESTINO[r.destino]">
                  {{ ROTULO_DESTINO_DA_REGRA[r.destino] }}
                </span>
                <span v-if="r.categoria_nome">{{ r.categoria_nome }}</span>
                <span>· {{ r.vezes === 1 ? '1 vez' : `${r.vezes} vezes` }}</span>
              </p>
            </div>
          </div>

          <div class="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
            <label
              class="flex items-center gap-2 text-xs"
              :class="podeAlternar(r) ? 'cursor-pointer' : 'cursor-not-allowed text-muted-foreground'"
              :title="podeAlternar(r) ? undefined : porQueNaoAutomatica(r)"
            >
              <button
                type="button"
                role="switch"
                :aria-checked="r.automatica"
                :aria-label="`Classificar ${r.rotulo} sozinha`"
                :disabled="!podeAlternar(r) || automatizar.isPending.value"
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                :class="r.automatica ? 'bg-primary' : 'bg-input'"
                @click="alternar(r)"
              >
                <span
                  class="pointer-events-none block size-4 rounded-full bg-background shadow-sm transition-transform"
                  :class="r.automatica ? 'translate-x-4' : 'translate-x-0.5'"
                />
              </button>
              Classificar sozinha
            </label>

            <Button
              variant="ghost"
              size="icon-sm"
              :aria-label="`Esquecer a regra de ${r.rotulo}`"
              :disabled="apagar.isPending.value"
              @click="esquecer(r)"
            >
              <Trash2Icon class="size-4" />
            </Button>
          </div>

          <p v-if="!podeAlternar(r) && r.destino === 'pessoal'" class="basis-full text-xs text-muted-foreground sm:hidden">
            {{ porQueNaoAutomatica(r) }}
          </p>
        </li>
      </ul>
    </template>
  </div>
</template>
