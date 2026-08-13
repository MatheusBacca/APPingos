/**
 * O popup: login, raspagem, revisão e envio.
 *
 * ## A decisão que organiza este arquivo
 *
 * O que a raspagem achou NUNCA é gravado direto. Ele preenche o formulário, e quem
 * confirma é a pessoa. É isso que evita o jogo de gato e rato com o HTML de cada
 * loja: quando a heurística errar — e ela vai errar —, o custo é corrigir um campo
 * antes de clicar, não um registro torto no banco que alguém descobre semanas
 * depois. O campo `fonte` que `raspar()` devolve é mostrado justamente para
 * calibrar quanta desconfiança a leitura merece.
 *
 * ## Sobre a injeção
 *
 * `chrome.scripting.executeScript({ func: raspar })` serializa a função e a roda na
 * aba. Funciona porque `raspar` é autocontida (ver `lib/raspagem.js`) e porque a
 * permissão `activeTab` concede acesso à aba a partir do clique no ícone — nada roda
 * em página nenhuma antes disso, e o Chrome não pede "ler seus dados em todos os
 * sites" na instalação.
 */
import { APP_URL } from './lib/config.gerado.js'
import {
  adicionarProduto,
  entrar,
  gravarEspacoEscolhido,
  lerEspacoEscolhido,
  lerSessao,
  listarEspacos,
  listarInteressesAbertos,
  registrarInteresse,
  sair,
} from './lib/api.js'
import { raspar } from './lib/raspagem.js'
import { pedirPermissao, rechecarTudo, temPermissao } from './lib/recheck.js'

const DESTINOS = [
  ['compra', 'Compra'],
  ['objetivo', 'Objetivo'],
  ['viagem', 'Viagem'],
  ['projeto', 'Projeto'],
  ['orcamento', 'Orçamento'],
]

/** Como cada nível da cascata se chama na tela, para calibrar a desconfiança. */
const ROTULO_FONTE = {
  'json-ld': 'dados da loja',
  'open-graph': 'metadados da página',
  'microdata': 'marcação da página',
  'texto': 'texto da página',
}

const el = id => document.getElementById(id)

/** O que a raspagem trouxe, para o envio saber o que não é editável na tela. */
let capturado = null

// ---- Telas -----------------------------------------------------------------

function mostrar(qual) {
  for (const nome of ['carregando', 'login', 'captura', 'recheck', 'pronto']) {
    el(`tela-${nome}`).hidden = nome !== qual
  }
}

function mostrarErro(id, mensagem) {
  const alvo = el(id)
  alvo.textContent = mensagem
  alvo.hidden = !mensagem
}

// ---- Leitura dos campos ----------------------------------------------------

/**
 * O número de um input, ou `null`.
 *
 * `null` e não `0` para campo vazio: o banco distingue "sem preço" de "de graça",
 * e um zero aqui viraria um CHECK violado (`preco > 0`) em vez de uma coluna nula.
 */
function numero(id) {
  const bruto = el(id).value.trim()
  if (!bruto) return null
  const valor = Number(bruto)
  return Number.isFinite(valor) && valor > 0 ? valor : null
}

function texto(id) {
  return el(id).value.trim() || null
}

function produtoDoFormulario() {
  return {
    nome: el('campo-nome').value.trim(),
    url: capturado?.url ?? '',
    loja: capturado?.loja ?? null,
    imagem_url: capturado?.imagem_url ?? null,
    preco: numero('campo-preco'),
    preco_pix: numero('campo-pix'),
    parcelas: numero('campo-parcelas'),
    valor_parcela: numero('campo-valor-parcela'),
    origem: 'extensao',
  }
}

// ---- Preenchimento ---------------------------------------------------------

function preencherDestinos() {
  el('campo-destino').innerHTML = DESTINOS
    .map(([valor, rotulo]) => `<option value="${valor}">${rotulo}</option>`)
    .join('')
}

function preencherEspacos(espacos, escolhido) {
  el('campo-espaco').innerHTML = espacos
    .map(e => `<option value="${e.id}">${e.nome} (${e.tipo})</option>`)
    .join('')

  const valido = espacos.some(e => e.id === escolhido)
  el('campo-espaco').value = valido ? escolhido : (espacos[0]?.id ?? '')
}

function preencherAlvos(interesses) {
  const opcoes = ['<option value="novo">Criar um interesse novo</option>']

  for (const interesse of interesses) {
    // `textContent` de um option criado por innerHTML não escapa sozinho; o título
    // vem do banco, mas passou por um popup antes — escapar é barato.
    const rotulo = interesse.titulo.replace(/[<>&]/g, c => (
      { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]
    ))
    opcoes.push(`<option value="${interesse.id}">Adicionar a: ${rotulo}</option>`)
  }

  el('campo-alvo').innerHTML = opcoes.join('')
  el('campo-alvo').value = 'novo'
  alternarGrupoNovo()
}

/** Título e destino só fazem sentido para um interesse novo. */
function alternarGrupoNovo() {
  const novo = el('campo-alvo').value === 'novo'
  el('grupo-novo').hidden = !novo
  el('campo-titulo').required = novo
}

function preencherComCaptura(achado) {
  capturado = achado

  el('campo-nome').value = achado.nome ?? ''
  el('campo-titulo').value = achado.nome ?? ''
  el('campo-preco').value = achado.preco ?? ''
  el('campo-pix').value = achado.preco_pix ?? ''
  el('campo-parcelas').value = achado.parcelas ?? ''
  el('campo-valor-parcela').value = achado.valor_parcela ?? ''

  el('rotulo-loja').textContent = achado.url ? `Link: ${achado.url}` : ''

  const previa = el('previa-imagem')
  if (achado.imagem_url) {
    previa.src = achado.imagem_url
    previa.hidden = false
    // Imagem de CDN de loja falha com frequência; esconder é melhor que o ícone
    // de imagem quebrada, e a url continua gravada de qualquer forma.
    previa.onerror = () => { previa.hidden = true }
  }
  else {
    previa.hidden = true
  }

  const fontes = (achado.fonte ?? []).map(f => ROTULO_FONTE[f] ?? f)
  el('rotulo-fonte').textContent = fontes.length
    ? `Lido de: ${fontes.join(', ')}. Confira antes de salvar.`
    : 'Não achei dados de produto nesta página — preencha à mão.'
}

// ---- Fluxo -----------------------------------------------------------------

/**
 * Raspa a aba ativa.
 *
 * Falha em silêncio (devolvendo o mínimo) de propósito: `chrome://`, a Web Store e
 * PDFs recusam injeção, e nesses casos o certo é abrir o formulário em branco em vez
 * de mostrar um erro que a pessoa não pode resolver.
 */
async function rasparAbaAtiva() {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true })
  const vazio = { nome: null, url: aba?.url ?? '', loja: null, imagem_url: null, preco: null, preco_pix: null, parcelas: null, valor_parcela: null, fonte: [] }

  if (!aba?.id) return vazio

  try {
    const [resultado] = await chrome.scripting.executeScript({
      target: { tabId: aba.id },
      func: raspar,
    })
    return resultado?.result ?? vazio
  }
  catch {
    return vazio
  }
}

async function abrirCaptura() {
  mostrar('carregando')

  try {
    const espacos = await listarEspacos()

    if (!espacos.length) {
      mostrar('login')
      mostrarErro('erro-login', 'Nenhum espaço encontrado nesta conta.')
      return
    }

    preencherDestinos()
    preencherEspacos(espacos, await lerEspacoEscolhido())

    // Raspar e listar em paralelo: são independentes, e o popup só é útil quando
    // as duas terminam.
    const [achado, interesses] = await Promise.all([
      rasparAbaAtiva(),
      listarInteressesAbertos(el('campo-espaco').value),
    ])

    preencherAlvos(interesses)
    preencherComCaptura(achado)

    mostrar('captura')
    el('campo-nome').focus()
  }
  catch (e) {
    if (e.status === 401) {
      mostrar('login')
      mostrarErro('erro-login', e.message)
      return
    }
    mostrar('captura')
    mostrarErro('erro-captura', e.message)
  }
}

async function iniciar() {
  const sessao = await lerSessao()
  if (sessao?.access_token) await abrirCaptura()
  else mostrar('login')
}

// ---- Eventos ---------------------------------------------------------------

el('form-login').addEventListener('submit', async (evento) => {
  evento.preventDefault()
  mostrarErro('erro-login', '')

  const botao = el('botao-entrar')
  botao.disabled = true
  botao.textContent = 'Entrando…'

  try {
    await entrar(el('login-email').value, el('login-senha').value)
    el('login-senha').value = ''
    await abrirCaptura()
  }
  catch (e) {
    mostrarErro('erro-login', e.message)
  }
  finally {
    botao.disabled = false
    botao.textContent = 'Entrar'
  }
})

el('botao-sair').addEventListener('click', async () => {
  await sair()
  mostrar('login')
})

el('campo-alvo').addEventListener('change', alternarGrupoNovo)

/*
 * Trocar de espaço troca a lista de interesses: pendurar um produto num interesse
 * de outro espaço seria recusado pela RLS, e o erro chegaria como "violates
 * row-level security" em vez de uma lista que simplesmente não oferece a opção.
 */
el('campo-espaco').addEventListener('change', async () => {
  const spaceId = el('campo-espaco').value
  await gravarEspacoEscolhido(spaceId)

  try {
    preencherAlvos(await listarInteressesAbertos(spaceId))
  }
  catch (e) {
    mostrarErro('erro-captura', e.message)
  }
})

el('form-captura').addEventListener('submit', async (evento) => {
  evento.preventDefault()
  mostrarErro('erro-captura', '')

  const produto = produtoDoFormulario()

  if (!produto.nome) {
    mostrarErro('erro-captura', 'Dê um nome ao produto.')
    return
  }
  if (!produto.url) {
    mostrarErro('erro-captura', 'Sem o link da página não dá para registrar.')
    return
  }

  const botao = el('botao-salvar')
  botao.disabled = true
  botao.textContent = 'Salvando…'

  try {
    const alvo = el('campo-alvo').value
    let interesseId = alvo

    if (alvo === 'novo') {
      interesseId = await registrarInteresse({
        spaceId: el('campo-espaco').value,
        titulo: el('campo-titulo').value.trim() || produto.nome,
        destino: el('campo-destino').value,
        paraQuem: texto('campo-para-quem'),
        observacao: null,
        produto,
      })
      el('texto-pronto').textContent = 'Interesse registrado.'
    }
    else {
      await adicionarProduto(interesseId, produto)
      el('texto-pronto').textContent = 'Produto adicionado ao interesse.'
    }

    el('link-app').href = `${APP_URL}/objetivos/interesses/${interesseId}`
    mostrar('pronto')
  }
  catch (e) {
    mostrarErro('erro-captura', e.message)
  }
  finally {
    botao.disabled = false
    botao.textContent = 'Salvar interesse'
  }
})

el('botao-outro').addEventListener('click', abrirCaptura)

// ---- Rechecagem de preço ----------------------------------------------------

const DINHEIRO = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** O preço que representa o produto: Pix quando há, senão o cheio. Igual ao app. */
function efetivo(valores) {
  return valores?.pix ?? valores?.preco ?? null
}

/**
 * Uma linha da lista de rechecagem.
 *
 * Mostra a loja, e não o nome do produto: num popup de 380px o nome de um produto
 * de e-commerce ("Sofá Retrátil 3 Lugares 220cm Suede Cinza...") ocupa a linha
 * inteira e empurra o que interessa, que é o número, para fora da tela.
 */
function desenharLinha(li, linha) {
  const { produto, estado, resultado } = linha
  const loja = produto.loja ?? new URL(produto.url).hostname

  let valor = ''
  let classe = ''

  if (estado === 'lendo') {
    valor = 'lendo…'
    classe = 'falhou'
  }
  else if (estado === 'erro' || estado === 'sem-preco') {
    valor = estado === 'erro' ? 'não abriu' : 'não achei o preço'
    classe = 'falhou'
  }
  else if (estado === 'mudou') {
    const antes = efetivo({ preco: resultado.preco_antes, pix: resultado.pix_antes })
    const depois = efetivo({ preco: resultado.preco_depois, pix: resultado.pix_depois })

    if (antes !== null && depois !== null && depois !== antes) {
      const caiu = depois < antes
      valor = `${DINHEIRO.format(antes)} → ${DINHEIRO.format(depois)} ${caiu ? '↓' : '↑'}`
      classe = caiu ? 'baixou' : ''
    }
    else {
      valor = depois === null ? 'atualizado' : DINHEIRO.format(depois)
    }
  }
  else {
    valor = 'sem mudança'
    classe = 'falhou'
  }

  li.innerHTML = ''
  const esquerda = document.createElement('span')
  esquerda.className = 'loja'
  // textContent, não innerHTML: `loja` vem do banco e passou por uma página.
  esquerda.textContent = loja
  const direita = document.createElement('span')
  direita.className = `valor ${classe}`.trim()
  direita.textContent = valor
  li.append(esquerda, direita)
}

async function abrirRecheck() {
  mostrarErro('erro-recheck', '')
  el('recheck-lista').innerHTML = ''
  el('recheck-dica').textContent = (await temPermissao())
    ? 'Abre cada produto numa aba escondida e relê o preço.'
    : 'Na primeira vez o Chrome vai pedir permissão para abrir as páginas das lojas.'
  el('botao-rodar-recheck').disabled = false
  el('botao-rodar-recheck').textContent = 'Reler os preços agora'
  mostrar('recheck')
}

async function rodarRecheck() {
  mostrarErro('erro-recheck', '')

  /*
   * A permissão precisa ser pedida de dentro do gesto do clique. Em algumas
   * versões o Chrome fecha o popup ao mostrar o diálogo — se isso acontecer, a
   * concessão fica valendo e basta reabrir e clicar de novo.
   */
  if (!(await temPermissao()) && !(await pedirPermissao())) {
    mostrarErro('erro-recheck', 'Sem a permissão não dá para abrir as páginas das lojas.')
    return
  }

  const botao = el('botao-rodar-recheck')
  botao.disabled = true
  botao.textContent = 'Lendo…'

  const lista = el('recheck-lista')
  const linhas = new Map()

  try {
    const resultados = await rechecarTudo((linha, total) => {
      let li = linhas.get(linha.produto.id)
      if (!li) {
        li = document.createElement('li')
        linhas.set(linha.produto.id, li)
        lista.append(li)
      }
      desenharLinha(li, linha)
      el('recheck-dica').textContent = `${linhas.size} de ${total}`
    })

    if (!resultados.length) {
      el('recheck-dica').textContent = 'Nenhum produto salvo para rechecar.'
    }
    else {
      const mudaram = resultados.filter(r => r.estado === 'mudou').length
      const falharam = resultados.filter(r => r.estado === 'erro' || r.estado === 'sem-preco').length
      el('recheck-dica').textContent =
        `${resultados.length} conferidos · ${mudaram} mudaram · ${falharam} não deram para ler`
    }
  }
  catch (e) {
    mostrarErro('erro-recheck', e.message)
  }
  finally {
    botao.disabled = false
    botao.textContent = 'Reler de novo'
  }
}

el('botao-recheck').addEventListener('click', abrirRecheck)
el('botao-voltar-captura').addEventListener('click', () => mostrar('captura'))
el('botao-rodar-recheck').addEventListener('click', rodarRecheck)

iniciar()
