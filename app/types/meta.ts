/**
 * Domínio de Metas (Objetivos › Metas).
 *
 * Schema e RLS em supabase/migrations/20261112120100_metas.sql. O progresso é a
 * SOMA DOS APORTES, derivada aqui e nunca guardada — a mesma régua do
 * `SaldoDoMes`.
 */
import type { OrigemLancamento } from '~/types/planejamento'

export type EstadoMeta = 'ativa' | 'pausada' | 'cumprida' | 'abandonada'

export const ESTADOS_META: EstadoMeta[] = ['ativa', 'pausada', 'cumprida', 'abandonada']

export const ROTULO_ESTADO_META: Record<EstadoMeta, string> = {
  ativa: 'Ativa',
  pausada: 'Pausada',
  cumprida: 'Cumprida',
  abandonada: 'Abandonada',
}

export interface Meta {
  id: string
  /** A gaveta: a meta pessoal mora no pessoal, a do casal no do casal. */
  space_id: string
  criado_por: string
  titulo: string
  valor_alvo: number
  prazo: string | null
  interesse_id: string | null
  estado: EstadoMeta
  cumprida_em: string | null
  created_at: string
}

/** Positivo guarda, negativo resgata. */
export interface MetaAporte {
  id: string
  meta_id: string
  user_id: string
  valor: number
  data: string
  /** Âncora do mês da `data`, gerada no banco. */
  competencia: string
  origem: OrigemLancamento
}

/** A soma com sinal dos aportes — aporte sai, resgate volta. É o progresso de uma meta e o que a projeção do mês subtrai. */
export function somaDosAportes(aportes: ReadonlyArray<{ valor: number }> | undefined): number {
  return Math.round((aportes ?? []).reduce((t, a) => t + a.valor, 0) * 100) / 100
}

const centavos = (v: number) => Math.round(v * 100) / 100

export interface ProgressoDaMeta {
  guardado: number
  /** Quanto ainda falta; zero quando já alcançou (nunca negativo). */
  falta: number
  /** De 0 a 1 — para a barra. Passar do alvo para em 1. */
  fracao: number
  alcancada: boolean
}

/** O progresso, sempre derivado dos aportes — nenhum campo `acumulado` guardado. */
export function progressoDaMeta(
  meta: Pick<Meta, 'valor_alvo'>,
  aportes: ReadonlyArray<{ valor: number }>,
): ProgressoDaMeta {
  const guardado = somaDosAportes(aportes)
  const alvo = Number(meta.valor_alvo)
  return {
    guardado,
    falta: centavos(Math.max(alvo - guardado, 0)),
    fracao: alvo > 0 ? Math.min(Math.max(guardado / alvo, 0), 1) : 0,
    alcancada: guardado >= alvo,
  }
}

export interface AporteSugerido {
  /** Quanto guardar por mês para chegar ao alvo no prazo. */
  porMes: number
  /** Em quantos meses: contando o atual, ou a partir do próximo quando este mês já recebeu aporte. */
  meses: number
  /**
   * `false` quando o mês atual já teve aporte: o ritmo passa a contar do mês que
   * vem, senão o que já foi guardado agora "dilui" a sugestão e ela não basta.
   */
  contaEsteMes: boolean
  /** O prazo já passou: o que falta é para agora. */
  vencido: boolean
}

/**
 * Quanto guardar por mês até o prazo: o que falta dividido pelos meses que sobram,
 * CONTANDO o mês atual — quem abre a meta em 12 de novembro com prazo em junho
 * ainda pode guardar em novembro, e são oito meses (nov a jun), não sete.
 *
 * Exceção: se o mês atual JÁ recebeu aporte (`guardadoNoMes > 0`), ele está feito e
 * a divisão é pelos meses seguintes. Sem isso, guardar R$ 1.000 em novembro numa
 * meta de R$ 12.000 até outubro baixaria a sugestão para R$ 916,67 em 12 meses — e
 * seguir a sugestão de dezembro em diante deixaria a meta ~R$ 917 abaixo do alvo.
 *
 * `null` quando não há o que sugerir: sem prazo, ou com o alvo já alcançado.
 * Prazo vencido devolve o que falta inteiro, num mês só, com `vencido` — a tela diz
 * isso em vez de dividir por zero ou por um número negativo de meses.
 *
 * `hoje` é parâmetro, e não `new Date()` dentro, pelo mesmo motivo de
 * `tempoRelativo`: sem ele a função não se testa sem congelar o relógio.
 */
export function aporteMensalSugerido(
  meta: Pick<Meta, 'valor_alvo' | 'prazo'>,
  guardado: number,
  hoje: string,
  guardadoNoMes = 0,
): AporteSugerido | null {
  if (!meta.prazo) return null

  const falta = centavos(Number(meta.valor_alvo) - guardado)
  if (falta <= 0) return null

  const [anoH, mesH] = hoje.split('-').map(Number)
  const [anoP, mesP] = meta.prazo.split('-').map(Number)
  const meses = (anoP! - anoH!) * 12 + (mesP! - mesH!) + 1

  if (meses <= 0 || meta.prazo < hoje) return { porMes: falta, meses: 1, vencido: true, contaEsteMes: true }

  // Último mês do prazo: o que falta é para agora, haja aporte neste mês ou não.
  const contaEsteMes = meses === 1 || guardadoNoMes <= 0
  const divisor = contaEsteMes ? meses : meses - 1

  // Arredonda para CIMA no centavo: guardar o sugerido todo mês precisa bastar.
  return { porMes: Math.ceil((falta / divisor) * 100) / 100, meses: divisor, vencido: false, contaEsteMes }
}

/** "Ana R$ 800 · Bia R$ 1.200" — quanto cada um guardou, já com os resgates. */
export function guardadoPorPessoa(aportes: ReadonlyArray<Pick<MetaAporte, 'user_id' | 'valor'>>): Map<string, number> {
  const porPessoa = new Map<string, number>()
  for (const a of aportes) porPessoa.set(a.user_id, centavos((porPessoa.get(a.user_id) ?? 0) + a.valor))
  return porPessoa
}
