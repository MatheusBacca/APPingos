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

export function formatarDia(iso: string): string {
  const { ano, mes, dia } = partesDaData(iso)
  return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
  })
}

export function formatarMes(mesIso: string): string {
  const { ano, mes } = partesDaData(mesIso)
  const nome = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${ano}`
}
