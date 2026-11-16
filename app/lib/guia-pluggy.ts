/**
 * O guia da integração com a Pluggy — o que a tela mostra, decidido sem rede.
 *
 * O texto dos passos mora no componente `GuiaPluggy.vue`; aqui fica só a regra
 * de QUAL guia mostrar e PARA QUEM. O setup do administrador completo está em
 * docs/pluggy-setup-administrador.md.
 */
import { situacaoDaConexao } from '~/lib/contas-bancarias'

export type EstadoDoGuia =
  /** O servidor não tem `NUXT_PLUGGY_*`: ninguém consegue conectar ainda. */
  | 'nao-configurada'
  /** Configurada, e a pessoa ainda não conectou nenhum banco. */
  | 'sem-conexao'
  /** Alguma conexão pede atenção: consentimento vencendo/vencido ou banco pedindo login. */
  | 'renovar'
  /** Conectada e em dia. */
  | 'conectado'

/**
 * Em que pé a pessoa está. Renovar ganha de "conectado": um consentimento
 * vencendo é a única coisa que, ignorada, faz o extrato parar de chegar sem
 * nenhum erro aparente (pegadinha 8 do plano).
 */
export function estadoDoGuia(
  configurada: boolean | undefined,
  conexoes: ReadonlyArray<{ status: string, consentimento_expira_em: string | null, erro_sincronizacao: string | null }>,
  hoje: string,
): EstadoDoGuia {
  if (conexoes.length) {
    const atencao = conexoes.some(c => situacaoDaConexao(c, hoje).reconectar)
    return atencao ? 'renovar' : 'conectado'
  }
  return configurada === false ? 'nao-configurada' : 'sem-conexao'
}

/**
 * Quem vê o bloco de setup do administrador (dashboard da Pluggy, chaves,
 * secrets, trial): o dono de um espaço de casal — é quem montou o espaço e quem
 * vai cuidar da conta de desenvolvedor. Quem não está em casal nenhum usa o app
 * sozinho e é o próprio administrador.
 */
export function mostraSetupDoAdministrador(
  espacos: ReadonlyArray<{ tipo: string, papel: string }>,
): boolean {
  const casais = espacos.filter(e => e.tipo === 'casal')
  return !casais.length || casais.some(e => e.papel === 'dono')
}
