/**
 * Contas conectadas (Open Finance) — o que a tela decide sem falar com ninguém.
 *
 * Ver supabase/migrations/20261112100000_open_finance_conexao.sql para o schema e
 * docs/notion-plano-open-finance.md para o porquê de cada aviso.
 */
import { dataLocal } from '~/lib/importacao-bancaria'

export type DestinoConta = 'casal' | 'pessoal' | 'perguntar'

export const ROTULO_DESTINO: Record<DestinoConta, string> = {
  perguntar: 'Perguntar a cada compra',
  pessoal: 'Pessoal',
  casal: 'Do casal',
}

/** Com quantos dias de antecedência o consentimento vencendo vira aviso. */
export const AVISO_CONSENTIMENTO_DIAS = 30

/** Status da Pluggy que pedem a pessoa de volta ao banco (ou ao MeuPluggy). */
const STATUS_QUE_PEDEM_RECONEXAO = new Set([
  'LOGIN_ERROR',
  'OUTDATED',
  'WAITING_USER_INPUT',
  'WAITING_USER_ACTION',
])

export interface SituacaoConexao {
  tom: 'ok' | 'aviso' | 'erro'
  texto: string
  /** Se o botão "Reconectar" deve aparecer em destaque. */
  reconectar: boolean
}

/** Dias de calendário de `de` até `ate` (os dois `YYYY-MM-DD`). */
export function diasEntre(de: string, ate: string): number {
  const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
  return Math.round((utc(ate) - utc(de)) / 86_400_000)
}

/**
 * Uma frase sobre a conexão, na ordem do que mais importa.
 *
 * Consentimento vencido ganha de tudo: com ele vencido o banco para de mandar
 * dado, e o app passaria a mostrar um extrato velho como se fosse o de hoje
 * (pegadinha 8 do plano). A renovação é no MeuPluggy ou no app do banco.
 */
export function situacaoDaConexao(
  conexao: {
    status: string
    consentimento_expira_em: string | null
    erro_sincronizacao: string | null
  },
  hoje: string,
): SituacaoConexao {
  if (conexao.consentimento_expira_em) {
    const dias = diasEntre(hoje, dataLocal(conexao.consentimento_expira_em))
    if (dias < 0) {
      return { tom: 'erro', texto: 'O consentimento venceu — renove para voltar a receber o extrato.', reconectar: true }
    }
    if (dias <= AVISO_CONSENTIMENTO_DIAS) {
      const quando = dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`
      return { tom: 'aviso', texto: `O consentimento vence ${quando}.`, reconectar: true }
    }
  }

  if (STATUS_QUE_PEDEM_RECONEXAO.has(conexao.status)) {
    return { tom: 'erro', texto: 'O banco pediu para conectar de novo.', reconectar: true }
  }

  if (conexao.erro_sincronizacao) {
    return { tom: 'aviso', texto: 'A última sincronização falhou. O app tenta de novo amanhã.', reconectar: false }
  }

  if (conexao.status === 'UPDATING' || conexao.status === 'MERGING') {
    return { tom: 'ok', texto: 'Buscando os dados no banco…', reconectar: false }
  }

  return { tom: 'ok', texto: 'Conectado.', reconectar: false }
}

/**
 * O valor do `<select>` de destino, que junta as duas colunas numa escolha só:
 * `perguntar`, `pessoal` ou `casal:<space_id>` — um casal por espaço.
 */
export function valorDoDestino(conta: { destino: string, space_id: string | null }): string {
  return conta.destino === 'casal' && conta.space_id ? `casal:${conta.space_id}` : conta.destino
}

export function destinoDoValor(valor: string): { destino: DestinoConta, space_id: string | null } {
  if (valor.startsWith('casal:')) return { destino: 'casal', space_id: valor.slice('casal:'.length) }
  if (valor === 'pessoal') return { destino: 'pessoal', space_id: null }
  return { destino: 'perguntar', space_id: null }
}
