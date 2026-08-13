/**
 * Interesses — o domínio, e a conta que a tela não deve refazer.
 *
 * Um interesse é uma vontade ("monitor novo"), e cada jeito de realizá-la é um
 * **agrupamento**: um ou mais produtos que só valem juntos ("o monitor de 27 mais
 * o braço de mesa"). Comparar interesse é comparar agrupamento contra agrupamento,
 * nunca produto contra produto — um monitor de 24" sozinho não concorre com um
 * monitor de 27" mais suporte, e tratar os quatro como quatro candidatos soltos
 * responderia "o mais barato é o suporte de R$ 150".
 *
 *     Interesse "Monitor novo"
 *       ├── Agrupamento (escolhido)   Monitor 27" 1.800 + braço 300  = 2.100
 *       └── Agrupamento               Monitor 24" 1.200 + base   150 = 1.350
 *
 * Toda a conta interessante é sobre esse conjunto: quanto vale o interesse, quanto
 * custaria querer tudo, quanto o favorito custa a mais que a saída mais barata. É
 * isso que mora aqui, puro e testável fora do Nuxt — o mesmo arranjo de
 * `app/types/orcamento.ts`.
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
  /**
   * O agrupamento a que este produto pertence.
   *
   * `interesse_id` continua aqui, e não é redundância por acidente: a RLS e a
   * consulta da extensão passam por ele. Um trigger no banco garante que os dois
   * caminhos apontem para o mesmo interesse.
   */
  agrupamento_id: string
  nome: string
  url: string
  loja: string | null
  imagem_url: string | null
  preco: number | null
  preco_pix: number | null
  parcelas: number | null
  valor_parcela: number | null
  origem: OrigemProduto
  capturado_em: string
  /** `null` = nunca rechecado desde a captura. */
  verificado_em: string | null
  /** Rechecagens seguidas que não conseguiram ler preço nenhum. */
  falhas_seguidas: number
  created_at: string
}

/**
 * Um jeito de realizar o interesse: um produto, ou vários que só valem juntos.
 *
 * `nome` é `null` na maioria dos casos — o agrupamento de um produto só não precisa
 * de batismo, e chamar "Sofá" de "Sofá" é ruído. `nomeDoAgrupamento` cobre isso.
 */
export interface Agrupamento {
  id: string
  interesse_id: string
  nome: string | null
  /** O favorito. No máximo um por interesse, garantido por índice único parcial. */
  escolhido: boolean
  created_at: string
  produtos: InteresseProduto[]
}

/** Uma observação de preço no tempo — só entra quando algo mudou. */
export interface PrecoObservado {
  id: string
  produto_id: string
  preco: number | null
  preco_pix: number | null
  parcelas: number | null
  valor_parcela: number | null
  visto_em: string
}

/**
 * O que `juntar_produto_ao_agrupamento` devolve.
 *
 * Existe para a tela poder dizer o que de fato aconteceu: juntar dois produtos pode
 * apagar um agrupamento e mover o favorito, e mudar o favorito em silêncio é o tipo
 * de coisa que a pessoa descobre depois, olhando o total e não entendendo.
 *
 * `mudou: false` é soltar em cima de onde já estava — gesto abandonado, não falha.
 */
export interface ResultadoJuntar {
  mudou: boolean
  origem_apagada?: boolean
  favorito_movido?: boolean
}

/**
 * O que `registrar_preco_lido` devolve, para a tela dizer "2.399 → 1.999" sem
 * uma segunda consulta.
 */
export interface ResultadoRecheck {
  atualizado: boolean
  motivo?: 'sem_preco'
  falhas_seguidas?: number
  preco_antes?: number | null
  preco_depois?: number | null
  pix_antes?: number | null
  pix_depois?: number | null
}

/**
 * Quantas rechecagens seguidas falhando bastam para a tela parar de fingir que
 * o preço é fresco e dizer que a loja não está deixando ler.
 *
 * Três, e não uma: uma falha isolada é rede instável ou a loja de mau humor, e
 * avisar sobre isso seria ruído. Três seguidas é padrão.
 */
export const FALHAS_ATE_AVISAR = 3

export interface Interesse {
  id: string
  space_id: string
  criado_por: string
  titulo: string
  destino: DestinoInteresse
  estado: EstadoInteresse
  /** Texto livre — vale para quem não tem conta aqui ("minha mãe"). */
  para_quem: string | null
  /** Um membro do espaço, quando o presente é para alguém que usa o app. */
  para_quem_user_id: string | null
  observacao: string | null
  /**
   * Quem disse "darei de presente para ele".
   *
   * Visível para todo mundo, inclusive para quem criou o interesse: o app é de
   * gente que coordena, não que faz surpresa. Nunca é o dono — assumir o próprio
   * interesse não quer dizer nada, e o banco recusa.
   */
  assumido_por: string | null
  assumido_em: string | null
  convertido_em: string | null
  convertido_tipo: 'objetivo' | 'compra' | 'viagem' | null
  convertido_ref_id: string | null
  created_at: string
  updated_at: string
}

/** Onde um interesse aparece além da casa dele. */
export interface InteresseCompartilhamento {
  interesse_id: string
  space_id: string
  compartilhado_por: string
  created_at: string
}

/** Um interesse com seus agrupamentos, cada um com seus produtos. */
export interface InteresseComAgrupamentos extends Interesse {
  agrupamentos: Agrupamento[]
  compartilhamentos: InteresseCompartilhamento[]
}

/** O que o diálogo de criação/edição manda para o banco. */
export interface NovoInteresse {
  titulo: string
  destino: DestinoInteresse
  para_quem: string | null
  para_quem_user_id: string | null
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
 * Quantos produtos do agrupamento ainda não têm preço.
 *
 * A tela usa para dizer "1 sem preço" ao lado de uma soma incompleta, em vez de
 * apresentar um número parcial como se fosse o custo.
 */
export function produtosSemPreco(agrupamento: Agrupamento): number {
  return agrupamento.produtos.filter(p => precoEfetivo(p) === null).length
}

/** O que já se sabe somar, ignorando os produtos sem preço. */
export function somaParcial(agrupamento: Agrupamento): number {
  return agrupamento.produtos.reduce((soma, p) => soma + (precoEfetivo(p) ?? 0), 0)
}

/**
 * O que custa levar tudo o que este agrupamento pede.
 *
 * `null` enquanto **qualquer** produto estiver sem preço, e não a soma dos que têm:
 * uma soma parcial não é um preço menor, é um preço incompleto — e é justamente
 * comparando somas que a tela diz "dá para economizar R$ 750". Devolver 1.800 para
 * "monitor 1.800 + suporte sem preço" faria essa frase mentir a favor do
 * agrupamento pior documentado. Para exibir o que se sabe existe `somaParcial`.
 *
 * Agrupamento vazio também é `null` — ele existe (a tela acabou de criá-lo, os
 * produtos vêm em seguida), mas não custa zero.
 */
export function somaDoAgrupamento(agrupamento: Agrupamento): number | null {
  if (!agrupamento.produtos.length) return null
  if (produtosSemPreco(agrupamento) > 0) return null

  return somaParcial(agrupamento)
}

/**
 * Como chamar o agrupamento na tela.
 *
 * Com nome, o nome. Sem nome e com um produto só, o nome do produto — é o caso
 * comum, e um cabeçalho "(sem nome)" acima de "Sofá Retrátil" não informa nada.
 * Sem nome e com vários, os nomes juntos, que é literalmente o que ele é.
 */
export function nomeDoAgrupamento(agrupamento: Agrupamento): string {
  if (agrupamento.nome) return agrupamento.nome
  if (!agrupamento.produtos.length) return 'Sem produtos ainda'

  return agrupamento.produtos.map(p => p.nome).join(' + ')
}

/**
 * O agrupamento que representa o interesse.
 *
 * O escolhido manda, sempre — é uma decisão humana, e o mais barato não é
 * necessariamente o que se quer (o sofá certo pode ser o caro). Sem escolhido, cai
 * no mais barato com soma completa; sem nenhuma soma, no primeiro, que ao menos tem
 * nome e link.
 */
export function agrupamentoDoInteresse(agrupamentos: Agrupamento[]): Agrupamento | null {
  if (!agrupamentos.length) return null

  const escolhido = agrupamentos.find(a => a.escolhido)
  if (escolhido) return escolhido

  const comSoma = agrupamentos.filter(a => somaDoAgrupamento(a) !== null)
  if (!comSoma.length) return agrupamentos[0] ?? null

  return comSoma.reduce((maisBarato, a) =>
    somaDoAgrupamento(a)! < somaDoAgrupamento(maisBarato)! ? a : maisBarato,
  )
}

/** O preço que representa o interesse, ou `null` se nenhum agrupamento fecha conta. */
export function valorDoInteresse(agrupamentos: Agrupamento[]): number | null {
  const agrupamento = agrupamentoDoInteresse(agrupamentos)
  return agrupamento ? somaDoAgrupamento(agrupamento) : null
}

/**
 * Quanto o agrupamento escolhido custa a mais que a saída mais barata.
 *
 * `null` quando não há escolha a comparar (menos de dois com soma completa) ou
 * quando o escolhido já é o mais barato — nesses casos não há nada a dizer, e a
 * tela some com a linha em vez de mostrar "R$ 0,00 a mais".
 */
export function economiaPossivel(agrupamentos: Agrupamento[]): number | null {
  const comSoma = agrupamentos.filter(a => somaDoAgrupamento(a) !== null)
  if (comSoma.length < 2) return null

  const atual = agrupamentoDoInteresse(agrupamentos)
  if (!atual || somaDoAgrupamento(atual) === null) return null

  const menor = Math.min(...comSoma.map(a => somaDoAgrupamento(a)!))
  const diferenca = somaDoAgrupamento(atual)! - menor

  return diferenca > 0 ? diferenca : null
}

/**
 * Separar faz sentido? Só quando o produto tem companhia.
 *
 * Um produto sozinho já É o conjunto dele: "separar" criaria um agrupamento novo e
 * apagaria o antigo para chegar exatamente onde já se está — e trocaria um id que a
 * tela tem em mão, o que é pior que não fazer nada. O banco também recusa.
 */
export function podeSeparar(agrupamento: Agrupamento): boolean {
  return agrupamento.produtos.length > 1
}

/** Todos os produtos do interesse, achatados — para contar e para rechecar preço. */
export function produtosDoInteresse(agrupamentos: Agrupamento[]): InteresseProduto[] {
  return agrupamentos.flatMap(a => a.produtos)
}

/**
 * O produto que ilustra o interesse na lista: o primeiro do agrupamento que o
 * representa. Serve para a miniatura e para dizer de que loja veio.
 */
export function produtoDaCapa(agrupamentos: Agrupamento[]): InteresseProduto | null {
  const agrupamento = agrupamentoDoInteresse(agrupamentos)
  return agrupamento?.produtos[0] ?? null
}

/**
 * A soma dos interesses abertos — o "quanto custaria querer tudo isso".
 *
 * Conta um agrupamento por interesse (o que o representa), não todos: somar os três
 * sofás candidatos diria que a gente quer três sofás.
 */
export function totalDosInteresses(interesses: InteresseComAgrupamentos[]): number {
  return interesses.reduce((soma, i) => soma + (valorDoInteresse(i.agrupamentos) ?? 0), 0)
}

/**
 * Para quem é isto, em texto.
 *
 * As duas formas do campo se resolvem aqui, num lugar só: um membro do espaço
 * (`para_quem_user_id`, cujo nome vem do mapa de pessoas) ou texto livre
 * (`para_quem`, para quem não tem conta aqui). O nome NÃO é copiado para
 * `para_quem` na hora de salvar de propósito — ele mudaria de apelido e o interesse
 * ficaria apontando para um nome que não existe mais.
 *
 * O rótulo genérico cobre o caso de o mapa não ter a pessoa: ela saiu do espaço, ou
 * a lista de perfis ainda está carregando. Melhor "alguém do espaço" do que a tela
 * dizer que não é para ninguém.
 */
export function paraQuemDoInteresse(
  interesse: Interesse,
  pessoas?: Map<string, string>,
): string | null {
  if (interesse.para_quem_user_id) {
    return pessoas?.get(interesse.para_quem_user_id) ?? 'alguém do espaço'
  }

  return interesse.para_quem
}

/**
 * De onde a pessoa está olhando — o que decide quais interesses cabem na tela.
 *
 * A RLS já responde "quais eu PODERIA ver" (os dos meus espaços, mais os que
 * alguém compartilhou num espaço meu). Isto responde outra pergunta, que é de
 * apresentação: dos que posso ver, quais fazem sentido AQUI.
 */
export interface Vista {
  spaceId: string
  /** O espaço ativo é o pessoal de quem está olhando. */
  pessoal: boolean
  userId: string | null
}

/**
 * Este interesse aparece nesta vista?
 *
 * Três caminhos, e o terceiro é o que dá sentido ao espaço pessoal:
 *
 * 1. **Mora aqui** — foi criado neste espaço.
 * 2. **Foi compartilhado aqui** — o dono o trouxe para cá de propósito.
 * 3. **É meu, e este é o meu espaço pessoal.** Um interesse que eu criei no
 *    espaço do casal, ou que eu assumi ("darei de presente para ele"), continua
 *    sendo assunto meu. Sem esta regra, o espaço pessoal seria o único lugar do
 *    app que esconde o que a própria pessoa está tocando, e ela teria de trocar de
 *    espaço para lembrar do presente que prometeu.
 *
 * O caminho 3 vale só no pessoal: dentro do espaço do casal, os interesses
 * pessoais de cada um seguem invisíveis até que alguém os compartilhe — que é o
 * ponto de existir espaço pessoal.
 */
export function interesseNaVista(interesse: InteresseComAgrupamentos, vista: Vista): boolean {
  if (interesse.space_id === vista.spaceId) return true

  if (interesse.compartilhamentos.some(c => c.space_id === vista.spaceId)) return true

  if (vista.pessoal && vista.userId) {
    return interesse.criado_por === vista.userId || interesse.assumido_por === vista.userId
  }

  return false
}

/** O recorte da vista, preservando a ordem recebida. */
export function interessesDaVista(
  interesses: InteresseComAgrupamentos[],
  vista: Vista,
): InteresseComAgrupamentos[] {
  return interesses.filter(i => interesseNaVista(i, vista))
}

/**
 * O interesse está sendo visto de fora da casa dele.
 *
 * A tela usa para dizer de onde ele vem — sem isso, um interesse do casal
 * aparecendo no espaço pessoal parece um dado duplicado, e quem editar vai
 * estranhar a mudança acontecer nos dois lugares.
 */
export function interesseDeFora(interesse: Interesse, spaceId: string): boolean {
  return interesse.space_id !== spaceId
}

/**
 * Interesses agrupados por destino, na ordem de `DESTINOS`.
 *
 * Só devolve os grupos que têm alguém dentro — a lista não deve mostrar cinco
 * cabeçalhos para dois interesses.
 */
export function agruparPorDestino(
  interesses: InteresseComAgrupamentos[],
): { destino: DestinoInteresse, rotulo: string, itens: InteresseComAgrupamentos[] }[] {
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
