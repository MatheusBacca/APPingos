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
      acerto_mes: {
        Row: {
          competencia: string
          pago_em: string
          pago_por: string
          space_id: string
        }
        Insert: {
          competencia: string
          pago_em?: string
          pago_por: string
          space_id: string
        }
        Update: {
          competencia?: string
          pago_em?: string
          pago_por?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acerto_mes_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "space"
            referencedColumns: ["id"]
          },
        ]
      }
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
      foto: {
        Row: {
          aprovada_em: string | null
          caminho: string
          created_at: string
          enviada_por: string
          id: string
          legenda: string | null
          lote_id: string
          mime: string
          nome_original: string | null
          postada_em: string | null
          space_id: string
          tamanho: number | null
          tipo: string
          updated_at: string
        }
        Insert: {
          aprovada_em?: string | null
          caminho: string
          created_at?: string
          enviada_por: string
          id?: string
          legenda?: string | null
          lote_id?: string
          mime: string
          nome_original?: string | null
          postada_em?: string | null
          space_id: string
          tamanho?: number | null
          tipo: string
          updated_at?: string
        }
        Update: {
          aprovada_em?: string | null
          caminho?: string
          created_at?: string
          enviada_por?: string
          id?: string
          legenda?: string | null
          lote_id?: string
          mime?: string
          nome_original?: string | null
          postada_em?: string | null
          space_id?: string
          tamanho?: number | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "foto_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "space"
            referencedColumns: ["id"]
          },
        ]
      }
      foto_curtida: {
        Row: {
          created_at: string
          foto_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          foto_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          foto_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "foto_curtida_foto_id_fkey"
            columns: ["foto_id"]
            isOneToOne: false
            referencedRelation: "foto"
            referencedColumns: ["id"]
          },
        ]
      }
      interesse: {
        Row: {
          assumido_em: string | null
          assumido_por: string | null
          convertido_em: string | null
          convertido_ref_id: string | null
          convertido_tipo: string | null
          created_at: string
          criado_por: string
          destino: string
          estado: string
          id: string
          observacao: string | null
          para_quem: string | null
          para_quem_user_id: string | null
          space_id: string
          titulo: string
          updated_at: string
        }
        Insert: {
          assumido_em?: string | null
          assumido_por?: string | null
          convertido_em?: string | null
          convertido_ref_id?: string | null
          convertido_tipo?: string | null
          created_at?: string
          criado_por: string
          destino?: string
          estado?: string
          id?: string
          observacao?: string | null
          para_quem?: string | null
          para_quem_user_id?: string | null
          space_id: string
          titulo: string
          updated_at?: string
        }
        Update: {
          assumido_em?: string | null
          assumido_por?: string | null
          convertido_em?: string | null
          convertido_ref_id?: string | null
          convertido_tipo?: string | null
          created_at?: string
          criado_por?: string
          destino?: string
          estado?: string
          id?: string
          observacao?: string | null
          para_quem?: string | null
          para_quem_user_id?: string | null
          space_id?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interesse_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "space"
            referencedColumns: ["id"]
          },
        ]
      }
      interesse_agrupamento: {
        Row: {
          created_at: string
          escolhido: boolean
          id: string
          interesse_id: string
          nome: string | null
        }
        Insert: {
          created_at?: string
          escolhido?: boolean
          id?: string
          interesse_id: string
          nome?: string | null
        }
        Update: {
          created_at?: string
          escolhido?: boolean
          id?: string
          interesse_id?: string
          nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interesse_agrupamento_interesse_id_fkey"
            columns: ["interesse_id"]
            isOneToOne: false
            referencedRelation: "interesse"
            referencedColumns: ["id"]
          },
        ]
      }
      interesse_compartilhamento: {
        Row: {
          compartilhado_por: string
          created_at: string
          interesse_id: string
          space_id: string
        }
        Insert: {
          compartilhado_por: string
          created_at?: string
          interesse_id: string
          space_id: string
        }
        Update: {
          compartilhado_por?: string
          created_at?: string
          interesse_id?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interesse_compartilhamento_interesse_id_fkey"
            columns: ["interesse_id"]
            isOneToOne: false
            referencedRelation: "interesse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interesse_compartilhamento_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "space"
            referencedColumns: ["id"]
          },
        ]
      }
      interesse_produto: {
        Row: {
          agrupamento_id: string
          capturado_em: string
          created_at: string
          falhas_seguidas: number
          id: string
          imagem_url: string | null
          interesse_id: string
          loja: string | null
          nome: string
          origem: string
          parcelas: number | null
          preco: number | null
          preco_pix: number | null
          url: string
          valor_parcela: number | null
          verificado_em: string | null
        }
        Insert: {
          agrupamento_id: string
          capturado_em?: string
          created_at?: string
          falhas_seguidas?: number
          id?: string
          imagem_url?: string | null
          interesse_id: string
          loja?: string | null
          nome: string
          origem?: string
          parcelas?: number | null
          preco?: number | null
          preco_pix?: number | null
          url: string
          valor_parcela?: number | null
          verificado_em?: string | null
        }
        Update: {
          agrupamento_id?: string
          capturado_em?: string
          created_at?: string
          falhas_seguidas?: number
          id?: string
          imagem_url?: string | null
          interesse_id?: string
          loja?: string | null
          nome?: string
          origem?: string
          parcelas?: number | null
          preco?: number | null
          preco_pix?: number | null
          url?: string
          valor_parcela?: number | null
          verificado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interesse_produto_agrupamento_id_fkey"
            columns: ["agrupamento_id"]
            isOneToOne: false
            referencedRelation: "interesse_agrupamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interesse_produto_interesse_id_fkey"
            columns: ["interesse_id"]
            isOneToOne: false
            referencedRelation: "interesse"
            referencedColumns: ["id"]
          },
        ]
      }
      interesse_produto_preco: {
        Row: {
          id: string
          parcelas: number | null
          preco: number | null
          preco_pix: number | null
          produto_id: string
          valor_parcela: number | null
          visto_em: string
        }
        Insert: {
          id?: string
          parcelas?: number | null
          preco?: number | null
          preco_pix?: number | null
          produto_id: string
          valor_parcela?: number | null
          visto_em?: string
        }
        Update: {
          id?: string
          parcelas?: number | null
          preco?: number | null
          preco_pix?: number | null
          produto_id?: string
          valor_parcela?: number | null
          visto_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "interesse_produto_preco_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "interesse_produto"
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
      notificacao: {
        Row: {
          ator_id: string | null
          created_at: string
          dados: Json
          entidade: string | null
          entidade_id: string | null
          id: string
          lida_em: string | null
          rota: string | null
          space_id: string | null
          tipo: string
          user_id: string
        }
        Insert: {
          ator_id?: string | null
          created_at?: string
          dados?: Json
          entidade?: string | null
          entidade_id?: string | null
          id?: string
          lida_em?: string | null
          rota?: string | null
          space_id?: string | null
          tipo: string
          user_id: string
        }
        Update: {
          ator_id?: string | null
          created_at?: string
          dados?: Json
          entidade?: string | null
          entidade_id?: string | null
          id?: string
          lida_em?: string | null
          rota?: string | null
          space_id?: string | null
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacao_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "space"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacao_email: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          endereco: string | null
          token: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          endereco?: string | null
          token?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          endereco?: string | null
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      notificacao_email_fila: {
        Row: {
          criado_em: string
          destinatario: string
          enviado_em: string | null
          erro: string | null
          estado: string
          id: string
          notificacao_id: string
          tentativas: number
          user_id: string
        }
        Insert: {
          criado_em?: string
          destinatario: string
          enviado_em?: string | null
          erro?: string | null
          estado?: string
          id?: string
          notificacao_id: string
          tentativas?: number
          user_id: string
        }
        Update: {
          criado_em?: string
          destinatario?: string
          enviado_em?: string | null
          erro?: string | null
          estado?: string
          id?: string
          notificacao_id?: string
          tentativas?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacao_email_fila_notificacao_id_fkey"
            columns: ["notificacao_id"]
            isOneToOne: true
            referencedRelation: "notificacao"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacao_email_saude: {
        Row: {
          id: boolean
          motivo: string | null
          ok: boolean
          verificado_em: string
        }
        Insert: {
          id?: boolean
          motivo?: string | null
          ok?: boolean
          verificado_em?: string
        }
        Update: {
          id?: boolean
          motivo?: string | null
          ok?: boolean
          verificado_em?: string
        }
        Relationships: []
      }
      notificacao_preferencia: {
        Row: {
          ativo: boolean
          email: boolean
          tipo: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          email?: boolean
          tipo: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          email?: boolean
          tipo?: string
          user_id?: string
        }
        Relationships: []
      }
      parada: {
        Row: {
          anotacao: string | null
          atualizado_em: string
          created_at: string
          desativada: boolean
          dia: number | null
          endereco: string | null
          google_place_id: string | null
          id: string
          nome: string
          ordem: number
          roteiro_id: string
        }
        Insert: {
          anotacao?: string | null
          atualizado_em?: string
          created_at?: string
          desativada?: boolean
          dia?: number | null
          endereco?: string | null
          google_place_id?: string | null
          id?: string
          nome: string
          ordem: number
          roteiro_id: string
        }
        Update: {
          anotacao?: string | null
          atualizado_em?: string
          created_at?: string
          desativada?: boolean
          dia?: number | null
          endereco?: string | null
          google_place_id?: string | null
          id?: string
          nome?: string
          ordem?: number
          roteiro_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parada_roteiro_id_fkey"
            columns: ["roteiro_id"]
            isOneToOne: false
            referencedRelation: "roteiro"
            referencedColumns: ["id"]
          },
        ]
      }
      profile: {
        Row: {
          apelido: string | null
          avatar_url: string | null
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          apelido?: string | null
          avatar_url?: string | null
          created_at?: string
          id: string
          nome: string
        }
        Update: {
          apelido?: string | null
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
      roteiro: {
        Row: {
          created_at: string
          criado_por: string
          data_fim: string | null
          data_inicio: string | null
          descricao: string | null
          id: string
          liberado_em: string | null
          modo_transporte: string
          nome: string
          space_id: string
          updated_at: string
          visibilidade: string
        }
        Insert: {
          created_at?: string
          criado_por: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          id?: string
          liberado_em?: string | null
          modo_transporte?: string
          nome: string
          space_id: string
          updated_at?: string
          visibilidade?: string
        }
        Update: {
          created_at?: string
          criado_por?: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          id?: string
          liberado_em?: string | null
          modo_transporte?: string
          nome?: string
          space_id?: string
          updated_at?: string
          visibilidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "roteiro_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "space"
            referencedColumns: ["id"]
          },
        ]
      }
      roteiro_visto: {
        Row: {
          roteiro_id: string
          user_id: string
          visto_em: string
        }
        Insert: {
          roteiro_id: string
          user_id: string
          visto_em?: string
        }
        Update: {
          roteiro_id?: string
          user_id?: string
          visto_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "roteiro_visto_roteiro_id_fkey"
            columns: ["roteiro_id"]
            isOneToOne: false
            referencedRelation: "roteiro"
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
      acordar_envio_de_email: { Args: never; Returns: undefined }
      adicionar_item: {
        Args: { p_item: Json; p_space: string }
        Returns: string
      }
      adicionar_produto: {
        Args: { p_interesse: string; p_produto: Json }
        Returns: string
      }
      adicionar_produto_ao_agrupamento: {
        Args: { p_agrupamento: string; p_produto: Json }
        Returns: string
      }
      alternar_curtida: { Args: { p_foto: string }; Returns: boolean }
      anunciar_versao: {
        Args: { p_descricao: string; p_titulo: string; p_versao: string }
        Returns: number
      }
      assumir_interesse: { Args: { p_interesse: string }; Returns: undefined }
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
      avisar_viagens_proximas: { Args: never; Returns: number }
      can_access_entry: { Args: { p_entry: string }; Returns: boolean }
      compartilhar_interesse: {
        Args: { p_interesse: string; p_space: string }
        Returns: undefined
      }
      create_space: {
        Args: { p_nome: string; p_tipo?: string }
        Returns: string
      }
      criar_agrupamento: {
        Args: { p_interesse: string; p_nome?: string }
        Returns: string
      }
      criar_convite: { Args: { p_space: string }; Returns: string }
      definir_email_notificacoes: {
        Args: { p_ativo: boolean; p_endereco?: string }
        Returns: undefined
      }
      definir_papel: {
        Args: { p_papel: string; p_space: string; p_user: string }
        Returns: undefined
      }
      deletar_espaco: { Args: { p_space: string }; Returns: undefined }
      descadastrar_email: { Args: { p_token: string }; Returns: undefined }
      descompartilhar_interesse: {
        Args: { p_interesse: string; p_space: string }
        Returns: undefined
      }
      escolher_agrupamento: {
        Args: { p_agrupamento: string }
        Returns: undefined
      }
      escolher_produto: { Args: { p_produto: string }; Returns: undefined }
      espaco_do_caminho: { Args: { p_nome: string }; Returns: string }
      faxina_notificacoes: { Args: never; Returns: number }
      gerar_codigo_convite: { Args: never; Returns: string }
      is_space_admin: { Args: { p_space: string }; Returns: boolean }
      is_space_member: { Args: { p_space: string }; Returns: boolean }
      is_space_owner: { Args: { p_space: string }; Returns: boolean }
      juntar_produto_ao_agrupamento: {
        Args: { p_agrupamento: string; p_produto: string }
        Returns: Json
      }
      lembrete_semanal_filmes: { Args: never; Returns: number }
      liberar_interesse: { Args: { p_interesse: string }; Returns: undefined }
      liberar_roteiro: { Args: { p_roteiro: string }; Returns: undefined }
      marcar_assistiram_comigo: {
        Args: { p_entry: string; p_usuarios: string[] }
        Returns: number
      }
      marcar_notificacoes_lidas: { Args: { p_ids?: string[] }; Returns: number }
      marcar_roteiro_visto: { Args: { p_roteiro: string }; Returns: undefined }
      nome_para_notificacao: { Args: { p_user: string }; Returns: string }
      notificar: {
        Args: {
          p_ator: string
          p_dados?: Json
          p_entidade?: string
          p_entidade_id?: string
          p_janela?: string
          p_rota?: string
          p_space: string
          p_tipo: string
        }
        Returns: number
      }
      notificar_pessoa: {
        Args: {
          p_ator: string
          p_dados?: Json
          p_entidade?: string
          p_entidade_id?: string
          p_rota?: string
          p_space: string
          p_tipo: string
          p_user: string
        }
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
      pode_ver_foto: { Args: { p_foto: string }; Returns: boolean }
      pode_ver_interesse: { Args: { p_interesse: string }; Returns: boolean }
      pode_ver_roteiro: { Args: { p_roteiro: string }; Returns: boolean }
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
      registrar_interesse: {
        Args: {
          p_destino?: string
          p_observacao?: string
          p_para_quem?: string
          p_para_quem_user_id?: string
          p_produto?: Json
          p_space: string
          p_titulo: string
        }
        Returns: string
      }
      registrar_preco_lido: {
        Args: {
          p_parcelas?: number
          p_preco?: number
          p_preco_pix?: number
          p_produto: string
          p_valor_parcela?: number
        }
        Returns: Json
      }
      resgatar_convite: { Args: { p_codigo: string }; Returns: string }
      responder_convite: {
        Args: { p_aceito: boolean; p_convite: string }
        Returns: undefined
      }
      salvar_paradas: {
        Args: { p_paradas: Json; p_roteiro: string }
        Returns: number
      }
      segredos_do_espaco: {
        Args: { p_space: string }
        Returns: {
          created_at: string
          criado_por: string
          id: string
        }[]
      }
      separar_produto: { Args: { p_produto: string }; Returns: string }
      shares_space_with: { Args: { p_user: string }; Returns: boolean }
      sou_dono_do_interesse: {
        Args: { p_interesse: string }
        Returns: boolean
      }
      status_do_email: { Args: never; Returns: Json }
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
