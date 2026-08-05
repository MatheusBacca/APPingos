/**
 * Tipos do banco.
 *
 * `database.generated.ts` é gerado a partir do schema real e NÃO deve ser
 * editado à mão — rode `npm run db:types` depois de qualquer migration.
 * Este arquivo reexporta o `Database` (nome que o @nuxtjs/supabase procura) e
 * acrescenta o que o gerador não consegue inferir.
 */
import type { Database as GeneratedDatabase } from './database.generated'

export type Database = GeneratedDatabase

/*
 * `papel` e `tipo` são CHECK constraints, não enums do Postgres, então o
 * gerador os entrega como `string`. As uniões abaixo espelham o SQL à mão —
 * ao mexer no CHECK de uma migration, ajuste aqui também.
 * Ver supabase/migrations/20260730120000_foundation.sql
 */
export type Papel = 'dono' | 'admin' | 'membro'
export type TipoEspaco = 'pessoal' | 'casal'

/*
 * Orçamentos — ver supabase/migrations/20260804180000_orcamento_compras.sql
 *
 * `informado_como` guarda só a unidade que a pessoa digitou, para o formulário
 * devolver igual na edição. O rateio em si é sempre o peso: guardar percentual
 * arredondado faria "R$ 500 de R$ 1.500" voltar como R$ 499,95.
 */
export type CorCategoria =
  | 'cinza' | 'marrom' | 'laranja' | 'amarelo' | 'verde'
  | 'azul' | 'roxo' | 'rosa' | 'vermelho'

export type InformadoComo = 'percentual' | 'valor'

export const CORES_CATEGORIA: CorCategoria[] = [
  'cinza', 'marrom', 'laranja', 'amarelo', 'verde',
  'azul', 'roxo', 'rosa', 'vermelho',
]

export const PAPEL_ROTULO: Record<Papel, string> = {
  dono: 'Dono',
  admin: 'Admin',
  membro: 'Membro',
}

/** Dono é admin por definição — espelha `is_space_admin` no banco. */
export function ehAdmin(papel: Papel | string | undefined | null): boolean {
  return papel === 'dono' || papel === 'admin'
}

/** Espaço + o papel do usuário atual nele. */
export interface EspacoComPapel {
  id: string
  tipo: TipoEspaco
  nome: string
  papel: Papel
}
