export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      categoria: {
        Row: {
          cor: string
          created_at: string
          id: string
          nome: string
          nome_norm: string | null
          space_id: string
        }
        Insert: {
          cor?: string
          created_at?: string
          id?: string
          nome: string
          nome_norm?: string | null
          space_id: string
        }
        Update: {
          cor?: string
          created_at?: string
          id?: string
          nome?: string
          nome_norm?: string | null
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categoria_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "space"
            referencedColumns: ["id"]
          },
        ]
      }
      collection: {
        Row: {
          created_at: string
          icone: string | null
          id: string
          nome: string
          space_id: string
        }
        Insert: {
          created_at?: string
          icone?: string | null
          id?: string
          nome: string
          space_id: string
        }
        Update: {
          created_at?: string
          icone?: string | null
          id?: string
          nome?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "space"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_item: {
        Row: {
          collection_id: string
          created_at: string
          entry_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          entry_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_item_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_item_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entry"
            referencedColumns: ["id"]
          },
        ]
      }
      compra: {
        Row: {
          categoria_id: string | null
          competencia_inicial: string
          created_at: string
          data_compra: string
          descricao: string
          id: string
          pago_por: string
          parcelas: number
          registrado_por: string
          space_id: string
          valor_total: number
        }
        Insert: {
          categoria_id?: string | null
          competencia_inicial: string
          created_at?: string
          data_compra?: string
          descricao: string
          id?: string
          pago_por: string
          parcelas?: number
          registrado_por: string
          space_id: string
          valor_total: number
        }
        Update: {
          categoria_id?: string | null
          competencia_inicial?: string
          created_at?: string
          data_compra?: string
          descricao?: string
          id?: string
          pago_por?: string
          parcelas?: number
          registrado_por?: string
          space_id?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "compra_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "space"
            referencedColumns: ["id"]
          },
        ]
      }
      compra_participante: {
        Row: {
          compra_id: string
          informado_como: string
          peso: number
          user_id: string
        }
        Insert: {
          compra_id: string
          informado_como?: string
          peso: number
          user_id: string
        }
        Update: {
          compra_id?: string
          informado_como?: string
          peso?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compra_participante_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_participante_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "parcela_mensal"
            referencedColumns: ["compra_id"]
          },
        ]
      }
      convite_filme: {
        Row: {
          aceito: boolean | null
          created_at: string
          data_proposta: string
          de_user_id: string
          entry_id: string
          id: string
          para_user_id: string
          respondido_em: string | null
        }
        Insert: {
          aceito?: boolean | null
          created_at?: string
          data_proposta: string
          de_user_id: string
          entry_id: string
          id?: string
          para_user_id: string
          respondido_em?: string | null
        }
        Update: {
          aceito?: boolean | null
          created_at?: string
          data_proposta?: string
          de_user_id?: string
          entry_id?: string
          id?: string
          para_user_id?: string
          respondido_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "convite_filme_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entry"
            referencedColumns: ["id"]
          },
        ]
      }
      entry: {
        Row: {
          added_by: string
          created_at: string
          id: string
          media_item_id: string
          space_id: string
        }
        Insert: {
          added_by: string
          created_at?: string
          id?: string
          media_item_id: string
          space_id: string
        }
        Update: {
          added_by?: string
          created_at?: string
          id?: string
          media_item_id?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "space"
            referencedColumns: ["id"]
          },
        ]
      }
      media_item: {
        Row: {
          ano: number | null
          capa_url: string | null
          created_at: string
          fonte: string
          fonte_id: string
          id: string
          metadados: Json
          sinopse: string | null
          tipo: string
          titulo: string
          titulo_original: string | null
        }
        Insert: {
          ano?: number | null
          capa_url?: string | null
          created_at?: string
          fonte: string
          fonte_id: string
          id?: string
          metadados?: Json
          sinopse?: string | null
          tipo: string
          titulo: string
          titulo_original?: string | null
        }
        Update: {
          ano?: number | null
          capa_url?: string | null
          created_at?: string
          fonte?: string
          fonte_id?: string
          id?: string
          metadados?: Json
          sinopse?: string | null
          tipo?: string
          titulo?: string
          titulo_original?: string | null
        }
        Relationships: []
      }
      membership: {
        Row: {
          created_at: string
          papel: string
          space_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          papel?: string
          space_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          papel?: string
          space_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "space"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_user_id_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      profile: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          nome: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      rating: {
        Row: {
          entry_id: string
          enviado_em: string | null
          id: string
          nota: number | null
          planejado_para: string | null
          resenha: string | null
          status: string
          updated_at: string
          user_id: string
          visto_em: string | null
        }
        Insert: {
          entry_id: string
          enviado_em?: string | null
          id?: string
          nota?: number | null
          planejado_para?: string | null
          resenha?: string | null
          status?: string
          updated_at?: string
          user_id: string
          visto_em?: string | null
        }
        Update: {
          entry_id?: string
          enviado_em?: string | null
          id?: string
          nota?: number | null
          planejado_para?: string | null
          resenha?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          visto_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rating_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_user_id_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      space: {
        Row: {
          created_at: string
          id: string
          nome: string
          tipo: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          tipo: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          tipo?: string
        }
        Relationships: []
      }
      space_deletion_notice: {
        Row: {
          deletado_em: string
          deletado_por_nome: string
          id: string
          lido_em: string | null
          space_nome: string
          user_id: string
        }
        Insert: {
          deletado_em?: string
          deletado_por_nome: string
          id?: string
          lido_em?: string | null
          space_nome: string
          user_id: string
        }
        Update: {
          deletado_em?: string
          deletado_por_nome?: string
          id?: string
          lido_em?: string | null
          space_nome?: string
          user_id?: string
        }
        Relationships: []
      }
      space_invite: {
        Row: {
          codigo: string
          created_at: string
          criado_por: string
          expira_em: string
          id: string
          space_id: string
          usado_em: string | null
          usado_por: string | null
        }
        Insert: {
          codigo: string
          created_at?: string
          criado_por: string
          expira_em?: string
          id?: string
          space_id: string
          usado_em?: string | null
          usado_por?: string | null
        }
        Update: {
          codigo?: string
          created_at?: string
          criado_por?: string
          expira_em?: string
          id?: string
          space_id?: string
          usado_em?: string | null
          usado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "space_invite_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "space"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      parcela_mensal: {
        Row: {
          competencia: string | null
          compra_id: string | null
          numero: number | null
          space_id: string | null
          total: number | null
          valor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "compra_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "space"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adicionar_item: {
        Args: { p_item: Json; p_space: string }
        Returns: string
      }
      atualizar_compra: {
        Args: {
          p_categoria_cor?: string
          p_categoria_nome?: string
          p_competencia_inicial: string
          p_compra: string
          p_data_compra: string
          p_descricao: string
          p_pago_por: string
          p_parcelas: number
          p_participantes: Json
          p_valor_total: number
        }
        Returns: undefined
      }
      can_access_entry: { Args: { p_entry: string }; Returns: boolean }
      create_space: {
        Args: { p_nome: string; p_tipo?: string }
        Returns: string
      }
      criar_convite: { Args: { p_space: string }; Returns: string }
      definir_papel: {
        Args: { p_papel: string; p_space: string; p_user: string }
        Returns: undefined
      }
      deletar_espaco: { Args: { p_space: string }; Returns: undefined }
      gerar_codigo_convite: { Args: never; Returns: string }
      is_space_admin: { Args: { p_space: string }; Returns: boolean }
      is_space_member: { Args: { p_space: string }; Returns: boolean }
      is_space_owner: { Args: { p_space: string }; Returns: boolean }
      marcar_assistiram_comigo: {
        Args: { p_entry: string; p_usuarios: string[] }
        Returns: number
      }
      obter_ou_criar_categoria: {
        Args: { p_cor?: string; p_nome: string; p_space: string }
        Returns: string
      }
      planejar_filme: {
        Args: { p_data: string; p_entry: string }
        Returns: number
      }
      registrar_compra: {
        Args: {
          p_categoria_cor?: string
          p_categoria_nome?: string
          p_competencia_inicial: string
          p_data_compra: string
          p_descricao: string
          p_pago_por: string
          p_parcelas: number
          p_participantes: Json
          p_space: string
          p_valor_total: number
        }
        Returns: string
      }
      resgatar_convite: { Args: { p_codigo: string }; Returns: string }
      responder_convite: {
        Args: { p_aceito: boolean; p_convite: string }
        Returns: undefined
      }
      shares_space_with: { Args: { p_user: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
