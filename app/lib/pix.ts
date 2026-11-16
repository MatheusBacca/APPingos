/**
 * Pix copia e cola (BR Code estático) — o "acertar o mês" sem provedor nenhum.
 *
 * Fase 6 de docs/notion-plano-open-finance.md, seção "Acertar com Pix". Mover
 * dinheiro pela Pluggy custa o plano comercial e mesmo assim pede a aprovação no
 * banco; o BR Code é um padrão aberto do Banco Central, e gerar um não exige
 * contrato. Quem paga cola no app do banco e confirma — a mesma aprovação.
 *
 * O formato é o EMV® QRCPS-MPM que o "Manual de Padrões para Iniciação do Pix"
 * do Bacen descreve: campos TLV (id de 2 dígitos + tamanho de 2 dígitos + valor),
 * fechados por um CRC16-CCITT. Função própria em vez de `pix-utils`: são poucas
 * linhas, e o teste confere contra o exemplo do próprio manual.
 */

export type TipoChavePix = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria'

export const TIPOS_CHAVE_PIX: TipoChavePix[] = ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria']

export const ROTULO_TIPO_CHAVE: Record<TipoChavePix, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  telefone: 'Celular',
  aleatoria: 'Chave aleatória',
}

// ---------------------------------------------------------------------------
// A chave
// ---------------------------------------------------------------------------

const soDigitos = (s: string) => s.replace(/\D/g, '')

/**
 * A chave no formato que o DICT (o diretório do Pix) usa — é ela que vai dentro
 * do BR Code, e um formato diferente faz o banco de quem paga não achar a conta.
 *
 * CPF/CNPJ só dígitos; e-mail em minúsculas; celular em E.164 (`+55` + DDD +
 * número); aleatória é um UUID em minúsculas.
 */
export function normalizarChavePix(tipo: TipoChavePix, valor: string): string {
  const v = valor.trim()
  switch (tipo) {
    case 'cpf':
    case 'cnpj':
      return soDigitos(v)
    case 'email':
      return v.toLowerCase()
    case 'telefone': {
      const d = soDigitos(v)
      return `+${d.length <= 11 ? `55${d}` : d}`
    }
    case 'aleatoria':
      return v.toLowerCase()
  }
}

function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false
  const digito = (n: number) => {
    let soma = 0
    for (let i = 0; i < n; i++) soma += Number(cpf[i]) * (n + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10])
}

function cnpjValido(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false
  const digito = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const soma = pesos.reduce((t, p, i) => t + p * Number(cnpj[i]), 0)
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  return digito(12) === Number(cnpj[12]) && digito(13) === Number(cnpj[13])
}

/** O que há de errado com a chave, ou `null` se ela serve. Recebe a chave já normalizada. */
export function problemaNaChavePix(tipo: TipoChavePix, chave: string): string | null {
  switch (tipo) {
    case 'cpf':
      return cpfValido(chave) ? null : 'CPF inválido.'
    case 'cnpj':
      return cnpjValido(chave) ? null : 'CNPJ inválido.'
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(chave) && chave.length <= 77 ? null : 'E-mail inválido.'
    case 'telefone':
      return /^\+55\d{10,11}$/.test(chave) ? null : 'Celular inválido — use DDD + número.'
    case 'aleatoria':
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(chave)
        ? null
        : 'Chave aleatória inválida — ela tem 32 letras e números, separados por hífens.'
  }
}

// ---------------------------------------------------------------------------
// O BR Code
// ---------------------------------------------------------------------------

/** Um campo TLV: id, tamanho com 2 dígitos e o valor. */
function campo(id: string, valor: string): string {
  if (valor.length > 99) throw new Error(`campo ${id} do BR Code passa de 99 caracteres`)
  return `${id}${String(valor.length).padStart(2, '0')}${valor}`
}

/**
 * CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF), em 4 dígitos
 * hexadecimais maiúsculos — o que o manual do Pix pede no campo 63.
 */
export function crc16Pix(texto: string): string {
  let crc = 0xFFFF
  for (const byte of new TextEncoder().encode(texto)) {
    crc ^= byte << 8
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/**
 * Texto livre num campo do BR Code: sem acento (o padrão é ASCII, e banco que
 * recebe "São Paulo" em UTF-8 mostra lixo ou recusa) e cortado no limite.
 */
function ascii(texto: string, limite: number): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, limite)
    .trim()
}

export interface DadosDoPix {
  /** A chave já normalizada (`normalizarChavePix`). */
  chave: string
  /** Nome de quem recebe — aparece na tela de confirmação do banco de quem paga. */
  nome: string
  /** Cidade de quem recebe. O padrão exige; os bancos não a conferem. */
  cidade?: string
  /** Sem valor, quem paga digita. Com valor, ele vem preenchido. */
  valor?: number | null
  /** Identificador do pagamento (até 25 letras e números). `***` quando não há. */
  txid?: string
  /** Mensagem para quem recebe (vai no campo 26, sub-campo 02). */
  mensagem?: string
}

/**
 * O Pix copia e cola de um pagamento: o mesmo texto que vira o QR Code.
 */
export function brCodePix(dados: DadosDoPix): string {
  const chave = dados.chave.trim()
  if (!chave) throw new Error('chave Pix vazia')

  // O campo 26 inteiro cabe em 99: "0014br.gov.bcb.pix" (18) + "01NN"+chave + "02NN"+mensagem.
  const espaco = 99 - 18 - 4 - chave.length - 4
  const mensagem = dados.mensagem && espaco > 0 ? ascii(dados.mensagem, espaco) : ''
  const contaDoRecebedor = campo('00', 'br.gov.bcb.pix')
    + campo('01', chave)
    + (mensagem ? campo('02', mensagem) : '')

  const txid = (dados.txid ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***'
  const valor = dados.valor != null && dados.valor > 0 ? (Math.round(dados.valor * 100) / 100).toFixed(2) : null

  const semCrc = campo('00', '01')
    + campo('26', contaDoRecebedor)
    + campo('52', '0000')
    + campo('53', '986')
    + (valor ? campo('54', valor) : '')
    + campo('58', 'BR')
    + campo('59', ascii(dados.nome, 25) || 'RECEBEDOR')
    + campo('60', ascii(dados.cidade ?? 'BRASIL', 15) || 'BRASIL')
    + campo('62', campo('05', txid))
    + '6304'

  return semCrc + crc16Pix(semCrc)
}

/** O identificador do acerto de um mês: `ACERTO202611`. Ajuda a conferir no extrato. */
export function txidDoAcerto(competencia: string): string {
  return `ACERTO${competencia.slice(0, 4)}${competencia.slice(5, 7)}`
}
