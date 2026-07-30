/**
 * Tipos do banco.
 *
 * Escritos à mão para casar com supabase/migrations. Depois do primeiro
 * `db push`, o comando abaixo passa a ser a fonte da verdade — rode-o sempre
 * que uma migration mexer no schema:
 *
 *   npm run db:types
 */

export type Papel = 'dono' | 'membro'
export type TipoEspaco = 'pessoal' | 'casal'

export interface Database {
  public: {
    Tables: {
      profile: {
        Row: { id: string, nome: string, avatar_url: string | null, created_at: string }
        Insert: { id: string, nome: string, avatar_url?: string | null }
        Update: { nome?: string, avatar_url?: string | null }
        Relationships: []
      }
      space: {
        Row: { id: string, tipo: TipoEspaco, nome: string, created_at: string }
        Insert: { id?: string, tipo: TipoEspaco, nome: string }
        Update: { nome?: string, tipo?: TipoEspaco }
        Relationships: []
      }
      membership: {
        Row: { space_id: string, user_id: string, papel: Papel, created_at: string }
        Insert: { space_id: string, user_id: string, papel?: Papel }
        Update: { papel?: Papel }
        Relationships: []
      }
      space_invite: {
        Row: {
          id: string
          space_id: string
          codigo: string
          criado_por: string
          expira_em: string
          usado_em: string | null
          usado_por: string | null
          created_at: string
        }
        Insert: { space_id: string, codigo: string, criado_por: string, expira_em?: string }
        Update: { usado_em?: string | null, usado_por?: string | null }
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: {
      create_space: { Args: { p_nome: string, p_tipo?: TipoEspaco }, Returns: string }
      criar_convite: { Args: { p_space: string }, Returns: string }
      resgatar_convite: { Args: { p_codigo: string }, Returns: string }
      is_space_member: { Args: { p_space: string }, Returns: boolean }
      is_space_owner: { Args: { p_space: string }, Returns: boolean }
      shares_space_with: { Args: { p_user: string }, Returns: boolean }
    }
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}

/** Espaço + o papel do usuário atual nele. */
export interface EspacoComPapel {
  id: string
  tipo: TipoEspaco
  nome: string
  papel: Papel
}
