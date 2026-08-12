/**
 * `raspar()` contra páginas de mentira, no DOM do happy-dom.
 *
 * Dá para testar a função inteira — e não só os auxiliares — porque ela é
 * autocontida por exigência do `chrome.scripting.executeScript`. O mesmo texto que
 * o Chrome injeta na aba roda aqui, sem mock nenhum da API de extensão.
 *
 * Os quatro cenários são os quatro níveis da cascata, e o último é o que mais
 * importa: uma página sem dado nenhum precisa devolver campos vazios sem lançar,
 * porque é o que acontece ao clicar no ícone fora de uma página de produto.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { raspar } from '../extensao/lib/raspagem.js'

function montarPagina(html: string, url = 'https://loja.com.br/produto/sofa-retratil') {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  // happy-dom não deixa trocar location.href por atribuição; a canônica cobre o
  // caminho que a função de fato prefere.
  document.head.innerHTML = `<link rel="canonical" href="${url}">`
  document.body.innerHTML = html
}

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('raspar — JSON-LD', () => {
  it('lê nome, imagem e preço do schema.org/Product', () => {
    montarPagina(`
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Sofá Retrátil 3 Lugares Cinza",
          "image": "https://cdn.loja.com.br/sofa.jpg",
          "offers": { "@type": "Offer", "price": "2399.00", "priceCurrency": "BRL" }
        }
      </script>
      <h1>Outro título qualquer</h1>
    `)

    const achado = raspar()

    expect(achado.nome).toBe('Sofá Retrátil 3 Lugares Cinza')
    expect(achado.imagem_url).toBe('https://cdn.loja.com.br/sofa.jpg')
    // `2399.00` é formato de máquina: o ponto é decimal, não milhar.
    expect(achado.preco).toBe(2399)
    expect(achado.loja).toBe('loja.com.br')
    expect(achado.url).toBe('https://loja.com.br/produto/sofa-retratil')
    expect(achado.fonte).toContain('json-ld')
  })

  it('encontra o produto dentro de @graph', () => {
    montarPagina(`
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "BreadcrumbList", "itemListElement": [] },
            { "@type": ["Product"], "name": "Fone XM5", "offers": { "price": 1899.9 } }
          ]
        }
      </script>
    `)

    const achado = raspar()
    expect(achado.nome).toBe('Fone XM5')
    expect(achado.preco).toBe(1899.9)
  })

  it('lê imagem em array e AggregateOffer com lowPrice', () => {
    montarPagina(`
      <script type="application/ld+json">
        {
          "@type": "Product",
          "name": "Monitor 27\\"",
          "image": ["https://cdn.loja.com.br/a.jpg", "https://cdn.loja.com.br/b.jpg"],
          "offers": { "@type": "AggregateOffer", "lowPrice": "1299.90", "highPrice": "1599.00" }
        }
      </script>
    `)

    const achado = raspar()
    expect(achado.imagem_url).toBe('https://cdn.loja.com.br/a.jpg')
    expect(achado.preco).toBe(1299.9)
  })

  /*
   * JSON-LD quebrado é comum de verdade — vírgula sobrando, HTML escapado no meio.
   * Se derrubasse a captura, uma loja com um script torto e Open Graph perfeito
   * não seria capturável.
   */
  it('ignora JSON-LD inválido e segue para o próximo nível', () => {
    montarPagina(`
      <script type="application/ld+json">{ isso não é json, }</script>
      <meta property="og:title" content="Cadeira Gamer">
      <meta property="product:price:amount" content="899.00">
    `)

    const achado = raspar()
    expect(achado.nome).toBe('Cadeira Gamer')
    expect(achado.preco).toBe(899)
    expect(achado.fonte).toContain('open-graph')
  })
})

describe('raspar — Open Graph', () => {
  it('usa og:* quando não há JSON-LD', () => {
    montarPagina(`
      <meta property="og:title" content="Air Fryer 5L">
      <meta property="og:image" content="https://cdn.loja.com.br/fryer.jpg">
      <meta property="product:price:amount" content="449.90">
    `)

    const achado = raspar()
    expect(achado.nome).toBe('Air Fryer 5L')
    expect(achado.imagem_url).toBe('https://cdn.loja.com.br/fryer.jpg')
    expect(achado.preco).toBe(449.9)
  })

  it('cai no twitter:* quando og não existe', () => {
    montarPagina(`
      <meta name="twitter:title" content="Teclado Mecânico">
      <meta name="twitter:image" content="https://cdn.loja.com.br/teclado.jpg">
    `)

    const achado = raspar()
    expect(achado.nome).toBe('Teclado Mecânico')
    expect(achado.imagem_url).toBe('https://cdn.loja.com.br/teclado.jpg')
  })
})

describe('raspar — microdata', () => {
  it('lê itemprop dentro de um escopo de Product', () => {
    montarPagina(`
      <div itemscope itemtype="https://schema.org/Product">
        <span itemprop="name">Liquidificador Turbo</span>
        <span itemprop="price" content="189.90">R$ 189,90</span>
      </div>
    `)

    const achado = raspar()
    expect(achado.nome).toBe('Liquidificador Turbo')
    expect(achado.preco).toBe(189.9)
    expect(achado.fonte).toContain('microdata')
  })

  it('lê o preço do texto quando não há atributo content', () => {
    montarPagina(`
      <div itemscope itemtype="https://schema.org/Product">
        <span itemprop="name">Batedeira</span>
        <span itemprop="price">R$ 1.299,00</span>
      </div>
    `)

    const achado = raspar()
    // Aqui o texto É brasileiro, então o ponto é milhar.
    expect(achado.preco).toBe(1299)
  })
})

describe('raspar — heurística no texto visível', () => {
  it('acha preço Pix e parcelamento, que nenhum dado estruturado carrega', () => {
    montarPagina(`
      <script type="application/ld+json">
        { "@type": "Product", "name": "Sofá Retrátil", "offers": { "price": "2399.00" } }
      </script>
      <main>
        <p>R$ 2.399,00</p>
        <p>R$ 2.279,05 no Pix</p>
        <p>ou 12x de R$ 219,90 sem juros</p>
      </main>
    `)

    const achado = raspar()
    expect(achado.preco).toBe(2399)
    expect(achado.preco_pix).toBe(2279.05)
    expect(achado.parcelas).toBe(12)
    expect(achado.valor_parcela).toBe(219.9)
    expect(achado.fonte).toContain('texto')
  })

  it('acha o preço no texto quando nada foi declarado', () => {
    montarPagina(`
      <main>
        <h1>Ventilador de Coluna</h1>
        <p>Frete grátis</p>
        <p>R$ 249,90 à vista</p>
      </main>
    `)

    const achado = raspar()
    expect(achado.nome).toBe('Ventilador de Coluna')
    expect(achado.preco).toBe(249.9)
    expect(achado.preco_pix).toBe(249.9)
  })

  /*
   * Um Pix acima do preço cheio é sinal de que a janela pegou o número de outro
   * produto. Descartar é melhor que gravar: `precoEfetivo` prefere o Pix, então
   * um Pix errado passaria a ser O valor exibido do produto.
   */
  it('descarta Pix maior que o preço cheio', () => {
    montarPagina(`
      <script type="application/ld+json">
        { "@type": "Product", "name": "Cafeteira", "offers": { "price": "199.00" } }
      </script>
      <main>
        <p>Cafeteira R$ 199,00</p>
        <p>Veja também: Cafeteira Pro por R$ 899,00 no Pix</p>
      </main>
    `)

    const achado = raspar()
    expect(achado.preco).toBe(199)
    expect(achado.preco_pix).toBeNull()
  })
})

describe('raspar — página sem nada', () => {
  /*
   * O caso de clicar no ícone fora de uma página de produto. Precisa devolver
   * campos vazios sem lançar: o popup mostra o formulário em branco e a pessoa
   * digita, em vez de ver um erro.
   */
  it('devolve campos vazios sem lançar', () => {
    montarPagina('<p>Uma página qualquer, sem produto nenhum.</p>')

    const achado = raspar()

    expect(achado.preco).toBeNull()
    expect(achado.preco_pix).toBeNull()
    expect(achado.parcelas).toBeNull()
    expect(achado.valor_parcela).toBeNull()
    expect(achado.imagem_url).toBeNull()
    // A url e a loja sempre vêm — são da aba, não da página.
    expect(achado.url).toBe('https://loja.com.br/produto/sofa-retratil')
    expect(achado.loja).toBe('loja.com.br')
  })

  it('usa o <title> quando não há h1 nem metadado', () => {
    document.head.innerHTML = '<link rel="canonical" href="https://x.com/p"><title>Produto Sem Marcação</title>'
    document.body.innerHTML = '<p>nada aqui</p>'

    expect(raspar().nome).toBe('Produto Sem Marcação')
  })
})
