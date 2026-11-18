/**
 * Como a caixa de entrada se organiza na tela: por dia, com um total no topo,
 * filtros por origem e o atalho "Aceitar" quando o app já sabe a resposta.
 *
 * Fica fora do componente para ser testável sem Vue, como o resto de
 * `~/lib/caixa-de-entrada`.
 */
import { formatarDia, somarDias } from '@/lib/datas'
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

/** "Itaú •••• 1234"; sem número, o nome da conta. */
export function rotuloDaConta(conta: { nome: string, numero?: string | null, conexao?: { banco: string } | null } | null | undefined): string {
  if (!conta) return ''
  const banco = conta.conexao?.banco?.trim()
  if (conta.numero) return `${banco || conta.nome} •••• ${conta.numero.slice(-4)}`
  return conta.nome
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
