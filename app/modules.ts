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
import type { UsarResumo } from '~/types/resumo'

/**
 * O que o cartão do painel mostra ao lado do título.
 *
 * O padrão é `resumo`: as linhas de número do módulo, que é o que o painel
 * sempre deu. As outras duas existem porque a vitrine mudou a conta — quando o
 * visual já diz aquilo, repetir em texto é ocupar a única linha de cabeçalho com
 * a informação que a pessoa acabou de ler logo abaixo.
 *
 *   `nada`     — Filmes: cada cartaz já traz o título e a data embaixo dele.
 *   `legenda`  — Fotos: a linha vira o nome da coisa ("Nossas memórias"), porque
 *                contar quantas fotos estão liberadas não é o assunto do cartão.
 */
export type CabecalhoDoCartao =
  | { tipo: 'resumo' }
  | { tipo: 'legenda', texto: string }
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
    // A data de cada filme aparece embaixo do cartaz dele; no topo era a mesma
    // lista, duas vezes, na mesma caixa.
    cabecalho: { tipo: 'nada' },
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
  },
  {
    slug: 'livros',
    rotulo: 'Livros',
    descricao: 'Lidos, lendo e a fila de espera',
    icone: 'BookOpenIcon',
    rota: '/livros',
    ativo: false,
    naBarra: false,
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
