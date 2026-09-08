/**
 * Registro de módulos — a única fonte de verdade da navegação.
 *
 * Adicionar um módulo ao APPingos é acrescentar uma entrada aqui e criar a
 * página correspondente. A sidebar, a bottom bar e o dashboard leem daqui;
 * nenhum deles tem lista própria.
 *
 * `naBarra` controla quais aparecem na bottom bar do mobile — cabem 5 no
 * máximo antes de virar um alvo de toque pequeno demais. O resto vive no
 * "Mais".
 *
 * `resumo` é o painel: o módulo registra aqui o composable que devolve as suas
 * linhas de resumo, e o dashboard e a sidebar desenham as mesmas linhas. Ficou
 * aqui, e não numa lista própria do painel, para a promessa acima continuar
 * valendo — um lugar só a editar quando um módulo entra ou muda de nome.
 *
 * `vitrine` é a mesma ideia, um andar acima: o pedaço VISUAL do cartão do
 * dashboard (as barras do mês, os cartazes, o mapa). Fica no mesmo registro pelo
 * mesmo motivo — e é `defineAsyncComponent` porque este arquivo é lido pela
 * sidebar e pela bottom bar em toda página. Import estático traria o mapa, o
 * carrossel e os gráficos para o bundle de quem só abriu a tela de Filmes.
 */
import { defineAsyncComponent } from 'vue'
import type { Component } from 'vue'
import type { UsarResumo, UsarSelo } from '~/types/resumo'
/*
 * Os composables entram por import explícito, e não pelo auto-import.
 *
 * É a regra de `scripts/verificar-imports.mjs`, e este arquivo é o pior lugar
 * possível para desobedecê-la: ele é lido pela sidebar e pela bottom bar em
 * TODA página, então um registro de auto-import remontado no meio de um
 * transform do Vite derrubaria o app inteiro no boot — o incidente de
 * 05/08/2026, de novo. O verificador não pegava isto porque aqui os composables
 * são passados como referência, e ele só enxerga chamada.
 */
import { useResumoOrcamentos } from '~/composables/useResumoOrcamentos'
import { useResumoFilmes, useSeloFilmes } from '~/composables/useResumoFilmes'
import { useResumoFotos } from '~/composables/useResumoFotos'
import { useResumoMusicas } from '~/composables/useResumoMusicas'
import { useResumoLivros, useSeloLivros } from '~/composables/useResumoLivros'
import { useResumoViagens } from '~/composables/useResumoViagens'
import { useResumoInteresses } from '~/composables/useResumoInteresses'
import { useResumoPins } from '~/composables/useResumoPins'

/**
 * O que o cartão do painel mostra ao lado do título.
 *
 * O padrão é `resumo`: as linhas de número do módulo, que é o que o painel
 * sempre deu. As outras existem porque a vitrine mudou a conta — quando o visual
 * já diz aquilo, repetir em texto é ocupar a única linha de cabeçalho com a
 * informação que a pessoa acabou de ler logo abaixo.
 *
 *   `nada`     — o canto fica vazio de propósito.
 *   `legenda`  — texto fixo: Fotos vira o nome da coisa ("Nossas memórias"),
 *                Músicas vira o convite ("Bora ouvir"). Nos dois casos contar
 *                quantidade não é o assunto do cartão.
 *   `selo`     — uma palavra que MUDA: o estado dos filmes em cena, a
 *                porcentagem da meta de leitura. É o que substituiu as linhas
 *                de legenda que a vitrine escrevia dentro do próprio corpo, e
 *                que competiam com o visual logo abaixo delas.
 *
 * `selo` é o único que vale também para módulo SEM vitrine — é como Livros, que
 * é só resumo em texto, ganha a porcentagem no canto.
 */
export type CabecalhoDoCartao =
  | { tipo: 'resumo' }
  | { tipo: 'legenda', texto: string }
  | { tipo: 'selo', usar: UsarSelo }
  | { tipo: 'nada' }

export interface AppModule {
  slug: string
  rotulo: string
  descricao: string
  /** Nome do componente de ícone do @lucide/vue (auto-importado). */
  icone: string
  rota: string
  ativo: boolean
  naBarra: boolean
  /** Sem isto o módulo simplesmente não aparece no painel de resumos. */
  resumo?: UsarResumo
  /** O visual do cartão no dashboard. Só o dashboard desenha; a sidebar, não. */
  vitrine?: Component
  /** Ausente = `resumo`, que é o comportamento de sempre. */
  cabecalho?: CabecalhoDoCartao
}

export const MODULOS: AppModule[] = [
  {
    slug: 'orcamentos',
    rotulo: 'Orçamentos',
    descricao: 'Gastos, receitas e metas — seus e do casal',
    icone: 'WalletIcon',
    rota: '/orcamentos',
    ativo: true,
    naBarra: true,
    resumo: useResumoOrcamentos,
    vitrine: defineAsyncComponent(() => import('~/components/VitrineOrcamentos.vue')),
  },
  {
    slug: 'filmes',
    rotulo: 'Filmes & Séries',
    descricao: 'O que assistir, o que já vimos e quem gostou mais',
    icone: 'ClapperboardIcon',
    rota: '/filmes',
    ativo: true,
    naBarra: true,
    resumo: useResumoFilmes,
    vitrine: defineAsyncComponent(() => import('~/components/VitrineFilmes.vue')),
    // O canto diz em que pé a vitrine está ("Na fila"), e nada mais: a data de
    // cada filme já aparece embaixo do cartaz dele, e a frase que a vitrine
    // escrevia no corpo ("Na fila, ainda sem data") competia com os cartazes
    // logo abaixo dela.
    cabecalho: { tipo: 'selo', usar: useSeloFilmes },
  },
  {
    slug: 'fotos',
    rotulo: 'Fotos',
    descricao: 'O que os dois curtiram e já pode ser postado',
    icone: 'ImageIcon',
    rota: '/fotos',
    ativo: true,
    // Fora da barra pelo mesmo motivo de Objetivos: os três slots são de
    // Orçamentos, Filmes e Viagens, e a grade não comporta um quarto sem virar
    // alvo de toque pequeno demais. Vive no "Mais".
    naBarra: false,
    resumo: useResumoFotos,
    vitrine: defineAsyncComponent(() => import('~/components/VitrineFotos.vue')),
    cabecalho: { tipo: 'legenda', texto: 'Nossas memórias ❤️' },
  },
  {
    slug: 'musicas',
    rotulo: 'Músicas',
    descricao: 'Álbuns e faixas que valem repetir',
    icone: 'MusicIcon',
    rota: '/musicas',
    ativo: true,
    // Fora da barra pelo mesmo motivo de Fotos e Objetivos: os três slots são
    // de Orçamentos, Filmes e Viagens. Vive no "Mais".
    naBarra: false,
    resumo: useResumoMusicas,
    vitrine: defineAsyncComponent(() => import('~/components/VitrineMusicas.vue')),
    // O convite no canto, e o corpo só com a faixa. A legenda que ficava ali
    // ("Ana está ouvindo agora", "A última que entrou na lista") explicava a
    // procedência do dado — informação de bastidor, num cartão cujo assunto é a
    // música. O ponto pulsando continua dizendo o que é ao vivo.
    cabecalho: { tipo: 'legenda', texto: 'Bora ouvir' },
  },
  {
    slug: 'livros',
    rotulo: 'Livros',
    descricao: 'Lidos, lendo e a fila de espera',
    icone: 'BookOpenIcon',
    rota: '/livros',
    ativo: true,
    naBarra: false,
    resumo: useResumoLivros,
    // Livros não tem vitrine: o cartão É as linhas de resumo. O canto ganha a
    // porcentagem da meta do ano, que é o número que se olha de relance — as
    // linhas embaixo continuam com o contexto ("faltam 3 livros").
    cabecalho: { tipo: 'selo', usar: useSeloLivros },
  },
  {
    slug: 'viagens',
    rotulo: 'Viagens',
    descricao: 'Roteiros com as paradas na ordem, prontos para o Maps',
    icone: 'PlaneIcon',
    rota: '/viagens',
    ativo: true,
    naBarra: true,
    resumo: useResumoViagens,
    vitrine: defineAsyncComponent(() => import('~/components/VitrineViagens.vue')),
  },
  {
    slug: 'objetivos',
    rotulo: 'Objetivos',
    // A descrição fala de Interesses porque é a única aba que existe hoje.
    // Prometer "metas com prazo" na sidebar, como antes, mandaria a pessoa para
    // uma tela que não entrega isso. Volta a mencionar metas quando elas nascerem.
    descricao: 'Interesses de hoje — e metas com prazo em breve',
    icone: 'TargetIcon',
    rota: '/objetivos',
    ativo: true,
    // Fora da barra mesmo estando ativo: a grade tem 5 células (Início + três
    // módulos + Mais), e os três slots são de Orçamentos, Filmes e Viagens.
    // Objetivos entrou por uma aba, não pelo que dá nome a ele — tomar o lugar
    // de um módulo inteiro seria desproporcional. Vive no "Mais".
    naBarra: false,
    resumo: useResumoInteresses,
    vitrine: defineAsyncComponent(() => import('~/components/VitrineObjetivos.vue')),
  },
  {
    slug: 'pins',
    rotulo: 'Pins',
    descricao: 'A moeda do app — o que rende, e quanto cada um já fez',
    icone: 'SparklesIcon',
    rota: '/pins',
    ativo: true,
    // Fora da barra, e não por falta de espaço: Pins ATRAVESSA os módulos —
    // rende em Orçamentos, em Filmes, em Fotos, em Viagens. Tomar um dos cinco
    // slots de um módulo que é um assunto seria dar a ele o peso errado. Vive no
    // "Mais", e aparece de fato no cartão do painel.
    naBarra: false,
    resumo: useResumoPins,
    vitrine: defineAsyncComponent(() => import('~/components/VitrinePins.vue')),
    // As barras do placar já trazem nome e número dos dois; repetir "Seus Pins:
    // 340" no cabeçalho seria dizer no topo o que a pessoa lê logo abaixo. As
    // linhas de resumo continuam existindo — é o que a sidebar desenha, e lá não
    // há vitrine. Mesma escolha de Filmes.
    cabecalho: { tipo: 'nada' },
  },
  {
    slug: 'treinos',
    rotulo: 'Treinos',
    descricao: 'Sessões, cargas e constância',
    icone: 'DumbbellIcon',
    rota: '/treinos',
    ativo: false,
    naBarra: false,
  },
]

export const MODULOS_ATIVOS = MODULOS.filter(m => m.ativo)

export const MODULOS_COM_RESUMO = MODULOS.filter(m => m.resumo)

/**
 * A ordem em que os módulos aparecem para quem usa: os prontos primeiro.
 *
 * O array acima é o registro, e a ordem dele é a de quem construiu — filmes
 * antes de músicas porque foi assim que nasceram. Quem abre o app não tem nada
 * a ver com isso: rolar por três "em breve" para chegar em Viagens é atrito por
 * história do projeto.
 *
 * É ordenação derivada, e não o array reordenado à mão, porque assim ativar um
 * módulo já o coloca no lugar certo — não há um segundo passo para alguém
 * esquecer. `sort` do JS é estável, então dentro de cada grupo a ordem de
 * registro se mantém.
 */
export const MODULOS_ORDENADOS = [...MODULOS].sort(
  (a, b) => Number(b.ativo) - Number(a.ativo),
)
