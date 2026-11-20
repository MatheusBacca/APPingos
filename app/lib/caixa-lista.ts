/**
 * Como a caixa de entrada se organiza na tela: por dia, com um total no topo,
 * filtros por origem e o atalho "Aceitar" quando o app já sabe a resposta.
 *
 * Fica fora do componente para ser testável sem Vue, como o resto de
 * `~/lib/caixa-de-entrada`.
 */
import { nomeDoBanco } from '~/lib/instituicoes'
import { formatarDia, primeiroDoMes, somarDias } from '@/lib/datas'
import { formatarDinheiro } from '@/lib/dinheiro'
import type { Sugestao } from '~/lib/auto-tag'
import type { ItemDaCaixa } from '~/lib/caixa-de-entrada'
import { reconhecerEstabelecimento } from '~/lib/estabelecimentos'

export function valorDoItem(item: ItemDaCaixa): number {
  return Math.round(item.transacoes.reduce((s, t) => s + Number(t.valor), 0) * 100) / 100
}

export interface GrupoDoDia<T extends { data: string }> {
  dia: string
  rotulo: string
  itens: T[]
}

/** "Hoje", "Ontem", "16 de novembro" — na ordem em que os itens chegaram (do mais novo). */
export function rotuloDoDia(dia: string, hoje: string): string {
  if (dia === hoje) return 'Hoje'
  if (dia === somarDias(hoje, -1)) return 'Ontem'
  return formatarDia(dia)
}

export function gruposPorDia<T extends { data: string }>(itens: T[], hoje: string): GrupoDoDia<T>[] {
  const grupos: GrupoDoDia<T>[] = []
  for (const item of itens) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo?.dia === item.data) ultimo.itens.push(item)
    else grupos.push({ dia: item.data, rotulo: rotuloDoDia(item.data, hoje), itens: [item] })
  }
  return grupos
}

/**
 * "R$ 1.380,00 em 18 compras". Só o que SAI conta no valor: o salário que caiu
 * não é dinheiro esperando destino de gasto, e somá-lo inflaria o número.
 */
export function resumoDaCaixa(itens: ItemDaCaixa[]): { total: number, quantidade: number, texto: string } {
  const saidas = itens.filter(i => i.sentido === 'saida')
  const total = Math.round(saidas.reduce((s, i) => s + valorDoItem(i), 0) * 100) / 100
  const quantidade = itens.length
  const nome = quantidade === 1 ? 'compra' : 'compras'
  return { total, quantidade, texto: `${formatarDinheiro(total)} em ${quantidade} ${nome}` }
}

/**
 * Dá para aceitar num toque quando a sugestão já tem tudo que o diálogo
 * pediria: o destino (casal ou pessoal), a categoria, e confiança de quem
 * escolheu isso mais de uma vez — ou a primeira, se foi agora mesmo e igual.
 * Marca conhecida sozinha não basta: ela sabe a categoria, não para quem é.
 */
export function aceitavel(s: Sugestao | null | undefined): s is Sugestao & { destino: 'casal' | 'pessoal' } {
  return !!s
    && s.origem === 'regra'
    && (s.destino === 'casal' || s.destino === 'pessoal')
    && !!s.categoriaNome
    && (s.confianca === 'media' || s.confianca === 'alta')
}

export type Origem = 'todas' | 'cartao' | 'conta'

export interface FiltroDaCaixa {
  origem: Origem
  /** `conta_id` de um cartão ou conta específico; `null` = todos da origem. */
  conta: string | null
  soComSugestao: boolean
}

export const FILTRO_INICIAL: FiltroDaCaixa = { origem: 'todas', conta: null, soComSugestao: false }

export function filtrarCaixa<T extends ItemDaCaixa>(
  itens: T[],
  filtro: FiltroDaCaixa,
  tipoDaConta: (contaId: string) => 'conta' | 'cartao' | null,
  sugestoes: Map<string, Sugestao>,
): T[] {
  return itens.filter((item) => {
    const conta = item.principal.conta_id
    if (filtro.conta && conta !== filtro.conta) return false
    if (filtro.origem !== 'todas' && tipoDaConta(conta) !== filtro.origem) return false
    if (filtro.soComSugestao && !sugestoes.has(item.chave)) return false
    return true
  })
}

// ---- a página do mês ----------------------------------------------------------

/*
 * A caixa pagina por MÊS DA COMPRA (a data do item), e não pela competência da
 * fatura: é a data que o calendário ao lado mostra, e uma página que pusesse
 * 30/10 dentro de novembro teria um dia que o calendário de novembro não tem.
 * A competência é a régua do Chico Moedas (`pendentesDoCasal`), onde a pergunta
 * é "o que pesa neste acerto".
 */

/** O mês (YYYY-MM-01) em que o item aparece: o da data mais recente dele, a mesma que o agrupa por dia. */
export function mesDoItem(item: { data: string }): string {
  return primeiroDoMes(item.data)
}

/** Os meses que têm algo esperando e quantos itens cada um, do mais novo para o mais antigo. */
export function mesesDaCaixa(itens: ReadonlyArray<{ data: string }>): Array<{ mes: string, quantidade: number }> {
  const conta = new Map<string, number>()
  for (const item of itens) {
    const mes = mesDoItem(item)
    conta.set(mes, (conta.get(mes) ?? 0) + 1)
  }
  return [...conta].map(([mes, quantidade]) => ({ mes, quantidade })).sort((a, b) => b.mes.localeCompare(a.mes))
}

/** Quantos itens em cada dia do mês — os números do calendário. */
export function contagemPorDia(itens: ReadonlyArray<{ data: string }>, mes: string): Map<string, number> {
  const conta = new Map<string, number>()
  for (const item of itens) {
    if (mesDoItem(item) !== mes) continue
    conta.set(item.data, (conta.get(item.data) ?? 0) + 1)
  }
  return conta
}

/** A página: os itens do mês e, com um dia marcado no calendário, só os dele. */
export function recortarPorData<T extends { data: string }>(itens: T[], mes: string, dia: string | null): T[] {
  return itens.filter(item => (dia ? item.data === dia : mesDoItem(item) === mes))
}

/**
 * Os pendentes do casal num mês do Chico Moedas: gasto já lançado pelo banco,
 * de um cartão designado a ESTE espaço, numa fatura desta competência. É o
 * mesmo recorte da RPC `pendencias_do_espaco` — a lista que a dona vê tem de
 * bater com o número que a outra pessoa vê.
 */
export function pendentesDoCasal<T extends ItemDaCaixa>(
  itens: T[],
  spaceId: string,
  competencia: string,
  contaDe: (contaId: string) => { destino?: string, space_id?: string | null } | null | undefined,
): T[] {
  return itens.filter((item) => {
    if (item.sentido !== 'saida' || item.pendente) return false
    const conta = contaDe(item.principal.conta_id)
    if (conta?.destino !== 'casal' || conta.space_id !== spaceId) return false
    return item.transacoes.some(t => !t.pendente && t.competencia === competencia)
  })
}

export type DestinoDaOrigem = 'casal' | 'pessoal' | 'perguntar'

/**
 * O ícone do destino, na frente do banco: 👤 pessoal, 👥 compartilhado com um
 * espaço, 🔀 "perguntar a cada compra" — o caminho ainda não escolhido.
 */
export const ICONE_DO_DESTINO: Record<DestinoDaOrigem, string> = {
  pessoal: '👤',
  casal: '👥',
  perguntar: '🔀',
}

export interface ContaParaRotulo {
  nome: string
  tipo?: 'conta' | 'cartao'
  numero?: string | null
  apelido?: string | null
  destino?: DestinoDaOrigem
  space_id?: string | null
  conexao?: { banco: string, instituicao?: string | null } | null
  cartoes?: ReadonlyArray<{ final: string, apelido: string | null, destino: string, space_id: string | null }> | null
}

export interface OrigemDaTransacao {
  icone: string
  destino: DestinoDaOrigem
  /** "C6", "Nubank"; sem instituição reconhecida, o nome da conta. */
  banco: string
  /** `•••• 7450` ou `"Uber"`; vazio quando não há número nem apelido. */
  identificador: string
}

/** Os 4 últimos dígitos: "29190816-0" vira "8160", "7450" fica "7450". */
const ultimosQuatro = (numero: string) => numero.replace(/\D/g, '').slice(-4) || numero.slice(-4)

/**
 * De onde veio o valor: o destino (do cartão daquele final, ou da conta), o
 * banco de verdade e o apelido ou o final.
 *
 * O cartão por final ganha da conta: o virtual do casal e o físico pessoal
 * faturam na mesma conta, e cada um vai para um lugar. `herdar` segue a conta.
 * O apelido do final ganha do da conta; o da conta vale para o cartão principal
 * (o final que é o número da conta) e para a conta corrente.
 */
export function origemDaConta(conta: ContaParaRotulo, final?: string | null): OrigemDaTransacao {
  const cartao = final ? conta.cartoes?.find(c => c.final === final) : undefined
  const destinoDoCartao = cartao && cartao.destino !== 'herdar' ? cartao.destino as DestinoDaOrigem : null
  const destinoBase = destinoDoCartao ?? conta.destino ?? 'perguntar'
  // "casal" sem espaço não existe no banco (o gatilho volta para perguntar); aqui só por garantia.
  const destino: DestinoDaOrigem = destinoBase === 'casal' && !(destinoDoCartao ? cartao!.space_id : conta.space_id)
    ? 'perguntar'
    : destinoBase

  const numero = final || conta.numero || null
  const principal = !final || final === conta.numero
  const apelido = cartao?.apelido?.trim() || (principal ? conta.apelido?.trim() : '') || ''

  return {
    icone: ICONE_DO_DESTINO[destino],
    destino,
    banco: nomeDoBanco(conta.conexao, conta.nome),
    identificador: apelido ? `"${apelido}"` : numero ? `•••• ${ultimosQuatro(numero)}` : '',
  }
}

/** `👤 C6 •••• 7450`, `👥 Nubank "Mercado"`; sem conta, vazio. */
export function rotuloDaConta(conta: ContaParaRotulo | null | undefined, final?: string | null): string {
  if (!conta) return ''
  const o = origemDaConta(conta, final)
  return [o.icone, o.banco, o.identificador].filter(Boolean).join(' ')
}

/** O nome do banco para o selo (ícone e cor), ou o nome da conta quando não há instituição. */
export function bancoDaConta(conta: ContaParaRotulo | null | undefined): string {
  return conta ? nomeDoBanco(conta.conexao, conta.nome) : ''
}

/**
 * O texto que o selo usa para reconhecer a loja — a MESMA ordem de
 * `rotuloParaRegra` (descrição primeiro, depois o estabelecimento da Pluggy).
 * Com ordens diferentes, "RAIA DROGASIL" virava título "Drogasil" com o selo
 * da Droga Raia.
 */
export function textoParaSelo(t: { descricao: string, estabelecimento_nome?: string | null }): string {
  return reconhecerEstabelecimento(t.descricao) ? t.descricao : (t.estabelecimento_nome || t.descricao)
}
