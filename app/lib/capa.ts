/**
 * A cor da capa tipográfica — a que aparece quando não existe imagem.
 *
 * POR QUE NÃO UM ÍCONE CINZA, que era o que havia. Numa estante de livros a
 * falta de capa é comum e não é erro: a Open Library simplesmente não tem
 * imagem de boa parte das edições brasileiras (as ISBNs delas devolvem 404 no
 * serviço de capas). Uma caixa cinza com ícone de imagem quebrada lê como
 * defeito do app, e uma prateleira cheia delas parece uma tela sem carregar.
 *
 * Uma capa composta com o título resolve isso e ainda cumpre a função da capa:
 * dizer qual livro é aquele de relance.
 *
 * A COR VEM DO TÍTULO, e é estável: o mesmo livro tem sempre a mesma cor, em
 * qualquer aparelho e depois de qualquer recarga. Cor aleatória mudaria a cada
 * render e destruiria justamente a memória visual que faz uma estante
 * funcionar ("o azul é o Caibalion").
 *
 * Não usa o acento do app de propósito. A estante é feita de capas coloridas e
 * variadas; se todas as capas faltantes nascessem da cor de destaque, a
 * prateleira viraria um bloco monocromático e as capas de verdade sumiriam no
 * meio.
 */

/**
 * Um matiz de 0 a 359, estável para uma mesma string.
 *
 * É um hash multiplicativo simples (a constante 31 é a clássica de `String
 * .hashCode`), suficiente aqui: a exigência não é distribuição criptográfica, é
 * que títulos diferentes tendam a cores diferentes e que o mesmo título nunca
 * mude.
 *
 * `Math.abs` porque o `|0` estoura para negativo depois de algumas letras, e
 * matiz negativo é cor inválida em CSS — o cartão ficaria transparente.
 */
export function matizDoTitulo(titulo: string): number {
  let hash = 0
  for (let i = 0; i < titulo.length; i++) {
    hash = (hash * 31 + titulo.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 360
}

/**
 * O gradiente da capa, pronto para o `style`.
 *
 * Luminosidade fixa nos dois extremos, e não derivada do tema: a capa é lida
 * sobre a prateleira nos dois modos, e o texto em cima dela é sempre branco.
 * Deixar a cor seguir o claro/escuro exigiria dois pares de valores para
 * ganhar nada — a capa de um livro não muda de cor à noite.
 *
 * Os 30° de diferença entre as duas pontas dão a variação que faz o retângulo
 * parecer papel impresso em vez de preenchimento chapado.
 */
export function fundoDaCapa(titulo: string): string {
  const matiz = matizDoTitulo(titulo)
  return `linear-gradient(155deg, oklch(0.58 0.11 ${matiz}), oklch(0.40 0.09 ${(matiz + 30) % 360}))`
}
