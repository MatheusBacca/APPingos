/**
 * Lê a página de produto aberta e devolve os campos que o APPingos guarda.
 *
 * ## Por que é UMA função com tudo dentro
 *
 * `chrome.scripting.executeScript({ func: raspar })` serializa a função com
 * `toString()` e injeta o texto na aba. O que ela fechar sobre — um import, uma
 * constante do módulo, outra função irmã — não existe do outro lado, e o erro
 * aparece só na página real, como `X is not defined`. Então todos os auxiliares
 * são declarados aqui dentro, inclusive uma segunda cópia de `dinheiroBr` que
 * também vive em `precos.js`.
 *
 * O ganho da restrição é grande: sem bundler, sem content script declarado no
 * manifest (nada roda em página que você não pediu), e a MESMA função roda no
 * Vitest contra o DOM do happy-dom — `test/extensao-raspagem.test.ts` a exercita
 * ponta a ponta sem mock nenhum do Chrome.
 *
 * ## A cascata
 *
 * Do mais confiável ao mais chutado, e cada nível só preenche o que o anterior
 * deixou vazio:
 *
 *   1. JSON-LD (schema.org/Product) — Mercado Livre, Amazon BR, Magalu, Kabum e
 *      Pichau publicam. É dado declarado pela loja, não inferido.
 *   2. Open Graph / meta tags — `og:title`, `product:price:amount`.
 *   3. Microdata — `[itemprop]` dentro de `[itemtype*=Product]`.
 *   4. Heurística sobre o texto visível — o único lugar onde existem preço Pix e
 *      parcelamento.
 *
 * Nada aqui grava nada. O popup mostra o que foi achado num formulário editável, e
 * quem confirma é a pessoa — é isso que evita o jogo de gato e rato com o HTML de
 * cada loja, porque o custo de um erro é corrigir um campo, não um registro torto
 * no banco.
 */
export function raspar() {
  // ---- Auxiliares (todos aqui dentro; ver o cabeçalho) ----------------------

  /** `'R$ 1.234,56'` → `1234.56`. Gêmea da de `precos.js`. */
  function dinheiroBr(texto) {
    if (typeof texto === 'number') return Number.isFinite(texto) && texto > 0 ? texto : null
    if (!texto) return null

    const bruto = String(texto).match(/-?[\d.,]+/)
    if (!bruto) return null

    // Ponto de milhar sai ANTES da vírgula decimal virar ponto; o contrário faz
    // `1.234,56` virar `1.234.56` e `Number` devolver NaN.
    const valor = Number(bruto[0].replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(valor) && valor > 0 ? valor : null
  }

  /**
   * Preço vindo de dado estruturado, onde o separador é o do padrão (ponto
   * decimal, sem milhar): `"2399.00"`. Passar isso por `dinheiroBr` daria
   * 239900 — o ponto seria lido como milhar.
   */
  function numeroPadrao(valor) {
    if (valor === null || valor === undefined) return null
    const n = Number(String(valor).replace(/[^\d.-]/g, ''))
    return Number.isFinite(n) && n > 0 ? n : null
  }

  function texto(valor) {
    if (valor === null || valor === undefined) return null
    const limpo = String(valor).replace(/\s+/g, ' ').trim()
    return limpo || null
  }

  /** Achata `@graph`, arrays e objetos aninhados num único array de nós. */
  function achatar(no, saida = []) {
    if (!no || typeof no !== 'object') return saida
    if (Array.isArray(no)) {
      for (const item of no) achatar(item, saida)
      return saida
    }
    saida.push(no)
    if (no['@graph']) achatar(no['@graph'], saida)
    return saida
  }

  function ehProduto(no) {
    const tipo = no['@type']
    if (!tipo) return false
    const tipos = Array.isArray(tipo) ? tipo : [tipo]
    return tipos.some(t => typeof t === 'string' && /product|offer/i.test(t))
  }

  /** A URL da imagem, que no schema.org pode ser string, array ou objeto. */
  function imagemDe(valor) {
    if (!valor) return null
    if (typeof valor === 'string') return texto(valor)
    if (Array.isArray(valor)) return imagemDe(valor[0])
    if (typeof valor === 'object') return texto(valor.url ?? valor.contentUrl)
    return null
  }

  /** O menor preço declarado entre as ofertas — `offers` também pode ser array. */
  function precoDeOfertas(offers) {
    if (!offers) return null

    const lista = Array.isArray(offers) ? offers : [offers]
    let menor = null

    for (const oferta of lista) {
      if (!oferta || typeof oferta !== 'object') continue

      const candidatos = [
        oferta.price,
        oferta.lowPrice,
        oferta.priceSpecification?.price,
        oferta.priceSpecification?.minPrice,
      ]

      // AggregateOffer aninha as ofertas de verdade um nível abaixo.
      if (oferta.offers) {
        const dentro = precoDeOfertas(oferta.offers)
        if (dentro !== null) candidatos.push(dentro)
      }

      for (const bruto of candidatos) {
        const valor = numeroPadrao(bruto)
        if (valor !== null && (menor === null || valor < menor)) menor = valor
      }
    }

    return menor
  }

  /** O texto que a pessoa vê. `innerText` já exclui o que está escondido. */
  function textoVisivel() {
    const raiz = document.querySelector('main, [role="main"], #main, #content')
      ?? document.body

    // Teto de caracteres: numa página de loja o fim é rodapé e "quem viu também
    // comprou", e varrer tudo só acrescenta preços de outros produtos.
    return (raiz?.innerText ?? '').slice(0, 40000)
  }

  function metaConteudo(...seletores) {
    for (const seletor of seletores) {
      const el = document.querySelector(seletor)
      const valor = texto(el?.getAttribute('content') ?? el?.getAttribute('value'))
      if (valor) return valor
    }
    return null
  }

  /**
   * O Pix/à vista mais próximo da palavra. Gêmea de `acharPrecoPix`.
   *
   * A regex não usa `\b` para "à vista": em JavaScript `\b` é ASCII, então `à` é
   * caractere NÃO-de-palavra e `\bà` nunca casa — a regra passava batida em toda
   * loja que escreve "à vista" em vez de "Pix", e em silêncio, porque o campo só
   * ficava vazio. As lookarounds com `\p{L}` fazem o papel que `\b` faria se ele
   * conhecesse acentos.
   */
  function pixDoTexto(fonte) {
    const JANELA = 60
    let melhor = null

    for (const encontro of fonte.matchAll(/\bpix\b|(?<![\p{L}\p{N}])[àa]\s*vista(?![\p{L}\p{N}])/giu)) {
      const centro = encontro.index
      const inicio = Math.max(0, centro - JANELA)
      const janela = fonte.slice(inicio, centro + encontro[0].length + JANELA)
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

  /** O parcelamento com mais parcelas, ignorando "com juros". */
  function parceladoDoTexto(fonte) {
    let melhor = null

    for (const encontro of fonte.matchAll(/(\d{1,2})\s*(?:x|vezes)\s*(?:de\s*)?R\$\s*([\d.,]+)/gi)) {
      const parcelas = Number(encontro[1])
      const valorParcela = dinheiroBr(encontro[2])
      if (!parcelas || parcelas < 1 || parcelas > 120 || valorParcela === null) continue

      const fim = encontro.index + encontro[0].length
      if (/com\s+juros/i.test(fonte.slice(fim, fim + 30))) continue

      if (!melhor || parcelas > melhor.parcelas) melhor = { parcelas, valorParcela }
    }

    return melhor
  }

  // ---- O resultado, preenchido pela cascata ---------------------------------

  const achado = {
    nome: null,
    url: null,
    loja: null,
    imagem_url: null,
    preco: null,
    preco_pix: null,
    parcelas: null,
    valor_parcela: null,
    /** Só para o popup dizer de onde veio o que ele está mostrando. */
    fonte: [],
  }

  // URL: a canônica ganha da barra de endereço porque vem sem os parâmetros de
  // rastreio, e é o que faz duas capturas do mesmo produto parecerem o mesmo link.
  const canonica = document.querySelector('link[rel="canonical"]')?.getAttribute('href')
  try {
    achado.url = new URL(canonica || location.href, location.href).href
  }
  catch {
    achado.url = location.href
  }

  try {
    achado.loja = new URL(achado.url).hostname.replace(/^www\./, '')
  }
  catch {
    achado.loja = null
  }

  // ---- 1. JSON-LD ----------------------------------------------------------

  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    let dados
    try {
      dados = JSON.parse(script.textContent || '')
    }
    catch {
      // JSON-LD quebrado é comum (vírgula sobrando, HTML escapado no meio) e não
      // pode derrubar a captura: o próximo nível da cascata ainda pode acertar.
      continue
    }

    for (const no of achatar(dados)) {
      if (!ehProduto(no)) continue

      achado.nome ??= texto(no.name)
      achado.imagem_url ??= imagemDe(no.image)
      achado.preco ??= precoDeOfertas(no.offers) ?? numeroPadrao(no.price)

      if (achado.nome && !achado.fonte.includes('json-ld')) achado.fonte.push('json-ld')
    }
  }

  // ---- 2. Open Graph / meta ------------------------------------------------

  const antesDeMeta = { nome: achado.nome, preco: achado.preco, imagem: achado.imagem_url }

  achado.nome ??= metaConteudo(
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
    'meta[itemprop="name"]',
  )

  achado.imagem_url ??= metaConteudo(
    'meta[property="og:image"]',
    'meta[property="og:image:secure_url"]',
    'meta[name="twitter:image"]',
    'meta[itemprop="image"]',
  )

  achado.preco ??= numeroPadrao(metaConteudo(
    'meta[property="product:price:amount"]',
    'meta[property="og:price:amount"]',
    'meta[itemprop="price"]',
  ))

  if (
    (achado.nome && !antesDeMeta.nome)
    || (achado.preco && !antesDeMeta.preco)
    || (achado.imagem_url && !antesDeMeta.imagem)
  ) {
    achado.fonte.push('open-graph')
  }

  // ---- 3. Microdata --------------------------------------------------------

  const escopo = document.querySelector('[itemtype*="schema.org/Product" i]')
  if (escopo && (!achado.nome || !achado.preco)) {
    const antes = { nome: achado.nome, preco: achado.preco }

    achado.nome ??= texto(escopo.querySelector('[itemprop="name"]')?.textContent)

    const elPreco = escopo.querySelector('[itemprop="price"]')
    // `content` primeiro: é onde o valor vem em formato de máquina. O texto do
    // elemento é "R$ 2.399,00", que precisa da leitura brasileira.
    achado.preco ??= numeroPadrao(elPreco?.getAttribute('content'))
      ?? dinheiroBr(elPreco?.textContent)

    achado.imagem_url ??= texto(escopo.querySelector('[itemprop="image"]')?.getAttribute('src'))

    if ((achado.nome && !antes.nome) || (achado.preco && !antes.preco)) {
      achado.fonte.push('microdata')
    }
  }

  // ---- 4. Heurística no texto visível --------------------------------------

  const visivel = textoVisivel()

  achado.preco_pix ??= pixDoTexto(visivel)

  const parcelado = parceladoDoTexto(visivel)
  if (parcelado) {
    achado.parcelas ??= parcelado.parcelas
    achado.valor_parcela ??= parcelado.valorParcela
  }

  // O preço cheio é o último a cair na heurística: um R$ solto no texto é o mais
  // fraco de todos os sinais, e só vale quando nada declarou nada.
  if (achado.preco === null) {
    for (const encontro of visivel.matchAll(/R\$\s*([\d.,]+)/gi)) {
      const valor = dinheiroBr(encontro[1])
      if (valor !== null && valor >= 1) {
        achado.preco = valor
        break
      }
    }
  }

  // Nome, por último recurso: o <h1> da página, e depois o <title>. Melhor que
  // vazio, e a pessoa corrige no popup.
  achado.nome ??= texto(document.querySelector('h1')?.textContent)
  achado.nome ??= texto(document.title)

  if (achado.preco_pix !== null || achado.parcelas !== null) achado.fonte.push('texto')

  /*
   * Pix maior que o preço cheio é sinal de que a heurística pegou o número errado
   * (o "à vista" de outro produto, ou o valor sem desconto). Descartar é melhor
   * que gravar: o preço cheio continua certo, e um Pix acima dele apareceria na
   * tela como o valor do produto, já que `precoEfetivo` prefere o Pix.
   */
  if (achado.preco !== null && achado.preco_pix !== null && achado.preco_pix > achado.preco) {
    achado.preco_pix = null
  }

  return achado
}
