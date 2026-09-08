/**
 * Domínio dos Pins — a moeda do APPingos.
 *
 * Ver `supabase/migrations/20260907230100_pins.sql` para o motor e o porquê de
 * o saldo ser derivado, e `docs/notion-plano-pins.md` para a economia inteira.
 *
 * A lógica daqui é pura de propósito: o extrato mostra a CONTA de cada linha
 * ("3 × 1,50 = 5") e a sequência de dias, e as duas coisas precisam ser testáveis
 * sem subir o Nuxt nem o banco.
 */
import { formatarMes, paraIso, somarDias } from '~/lib/datas'

export interface Pin {
  id: string
  user_id: string
  space_id: string | null
  regra: string
  base: number
  multiplicador: number
  pontos: number
  hotspots: string[]
  dados: Record<string, unknown>
  entidade: string | null
  entidade_id: string | null
  created_at: string
}

export interface PinRegra {
  chave: string
  rotulo: string
  descricao: string
  modulo: string
  base: number
  teto_dia: number | null
  lazer: boolean
  noturna: boolean
  ativa: boolean
  ordem: number
}

export interface PinHotspot {
  chave: string
  rotulo: string
  descricao: string
  fator: number
  por_dia: boolean
  teto: number
  ativo: boolean
  ordem: number
}

/**
 * Sobre o que era aquele Pin: "Duna", "Setembro de 2026", "Mercado".
 *
 * Cada regra guarda o assunto sob a chave que fazia sentido para o módulo dela —
 * `titulo` em Filmes, `descricao` em Orçamentos, `nome` em Viagens. Resolver isso
 * na tela, com um `||` encadeado por componente, seria espalhar o mesmo
 * conhecimento por três lugares e esquecê-lo no quarto.
 *
 * Devolve string vazia quando não há assunto — foto e curtida não têm nome, e o
 * rótulo da regra ("Foto curtida") já diz tudo o que há para dizer. A tela some
 * com a linha em vez de escrever "sem título".
 */
export function assuntoDoPin(pin: Pick<Pin, 'dados'>): string {
  const d = pin.dados ?? {}

  const competencia = d.competencia
  if (typeof competencia === 'string' && competencia.trim() !== '') {
    return formatarMes(competencia)
  }

  for (const chave of ['titulo', 'nome', 'descricao', 'legenda'] as const) {
    const valor = d[chave]
    if (typeof valor === 'string' && valor.trim() !== '') return valor
  }

  return ''
}

export interface SaldoDePins {
  user_id: string
  pontos: number
  conquistas: number
  ultimo: string | null
}

/**
 * "1 Pin" / "12 Pins".
 *
 * Existe para o texto não precisar concordar em número no meio de um template
 * literal — a mesma razão do `umaMidia` das notificações.
 */
export function pinsEmTexto(pontos: number): string {
  const n = Math.trunc(pontos)
  return `${n} ${n === 1 ? 'Pin' : 'Pins'}`
}

/** `1.5` → `"1,50×"`. Sempre duas casas: `1,5×` e `1,15×` desalinhariam a lista. */
export function formatarMultiplicador(multiplicador: number): string {
  return `${multiplicador.toFixed(2).replace('.', ',')}×`
}

/**
 * A conta que rendeu aqueles pontos: `"3 × 1,50 = 5"`.
 *
 * Sem multiplicador a conta some e sobra o número — mostrar "3 × 1,00 = 3" seria
 * ocupar uma linha para dizer que nada aconteceu.
 *
 * Lê `base` e `multiplicador` GRAVADOS na linha, nunca a regra de hoje:
 * recalcular na leitura daria outro número amanhã, porque os hotspots de hoje
 * não são os de amanhã. É por isso que as duas colunas existem.
 */
export function formatarConta(pin: Pick<Pin, 'base' | 'multiplicador' | 'pontos'>): string {
  if (pin.multiplicador <= 1) return String(pin.pontos)

  // Sem o `×` do sufixo: o sinal de multiplicação já está na conta, e
  // "3 × 1,50× = 5" tem um a mais que ninguém consegue não ler duas vezes.
  const fator = pin.multiplicador.toFixed(2).replace('.', ',')
  return `${pin.base} × ${fator} = ${pin.pontos}`
}

/** O dia de calendário (local) em que o Pin caiu. */
export function diaDoPin(pin: Pick<Pin, 'created_at'>): string {
  const d = new Date(pin.created_at)
  return paraIso(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

export function totalDe(pins: Pick<Pin, 'pontos'>[]): number {
  return pins.reduce((soma, p) => soma + p.pontos, 0)
}

export interface DiaDoExtrato {
  dia: string
  pins: Pin[]
  total: number
}

/**
 * O extrato, quebrado por dia — do mais recente para o mais antigo.
 *
 * A lista chega ordenada do banco (`created_at desc`), e o agrupamento preserva
 * essa ordem em vez de reordenar: um `sort` aqui seria uma segunda opinião sobre
 * a ordem, e as duas divergiriam no dia em que a query mudasse.
 */
export function agruparPorDia(pins: Pin[]): DiaDoExtrato[] {
  const dias: DiaDoExtrato[] = []

  for (const pin of pins) {
    const dia = diaDoPin(pin)
    const atual = dias[dias.length - 1]

    if (atual?.dia === dia) {
      atual.pins.push(pin)
      atual.total += pin.pontos
    }
    else {
      dias.push({ dia, pins: [pin], total: pin.pontos })
    }
  }

  return dias
}

/**
 * Quantos dias seguidos a pessoa registrou alguma coisa.
 *
 * Espelha o hotspot `sequencia` do banco, com uma diferença deliberada: aqui NÃO
 * há teto. O multiplicador satura em três dias, mas a tela mostra a sequência
 * real — quem está no décimo dia quer ver o décimo dia, e é justamente esse
 * número que faz a sequência valer a pena manter. Quem diz que o bônus parou é
 * a tela de regras, não este número.
 *
 * Conta a partir de HOJE quando o dia já tem Pin, e de ONTEM quando não tem:
 * antes do primeiro Pin do dia, a sequência de quem está mantendo-a ainda vale.
 * Zera quando o último Pin é anteontem ou mais.
 */
export function sequenciaDeDias(pins: Pick<Pin, 'created_at'>[], hoje: string): number {
  const dias = new Set(pins.map(diaDoPin))

  let dia = dias.has(hoje) ? hoje : somarDias(hoje, -1)
  let total = 0

  while (dias.has(dia)) {
    total += 1
    dia = somarDias(dia, -1)
  }

  return total
}
