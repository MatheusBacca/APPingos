/**
 * Mede se dá para reler o preço dos produtos salvos, loja por loja.
 *
 *   node scripts/medir-precos.mjs
 *
 * NÃO ESCREVE NADA. É o passo anterior ao cron de rechecagem: antes de construir o
 * pipeline inteiro, descobrir se ele acertaria 90% ou 20% das lojas que vocês de
 * fato usam. A resposta muda o desenho — se uma loja específica bloquear sempre,
 * talvez valha um adaptador para ela; se todas bloquearem, o cron não vale a pena.
 *
 * ## Por que Chromium, e não fetch
 *
 * Um `fetch` recebe o HTML cru, antes do JS da loja rodar. JSON-LD e Open Graph
 * costumam estar lá, mas **preço Pix e parcelamento quase nunca** — são montados no
 * cliente, e são justamente os números que decidem uma compra no Brasil. Com um
 * navegador de verdade a página termina de se montar antes de a gente ler.
 *
 * ## Por que a MESMA raspar() da extensão
 *
 * `raspar()` é autocontida por exigência do `chrome.scripting.executeScript`, que
 * serializa a função e injeta o texto. `page.evaluate()` do Playwright faz
 * exatamente a mesma coisa — então a função roda aqui sem uma linha de adaptação.
 * Um raspador só, três consumidores: a extensão, os testes e esta medição. Um
 * segundo raspador divergiria do primeiro no primeiro mês.
 *
 * ## Privacidade do relatório
 *
 * O repositório é PÚBLICO, e o log do Actions com ele. O relatório por isso não
 * imprime URL nem nome de produto — sairia a lista de desejos de vocês num lugar
 * que qualquer um lê. Só hostname, contagens e o que foi lido ou não.
 */
import { chromium } from 'playwright'
import { raspar } from '../extensao/lib/raspagem.js'

const URL_BASE = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
const CHAVE = process.env.SUPABASE_KEY
const EMAIL = process.env.APPINGOS_EMAIL
const SENHA = process.env.APPINGOS_SENHA

if (!URL_BASE || !CHAVE || !EMAIL || !SENHA) {
  console.error(
    'Faltam variáveis. Precisa de SUPABASE_URL, SUPABASE_KEY, APPINGOS_EMAIL e APPINGOS_SENHA.\n'
    + 'No CI: Settings → Secrets and variables → Actions.',
  )
  process.exit(1)
}

/** Quanto esperar uma loja responder antes de desistir dela. */
const TIMEOUT_MS = 45_000

// ---- Dados ------------------------------------------------------------------

async function entrar() {
  const resposta = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': CHAVE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: SENHA }),
  })

  if (!resposta.ok) {
    // Sem detalhe do corpo: a resposta do GoTrue pode ecoar o e-mail, e isto vai
    // para um log público.
    console.error(`Login recusado (HTTP ${resposta.status}). Confira APPINGOS_EMAIL e APPINGOS_SENHA.`)
    process.exit(1)
  }

  return (await resposta.json()).access_token
}

async function produtos(token) {
  const params = new URLSearchParams({
    select: 'id,url,loja,preco,preco_pix,parcelas,valor_parcela',
    order: 'created_at.asc',
  })

  const resposta = await fetch(`${URL_BASE}/rest/v1/interesse_produto?${params}`, {
    headers: { apikey: CHAVE, Authorization: `Bearer ${token}` },
  })

  if (!resposta.ok) {
    console.error(`Não deu para ler os produtos (HTTP ${resposta.status}).`)
    process.exit(1)
  }

  return resposta.json()
}

// ---- Medição ----------------------------------------------------------------

/**
 * Sinais de que a loja respondeu com barreira em vez de produto.
 *
 * Não é infalível e nem precisa ser: serve para separar "a página veio e a
 * heurística não achou o preço" de "a página nem veio", que pedem soluções
 * opostas — a primeira é raspagem, a segunda é acesso.
 */
function pareceBloqueio(titulo, corpo) {
  return /captcha|robot|are you a human|acesso negado|access denied|unusual traffic/i
    .test(`${titulo} ${corpo.slice(0, 2000)}`)
}

async function medirUm(pagina, produto) {
  const resultado = {
    loja: produto.loja ?? '(sem loja)',
    status: null,
    bloqueado: false,
    erro: null,
    leu: { nome: false, preco: false, pix: false, parcelado: false, imagem: false },
    fontes: [],
    // Só a variação relativa: o valor absoluto é dado de quem usa.
    variacaoPreco: null,
  }

  try {
    const resposta = await pagina.goto(produto.url, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT_MS,
    })
    resultado.status = resposta?.status() ?? null

    // Uma folga para o JS que monta preço e parcelamento. `networkidle` seria
    // melhor em teoria e nunca chega em loja com rastreador batendo sem parar.
    await pagina.waitForTimeout(3500)

    const titulo = await pagina.title()
    const corpo = await pagina.evaluate(() => document.body?.innerText ?? '')
    resultado.bloqueado = (resultado.status ?? 0) >= 400 || pareceBloqueio(titulo, corpo)

    const achado = await pagina.evaluate(raspar)

    resultado.leu = {
      nome: !!achado.nome,
      preco: achado.preco !== null,
      pix: achado.preco_pix !== null,
      parcelado: achado.parcelas !== null && achado.valor_parcela !== null,
      imagem: !!achado.imagem_url,
    }
    resultado.fontes = achado.fonte ?? []

    if (achado.preco !== null && produto.preco !== null) {
      const antes = Number(produto.preco)
      if (antes > 0) resultado.variacaoPreco = (achado.preco - antes) / antes
    }
  }
  catch (e) {
    resultado.erro = e.name === 'TimeoutError' ? 'timeout' : String(e.message).slice(0, 120)
  }

  return resultado
}

// ---- Relatório --------------------------------------------------------------

const marca = ok => (ok ? '✅' : '—')

function relatorio(medidos) {
  const linhas = []

  linhas.push('## Medição de rechecagem de preço', '')
  linhas.push(`Produtos medidos: **${medidos.length}**`, '')

  // Por loja, que é a unidade de decisão: adaptador, ou desistir dela.
  const lojas = [...new Set(medidos.map(m => m.loja))].sort()

  linhas.push('| Loja | Produtos | Página veio | Preço | Pix | Parcelado |')
  linhas.push('| --- | ---: | ---: | ---: | ---: | ---: |')

  for (const loja of lojas) {
    const daLoja = medidos.filter(m => m.loja === loja)
    const veio = daLoja.filter(m => !m.bloqueado && !m.erro).length
    const conta = campo => daLoja.filter(m => m.leu[campo]).length
    linhas.push(
      `| \`${loja}\` | ${daLoja.length} | ${veio}/${daLoja.length} `
      + `| ${conta('preco')}/${daLoja.length} | ${conta('pix')}/${daLoja.length} `
      + `| ${conta('parcelado')}/${daLoja.length} |`,
    )
  }

  linhas.push('', '### Produto a produto', '')
  linhas.push('| # | Loja | HTTP | Estado | Nome | Preço | Pix | Parcelado | Fontes | Δ preço |')
  linhas.push('| ---: | --- | ---: | --- | :-: | :-: | :-: | :-: | --- | ---: |')

  medidos.forEach((m, i) => {
    const estado = m.erro ? `erro: ${m.erro}` : m.bloqueado ? '**bloqueado**' : 'ok'
    const delta = m.variacaoPreco === null
      ? '—'
      : `${(m.variacaoPreco * 100).toFixed(1)}%`
    linhas.push(
      `| ${i + 1} | \`${m.loja}\` | ${m.status ?? '—'} | ${estado} `
      + `| ${marca(m.leu.nome)} | ${marca(m.leu.preco)} | ${marca(m.leu.pix)} `
      + `| ${marca(m.leu.parcelado)} | ${m.fontes.join(', ') || '—'} | ${delta} |`,
    )
  })

  const comPreco = medidos.filter(m => m.leu.preco).length
  const comPix = medidos.filter(m => m.leu.pix).length

  linhas.push('', '### Leitura', '')
  linhas.push(
    `- **${comPreco}/${medidos.length}** dariam para atualizar o preço cheio`,
    `- **${comPix}/${medidos.length}** dariam para atualizar o preço no Pix`,
    '',
    'Sem URL nem nome de produto de propósito: o log do Actions é público.',
  )

  return linhas.join('\n')
}

// ---- Execução ---------------------------------------------------------------

const token = await entrar()
const lista = await produtos(token)

if (!lista.length) {
  console.log('Nenhum produto salvo ainda — nada a medir.')
  process.exit(0)
}

console.log(`Medindo ${lista.length} produto(s)…`)

const navegador = await chromium.launch()
const contexto = await navegador.newContext({
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
  // Uma janela de desktop de verdade: layout responsivo de loja esconde o
  // parcelamento no mobile, e aí a medição culparia a heurística à toa.
  viewport: { width: 1366, height: 900 },
})

const pagina = await contexto.newPage()
const medidos = []

for (const produto of lista) {
  const m = await medirUm(pagina, produto)
  medidos.push(m)
  console.log(`  ${m.loja}: ${m.erro ?? (m.bloqueado ? 'bloqueado' : 'ok')}`)
}

await navegador.close()

const texto = relatorio(medidos)
console.log(`\n${texto}`)

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import('node:fs/promises')
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${texto}\n`)
}
