/**
 * As contas do painel de Orçamentos que não são de nenhuma tela de detalhe.
 *
 * O painel não refaz conta nenhuma que já tenha dono: gasto do mês, projeção,
 * fatura aberta e saldo do acerto vêm das mesmas funções que as telas de detalhe
 * usam (`totalDoMes`, `projecaoPessoal`, `useCartoes`, `saldoDoMes`). Um número
 * diferente no painel e na tela a que ele leva seria pior do que não ter painel.
 * Aqui fica só o que é leitura do próprio painel.
 */
import { partesDaData, primeiroDoMes, somarDias, ultimoDiaDoMes } from '@/lib/datas'
import { nomeDoBanco } from '~/lib/instituicoes'
import type { ConexaoBancaria } from '~/composables/useContasBancarias'
import { parteDe, saldoDoMes, totalDoMes } from '~/types/orcamento'
import type { CompraDoMes } from '~/types/orcamento'

/**
 * Variação percentual ante o período anterior (0,25 = +25%).
 *
 * `null` sem anterior ou com anterior zero: "quanto por cento a mais que nada"
 * não tem resposta, e a tela mostra "—" em vez de "Infinity%".
 */
export function variacaoEntre(atual: number, anterior: number | null | undefined): number | null {
  if (anterior === null || anterior === undefined || anterior === 0) return null
  return (atual - anterior) / anterior
}

/**
 * Quanto do mês já passou, de 0 a 1 — a régua do "no ritmo" do Planejamento.
 *
 * Mês fechado é 1 e mês futuro é 0: não há "ritmo" a comparar em nenhum dos dois,
 * e quem chama usa isso para não mostrar a frase.
 */
export function fracaoDoMes(competencia: string, hoje: string): number {
  const mesDeHoje = primeiroDoMes(hoje)
  if (competencia < mesDeHoje) return 1
  if (competencia > mesDeHoje) return 0
  const dias = partesDaData(ultimoDiaDoMes(competencia)).dia
  return partesDaData(hoje).dia / dias
}

export type Ritmo = 'folgado' | 'no-ritmo' | 'acima'

/**
 * O uso do planejado comparado com o pedaço do mês que já passou.
 *
 * Dez pontos de folga para cada lado: gastar 55% do plano com metade do mês
 * corrida é estar no ritmo, não acima dele — a conta do mercado cai num dia só.
 */
export function ritmoDoMes(uso: number, fracao: number): Ritmo {
  if (uso > fracao + 0.1) return 'acima'
  if (uso < fracao - 0.1) return 'folgado'
  return 'no-ritmo'
}

export interface ContaComSaldo {
  id: string
  nome: string
  banco: string
  saldo: number
  atualizadoEm: string | null
}

export interface SaldoDasContas {
  total: number
  /** Da maior para a menor. */
  contas: ContaComSaldo[]
  /** A atualização mais antiga entre as contas — é a idade do total. */
  atualizadoEm: string | null
}

/**
 * O saldo somado das contas correntes conectadas (os cartões ficam de fora: o
 * "saldo" de um cartão é a fatura, e entra no cartão de Faturas).
 *
 * `null` quando não há conta nenhuma: sem banco conectado o cartão vira convite,
 * e não um "R$ 0,00" que pareceria conta zerada.
 */
export function saldoDasContas(conexoes: ReadonlyArray<ConexaoBancaria>): SaldoDasContas | null {
  const contas: ContaComSaldo[] = []
  for (const conexao of conexoes) {
    for (const conta of conexao.contas) {
      if (conta.tipo !== 'conta' || conta.saldo === null) continue
      contas.push({
        id: conta.id,
        nome: conta.apelido || conta.nome,
        banco: nomeDoBanco(conexao, conta.nome),
        saldo: Number(conta.saldo),
        atualizadoEm: conta.saldo_atualizado_em,
      })
    }
  }
  if (!contas.length) return null

  contas.sort((a, b) => b.saldo - a.saldo)
  const datas = contas.map(c => c.atualizadoEm).filter((d): d is string => !!d).sort()
  return {
    total: Math.round(contas.reduce((s, c) => s + c.saldo, 0) * 100) / 100,
    contas,
    atualizadoEm: datas[0] ?? null,
  }
}

/**
 * A cor do banco servindo de cor de dado (barra, fatia), ou `null` quando ela
 * sumiria contra o cartão num dos temas: o preto do C6 no escuro, um branco no
 * claro. Com `null`, quem desenha usa `currentColor` — o texto atenuado, que
 * tem contraste nos dois temas.
 */
export function corDeDado(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = Number.parseInt(m[1]!, 16)
  const canal = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminancia = 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255)
  return luminancia < 0.02 || luminancia > 0.85 ? null : hex
}

// ---- O planejado, semana a semana ----------------------------------------------

export interface SemanaDoPlanejado {
  /** Primeiro e último dia do bloco (AAAA-MM-DD). */
  inicio: string
  fim: string
  /** "1–7 nov" */
  rotulo: string
  gasto: number
  /** A parte do planejado que cabe nesta semana, pelos dias dela. */
  cota: number
  /** Gasto sobre a cota: 1 = gastou exatamente a parte da semana (pode passar de 1). */
  fracao: number
  atual: boolean
  futura: boolean
}

/**
 * O realizado do mês repartido em quatro blocos — 1–7, 8–14, 15–21 e 22 ao fim
 * do mês — e cada um medido contra a sua parte do planejado.
 *
 * A parte de cada bloco é proporcional aos dias dele (o último tem de 7 a 10):
 * com R$ 3.000 num mês de 30 dias, a semana de 1–7 tem R$ 700. Assim "68%" na
 * primeira semana quer dizer "gastou 68% do que cabia nela", e semanas com a
 * barra cheia antes da hora mostram onde o mês escapou.
 *
 * O lançamento vai para o bloco do seu dia. O que tem data de antes do mês —
 * a parcela de uma compra antiga — cai na primeira semana: é dinheiro que o mês
 * já começou devendo. O de depois, na última.
 */
export function semanasDoPlanejado(dados: {
  competencia: string
  planejado: number
  lancamentos: ReadonlyArray<{ valor: number, data: string }>
  hoje: string
  /** "nov" — o rótulo do mês, vindo de quem já sabe formatar. */
  mesCurto: string
}): SemanaDoPlanejado[] {
  const { ano, mes } = partesDaData(dados.competencia)
  const ultimo = partesDaData(ultimoDiaDoMes(dados.competencia)).dia
  const dia = (d: number) => `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const blocos: Array<[number, number]> = [[1, 7], [8, 14], [15, 21], [22, ultimo]]

  const gastos = blocos.map(() => 0)
  for (const l of dados.lancamentos) {
    const d = l.data < dia(1) ? 1 : l.data > dia(ultimo) ? ultimo : partesDaData(l.data).dia
    const i = blocos.findIndex(([de, ate]) => d >= de && d <= ate)
    gastos[i]! += Number(l.valor)
  }

  return blocos.map(([de, ate], i) => {
    const cota = dados.planejado > 0 ? (dados.planejado * (ate - de + 1)) / ultimo : 0
    const gasto = redondo(gastos[i]!)
    return {
      inicio: dia(de),
      fim: dia(ate),
      rotulo: `${de}–${ate} ${dados.mesCurto}`,
      gasto,
      cota: redondo(cota),
      fracao: cota > 0 ? Math.max(0, gasto) / cota : 0,
      atual: dados.hoje >= dia(de) && dados.hoje <= dia(ate),
      futura: dados.hoje < dia(de),
    }
  })
}

// ---- A pizza do salário ------------------------------------------------------

export type ChaveDaFatia = 'faturas' | 'investido' | 'livre'

export interface FatiaDoSalario {
  chave: ChaveDaFatia
  rotulo: string
  valor: number
  /** Do salário, de 0 a 1. As três somam 1 quando nada estourou. */
  fracao: number
}

export interface SalarioRepartido {
  salario: number
  fatias: FatiaDoSalario[]
  /** Quanto faturas + investido passaram do salário; zero quando cabem nele. */
  estouro: number
  /** As faturas abertas como o banco mostra, antes do acerto. */
  faturasDoBanco: number
  /** O acerto que entrou na conta: positivo = te devem (abate), negativo = você deve (soma). */
  acerto: number
}

const redondo = (n: number) => Math.round(n * 100) / 100

/**
 * O salário do mês repartido em três: o que está nas faturas abertas, o que foi
 * guardado (metas e caixinhas) e o que ainda está livre.
 *
 * A contribuição ao casal não é fatia — foi a escolha de produto para esta
 * leitura, que responde "do que eu ganho, quanto já está comprometido no
 * cartão e quanto eu guardei". Quem quer a conta com a contribuição tem a
 * Sobra do Planejamento.
 *
 * Quando faturas e investido passam do salário, o livre é zero e as outras
 * duas fatias dividem a pizza na proporção delas; o tanto que passou vai em
 * `estouro`, para a tela dizer em texto — uma pizza não desenha mais de 100%.
 *
 * O ACERTO entra na fatia das faturas (`acertoAPagar`): o que te devem volta
 * para você e abate o que sai do salário; o que você deve soma. A fatia nunca
 * fica negativa — receber mais do que a fatura não vira salário a mais aqui.
 */
export function repartirSalario(dados: { salario: number, faturas: number, investido: number, acerto?: number }): SalarioRepartido | null {
  if (!(dados.salario > 0)) return null
  const faturasDoBanco = Math.max(0, redondo(dados.faturas))
  const acerto = redondo(dados.acerto ?? 0)
  const faturas = acertoAPagar(faturasDoBanco, acerto)
  const investido = Math.max(0, redondo(dados.investido))
  const comprometido = faturas + investido
  const livre = Math.max(0, redondo(dados.salario - comprometido))
  const base = Math.max(dados.salario, comprometido)
  return {
    salario: redondo(dados.salario),
    fatias: [
      { chave: 'faturas', rotulo: 'Faturas', valor: faturas, fracao: faturas / base },
      { chave: 'investido', rotulo: 'Investido', valor: investido, fracao: investido / base },
      { chave: 'livre', rotulo: 'Livre', valor: livre, fracao: livre / base },
    ],
    estouro: Math.max(0, redondo(comprometido - dados.salario)),
    faturasDoBanco,
    acerto,
  }
}

/** As faturas depois do acerto: o que te devem abate, o que você deve soma; nunca abaixo de zero. */
export function acertoAPagar(faturas: number, acerto: number): number {
  return Math.max(0, redondo(faturas - acerto))
}

export interface SaldoNoEspaco {
  spaceId: string
  /** Positivo = te devem; negativo = você deve. */
  saldo: number
}

/**
 * O seu saldo no acerto do mês de cada espaço compartilhado — a mesma conta do
 * cartão "Acerto do mês" (`saldoDoMes` com os membros do espaço), só que em
 * todos os espaços de uma vez: é dinheiro que volta para você (ou sai de você)
 * junto com as faturas.
 *
 * A mesma régua do cartão: só espaço de DUAS pessoas (é onde existe "fulano
 * deve a beltrano"), com os membros de verdade (`membership`), não os que
 * aparecem nas compras. Fica de fora o pessoal e o espaço cujo mês já foi
 * marcado como acertado — aquele dinheiro já trocou de mãos.
 */
export function saldosNosAcertos(dados: {
  espacos: ReadonlyArray<{ id: string, tipo: string }>
  compras: ReadonlyMap<string, CompraDoMes[]>
  acertados: ReadonlySet<string>
  membros: ReadonlyMap<string, string[]>
  eu: string | null
}): { total: number, porEspaco: SaldoNoEspaco[] } {
  if (!dados.eu) return { total: 0, porEspaco: [] }
  const porEspaco: SaldoNoEspaco[] = []
  for (const e of dados.espacos) {
    if (e.tipo === 'pessoal' || dados.acertados.has(e.id)) continue
    const membros = dados.membros.get(e.id) ?? []
    if (membros.length !== 2 || !membros.includes(dados.eu)) continue
    const compras = dados.compras.get(e.id) ?? []
    if (!compras.length) continue
    const meu = saldoDoMes(compras, membros).find(s => s.user_id === dados.eu)
    if (meu && meu.saldo !== 0) porEspaco.push({ spaceId: e.id, saldo: meu.saldo })
  }
  return { total: redondo(porEspaco.reduce((s, p) => s + p.saldo, 0)), porEspaco }
}

/**
 * Junta os acertos de mais de um mês (o aberto e o anterior ainda não pago — o
 * mesmo "Pendente" da lateral): por espaço, somando, e o total.
 */
export function somarAcertos(...meses: ReadonlyArray<{ total: number, porEspaco: SaldoNoEspaco[] }>): { total: number, porEspaco: SaldoNoEspaco[] } {
  const porEspaco = new Map<string, number>()
  for (const m of meses) {
    for (const p of m.porEspaco) porEspaco.set(p.spaceId, redondo((porEspaco.get(p.spaceId) ?? 0) + p.saldo))
  }
  const lista = [...porEspaco].filter(([, saldo]) => saldo !== 0).map(([spaceId, saldo]) => ({ spaceId, saldo }))
  return { total: redondo(lista.reduce((s, p) => s + p.saldo, 0)), porEspaco: lista }
}

/**
 * O que a pessoa aplicou nas caixinhas no mês, pelos movimentos dela.
 *
 * Ficam de fora os movimentos ligados a um aporte de meta (`meta_aporte_id`):
 * esses já entram pela soma dos aportes, e contar os dois seria guardar o mesmo
 * dinheiro duas vezes. Resgates entram com sinal — tiram do guardado.
 */
export function aplicadoNasCaixinhas(
  caixinhas: ReadonlyArray<{ movimentos: ReadonlyArray<{ valor: number, data: string, meta_aporte_id: string | null, user_id: string }> }>,
  competencia: string,
  eu: string | null,
): number {
  if (!eu) return 0
  let total = 0
  for (const c of caixinhas) {
    for (const m of c.movimentos) {
      if (m.user_id !== eu || m.meta_aporte_id || m.data.slice(0, 7) !== competencia.slice(0, 7)) continue
      total += Number(m.valor)
    }
  }
  return redondo(total)
}

// ---- Últimas movimentações ---------------------------------------------------

/**
 * A etiqueta miúda de uma movimentação do extrato: o que ela é, ou o que foi
 * feito dela. A exclusão automática vem primeiro — um pagamento de fatura nunca
 * vira "esperando destino", porque nunca vai precisar de um.
 */
export function etiquetaDaMovimentacao(t: {
  sentido: 'entrada' | 'saida'
  destino: string | null
  motivo_exclusao: string | null
}): string {
  if (t.motivo_exclusao === 'pagamento_fatura') return 'Pagamento de fatura'
  if (t.motivo_exclusao === 'transferencia_propria') return 'Entre suas contas'
  switch (t.destino) {
    case 'renda': return 'Receita'
    case 'aporte': return 'Aporte em meta'
    case 'investimento': return 'Investimento'
    case 'ignorada': return 'Ignorada'
    case 'compra': return 'Lançada'
    case null: return t.sentido === 'entrada' ? 'Entrada' : 'Esperando destino'
    default: return t.sentido === 'entrada' ? 'Entrada' : 'Saída'
  }
}

/** "Hoje", "Ontem" ou "21/11" — a coluna estreita da data. */
export function quandoFoi(dia: string, hoje: string): string {
  if (dia === hoje) return 'Hoje'
  if (dia === somarDias(hoje, -1)) return 'Ontem'
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
}

/** "AAAA-MM" — o formato do `?mes=` que as telas de detalhe leem. */
export function mesNaUrl(competencia: string): string {
  return competencia.slice(0, 7)
}

/**
 * A competência que veio no `?mes=AAAA-MM`, ou `null` se não veio ou não é um mês.
 * É o que deixa o atalho do painel abrir a tela de detalhe no mesmo mês.
 */
export function competenciaDaUrl(valor: unknown): string | null {
  if (typeof valor !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(valor)) return null
  return `${valor}-01`
}

// ---- A barra "A pagar do salário" --------------------------------------------

/** As duas faixas da barra, como fração do salário (0,7 = 70%). */
export interface FaixasDoSalario {
  atencao: number
  alerta: number
}

/** O que vale enquanto a pessoa não ajusta nada — espelha o default da migration. */
export const FAIXAS_PADRAO: FaixasDoSalario = { atencao: 0.7, alerta: 1 }

export type TomDoSalario = 'tranquilo' | 'atencao' | 'alerta'

/**
 * A cor da barra: a partir da faixa de atenção é âmbar, a partir da de alerta é
 * vermelho. Sem salário (fração infinita) é alerta: tudo o que há a pagar está
 * descoberto.
 */
export function tomDoSalario(fracao: number, faixas: FaixasDoSalario = FAIXAS_PADRAO): TomDoSalario {
  if (!Number.isFinite(fracao) || fracao >= faixas.alerta) return 'alerta'
  if (fracao >= faixas.atencao) return 'atencao'
  return 'tranquilo'
}

/**
 * Confere as faixas digitadas em percentual (70, 100) e devolve a mensagem do
 * problema, ou `null` se servem. Espelha o CHECK `renda_faixas_validas`.
 */
export function problemaNasFaixas(atencaoPct: number, alertaPct: number): string | null {
  if (!Number.isFinite(atencaoPct) || !Number.isFinite(alertaPct)) return 'Preencha as duas faixas.'
  if (atencaoPct <= 0) return 'A faixa de atenção precisa ser maior que 0%.'
  if (alertaPct > 300) return 'A faixa de alerta vai até 300%.'
  if (atencaoPct >= alertaPct) return 'A faixa de atenção precisa ficar abaixo da de alerta.'
  return null
}

// ---- "Em que foi": os outros espaços -----------------------------------------

export interface ConsumoDeEspaco {
  spaceId: string
  nome: string
  pessoal: boolean
  /** O que aquele espaço tira do SEU mês: tudo no pessoal, a sua parte num compartilhado. */
  valor: number
}

/**
 * Quanto cada um dos OUTROS espaços — todos menos o aberto — consome do seu mês.
 *
 * No pessoal a gaveta é inteira sua; num compartilhado é a sua parte do rateio
 * (`parteDe`), a mesma leitura do "Meu bolso". Espaço sem compra no mês entra com
 * zero: a pergunta é "quanto cada espaço em que estou me custa", e zero é uma
 * resposta.
 */
export function consumoDosOutrosEspacos(dados: {
  ativo: string | null
  espacos: ReadonlyArray<{ id: string, nome: string, tipo: string }>
  compras: ReadonlyMap<string, CompraDoMes[]>
  eu: string | null
}): ConsumoDeEspaco[] {
  return dados.espacos
    .filter(e => e.id !== dados.ativo)
    .map((e) => {
      const compras = dados.compras.get(e.id) ?? []
      const pessoal = e.tipo === 'pessoal'
      const valor = pessoal || !dados.eu
        ? totalDoMes(compras)
        : redondo(compras.reduce((s, c) => s + parteDe(c.participantes, dados.eu!, c.valor), 0))
      return { spaceId: e.id, nome: e.nome, pessoal, valor }
    })
    .sort((a, b) => b.valor - a.valor)
}
