/**
 * Quem é quem num Pix do extrato: "Pinga Fogo transferiu para Bixo Pingo".
 *
 * O extrato traz o CPF da outra ponta (`contraparte_documento`); a RPC
 * `contrapartes_reconhecidas` diz de qual membro do espaço ele é
 * (`useContrapartes`). Aqui é só a frase.
 */

export interface PessoaDoApp {
  user_id: string
  /** O apelido, ou o nome quando não há ("Pinga Fogo"). */
  exibicao: string
}

export interface TransferenciaEntrePessoas {
  de: PessoaDoApp
  para: PessoaDoApp
  /** "Pinga Fogo transferiu para Bixo Pingo". */
  frase: string
}

/** Os 11 ou 14 dígitos do documento, sem máscara. */
export const soDigitosDoDocumento = (documento: string | null | undefined) => (documento ?? '').replace(/\D/g, '')

/**
 * A transferência entre duas pessoas do app, ou `null` quando a contraparte não
 * é ninguém dos meus espaços. Entrada: ela mandou para mim; saída: eu mandei para
 * ela. Boleto e cartão não são "transferir".
 */
export function transferenciaEntrePessoas(
  t: { sentido: 'entrada' | 'saida', contraparte_documento: string | null, metodo?: string | null },
  contrapartes: ReadonlyMap<string, string> | undefined,
  eu: PessoaDoApp | null | undefined,
  membros: ReadonlyArray<PessoaDoApp>,
): TransferenciaEntrePessoas | null {
  if (!eu || !contrapartes?.size) return null
  const userId = contrapartes.get(soDigitosDoDocumento(t.contraparte_documento))
  if (!userId || userId === eu.user_id) return null
  const outro = membros.find(m => m.user_id === userId)
  if (!outro) return null

  const [de, para] = t.sentido === 'entrada' ? [outro, eu] : [eu, outro]
  const verbo = (t.metodo ?? '').toUpperCase() === 'BOLETO' ? 'pagou' : 'transferiu para'
  return { de, para, frase: verbo === 'pagou' ? `${de.exibicao} pagou ${para.exibicao}` : `${de.exibicao} ${verbo} ${para.exibicao}` }
}

/** Os documentos que a RPC reconheceu como sendo de `userId` — vão para a conciliação do acerto. */
export function documentosDe(contrapartes: ReadonlyMap<string, string> | undefined, userId: string): string[] {
  return [...(contrapartes ?? new Map<string, string>())].filter(([, u]) => u === userId).map(([d]) => d)
}
