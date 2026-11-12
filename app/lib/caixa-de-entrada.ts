/**
 * A caixa de entrada do extrato — o que a tela decide sem falar com o banco.
 *
 * Fase 5 de docs/notion-plano-open-finance.md ("lançar vira classificar"), sobre o
 * contrato com a Frente A (docs/contrato-planejamento-open-finance.md): o salário
 * casa por `dataPrevistaDoSalario`, o 50/50 é `rateioIgual` e o aviso de mês já
 * acertado é `competenciasAcertadas`. As RPCs que gravam estão em
 * supabase/migrations/20261112140000_open_finance_caixa_de_entrada.sql.
 */
import { formatarMes } from '~/lib/datas'
import { diasEntre } from '~/lib/contas-bancarias'
import { agruparParcelas, competenciaDe, planoDaCompra, somarMesesCompetencia } from '~/lib/importacao-bancaria'
import type { MotivoExclusao, PlanoDaCompra, Sentido, TransacaoNormalizada } from '~/lib/importacao-bancaria'
import { dataPrevistaDoSalario } from '~/lib/salario'
import type { RecebimentoTipo } from '~/lib/salario'
import { competenciasAcertadas, rateioIgual } from '~/types/orcamento'
import type { Participante } from '~/types/orcamento'

/** Uma linha de `transacao_bancaria` como a caixa de entrada a lê. */
export interface TransacaoDaCaixa {
  id: string
  conta_id: string
  provider_id: string
  pluggy_id: string
  descricao: string
  valor: number
  sentido: Sentido
  data: string
  competencia: string
  pendente: boolean
  parcela_numero: number | null
  parcelas_total: number | null
  valor_total_compra: number | null
  data_compra: string | null
  fatura_id: string | null
  chave_compra: string | null
  contraparte_nome: string | null
  contraparte_documento: string | null
  metodo: string | null
  categoria_pluggy: string | null
  motivo_exclusao: MotivoExclusao | null
  destino: 'compra' | 'ignorada' | 'renda' | 'aporte' | null
  compra_id: string | null
  classificada_em: string | null
}

/** Os destinos que abrem o diálogo de classificação (Ignorar é um toque só). */
export type ModoClassificacao = 'casal' | 'pessoal' | 'ja-lancei' | 'salario' | 'meta'

/** O que a caixa mostra numa linha: uma transação, ou as parcelas de uma compra. */
export interface ItemDaCaixa {
  chave: string
  /** A transação que vai como `p_transacao`: a menor parcela já lançada. */
  principal: TransacaoDaCaixa
  transacoes: TransacaoDaCaixa[]
  /** A compra que o item vira — com o recuo da competência, se for parcela. */
  plano: PlanoDaCompra
  sentido: Sentido
  /** Todas pendentes: espera o banco lançar antes de deixar classificar. */
  pendente: boolean
  /** A data mais recente do item — é por ela que a caixa ordena. */
  data: string
}

/** A linha do banco no formato das regras de `_shared/importacao-bancaria.ts`. */
function comoNormalizada(t: TransacaoDaCaixa): TransacaoNormalizada & { id: string } {
  return {
    id: t.id,
    pluggy_id: t.pluggy_id,
    provider_id: t.provider_id,
    conta_pluggy_id: t.conta_id,
    descricao: t.descricao,
    valor: Number(t.valor),
    sentido: t.sentido,
    data: t.data,
    competencia: t.competencia,
    pendente: t.pendente,
    parcela_numero: t.parcela_numero,
    parcelas_total: t.parcelas_total,
    valor_total_compra: t.valor_total_compra == null ? null : Number(t.valor_total_compra),
    data_compra: t.data_compra,
    fatura_id: t.fatura_id,
    contraparte_nome: t.contraparte_nome,
    contraparte_documento: t.contraparte_documento,
    metodo: t.metodo,
    categoria_pluggy: t.categoria_pluggy,
    chave_compra: t.chave_compra,
    motivo_exclusao: t.motivo_exclusao,
  }
}

/**
 * As transações da caixa, com as parcelas de uma mesma compra numa linha só
 * (decisão nº 1 de Orçamentos), das mais novas para as mais velhas.
 */
export function itensDaCaixa(transacoes: TransacaoDaCaixa[]): ItemDaCaixa[] {
  const porId = new Map(transacoes.map(t => [t.id, t]))
  const { compras, avulsas } = agruparParcelas(transacoes.map(comoNormalizada))

  const item = (chave: string, grupo: TransacaoDaCaixa[], plano: PlanoDaCompra): ItemDaCaixa => {
    const lancadas = grupo.filter(t => !t.pendente)
    return {
      chave,
      principal: lancadas[0] ?? grupo[0]!,
      transacoes: grupo,
      plano,
      sentido: grupo[0]!.sentido,
      pendente: lancadas.length === 0,
      data: grupo.map(t => t.data).sort().at(-1)!,
    }
  }

  return [
    ...compras.map((c) => {
      const grupo = c.transacoes.map(t => porId.get((t as TransacaoNormalizada & { id: string }).id)!)
      return item(c.chave, grupo, c.plano)
    }),
    ...avulsas.map((t) => {
      const original = porId.get((t as TransacaoNormalizada & { id: string }).id)!
      return item(original.id, [original], planoDaCompra(t))
    }),
  ].sort((a, b) => b.data.localeCompare(a.data))
}

// ---------------------------------------------------------------------------
// Já lancei
// ---------------------------------------------------------------------------

export interface CompraCandidata {
  id: string
  space_id: string
  descricao: string
  valor_total: number
  data_compra: string
}

/** Quantos dias de diferença entre o lançamento manual e o extrato ainda contam. */
export const JANELA_JA_LANCEI_DIAS = 7

/**
 * As compras lançadas à mão que podem ser esta transação: mesmo valor total e
 * data perto, da mais próxima para a mais longe. É sugestão — a pessoa escolhe.
 */
export function candidatasJaLancei(
  plano: Pick<PlanoDaCompra, 'valor_total' | 'data_compra'>,
  compras: CompraCandidata[],
  janelaDias = JANELA_JA_LANCEI_DIAS,
): CompraCandidata[] {
  return compras
    .filter(c => Math.abs(Number(c.valor_total) - plano.valor_total) < 0.005)
    .map(c => ({ c, distancia: Math.abs(diasEntre(plano.data_compra, c.data_compra)) }))
    .filter(({ distancia }) => distancia <= janelaDias)
    .sort((a, b) => a.distancia - b.distancia)
    .map(({ c }) => c)
}

// ---------------------------------------------------------------------------
// Receita → salário recebido
// ---------------------------------------------------------------------------

/**
 * De que competência é o salário que caiu nesta data.
 *
 * Compara com a data prevista do mês do crédito e do mês SEGUINTE e fica com a
 * mais perto: "até o 5º dia útil" de dezembro pode cair em 30/11 (empresa que
 * adianta), e aí o salário é de dezembro, não um segundo salário de novembro.
 * Sem salário cadastrado, é o mês do crédito.
 */
export function competenciaDoSalario(
  data: string,
  renda: { recebimento_tipo: RecebimentoTipo, recebimento_dia: number } | null,
): string {
  const doMes = competenciaDe(data)
  if (!renda) return doMes

  const candidatas = [doMes, somarMesesCompetencia(doMes, 1), somarMesesCompetencia(doMes, -1)]
  return candidatas
    .map(c => ({
      c,
      distancia: Math.abs(diasEntre(data, dataPrevistaDoSalario(c, renda.recebimento_tipo, renda.recebimento_dia))),
    }))
    .sort((a, b) => a.distancia - b.distancia)[0]!.c
}

// ---------------------------------------------------------------------------
// Compartilhada — o rateio e o aviso
// ---------------------------------------------------------------------------

/** As três divisões que a caixa oferece; qualquer outra se edita depois, na compra. */
export type DivisaoRapida = 'igual' | 'so-eu' | 'so-outro'

/**
 * O rateio de uma divisão rápida. "Só o outro" é pagar uma conta em nome dele
 * (o plano: `pago_por` = você e ele o único participante), e entra no acerto.
 */
export function participantesDaDivisao(divisao: DivisaoRapida, eu: string, membrosIds: string[]): Participante[] {
  const outros = membrosIds.filter(id => id !== eu)
  if (divisao === 'so-eu' || (divisao === 'so-outro' && !outros.length)) return rateioIgual([eu])
  if (divisao === 'so-outro') return rateioIgual(outros)
  return rateioIgual(membrosIds.includes(eu) ? membrosIds : [eu, ...membrosIds])
}

/**
 * "Isso muda o saldo de um mês já acertado" — a importação com recuo de
 * parcelas cai em mês fechado com frequência (a parcela 3 de 10 traz as duas
 * anteriores). Aviso, não trava: decisão 7 de 12/11/2026.
 */
export function avisoDeMesAcertado(
  plano: Pick<PlanoDaCompra, 'competencia_inicial' | 'parcelas'>,
  acertos: ReadonlyArray<{ competencia: string }>,
): string | null {
  const meses = competenciasAcertadas(plano, acertos)
  if (!meses.length) return null

  const nomes = meses.map(m => formatarMes(m))
  const lista = nomes.length === 1
    ? nomes[0]
    : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`
  return meses.length === 1
    ? `Isso muda o saldo de ${lista}, que já foi acertado.`
    : `Isso muda o saldo de ${lista}, que já foram acertados.`
}
