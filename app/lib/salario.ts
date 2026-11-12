/**
 * Quando o salário deve cair.
 *
 * A regra de recebimento mora em `renda` (supabase/migrations/
 * 20261112120000_planejamento_renda.sql) e tem dois tipos:
 *
 *   - `dia_fixo`: o dia do mês. Num mês que não tem esse dia (31 em abril, 30 em
 *     fevereiro) vale o último dia — é o que "todo dia 31" quer dizer para quem
 *     paga. Não anda para o dia útil anterior: a regra que a pessoa declarou é o
 *     dia, e corrigir por conta própria seria inventar uma política da empresa.
 *   - `dia_util`: o N-ésimo dia útil ("até o 5º dia útil", o comum da CLT).
 *
 * Dia útil aqui é DIA DE BANCO: segunda a sexta, menos os feriados nacionais e os
 * dois dias de Carnaval e Corpus Christi. Os três últimos são ponto facultativo na
 * lei, mas não há expediente bancário neles — e o salário é um crédito em conta.
 * É também a data que a Frente B (Pluggy) usa como centro da janela de
 * conciliação do crédito no extrato, então errar para o lado da lei faria o app
 * esperar o salário num dia em que nenhum banco compensa nada.
 *
 * Sábado NÃO conta, embora a fiscalização do trabalho conte o sábado como dia útil
 * para o prazo do art. 459 da CLT. A decisão (docs/contrato-planejamento-open-
 * finance.md, seção 4) foi pelo calendário bancário pela mesma razão acima.
 *
 * Feriados estaduais e municipais ficam de fora: o app não sabe onde cada um
 * mora, e um feriado a mais desloca o "5º dia útil" um dia para frente — o pior
 * caso é a projeção esperar o salário um dia depois.
 */
import { paraIso, partesDaData, primeiroDoMes, somarDias, ultimoDiaDoMes } from '@/lib/datas'

export type RecebimentoTipo = 'dia_fixo' | 'dia_util'

export interface Feriado {
  data: string
  nome: string
}

/**
 * Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano).
 * É a âncora dos feriados móveis — Carnaval, Sexta-feira Santa, Corpus Christi.
 */
export function pascoa(ano: number): string {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return paraIso(ano, mes, dia)
}

const cachePorAno = new Map<number, Feriado[]>()

/** Os dias sem expediente bancário no país inteiro, em ordem de data. */
export function feriadosNacionais(ano: number): Feriado[] {
  const guardado = cachePorAno.get(ano)
  if (guardado) return guardado

  const domingo = pascoa(ano)
  const fixo = (mes: number, dia: number, nome: string): Feriado => ({ data: paraIso(ano, mes, dia), nome })
  const movel = (delta: number, nome: string): Feriado => ({ data: somarDias(domingo, delta), nome })

  const feriados: Feriado[] = [
    fixo(1, 1, 'Confraternização Universal'),
    movel(-48, 'Carnaval'),
    movel(-47, 'Carnaval'),
    movel(-2, 'Sexta-feira Santa'),
    fixo(4, 21, 'Tiradentes'),
    fixo(5, 1, 'Dia do Trabalho'),
    movel(60, 'Corpus Christi'),
    fixo(9, 7, 'Independência'),
    fixo(10, 12, 'Nossa Senhora Aparecida'),
    fixo(11, 2, 'Finados'),
    fixo(11, 15, 'Proclamação da República'),
    // Feriado nacional desde 2024 (Lei 14.759/2023). Antes disso, só em alguns estados.
    ...(ano >= 2024 ? [fixo(11, 20, 'Dia Nacional de Zumbi e da Consciência Negra')] : []),
    fixo(12, 25, 'Natal'),
  ].sort((x, y) => x.data.localeCompare(y.data))

  cachePorAno.set(ano, feriados)
  return feriados
}

/** Segunda a sexta, fora dos feriados nacionais. */
export function ehDiaUtil(iso: string): boolean {
  const { ano, mes, dia } = partesDaData(iso)
  const semana = new Date(ano, mes - 1, dia).getDay()
  if (semana === 0 || semana === 6) return false
  return !feriadosNacionais(ano).some(f => f.data === iso)
}

/**
 * A data em que o salário daquela competência deve cair.
 *
 * `competencia` é qualquer data do mês (o app usa a âncora `YYYY-MM-01`). Para
 * `dia_util`, um N maior do que os dias úteis do mês devolve o ÚLTIMO dia útil:
 * fevereiro com Carnaval tem 18, e "até o 20º dia útil" quer dizer, no limite, o
 * fim do mês — nunca o mês seguinte, que seria a competência errada.
 */
export function dataPrevistaDoSalario(competencia: string, tipo: RecebimentoTipo, dia: number): string {
  const inicio = primeiroDoMes(competencia)
  const fim = ultimoDiaDoMes(inicio)

  if (tipo === 'dia_fixo') {
    const { ano, mes } = partesDaData(inicio)
    const ultimo = partesDaData(fim).dia
    return paraIso(ano, mes, Math.min(Math.max(dia, 1), ultimo))
  }

  const alvo = Math.max(dia, 1)
  let contados = 0
  let ultimoUtil: string | null = null

  for (let data = inicio; data <= fim; data = somarDias(data, 1)) {
    if (!ehDiaUtil(data)) continue
    contados++
    ultimoUtil = data
    if (contados === alvo) return data
  }

  // Todo mês tem dia útil; o `?? fim` só existe para o tipo não mentir.
  return ultimoUtil ?? fim
}

/** "dia 5" / "5º dia útil" — como a regra aparece na tela. */
export function descreverRecebimento(tipo: RecebimentoTipo, dia: number): string {
  return tipo === 'dia_fixo' ? `todo dia ${dia}` : `até o ${dia}º dia útil`
}
