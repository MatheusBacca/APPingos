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
 */
import type { UsarResumo } from '~/types/resumo'

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
  },
  {
    slug: 'musicas',
    rotulo: 'Músicas',
    descricao: 'Álbuns e faixas que valem repetir',
    icone: 'MusicIcon',
    rota: '/musicas',
    ativo: false,
    naBarra: false,
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
    descricao: 'Roteiros, checklists e lugares para ir',
    icone: 'PlaneIcon',
    rota: '/viagens',
    ativo: false,
    naBarra: false,
  },
  {
    slug: 'objetivos',
    rotulo: 'Objetivos',
    descricao: 'Metas com prazo e progresso visível',
    icone: 'TargetIcon',
    rota: '/objetivos',
    ativo: false,
    naBarra: true,
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
