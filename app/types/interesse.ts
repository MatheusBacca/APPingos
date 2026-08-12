/**
 * Interesses — o domínio, e a conta que a tela não deve refazer.
 *
 * Um interesse é uma vontade ("trocar o sofá") com vários produtos candidatos
 * atrás dela. Toda pergunta interessante é sobre o conjunto: qual candidato vale
 * o valor do interesse, quanto custa a lista inteira, quanto o candidato mais
 * barato economiza. É isso que mora aqui, puro e testável fora do Nuxt — o mesmo
 * arranjo de `app/types/orcamento.ts`.
 *
 * As uniões abaixo espelham à mão os CHECKs de
 * `supabase/migrations/20260812150000_objetivos_interesses.sql`, pelo mesmo motivo
 * de `Papel` e `TipoEspaco` em `app/types/database.types.ts`: no banco são CHECK,
 * não enum, então o gerador de tipos os entrega como `string`. Ao mexer num CHECK
 * na migration, ajuste aqui também.
 */

export type DestinoInteresse = 'compra' | 'objetivo' | 'viagem' | 'projeto' | 'orcamento'

export type EstadoInteresse = 'rascunho' | 'amadurecendo' | 'convertido' | 'arquivado'

export type OrigemProduto = 'extensao' | 'manual'

/** Rótulos em ordem de exibição — a fonte única dos seletores e dos filtros. */
export const DESTINOS: { valor: DestinoInteresse, rotulo: string, icone: string }[] = [
  { valor: 'compra', rotulo: 'Compra', icone: 'ShoppingBagIcon' },
  { valor: 'objetivo', rotulo: 'Objetivo', icone: 'TargetIcon' },
  { valor: 'viagem', rotulo: 'Viagem', icone: 'PlaneIcon' },
  { valor: 'projeto', rotulo: 'Projeto', icone: 'HammerIcon' },
  { valor: 'orcamento', rotulo: 'Orçamento', icone: 'WalletIcon' },
]

/**
 * A ordem é a do amadurecimento, e 'arquivado' fecha a fila em vez de ficar
 * escondido: a maioria das ideias não vira nada, e isso é um fim legítimo.
 */
export const ESTADOS: { valor: EstadoInteresse, rotulo: string }[] = [
  { valor: 'rascunho', rotulo: 'Rascunho' },
  { valor: 'amadurecendo', rotulo: 'Amadurecendo' },
  { valor: 'convertido', rotulo: 'Convertido' },
  { valor: 'arquivado', rotulo: 'Arquivado' },
]

/** Os estados que contam como "vontade viva" — o que a lista mostra por padrão. */
export const ESTADOS_ABERTOS: EstadoInteresse[] = ['rascunho', 'amadurecendo']

export function rotuloDestino(destino: DestinoInteresse): string {
  return DESTINOS.find(d => d.valor === destino)?.rotulo ?? destino
}

export function rotuloEstado(estado: EstadoInteresse): string {
  return ESTADOS.find(e => e.valor === estado)?.rotulo ?? estado
}

export interface InteresseProduto {
  id: string
  interesse_id: string
  nome: string
  url: string
  loja: string | null
  imagem_url: string | null
  preco: number | null
  preco_pix: number | null
  parcelas: number | null
  valor_parcela: number | null
  escolhido: boolean
  origem: OrigemProduto
  capturado_em: string
  created_at: string
}

export interface Interesse {
  id: string
  space_id: string
  criado_por: string
  titulo: string
  destino: DestinoInteresse
  estado: EstadoInteresse
  para_quem: string | null
  observacao: string | null
  convertido_em: string | null
  convertido_tipo: 'objetivo' | 'compra' | 'viagem' | null
  convertido_ref_id: string | null
  created_at: string
  updated_at: string
}

export interface InteresseComProdutos extends Interesse {
  produtos: InteresseProduto[]
}

/** O que o diálogo de criação/edição manda para o banco. */
export interface NovoInteresse {
  titulo: string
  destino: DestinoInteresse
  para_quem: string | null
  observacao: string | null
}

/**
 * O produto como a extensão e o formulário o entregam.
 *
 * Só `nome` e `url` são obrigatórios, e é a decisão que sustenta a raspagem: uma
 * captura que não achou o preço grava o link e o nome em vez de recusar. O valor
 * entra à mão depois, na tela de detalhe.
 */
export interface ProdutoParaSalvar {
  nome: string
  url: string
  loja?: string | null
  imagem_url?: string | null
  preco?: number | null
  preco_pix?: number | null
  parcelas?: number | null
  valor_parcela?: number | null
  origem?: OrigemProduto
}

/**
 * O que este produto custa de verdade, hoje.
 *
 * Pix ganha do preço cheio quando existe porque é o que se paga à vista — a loja
 * anuncia o cheio para o parcelamento parecer menor. `null` quando não há preço
 * nenhum: zero seria mentira (diria "de graça" a quem só tem o link), e a tela
 * precisa distinguir "não sei o preço" de "é barato".
 */
export function precoEfetivo(produto: InteresseProduto): number | null {
  return produto.preco_pix ?? produto.preco ?? null
}

/**
 * O total do parcelamento — quase sempre maior que o preço cheio.
 *
 * Existe porque "12x de R$ 219,90" soa como R$ 2.399 e são R$ 2.638,80. Mostrar
 * os dois lado a lado é o ponto de guardar `parcelas` e `valor_parcela`
 * separados em vez de só a string que a loja exibia.
 */
export function totalParcelado(produto: InteresseProduto): number | null {
  if (!produto.parcelas || !produto.valor_parcela) return null
  return produto.parcelas * produto.valor_parcela
}

/**
 * O candidato que representa o interesse.
 *
 * O escolhido manda, sempre — é uma decisão humana, e o mais barato não é
 * necessariamente o que se quer (o sofá certo pode ser o caro). Sem escolhido,
 * cai no mais barato com preço conhecido; sem nenhum preço, no primeiro, que ao
 * menos tem nome e link.
 */
export function produtoDoInteresse(produtos: InteresseProduto[]): InteresseProduto | null {
  if (!produtos.length) return null

  const escolhido = produtos.find(p => p.escolhido)
  if (escolhido) return escolhido

  const comPreco = produtos.filter(p => precoEfetivo(p) !== null)
  if (!comPreco.length) return produtos[0] ?? null

  return comPreco.reduce((maisBarato, p) =>
    precoEfetivo(p)! < precoEfetivo(maisBarato)! ? p : maisBarato,
  )
}

/** O preço que representa o interesse, ou `null` se nenhum candidato tem preço. */
export function valorDoInteresse(produtos: InteresseProduto[]): number | null {
  const produto = produtoDoInteresse(produtos)
  return produto ? precoEfetivo(produto) : null
}

/**
 * Quanto o candidato escolhido custa a mais que o mais barato da lista.
 *
 * `null` quando não há escolha a comparar (menos de dois com preço) ou quando o
 * escolhido já é o mais barato — nesses casos não há nada a dizer, e a tela some
 * com a linha em vez de mostrar "R$ 0,00 a mais".
 */
export function economiaPossivel(produtos: InteresseProduto[]): number | null {
  const comPreco = produtos.filter(p => precoEfetivo(p) !== null)
  if (comPreco.length < 2) return null

  const atual = produtoDoInteresse(produtos)
  if (!atual || precoEfetivo(atual) === null) return null

  const menor = Math.min(...comPreco.map(p => precoEfetivo(p)!))
  const diferenca = precoEfetivo(atual)! - menor

  return diferenca > 0 ? diferenca : null
}

/**
 * A soma dos interesses abertos — o "quanto custaria querer tudo isso".
 *
 * Conta um produto por interesse (o que o representa), não todos: somar os três
 * sofás candidatos diria que a gente quer três sofás.
 */
export function totalDosInteresses(interesses: InteresseComProdutos[]): number {
  return interesses.reduce((soma, i) => soma + (valorDoInteresse(i.produtos) ?? 0), 0)
}

/**
 * Interesses agrupados por destino, na ordem de `DESTINOS`.
 *
 * Só devolve os grupos que têm alguém dentro — a lista não deve mostrar cinco
 * cabeçalhos para dois interesses.
 */
export function agruparPorDestino(
  interesses: InteresseComProdutos[],
): { destino: DestinoInteresse, rotulo: string, itens: InteresseComProdutos[] }[] {
  return DESTINOS
    .map(({ valor, rotulo }) => ({
      destino: valor,
      rotulo,
      itens: interesses.filter(i => i.destino === valor),
    }))
    .filter(grupo => grupo.itens.length > 0)
}

/**
 * O hostname sem `www.`, para mostrar de onde veio o produto.
 *
 * Tolerante a URL inválida de propósito: o campo é digitável na tela de detalhe,
 * e uma url meio digitada não pode derrubar a lista inteira.
 */
export function lojaDaUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  }
  catch {
    return null
  }
}
