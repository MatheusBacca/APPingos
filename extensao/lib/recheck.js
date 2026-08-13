/**
 * Rechecagem de preço: reabre cada produto salvo e relê o que a loja mostra hoje.
 *
 * ## Por que aqui, e não num cron de servidor
 *
 * Duas coisas quebram a versão de servidor, e as duas somem aqui:
 *
 *   - **O HTML cru não tem o que interessa.** Preço Pix e parcelamento são
 *     montados por JS; um `fetch` recebe a página antes disso. Uma aba de verdade
 *     espera a página terminar de se montar.
 *   - **Loja grande bloqueia IP de datacenter.** Aqui a requisição sai do
 *     navegador de quem usa: IP residencial, Chrome de verdade, os cookies que a
 *     pessoa já tem. É o tráfego que a loja não tem motivo para barrar.
 *
 * De quebra, nenhuma credencial precisa existir em lugar nenhum: a sessão já está
 * no popup.
 *
 * ## A permissão vem no clique, não na instalação
 *
 * Para rodar `raspar()` numa aba que a pessoa não abriu, o Chrome exige permissão
 * de host para aquele site — e `activeTab` só cobre a aba de onde o ícone foi
 * clicado. A saída é `optional_host_permissions` no manifest mais
 * `chrome.permissions.request()` **no momento do clique**: quem nunca usar o botão
 * nunca concede nada, e a instalação continua sem o aviso de "ler seus dados em
 * todos os sites".
 *
 * ## O que acontece se o popup fechar no meio
 *
 * A rodada morre junto — o popup é a página que executa este código. Não é grave e
 * é por isso que cada produto é gravado assim que é lido, em vez de tudo no fim:
 * uma rodada interrompida deixa metade do trabalho FEITO, não perdido. E como a
 * lista vem ordenada pelo mais desatualizado, a rodada seguinte pega de onde
 * parou sem repetir o que já foi.
 */
import { registrarPrecoLido } from './api.js'
import { raspar } from './raspagem.js'

/** Teto de tempo esperando uma loja terminar de carregar. */
const TIMEOUT_MS = 30_000

/**
 * Folga depois do `complete` para o JS montar preço e parcelamento.
 *
 * O evento `complete` do Chrome dispara quando o documento carregou, e em loja
 * moderna o preço aparece depois disso. Três segundos é o que separou "leu" de
 * "não leu" nos testes com a extensão em uso.
 */
const ESPERA_JS_MS = 3000

/** Pede a permissão de host. Só pode ser chamada de dentro de um clique. */
export async function pedirPermissao() {
  return chrome.permissions.request({ origins: ['https://*/*'] })
}

export async function temPermissao() {
  return chrome.permissions.contains({ origins: ['https://*/*'] })
}

/** Resolve quando a aba termina de carregar, ou estoura o tempo. */
function esperarCarregar(tabId) {
  return new Promise((resolve, reject) => {
    const relogio = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(ouvinte)
      reject(new Error('timeout'))
    }, TIMEOUT_MS)

    function ouvinte(id, info) {
      if (id !== tabId || info.status !== 'complete') return
      clearTimeout(relogio)
      chrome.tabs.onUpdated.removeListener(ouvinte)
      resolve()
    }

    chrome.tabs.onUpdated.addListener(ouvinte)
  })
}

/**
 * Abre a URL numa aba escondida, raspa e fecha.
 *
 * `active: false` para a aba não roubar o foco — a pessoa continua no que estava
 * fazendo, e o popup não fecha. A aba é fechada no `finally`: uma loja que trave
 * não pode deixar aba órfã acumulando a cada rodada.
 */
async function rasparEmAbaNova(url) {
  let aba

  try {
    aba = await chrome.tabs.create({ url, active: false })
    await esperarCarregar(aba.id)
    await new Promise(r => setTimeout(r, ESPERA_JS_MS))

    const [resultado] = await chrome.scripting.executeScript({
      target: { tabId: aba.id },
      func: raspar,
    })

    return resultado?.result ?? null
  }
  finally {
    if (aba?.id) {
      try {
        await chrome.tabs.remove(aba.id)
      }
      catch {
        // A aba pode já ter sumido (a pessoa fechou, a loja redirecionou para
        // fora). Não é motivo para derrubar a rodada inteira.
      }
    }
  }
}

/**
 * Recheca os produtos DADOS, avisando o progresso a cada um.
 *
 * A lista vem de fora, e não de dentro: quem escolhe o que reler é a pessoa, na tela
 * de seleção. Cada produto relido é uma aba aberta e ~5 segundos de espera, então
 * "todos" nem sempre é o que se quer — quem tem quinze produtos salvos e só quer
 * saber do sofá não deve esperar pelos outros catorze.
 *
 * `aoProgresso` é chamado com o resultado de cada produto assim que ele fica
 * pronto, para a tela ir preenchendo em vez de ficar parada até o fim. Numa lista
 * de dez produtos a rodada leva quase um minuto, e um popup congelado esse tempo
 * todo parece travado.
 */
export async function rechecarTudo(produtos, aoProgresso = () => {}) {
  const resultados = []

  for (const produto of produtos) {
    const linha = { produto, estado: 'lendo' }
    aoProgresso(linha, produtos.length)

    try {
      const achado = await rasparEmAbaNova(produto.url)
      const gravado = await registrarPrecoLido(produto.id, achado)

      Object.assign(linha, {
        estado: gravado?.atualizado ? 'mudou' : (achado?.preco || achado?.preco_pix) ? 'igual' : 'sem-preco',
        resultado: gravado,
      })
    }
    catch (e) {
      /*
       * Falhar num produto não pode derrubar os outros — uma loja fora do ar
       * deixaria a rodada inteira sem efeito. Registra a tentativa mesmo assim,
       * para `falhas_seguidas` contar e a tela poder dizer que essa loja parou de
       * funcionar.
       */
      try {
        await registrarPrecoLido(produto.id, null)
      }
      catch {
        // Sem rede nem para gravar a falha; segue para o próximo.
      }
      Object.assign(linha, { estado: 'erro', erro: e.message })
    }

    resultados.push(linha)
    aoProgresso(linha, produtos.length)
  }

  return resultados
}
