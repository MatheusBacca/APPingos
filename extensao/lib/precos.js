/**
 * Preço em português, extraído de texto de loja.
 *
 * Puro e sem dependência de DOM de propósito: é a parte que erra, então é a parte
 * que precisa de teste. `test/extensao-precos.test.ts` cobre esta função por
 * função, com os formatos que as lojas brasileiras usam de verdade.
 *
 * O que nenhum dado estruturado carrega — e por isso mora aqui — é o preço no Pix
 * e o parcelamento. O JSON-LD de schema.org tem `offers.price` e nada mais; "à
 * vista no Pix" e "12x de R$ 219,90 sem juros" existem só no texto visível, e são
 * exatamente os dois números que decidem uma compra no Brasil.
 *
 * ATENÇÃO: `raspagem.js` reimplementa `dinheiroBr` dentro de `raspar()`, porque
 * aquela função é injetada na página e não pode importar nada. As duas versões são
 * cobertas pelos mesmos casos de teste; ao mexer numa, mexa na outra.
 */

/**
 * `'R$ 1.234,56'` → `1234.56`. `null` quando não há número reconhecível.
 *
 * A regra que importa é a ordem: remover o ponto de milhar ANTES de trocar a
 * vírgula decimal por ponto. Fazer o contrário transformaria `1.234,56` em
 * `1.234.56`, que `Number` lê como `NaN` — e o produto seria gravado sem preço
 * justamente nas lojas que passam de mil reais.
 *
 * `1.234` sem centavos é ambíguo (mil duzentos e trinta e quatro, ou um real e
 * vinte e três?). Aqui vale a leitura brasileira: ponto é milhar, sempre. Uma loja
 * que escrevesse `1.23` para um real e vinte e três centavos seria a exceção, e
 * ela não existe em pt-BR.
 */
export function dinheiroBr(texto) {
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null
  if (!texto) return null

  const bruto = String(texto).match(/-?[\d.,]+/)
  if (!bruto) return null

  const limpo = bruto[0].replace(/\./g, '').replace(',', '.')
  const valor = Number(limpo)

  return Number.isFinite(valor) && valor > 0 ? valor : null
}

/**
 * As menções que indicam preço à vista.
 *
 * `\b` NÃO serve para `à vista`, e foi um bug de verdade: em JavaScript `\b` é
 * ASCII, então `à` conta como caractere NÃO-de-palavra e `\bà` nunca casa. A regra
 * passava batida em toda loja que escreve "à vista" em vez de "Pix" — silenciosa,
 * porque o campo só ficava vazio. As lookarounds com `\p{L}` (e a flag `u`) fazem o
 * papel que `\b` faria se ele conhecesse acentos.
 *
 * `\s*` entre `à` e `vista` aceita "avista", que aparece escrito junto por aí.
 */
const MENCAO_A_VISTA = /\bpix\b|(?<![\p{L}\p{N}])[àa]\s*vista(?![\p{L}\p{N}])/giu

/**
 * O preço em Pix (ou "à vista"), procurando o valor mais próximo da palavra.
 *
 * A janela é o pedaço de texto em volta da menção, e ela olha para os dois lados
 * porque as lojas escrevem das duas formas: "R$ 2.279,05 no Pix" e "Pix: R$
 * 2.279,05". Uma regex só de um lado perde metade das lojas.
 *
 * Pega o valor MAIS PRÓXIMO da palavra, não o primeiro da janela: numa página de
 * produto o texto em volta está cheio de outros preços (frete, produtos
 * relacionados, "a partir de"), e distância é o melhor sinal disponível sem
 * conhecer o HTML de cada loja.
 */
export function acharPrecoPix(texto) {
  if (!texto) return null

  const JANELA = 60
  const fonte = String(texto)
  let melhor = null

  for (const encontro of fonte.matchAll(MENCAO_A_VISTA)) {
    const centro = encontro.index
    const inicio = Math.max(0, centro - JANELA)
    const janela = fonte.slice(inicio, centro + encontro[0].length + JANELA)

    // A posição da palavra dentro da janela, para medir distância.
    const posPalavra = centro - inicio

    for (const preco of janela.matchAll(/R\$\s*([\d.,]+)/gi)) {
      const valor = dinheiroBr(preco[1])
      if (valor === null) continue

      const distancia = Math.abs(preco.index - posPalavra)
      if (!melhor || distancia < melhor.distancia) melhor = { valor, distancia }
    }
  }

  return melhor ? melhor.valor : null
}

/**
 * O parcelamento: `{ parcelas, valorParcela }`, ou `null`.
 *
 * Aceita `12x R$ 219,90`, `12x de R$ 219,90`, `12 x de R$219,90` e a variação com
 * "vezes". Recusa explicitamente o que vem marcado como "com juros": o número que
 * interessa registrar é o que a loja oferece como sem juros, e guardar um
 * parcelado com juros como se fosse o normal inflaria o total do interesse.
 *
 * Quando há vários (a loja lista 3x, 6x, 12x), fica com o de MAIS parcelas — é o
 * que a página anuncia em destaque, e é o que a pessoa lembra de ter visto.
 */
export function acharParcelado(texto) {
  if (!texto) return null

  const fonte = String(texto)
  let melhor = null

  const padrao = /(\d{1,2})\s*(?:x|vezes)\s*(?:de\s*)?R\$\s*([\d.,]+)/gi

  for (const encontro of fonte.matchAll(padrao)) {
    const parcelas = Number(encontro[1])
    const valorParcela = dinheiroBr(encontro[2])
    if (!parcelas || parcelas < 1 || parcelas > 120 || valorParcela === null) continue

    // "com juros" logo depois do valor desqualifica a oferta. A janela é curta de
    // propósito: um "sem juros" trinta caracteres à frente pertence a outra linha.
    const depois = fonte.slice(encontro.index + encontro[0].length, encontro.index + encontro[0].length + 30)
    if (/com\s+juros/i.test(depois)) continue

    if (!melhor || parcelas > melhor.parcelas) melhor = { parcelas, valorParcela }
  }

  return melhor
}

/**
 * O primeiro preço do texto — a última tentativa, quando nada mais achou.
 *
 * `minimo` existe porque páginas de loja começam com ruído barato: "frete R$
 * 19,90", "a partir de R$ 9,90", parcelas soltas. Um piso baixo (R$ 1) não
 * resolve tudo, mas evita que um selo de centavos vença o preço do produto.
 */
export function acharPrimeiroPreco(texto, minimo = 1) {
  if (!texto) return null

  for (const encontro of String(texto).matchAll(/R\$\s*([\d.,]+)/gi)) {
    const valor = dinheiroBr(encontro[1])
    if (valor !== null && valor >= minimo) return valor
  }

  return null
}
