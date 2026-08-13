/**
 * O changelog do APPingos — a única fonte de verdade das versões.
 *
 * No mesmo molde de `app/modules.ts`: um registro em TypeScript, versionado no
 * git, lido por quem precisa. A tela `/novidades` desenha a timeline daqui, e o
 * `npm run release` acrescenta a entrada nova no topo.
 *
 * POR QUE NÃO UMA TABELA NO BANCO. Foi a primeira ideia, e ela custa mais do que
 * entrega: uma tabela `app_versao` daria changelog atualizável sem deploy — só
 * que changelog descreve o que ESTE build faz, então "sem deploy" não é vantagem,
 * é incoerência (a pessoa leria sobre uma versão que o app dela não tem). Em
 * troca vinham tabela, RLS, tipos gerados, uma consulta com skeleton de carga e
 * uma tela que não abre offline. Aqui a timeline é instantânea, funciona com o
 * PWA sem rede, e o teste de `test/changelog.test.ts` alcança o conteúdo.
 *
 * A NOTIFICAÇÃO É OUTRA COISA, e é ela que precisa do banco: "chegou a versão
 * v1.000.0" é uma linha por pessoa, com estado de lida, e nasce de uma migration
 * por release (ver `supabase/migrations/*_notificacoes_versao.sql`). O título e a
 * descrição vão gravados em `dados` como snapshot — o mesmo desenho do resto do
 * motor de notificações, e o que faz o aviso continuar legível para quem só abrir
 * o app duas versões depois.
 *
 * Isso significa o mesmo texto em dois lugares (aqui e na migration do release).
 * Não é copiar à mão: `npm run release` escreve os dois de uma vez, a partir do
 * que você digitou uma vez só.
 */
import { formatarVersao } from '~/lib/notificacoes'

export interface Lancamento {
  /** `MAIOR.MENOR.CORRECAO` — sem o `v`, que é coisa de exibição. */
  versao: string
  /** O que a pessoa vê primeiro. Curto, e sobre o que ela ganhou. */
  titulo: string
  /** Uma ou duas frases. É o corpo da notificação e a linha da timeline. */
  descricao: string
  /** `YYYY-MM-DD` do dia em que a versão foi publicada. */
  data: string
}

/**
 * Do mais recente para o mais antigo — a ordem em que a timeline é lida.
 *
 * As entradas anteriores a v1.000.0 são retroativas: o projeto rodou cinco
 * semanas sem numeração, e uma timeline que começa vazia esconde tudo o que já
 * existe no app. Elas vêm de `docs/notion-changelog.md` e do histórico do git,
 * agrupadas por marco (o que a pessoa notou), não por commit. Nenhuma delas
 * gerou notificação: só o que é publicado a partir de v1.000.0 avisa.
 */
export const LANCAMENTOS: Lancamento[] = [
  {
    versao: '1.0.0',
    titulo: 'Novidades, com versão e changelog',
    descricao: 'O app passa a ter versão, e cada atualização vira um aviso na sua caixa e uma parada nesta timeline.',
    data: '2026-08-12',
  },
  {
    versao: '0.8.0',
    titulo: 'O mês em gráfico de barras',
    descricao: 'A lista de gastos do mês virou um gráfico por categoria — dá para ver para onde o dinheiro foi sem somar nada.',
    data: '2026-08-12',
  },
  {
    versao: '0.7.0',
    titulo: 'Notificações num canal só',
    descricao: 'O sino com a caixa de avisos, preferências por categoria e envio por e-mail. Em Viagens, parada desativável e mapa de um dia só.',
    data: '2026-08-11',
  },
  {
    versao: '0.6.0',
    titulo: 'Módulo de Viagens',
    descricao: 'Roteiros com as paradas do Google Maps na ordem, abrir no Maps por dia ou por seleção, roteiro-surpresa sem spoiler — e cada um escolhe como o app o chama.',
    data: '2026-08-09',
  },
  {
    versao: '0.5.0',
    titulo: 'Gastos pessoais em Orçamentos',
    descricao: 'Abas separando o que é do casal do que é de cada um, no mesmo módulo.',
    data: '2026-08-07',
  },
  {
    versao: '0.4.0',
    titulo: 'Módulo de Orçamentos',
    descricao: 'Gastos compartilhados com parcelamento e rateio, o acerto do mês, e o painel de resumos na tela inicial.',
    data: '2026-08-05',
  },
  {
    versao: '0.3.0',
    titulo: 'Filmes numa tela só',
    descricao: 'Arrastar as capas entre os grupos, o recorte "Assistindo" para série que leva dias, a agenda do mês, convite para assistir junto e o papel de admin no espaço.',
    data: '2026-08-03',
  },
  {
    versao: '0.2.0',
    titulo: 'Convite por link, e espaço que o dono pode apagar',
    descricao: 'Quem recebe o link cria a conta e já entra no espaço. E o dono pode excluir o espaço, com aviso para quem estava nele.',
    data: '2026-07-31',
  },
  {
    versao: '0.1.0',
    titulo: 'Fundação: contas, espaços e Filmes & Séries',
    descricao: 'O começo: login, espaço de casal com convite por código, e o primeiro módulo — buscar no TMDB, marcar o que assistir e dar nota.',
    data: '2026-07-30',
  },
]

/**
 * A versão que este build é.
 *
 * Sai do topo do registro, e não de `package.json` lido em runtime: no client não
 * existe `fs`, e injetar por `runtimeConfig` seria mais uma engrenagem para
 * desalinhar. O `package.json` continua sendo a versão do PACOTE, e
 * `test/changelog.test.ts` trava as duas juntas — quem esquecer de subir uma das
 * pontas quebra o `npm run verificar`, não a produção.
 */
export const VERSAO_ATUAL = LANCAMENTOS[0]!.versao

/** `v1.000.0` — a versão como ela aparece na tela. */
export const VERSAO_ATUAL_EXIBICAO = formatarVersao(VERSAO_ATUAL)

/**
 * Compara duas versões como números, não como texto.
 *
 * `'0.10.0' > '0.9.0'` é falso em ordem alfabética, e é exatamente o erro que
 * aparece na décima versão menor — longe o bastante para passar em toda revisão.
 * Devolve negativo se `a` vem antes, positivo se depois, zero se iguais.
 */
export function compararVersoes(a: string, b: string): number {
  const partes = (v: string) => v.replace(/^v/, '').split('.').map(n => Number(n) || 0)
  const [ma = 0, na = 0, ca = 0] = partes(a)
  const [mb = 0, nb = 0, cb = 0] = partes(b)
  return ma - mb || na - nb || ca - cb
}
