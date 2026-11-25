/**
 * As duas projeções do mês — "Meu mês" e o mês do casal — com tudo o que as
 * compõe.
 *
 * Mora aqui, e não dentro da página do Planejamento, porque o painel de
 * Orçamentos mostra os mesmos números num cartão: duas cópias da conta seriam
 * duas chances de o painel e a tela a que ele leva discordarem por um centavo.
 * As regras de cada projeção continuam em `~/types/planejamento`; isto só junta
 * as consultas de que elas precisam.
 *
 * As duas leem gavetas diferentes ao mesmo tempo — o pessoal e o compartilhado —
 * e não se somam (ver `projecaoPessoal`).
 */
import type { MaybeRefOrGetter } from 'vue'
import { totalDoMes } from '~/types/orcamento'
import { somaDosAportes } from '~/types/meta'
import { projecaoDoCasal, projecaoPessoal, rendaDaCompetencia, valorCentral, valorDaContribuicao } from '~/types/planejamento'
import { useGastosPessoais } from '~/composables/useGastosPessoais'
import { useAportesDoMes } from '~/composables/useMetas'
import { useComprasDoMes } from '~/composables/useOrcamento'
import { useContribuicoesDoEspaco, useMinhasContribuicoes } from '~/composables/usePlanejamento'
import { useHistoricoDaRenda, useMinhaRenda } from '~/composables/useRenda'
import { useSpaceStore } from '~/stores/space'

export function useProjecoesDoMes(competencia: MaybeRefOrGetter<string>) {
  const store = useSpaceStore()
  const { espacoPessoalId } = useGastosPessoais()

  /** O espaço do casal, quando o ativo é compartilhado; `null` desliga as consultas dele. */
  const espacoCasal = computed(() =>
    store.espacoAtivo && store.espacoAtivo.tipo !== 'pessoal' ? store.espacoAtivo.id : null,
  )

  // ---- A pessoa -----------------------------------------------------------------

  const rendaAtual = useMinhaRenda()
  const historicoDaRenda = useHistoricoDaRenda()
  const minhasContribuicoes = useMinhasContribuicoes()

  const { data: comprasPessoais, isPending: carregandoPessoais } = useComprasDoMes(competencia, espacoPessoalId)
  const { data: aportesPessoais } = useAportesDoMes(espacoPessoalId, competencia)

  /*
   * O salário que valia no mês: ajustar vale dali em diante, então um mês que já
   * passou usa a versão de antes do ajuste (`renda_historico`).
   */
  const rendaDoMes = computed(() =>
    rendaDaCompetencia(rendaAtual.data.value ?? null, historicoDaRenda.data.value ?? [], toValue(competencia)),
  )

  const salario = computed(() => rendaDoMes.value?.valor_liquido ?? null)

  /**
   * O que sai do salário para os espaços compartilhados — todos eles, e não só o
   * ativo: quem contribui com o casal e com a família tem as duas saídas no mês,
   * qualquer que seja o espaço aberto na tela.
   */
  const contribuicoesEmReais = computed(() =>
    (minhasContribuicoes.data.value ?? []).map(c => ({
      space_id: c.space_id,
      valor: valorDaContribuicao(c, salario.value),
    })),
  )

  const meuMes = computed(() => projecaoPessoal({
    salario: salario.value,
    contribuicoes: contribuicoesEmReais.value.map(c => c.valor),
    gastosPessoais: totalDoMes(comprasPessoais.value ?? []),
    aportesPessoais: somaDosAportes(aportesPessoais.value),
  }))

  const carregandoMeuMes = computed(() => rendaAtual.isPending.value || carregandoPessoais.value)

  // ---- O casal ------------------------------------------------------------------

  const { data: comprasDoCasal } = useComprasDoMes(competencia, espacoCasal)
  const { data: aportesDoCasal } = useAportesDoMes(espacoCasal, competencia)
  const { data: contribuicoes, isPending: carregandoContribuicoes } = useContribuicoesDoEspaco(espacoCasal)

  const mesDoCasal = computed(() => projecaoDoCasal({
    valorCentral: valorCentral(contribuicoes.value ?? []),
    parcelas: totalDoMes(comprasDoCasal.value ?? []),
    aportes: somaDosAportes(aportesDoCasal.value),
  }))

  return {
    espacoPessoalId,
    espacoCasal,
    rendaAtual,
    minhasContribuicoes,
    rendaDoMes,
    salario,
    contribuicoesEmReais,
    meuMes,
    carregandoMeuMes,
    contribuicoes,
    carregandoContribuicoes,
    mesDoCasal,
    /** Os aportes do mês nas metas do casal, de todo mundo — o painel filtra os seus. */
    aportesDoCasal,
    // As linhas que compõem o realizado de cada projeção — o painel as reparte por semana.
    comprasPessoais,
    aportesPessoais,
    comprasDoCasal,
  }
}
