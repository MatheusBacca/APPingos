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
 * A mesma capa do Google, num tamanho que não fica borrado.
 *
 * A BUSCA DO GOOGLE SÓ DEVOLVE MINIATURA. `imageLinks` traz `smallThumbnail` e
 * `thumbnail` e nada além disso — os tamanhos grandes existem, mas não chegam
 * no resultado de busca. O que se guardava era a URL com `zoom=1`, que é
 * 128×191: metade da largura de um cartão da estante, e um quarto num celular
 * retina. Daí a impressão de imagem ruim.
 *
 * O endpoint aceita `w` e devolve a largura pedida, medido em três livros:
 * 400×580, 400×619, 400×596. Em 600 a capa fica nítida até no detalhe de um
 * aparelho 3x, por volta de 60 KB — e as da grade são carregadas com `lazy`.
 *
 * NORMALIZA NA HORA DE MOSTRAR, e não ao guardar, porque assim os livros que já
 * estão na estante com a URL velha melhoram junto. Guardar a URL boa só
 * consertaria os próximos, e exigiria uma migration para os que já existem.
 *
 * Open Library passa direto: `-L` já é o maior tamanho que ela serve (329×500).
 */
export function capaEmAlta(url: string | null | undefined, largura = 600): string | null {
  if (!url) return null
  if (!url.includes('books.google.com')) return url

  // Tira o `zoom` e um `w` que já estivesse lá, e devolve com a largura pedida.
  // A limpeza vem antes para a função ser idempotente: aplicá-la duas vezes não
  // pode empilhar `&w=600&w=600`.
  const limpa = url
    .replace(/&zoom=\d+/g, '')
    .replace(/\?zoom=\d+&/g, '?')
    .replace(/&w=\d+/g, '')
    .replace(/\?w=\d+&/g, '?')

  return `${limpa}${limpa.includes('?') ? '&' : '?'}w=${largura}`
}

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
