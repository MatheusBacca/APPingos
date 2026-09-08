/**
 * O contrato do resumo de um módulo — dado, não componente.
 *
 * O painel aparece em superfícies com formatos bem diferentes (o cartão do
 * dashboard, o canto do cartão que tem vitrine, o bloco da sidebar), e a regra
 * que vale para todas é que o CONTEÚDO seja definido uma vez só. Por isso o
 * módulo registra um composable que devolve linhas prontas, e não um
 * componente: as superfícies desenham as mesmas linhas do jeito delas, e não há
 * como uma passar a dizer uma coisa e a outra, outra.
 *
 * Formatar aqui (dinheiro, data) é de propósito — a superfície não deveria
 * precisar saber que "R$" existe para conseguir mostrar um resumo.
 */
import type { ComputedRef } from 'vue'

/**
 * Vermelho = dinheiro contra você. Verde = dinheiro a favor.
 *
 * Não é a convenção de mercado (onde verde é alta), e é de propósito: aqui a
 * métrica é gasto e dívida, não rendimento. O módulo de Orçamentos já usa as
 * duas cores em dois lugares (o saldo e a variação da tabela) sob essa mesma
 * regra; fixá-la aqui é o que impede o próximo módulo de inventar a sua.
 *
 * A cor nunca carrega o sentido sozinha — falharia para daltonismo e em
 * impressão. Toda linha com tom traz a palavra junto ("Você deve", "A receber").
 */
export type TomResumo = 'contra' | 'favor' | 'neutro'

export const CLASSE_TOM: Record<TomResumo, string> = {
  contra: 'text-destructive',
  favor: 'text-emerald-600 dark:text-emerald-400',
  neutro: '',
}

export interface LinhaResumo {
  /** Estável entre atualizações — é a `key` da lista. */
  chave: string
  /** O que é: "Você deve", ou o título do filme. */
  rotulo: string
  /** O número ou a data, alinhado à direita e já formatado. */
  valor?: string
  /**
   * O que o valor quer dizer, por extenso — "você deve", "a receber". Fica em
   * `sr-only`: no visual quem diz isso é o sinal e a cor, mas nenhum dos dois
   * chega a quem usa leitor de tela.
   */
  valorDescrito?: string
  /** Contexto curto e discreto: "Julho, fechado", "Convite de Ana". */
  nota?: string
  tom?: TomResumo
  /** Linha que espera resposta (um convite) vale mais que a que só informa. */
  destaque?: boolean
}

/**
 * O que um módulo registra em `app/modules.ts`. Chamado no setup do painel.
 *
 * Lista vazia significa "este módulo não tem nada a dizer agora" — a superfície
 * some com o bloco em vez de desenhar uma caixa vazia. Carregando também chega
 * vazio, de propósito: nas duas superfícies o estado de carregamento e o de
 * "nada a dizer" se parecem, e distingui-los só renderia um esqueleto piscando
 * a cada troca de tela.
 */
export type UsarResumo = () => ComputedRef<LinhaResumo[]>

/** Três linhas é o teto do "de relance" — além disso vira uma tela pequena. */
export const MAX_LINHAS = 3

/**
 * O selo do canto do cartão do painel: uma palavra que muda — "Na fila", "42%".
 *
 * Irmão de `UsarResumo`, e mora aqui pelo mesmo motivo, mais um: `app/modules.ts`
 * importa os composables que o produzem, então declarar o contrato lá dentro
 * faria cada composable importar de volta o arquivo que o importa. Tipo é
 * apagado na compilação e o ciclo não existiria em runtime, mas um ciclo que só
 * não morde por causa disso é um ciclo esperando a primeira constante ser
 * movida para o lado errado.
 *
 * `null` = nada a dizer, e o canto fica vazio. Nunca um traço: um cartão sem
 * selo não é um cartão com selo vazio.
 */
export type UsarSelo = () => ComputedRef<string | null>
