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
 */
export interface AppModule {
  slug: string
  rotulo: string
  descricao: string
  /** Nome do componente de ícone do @lucide/vue (auto-importado). */
  icone: string
  rota: string
  ativo: boolean
  naBarra: boolean
}

export const MODULOS: AppModule[] = [
  {
    slug: 'orcamentos',
    rotulo: 'Orçamentos',
    descricao: 'Gastos, receitas e metas — seus e do casal',
    icone: 'WalletIcon',
    rota: '/orcamentos',
    ativo: false,
    naBarra: true,
  },
  {
    slug: 'filmes',
    rotulo: 'Filmes & Séries',
    descricao: 'O que assistir, o que já vimos e quem gostou mais',
    icone: 'ClapperboardIcon',
    rota: '/filmes',
    ativo: true,
    naBarra: true,
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
