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
