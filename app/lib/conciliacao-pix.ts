/**
 * A conciliação do Pix do acerto — "a gente já acertou?" respondido pelo extrato.
 *
 * Fase 6 de docs/notion-plano-open-finance.md, passo 3 de "Acertar com Pix": no
 * dia seguinte ao Pix, o MeuPluggy traz a transação (saída de um, entrada do
 * outro), e o app confere por valor, janela de data e contraparte e marca o
 * `acerto_mes` sozinho.
 *
 * Função pura sobre o MESMO `saldoDoMes` que a tela mostra, de propósito: refazer
 * a conta em SQL arriscaria um centavo de diferença do número que a pessoa viu e
 * copiou — e aí o Pix certo não casaria.
 */
import { normalizarNome, somarMesesCompetencia, competenciaDe } from '~/lib/importacao-bancaria'
import type { Sentido } from '~/lib/importacao-bancaria'
import type { SaldoMembro } from '~/types/orcamento'

/** Os métodos que movem dinheiro entre duas pessoas. Boleto e cartão não acertam mês. */
const METODOS_DE_TRANSFERENCIA = new Set(['PIX', 'TED', 'TEF', 'DOC'])

export interface TransacaoParaConciliar {
  id: string
  sentido: Sentido
  valor: number
  data: string
  pendente: boolean
  metodo: string | null
  contraparte_nome: string | null
  contraparte_documento: string | null
}

export interface Parceiro {
  user_id: string
  /** O nome de cadastro — é o que o banco conhece, não o apelido. */
  nome: string
  chave_pix: string | null
  chave_pix_tipo: string | null
}

/**
 * Se a outra ponta do Pix é a outra pessoa do casal.
 *
 * Pelo CPF quando ela usa CPF como chave Pix (o documento casa exato); senão
 * pelo nome: todas as palavras do nome de cadastro dela aparecem no nome que o
 * banco mostra ("Ana Exemplo" dentro de "ANA MARIA EXEMPLO"). O valor e a janela
 * de data, conferidos junto, é que tornam isso seguro.
 */
export function contraparteEhParceiro(t: Pick<TransacaoParaConciliar, 'contraparte_nome' | 'contraparte_documento'>, parceiro: Parceiro): boolean {
  const documento = (t.contraparte_documento ?? '').replace(/\D/g, '')
  if (parceiro.chave_pix_tipo === 'cpf' && parceiro.chave_pix && documento === parceiro.chave_pix) return true

  const doBanco = new Set(normalizarNome(t.contraparte_nome).split(' ').filter(Boolean))
  const doPerfil = normalizarNome(parceiro.nome).split(' ').filter(Boolean)
  return doPerfil.length > 0 && doPerfil.every(p => doBanco.has(p))
}

/**
 * Que meses um Pix pode estar acertando, do mais provável para o menos: o mês
 * anterior (o comum: acerta-se outubro no começo de novembro), o próprio mês
 * (casal que acerta no meio do mês) e o retrasado (o atrasado).
 */
export function mesesCandidatos(data: string): string[] {
  const mes = competenciaDe(data)
  return [somarMesesCompetencia(mes, -1), mes, somarMesesCompetencia(mes, -2)]
}

/** Diferença tolerada entre o Pix e o saldo — meio centavo, só para o ponto flutuante. */
const TOLERANCIA = 0.005

/**
 * O mês que este Pix acerta, ou `null`.
 *
 * Saída minha para o parceiro: eu sou quem deve, e o valor é o que devo. Entrada
 * do parceiro para mim: eu sou quem recebe, e o valor é o meu saldo. Mês já
 * acertado não conta. Na dúvida (nada casa), não marca nada — a pessoa ainda
 * tem o botão "Marcar como pago".
 */
export function acertoDoPix(
  t: TransacaoParaConciliar,
  eu: string,
  parceiro: Parceiro,
  saldosPorMes: Record<string, SaldoMembro[]>,
  acertados: ReadonlyArray<string>,
): string | null {
  if (t.pendente) return null
  if (!t.metodo || !METODOS_DE_TRANSFERENCIA.has(t.metodo.toUpperCase())) return null
  if (!contraparteEhParceiro(t, parceiro)) return null

  const valor = Number(t.valor)
  const credor = t.sentido === 'saida' ? parceiro.user_id : eu

  for (const mes of mesesCandidatos(t.data)) {
    if (acertados.includes(mes)) continue
    const saldo = saldosPorMes[mes]?.find(s => s.user_id === credor)?.saldo
    if (saldo != null && saldo > 0 && Math.abs(saldo - valor) < TOLERANCIA) return mes
  }

  return null
}
