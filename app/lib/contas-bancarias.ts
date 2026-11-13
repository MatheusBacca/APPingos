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
  pessoal: 'Direto nos meus gastos pessoais',
  casal: 'Compartilhado',
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

  // Marcado pela sincronização quando a Pluggy responde 404 para o item.
  if (conexao.status === 'DELETED') {
    return { tom: 'erro', texto: 'Esta conexão não existe mais na Pluggy. Desconecte e conecte de novo.', reconectar: false }
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

/** Os dois jeitos de um cartão ficar privado: cada compra na caixa de entrada, ou direto no pessoal. */
export type ModoPrivado = 'perguntar' | 'pessoal'

export interface Designacao {
  destino: DestinoConta
  space_id: string | null
}

/** Se a conta está compartilhada com um espaço — o opt-in de cada pessoa, cartão a cartão. */
export function estaCompartilhada(conta: { destino: string, space_id: string | null }): boolean {
  return conta.destino === 'casal' && !!conta.space_id
}

/**
 * Marcar ou desmarcar "compartilhar este cartão".
 *
 * Marcar leva ao espaço que a conta já apontava ou ao primeiro espaço de casal
 * da pessoa; sem espaço de casal não há o que marcar, e a conta continua como
 * está. Desmarcar volta a ser privado no modo mais conservador (perguntar a cada
 * compra). Nenhum dos dois mexe nas compras que já entraram: a designação só vale
 * para o que for importado depois (`designada_em`, migration 20261112140000).
 */
export function designacaoAoMarcar(
  marcado: boolean,
  conta: Designacao,
  espacosDeCasal: ReadonlyArray<{ id: string }>,
): Designacao {
  if (!marcado) return { destino: 'perguntar', space_id: null }
  const espaco = espacosDeCasal.find(e => e.id === conta.space_id) ?? espacosDeCasal[0]
  return espaco ? { destino: 'casal', space_id: espaco.id } : conta
}

/** Trocar o espaço de um cartão compartilhado. */
export function designacaoParaEspaco(spaceId: string): Designacao {
  return { destino: 'casal', space_id: spaceId }
}

/** Trocar o modo de um cartão privado. */
export function designacaoPrivada(modo: ModoPrivado): Designacao {
  return { destino: modo, space_id: null }
}
