<script setup lang="ts">
/**
 * Três meses de gasto, no cartão do painel.
 *
 * O mês corrente e os dois que dão a referência — a pergunta aqui é "estamos
 * gastando mais que o normal?", e ela não precisa dos doze meses do módulo.
 *
 * Duas diferenças de propósito em relação ao `GraficoBarras` de Orçamentos, e
 * nenhuma delas é enfeite:
 *
 * - **Rótulo em toda barra.** Lá são até doze, e o número em cima de cada uma
 *   vira ruído; aqui são três, e o valor é justamente o que se veio ler.
 * - **Nada clicável.** O cartão inteiro é um link para o módulo. Um botão de
 *   tooltip ou de "ver tabela" dentro dele seria um alvo dentro de outro alvo —
 *   e um `<button>` dentro de um `<a>` é HTML inválido, não só desconfortável.
 *   O caminho para o número exato continua existindo: é a tela de Orçamentos.
 *
 * O mesmo matiz em duas intensidades, e não duas cores: passado e presente são
 * estados ordenados no tempo, não identidades diferentes.
 */
import { Skeleton } from '@/components/ui/skeleton'
import { hojeIso, primeiroDoMes } from '@/lib/datas'
import { formatarDinheiro } from '@/lib/dinheiro'
import { ESPACO_DA_VITRINE, ESPACO_INDEFINIDO, mesesDaVitrine } from '@/lib/vitrine'
import { useSerieMensal } from '~/composables/useOrcamento'

/*
 * O mês é fixado na montagem, como no resumo em texto: o painel pode ficar
 * aberto por horas num app instalado, mas a virada de mês com a tela ligada é
 * rara o bastante para não valer um timer.
 */
const mesCorrente = primeiroDoMes(hojeIso())

// A MESMA consulta (e a mesma chave de cache) da tela de Orçamentos quando ela
// abre no mês corrente: entrar no módulo depois de ver o painel não busca de novo.
const { data: serie, isPending } = useSerieMensal(mesCorrente)

const meses = computed(() => mesesDaVitrine(serie.value ?? [], mesCorrente))

const maximo = computed(() => Math.max(...meses.value.map(m => m.total), 0))

const vazio = computed(() => maximo.value <= 0)

/**
 * A altura do gráfico em PIXELS, e não `flex-1`.
 *
 * As barras têm altura em porcentagem, e porcentagem só resolve contra uma
 * altura definida: num pai que estica por flex, a conta não fecha e toda barra
 * desaba para zero — foi exatamente o que aconteceu quando o cartão ganhou
 * altura ajustável. Com o número em mãos, o gráfico ocupa o que sobrou no cartão
 * alto e volta aos 96px de sempre no cartão de altura natural.
 */
const ALTURA_PADRAO = 96
/** Régua, rótulos dos meses e o respiro do valor em cima da barra. */
const RODAPE = 44

const espaco = inject(ESPACO_DA_VITRINE, computed(() => ESPACO_INDEFINIDO))

const alturaDoGrafico = computed(() => {
  if (espaco.value.altura === null) return ALTURA_PADRAO
  return Math.max(espaco.value.altura - RODAPE, 72)
})

/** Piso de 2% para um mês sem gasto ainda existir como barra. */
function altura(total: number): string {
  if (maximo.value <= 0) return '2%'
  return `${Math.max((total / maximo.value) * 100, 2)}%`
}
</script>

<template>
  <!--
    `flex-1`: o cartão é esticado pela altura do vizinho na grade (os cartazes de
    Filmes, ao lado), e um gráfico de 96px com 120px de sobra embaixo pareceria um
    erro de layout. O gráfico ocupa o que sobrar, com um piso para não achatar
    quando o vizinho for baixo.
  -->
  <div class="mt-3 flex flex-1 flex-col">
    <Skeleton v-if="isPending" class="h-28 w-full rounded-lg" />

    <p v-else-if="vazio" class="text-sm text-muted-foreground">
      Nenhum gasto lançado nos últimos meses.
    </p>

    <template v-else>
      <!--
        O desenho é decorativo para quem não o enxerga: a mesma informação sai
        em texto logo abaixo, que é o que o leitor de tela lê.
      -->
      <div aria-hidden="true" class="flex flex-1 flex-col justify-end">
        <div class="flex items-end gap-3" :style="{ height: `${alturaDoGrafico}px` }">
          <div
            v-for="mes in meses"
            :key="mes.competencia"
            class="flex h-full flex-1 flex-col items-center justify-end"
          >
            <span
              class="mb-1 text-center text-[10px] tabular-nums"
              :class="mes.atual ? 'font-medium text-foreground' : 'text-muted-foreground'"
            >
              {{ formatarDinheiro(mes.total) }}
            </span>
            <!--
              Barra estreita dentro da coluna larga: com três barras, `w-full`
              vira um bloco de 95px que parece uma caixa, não uma medida.
            -->
            <span
              class="w-4/5 rounded-t transition-[height]"
              :class="mes.atual ? 'bg-primary' : 'bg-primary/35'"
              :style="{ height: altura(mes.total) }"
            />
          </div>
        </div>

        <!-- Régua fina, um tom acima da superfície — a mesma do módulo. -->
        <div class="mt-1 h-px bg-border" />

        <div class="mt-1 flex gap-3">
          <span
            v-for="mes in meses"
            :key="mes.competencia"
            class="flex-1 text-center text-[10px]"
            :class="mes.atual ? 'font-medium text-foreground' : 'text-muted-foreground'"
          >
            {{ mes.rotulo }}
          </span>
        </div>
      </div>

      <p class="sr-only">
        Gasto do espaço por mês:
        <span v-for="mes in meses" :key="mes.competencia">
          {{ mes.rotuloLongo }}, {{ formatarDinheiro(mes.total) }}{{ mes.atual ? ' (mês corrente)' : '' }}.
        </span>
      </p>
    </template>
  </div>
</template>
