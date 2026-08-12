import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { Notificacao, Preferencia, StatusDoEmail, TipoNotificacao } from '~/lib/notificacoes'
import { useUsuarioId } from '~/composables/useUsuarioId'

/**
 * Quanto da caixa vem de uma vez. O sino só precisa saber se passou de nove
 * ("9+"), e ninguém rola cem avisos — o que passar daqui é histórico, e
 * histórico a faxina mensal apaga.
 */
const TETO = 50

/**
 * A caixa de notificações da PESSOA — e não do espaço ativo.
 *
 * Por isso `useQuery` com a chave do usuário, no molde de
 * `useAvisoEspacoDeletado`, e não `useSpaceQuery`: trocar de espaço não pode
 * esconder o aviso que chegou no outro. Cada linha mostra de qual espaço veio
 * quando a pessoa tem mais de um.
 *
 * Sem Realtime: o `refetchOnWindowFocus` do TanStack Query já cobre o caso real
 * de duas pessoas — voltar para o app é exatamente quando se quer ver o que
 * chegou —, e o repo ainda não abre canal em lugar nenhum. Quem tem pressa
 * recebe o e-mail, que é o ponto desta fase.
 */
export function useNotificacoes() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: ['notificacoes', usuarioId],
    enabled: computed(() => !!usuarioId.value),
    queryFn: async (): Promise<Notificacao[]> => {
      const { data, error } = await supabase
        .from('notificacao')
        .select('id, space_id, tipo, dados, ator_id, entidade, entidade_id, rota, created_at, lida_em')
        .order('created_at', { ascending: false })
        .limit(TETO)

      if (error) throw error
      return (data ?? []) as unknown as Notificacao[]
    },
  })
}

export function useNaoLidas() {
  const { data } = useNotificacoes()
  return computed(() => (data.value ?? []).filter(n => !n.lida_em))
}

/**
 * Marcar como lida — uma, várias, ou a caixa inteira com `undefined`.
 *
 * RPC e não UPDATE: "todas" precisaria mandar a lista de ids, e a lista que o
 * client tem é a página que ele carregou (`TETO`), não a caixa inteira. Quem
 * apertou "marcar todas" quer dizer todas.
 */
export function useMarcarLidas() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ids?: string[]) => {
      const { error } = await supabase.rpc('marcar_notificacoes_lidas', {
        p_ids: ids ?? undefined,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notificacoes'] }),
  })
}

// ---------------------------------------------------------------------------
// Preferências
// ---------------------------------------------------------------------------

export interface EstadoDasPreferencias {
  /** Uma linha por tipo mexido. Ausência de linha é "ligado" — ver a migration. */
  preferencias: Preferencia[]
  email: {
    ativo: boolean
    /** Nulo = usa o e-mail da conta. */
    endereco: string | null
  }
  /** O canal está de pé? Quanto está parado? Ver `status_do_email()`. */
  status: StatusDoEmail
}

/**
 * Tudo o que a tela de preferências precisa, numa chave só.
 *
 * As três consultas vivem juntas porque a tela é uma coisa só e elas são
 * minúsculas: separadas, a página piscaria em três tempos e cada mutação teria
 * que lembrar de invalidar as três.
 */
export function usePreferenciasNotificacao() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: ['notificacoes-preferencias', usuarioId],
    enabled: computed(() => !!usuarioId.value),
    queryFn: async (): Promise<EstadoDasPreferencias> => {
      const [prefs, email, status] = await Promise.all([
        supabase.from('notificacao_preferencia').select('tipo, ativo, email'),
        supabase.from('notificacao_email').select('ativo, endereco').maybeSingle(),
        supabase.rpc('status_do_email'),
      ])

      if (prefs.error) throw prefs.error
      if (email.error) throw email.error
      if (status.error) throw status.error

      return {
        preferencias: (prefs.data ?? []) as Preferencia[],
        email: {
          ativo: email.data?.ativo ?? false,
          endereco: email.data?.endereco ?? null,
        },
        status: status.data as unknown as StatusDoEmail,
      }
    },

    /*
     * O canal pode voltar sozinho — basta alguém cadastrar os segredos, e o cron
     * de 5 minutos atualiza a saúde. Sem isto, quem deixou a tela aberta veria
     * "indisponível" para sempre.
     */
    refetchInterval: 60_000,
  })
}

export interface MudancaDePreferencia {
  tipos: TipoNotificacao[]
  /** A caixa do app. Deixe de fora para não mexer. */
  ativo?: boolean
  /** O e-mail. Deixe de fora para não mexer. */
  email?: boolean
}

/**
 * Liga ou desliga uma categoria inteira — um canal de cada vez.
 *
 * O upsert grava as duas colunas sempre, e o valor do canal que NÃO está sendo
 * mexido vem do que já está em cache. Sem isso, desligar o e-mail de Orçamentos
 * reativaria a caixa de quem a tinha desligado, porque a coluna ausente cairia
 * no default `true`.
 */
export function useDefinirPreferencia() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()
  const usuarioId = useUsuarioId()
  const { data: estado } = usePreferenciasNotificacao()

  return useMutation({
    mutationFn: async ({ tipos, ativo, email }: MudancaDePreferencia) => {
      if (!usuarioId.value) throw new Error('Não autenticado')

      const atuais = new Map((estado.value?.preferencias ?? []).map(p => [p.tipo, p]))

      const linhas = tipos.map(tipo => ({
        user_id: usuarioId.value!,
        tipo,
        ativo: ativo ?? atuais.get(tipo)?.ativo ?? true,
        email: email ?? atuais.get(tipo)?.email ?? true,
      }))

      const { error } = await supabase
        .from('notificacao_preferencia')
        .upsert(linhas, { onConflict: 'user_id,tipo' })

      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notificacoes-preferencias'] }),
  })
}

/**
 * O interruptor mestre do e-mail.
 *
 * RPC porque a linha carrega o token de descadastro, que nenhum cliente pode
 * escrever — o porquê está em `definir_email_notificacoes` na migration.
 */
export function useDefinirEmail() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ ativo, endereco }: { ativo: boolean, endereco?: string | null }) => {
      const { error } = await supabase.rpc('definir_email_notificacoes', {
        p_ativo: ativo,
        p_endereco: endereco ?? undefined,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notificacoes-preferencias'] }),
  })
}
