/**
 * Datas de calendário como texto `YYYY-MM-DD`, do banco até a tela.
 *
 * O banco guarda `date` (sem hora, sem fuso). Passar isso por
 * `new Date('2026-08-03')` interpretaria em UTC e, num fuso a oeste como o
 * nosso, devolveria o dia 2 — o clássico "o filme aparece um dia antes".
 * Por isso nada aqui converte para Date sem passar por `new Date(a, m, d)`,
 * que é sempre horário local.
 */

export function paraIso(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

export function partesDaData(iso: string): { ano: number, mes: number, dia: number } {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return { ano: ano!, mes: mes!, dia: dia! }
}

export function hojeIso(): string {
  const agora = new Date()
  return paraIso(agora.getFullYear(), agora.getMonth() + 1, agora.getDate())
}

/** Primeiro dia do mês a que a data pertence — a âncora do calendário. */
export function primeiroDoMes(iso: string): string {
  const { ano, mes } = partesDaData(iso)
  return paraIso(ano, mes, 1)
}

export function mesmoMes(iso: string, mesIso: string): boolean {
  return iso.slice(0, 7) === mesIso.slice(0, 7)
}

/**
 * Anda meses na âncora do mês. `new Date(ano, mes - 1 + n, 1)` normaliza a
 * virada de ano sozinho — dezembro + 1 vira janeiro do ano seguinte.
 */
export function somarMeses(mesIso: string, n: number): string {
  const { ano, mes } = partesDaData(mesIso)
  const d = new Date(ano, mes - 1 + n, 1)
  return paraIso(d.getFullYear(), d.getMonth() + 1, 1)
}

/** Último dia do mês, para fechar intervalos `data_compra between mes and fim`. */
export function ultimoDiaDoMes(mesIso: string): string {
  const { ano, mes } = partesDaData(mesIso)
  // Dia 0 do mês seguinte é o último dia deste — o Date normaliza a virada de ano.
  const d = new Date(ano, mes, 0)
  return paraIso(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

export function mesAbreviado(mesIso: string): string {
  const { ano, mes } = partesDaData(mesIso)
  return new Date(ano, mes - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'short' })
    .replace('.', '')
}

/** `YYYY-MM` do `<input type="month">` para a âncora `YYYY-MM-01` do banco. */
export function deMesInput(valor: string): string {
  return `${valor}-01`
}

export function paraMesInput(mesIso: string): string {
  return mesIso.slice(0, 7)
}

export function formatarDia(iso: string): string {
  const { ano, mes, dia } = partesDaData(iso)
  return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
  })
}

/** Só o nome do mês — "Julho". Para rótulo curto, onde o ano é óbvio. */
export function nomeDoMes(mesIso: string): string {
  const { ano, mes } = partesDaData(mesIso)
  const nome = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}`
}

export function formatarMes(mesIso: string): string {
  return `${nomeDoMes(mesIso)} de ${partesDaData(mesIso).ano}`
}

/**
 * "sáb, 9 de ago" — a data de relance, para o painel de resumos.
 *
 * O dia da semana entra porque a pergunta que o painel responde é "que filme a
 * gente marcou para sábado", e não "para o dia 9". Os pontos das abreviações do
 * pt-BR ("sáb., 9 de ago.") saem: numa linha curta eles só fazem ruído.
 */
export function formatarDiaCurto(iso: string): string {
  const { ano, mes, dia } = partesDaData(iso)
  return new Date(ano, mes - 1, dia)
    .toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/\./g, '')
}
