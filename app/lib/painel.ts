/**
 * O painel como a pessoa o deixou: ordem, tamanho e o que ela não quer ver.
 *
 * Três decisões carregam este arquivo:
 *
 * 1. **O registro de módulos continua mandando no que EXISTE.** O layout diz
 *    apenas como as coisas aparecem. Por isso nada aqui guarda módulo: guarda
 *    `slug`, e `normalizarLayout` reconcilia com a lista de verdade a cada
 *    leitura. Módulo novo entra no fim sozinho, módulo removido some sem deixar
 *    um cartão fantasma — e um `localStorage` de dois meses atrás continua
 *    valendo.
 *
 * 2. **Tudo é função pura sobre o layout inteiro**, devolvendo um layout novo.
 *    O estado mora num `localStorage` reativo; se as regras morassem lá também,
 *    a única forma de testar "mover para cima pula o cartão escondido" seria
 *    montando a tela.
 *
 * 3. **Mover é entre VIZINHOS VISÍVEIS.** A ordem guardada tem os escondidos
 *    dentro dela (é o que faz um cartão voltar para onde estava, e não para o
 *    fim), então trocar de posição com o vizinho cru faria a seta não mexer nada
 *    na tela quando o vizinho estivesse escondido — o clássico "o botão está
 *    quebrado" que não está.
 */

/** A grade do painel tem duas colunas no desktop; um cartão ocupa uma ou as duas. */
export type LarguraDoCard = 1 | 2

/**
 * O piso da altura é o cabeçalho do cartão mais um respiro: abaixo disso não
 * sobra vitrine nenhuma, só um cartão cortado. O teto existe para o arraste que
 * escapou não deixar um cartão de dez mil pixels que a pessoa não consegue mais
 * alcançar para consertar.
 */
export const ALTURA_MINIMA = 140
export const ALTURA_MAXIMA = 900

/** O passo dos botões de altura — o caminho de quem não está no mouse. */
export const PASSO_DA_ALTURA = 40

// ---------------------------------------------------------------------------
// A grade que fecha os buracos
// ---------------------------------------------------------------------------

/**
 * A grade do painel não tem linhas do tamanho dos cartões: tem uma malha fina de
 * 4px, e cada cartão ocupa quantas linhas precisar.
 *
 * É isso que acaba com o buraco que aparecia quando dois cartões vizinhos tinham
 * alturas diferentes. Numa grade comum, a linha inteira fica com a altura do
 * cartão mais alto, e o mais baixo sobra um vão embaixo — pior ainda quando a
 * pessoa encolhe um cartão à mão, porque o espaço que ela liberou não vai para
 * lugar nenhum. Com a malha fina, o cartão seguinte da coluna começa logo abaixo
 * do que veio antes, e as duas colunas correm em alturas independentes.
 *
 * O vão vertical vira margem do cartão em vez de `row-gap`: com `row-gap` o vão
 * entraria na conta de CADA linha da malha, e o erro de arredondamento cresceria
 * com a altura do cartão. Assim ele é um valor fixo dentro do que se mede.
 */
export const LINHA_DA_GRADE = 4
export const VAO_DA_GRADE = 12

/** Quantas linhas da malha um cartão daquela altura ocupa, com o vão junto. */
export function linhasDoCartao(altura: number): number {
  return Math.max(1, Math.ceil((altura + VAO_DA_GRADE) / LINHA_DA_GRADE))
}

export interface AjusteDoCard {
  largura: LarguraDoCard
  /** Altura do cartão em px, ou `null` para a altura natural do conteúdo. */
  altura: number | null
  escondido: boolean
}

export interface LayoutDoPainel {
  /** Todos os slugs, escondidos inclusive — ver a decisão 3 no cabeçalho. */
  ordem: string[]
  cards: Record<string, AjusteDoCard>
}

export const AJUSTE_PADRAO: AjusteDoCard = { largura: 1, altura: null, escondido: false }

export function limitarAltura(px: number): number {
  return Math.min(Math.max(Math.round(px), ALTURA_MINIMA), ALTURA_MAXIMA)
}

/** O ajuste guardado, ou o padrão — nunca `undefined` para a tela tratar. */
export function ajusteDe(layout: LayoutDoPainel, slug: string): AjusteDoCard {
  return layout.cards[slug] ?? AJUSTE_PADRAO
}

function normalizarAjuste(bruto: unknown): AjusteDoCard {
  const dado = (bruto ?? {}) as Partial<AjusteDoCard>

  return {
    largura: dado.largura === 2 ? 2 : 1,
    altura: typeof dado.altura === 'number' && Number.isFinite(dado.altura)
      ? limitarAltura(dado.altura)
      : null,
    escondido: dado.escondido === true,
  }
}

/**
 * O layout guardado, reconciliado com os módulos que existem hoje.
 *
 * Recebe `unknown` de propósito: a origem é `localStorage`, que é texto que
 * qualquer um edita e que pode ter sido escrito por uma versão anterior do app.
 * Um `JSON.parse` de lixo não pode virar uma tela em branco.
 */
export function normalizarLayout(bruto: unknown, slugs: string[]): LayoutDoPainel {
  const dado = (bruto ?? {}) as Partial<LayoutDoPainel>
  const conhecidos = new Set(slugs)

  const guardada = Array.isArray(dado.ordem) ? dado.ordem : []
  const ordem = [...new Set(guardada.filter(s => typeof s === 'string' && conhecidos.has(s)))]

  // Módulo novo entra no fim, na ordem do registro — nunca some por não estar
  // no layout de quem instalou o app antes dele existir.
  for (const slug of slugs) {
    if (!ordem.includes(slug)) ordem.push(slug)
  }

  const guardados = (dado.cards ?? {}) as Record<string, unknown>
  const cards: Record<string, AjusteDoCard> = {}
  for (const slug of ordem) cards[slug] = normalizarAjuste(guardados[slug])

  return { ordem, cards }
}

/** O layout de fábrica: a ordem do registro, tudo visível e no tamanho natural. */
export function layoutPadrao(slugs: string[]): LayoutDoPainel {
  return normalizarLayout({ ordem: slugs, cards: {} }, slugs)
}

export function slugsVisiveis(layout: LayoutDoPainel): string[] {
  return layout.ordem.filter(slug => !ajusteDe(layout, slug).escondido)
}

/**
 * Troca o cartão de lugar com o vizinho VISÍVEL de cima (-1) ou de baixo (+1).
 *
 * Sem vizinho naquela direção, devolve o mesmo layout — quem chama desabilita o
 * botão, e a função não depende disso para não estragar nada.
 */
export function moverCard(layout: LayoutDoPainel, slug: string, direcao: -1 | 1): LayoutDoPainel {
  const visiveis = slugsVisiveis(layout)
  const posicao = visiveis.indexOf(slug)
  if (posicao < 0) return layout

  const vizinho = visiveis[posicao + direcao]
  if (!vizinho) return layout

  const ordem = [...layout.ordem]
  const daqui = ordem.indexOf(slug)
  const dali = ordem.indexOf(vizinho)
  ordem[daqui] = vizinho
  ordem[dali] = slug

  return { ...layout, ordem }
}

/**
 * Solta o cartão arrastado na posição do cartão de destino.
 *
 * Reinserção, e não troca: arrastar o último para o primeiro lugar deve empurrar
 * o resto para baixo, que é o que a mão espera do gesto. Trocar dois faria o
 * primeiro cartão saltar para o fim da lista.
 */
export function soltarCard(layout: LayoutDoPainel, arrastado: string, alvo: string): LayoutDoPainel {
  if (arrastado === alvo) return layout

  const ordem = layout.ordem.filter(s => s !== arrastado)
  const destino = ordem.indexOf(alvo)
  if (destino < 0) return layout

  ordem.splice(destino, 0, arrastado)
  return { ...layout, ordem }
}

function comAjuste(
  layout: LayoutDoPainel,
  slug: string,
  campos: Partial<AjusteDoCard>,
): LayoutDoPainel {
  if (!layout.ordem.includes(slug)) return layout

  return {
    ...layout,
    cards: { ...layout.cards, [slug]: { ...ajusteDe(layout, slug), ...campos } },
  }
}

export function definirLargura(layout: LayoutDoPainel, slug: string, largura: LarguraDoCard) {
  return comAjuste(layout, slug, { largura })
}

/** `null` devolve o cartão à altura natural do conteúdo. */
export function definirAltura(layout: LayoutDoPainel, slug: string, altura: number | null) {
  return comAjuste(layout, slug, { altura: altura === null ? null : limitarAltura(altura) })
}

export function alternarEscondido(layout: LayoutDoPainel, slug: string): LayoutDoPainel {
  return comAjuste(layout, slug, { escondido: !ajusteDe(layout, slug).escondido })
}

export function mostrarCard(layout: LayoutDoPainel, slug: string, mostrar: boolean) {
  return comAjuste(layout, slug, { escondido: !mostrar })
}

/** O painel foi mexido? É o que decide se "Restaurar padrão" tem o que fazer. */
export function foiAjustado(layout: LayoutDoPainel, slugs: string[]): boolean {
  const padrao = layoutPadrao(slugs)

  if (layout.ordem.join() !== padrao.ordem.join()) return true

  return layout.ordem.some((slug) => {
    const a = ajusteDe(layout, slug)
    return a.largura !== 1 || a.altura !== null || a.escondido
  })
}
