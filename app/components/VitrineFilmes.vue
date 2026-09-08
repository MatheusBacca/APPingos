<script setup lang="ts">
/**
 * Dois cartazes: o que a gente marcou, o que está na fila, o que já viu.
 *
 * A escolha (e o porquê da ordem) mora em `filmesDaVitrine`, testável sem subir
 * o Nuxt. Aqui fica só o desenho.
 *
 * `PosterCard` é o mesmo componente da grade do módulo — o cartaz do painel não
 * pode ter proporção nem tratamento próprios, ou o app passa a ter duas ideias
 * de como um filme se parece.
 */
import { Skeleton } from '@/components/ui/skeleton'
import { hojeIso } from '@/lib/datas'
import { ESPACO_DA_VITRINE, ESPACO_INDEFINIDO, filmesDaVitrine, quantosCabem } from '@/lib/vitrine'
import { useItens } from '~/composables/useCatalogo'

// Mesma chave de cache da tela de Filmes e do resumo em texto — a lista é
// buscada uma vez só, por mais superfícies que a desenhem.
const { data: itens, isPending } = useItens(['filme', 'serie'])

/*
 * Quantos cartazes cabem.
 *
 * A altura vem da largura da coluna porque o cartaz é 2:3 — a mesma proporção do
 * `PosterCard` da tela de Filmes —, mais o título e o ano embaixo. 150px de
 * largura mínima é onde um título de duas palavras ainda cabe sem virar três
 * linhas; 62px é o que o texto ocupa quando o título quebra em duas.
 *
 * Oito é o teto: além disso o cartão do painel vira a tela de Filmes, que já
 * existe e faz isso melhor.
 */
const RESERVA = 40
const TEXTO_DO_CARTAZ = 62

const espaco = inject(ESPACO_DA_VITRINE, computed(() => ESPACO_INDEFINIDO))

const cabem = computed(() =>
  quantosCabem(
    espaco.value,
    { largura: 150, altura: coluna => coluna * 1.5 + TEXTO_DO_CARTAZ },
    { minimo: 2, maximo: 8, colunas: 4, vao: 12, reserva: RESERVA },
  ),
)

const vitrine = computed(() => filmesDaVitrine(itens.value ?? [], hojeIso(), cabem.value.total))
</script>

<template>
  <div class="mt-3">
    <div v-if="isPending" class="grid grid-cols-2 gap-3">
      <Skeleton v-for="i in 2" :key="i" class="aspect-[2/3] w-full rounded-lg" />
    </div>

    <p v-else-if="!vitrine" class="text-sm text-muted-foreground">
      Nenhum filme na lista ainda.
    </p>

    <template v-else>
      <!--
        Sem a linha de legenda que ficava aqui: o estado da vitrine ("Na fila")
        subiu para o canto do cartão, junto do nome do módulo (ver
        `useSeloFilmes` e o `cabecalho` de Filmes em `app/modules.ts`). Uma frase
        de largura inteira logo acima dos cartazes disputava com eles a primeira
        leitura — e os cartazes é que são o assunto.
      -->

      <!--
        Colunas contadas, e não `auto-fit`: com um cartaz só, a coluna vazia é o
        que mantém o cartaz no tamanho de sempre. Esticá-lo para a largura
        inteira faria um filme parecer um banner.
      -->
      <div
        class="grid gap-3"
        :style="{ gridTemplateColumns: `repeat(${cabem.colunas}, minmax(0, 1fr))` }"
      >
        <PosterCard
          v-for="filme in vitrine.filmes"
          :key="filme.entryId"
          :titulo="filme.titulo"
          :ano="filme.ano"
          :capa-url="filme.capaUrl"
          :legenda="filme.legenda"
        />
      </div>
    </template>
  </div>
</template>
