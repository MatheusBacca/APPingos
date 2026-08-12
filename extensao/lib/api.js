/**
 * O Supabase visto pela extensão: Auth e PostgREST sobre `fetch`, sem dependência.
 *
 * ## Por que REST cru e não supabase-js
 *
 * Sem bibliotecas, a pasta da extensão É o pacote: nada de bundler, nada de
 * `package.json` aninhado dentro do projeto Nuxt, nada de build a rodar antes de
 * "Carregar sem compactação". O que se paga por isso são as ~40 linhas de renovação
 * de token abaixo, que o supabase-js daria de graça. Na escala de uma extensão com
 * um popup, o troco é bom.
 *
 * ## Por que a extensão faz o próprio login
 *
 * A sessão do app vive em cookies do domínio do Vercel, e a extensão não consegue
 * ler isso — nem deveria. Ela autentica com o MESMO e-mail e senha, contra o mesmo
 * projeto, e recebe um JWT igual ao do app. Quem autoriza cada leitura e escrita
 * continua sendo a RLS por `is_space_member`.
 *
 * ## Sobre a anon key ir dentro do .zip
 *
 * É a mesma exposição do app web, onde ela já vai no bundle: a chave é pública por
 * projeto, por desenho. Ela sozinha não abre nada — o que autoriza é o JWT do
 * usuário. Nenhuma `service_role` chega perto daqui.
 */
import { SUPABASE_URL, SUPABASE_KEY } from './config.gerado.js'

const CHAVE_SESSAO = 'appingos:sessao'
const CHAVE_ESPACO = 'appingos:espaco'

/**
 * Margem antes de considerar o token vencido.
 *
 * 60s porque o relógio da máquina pode estar adiantado e porque a requisição
 * leva tempo: renovar "no instante exato" produziria 401 esporádicos que só
 * aparecem para quem tem a máquina fora de hora.
 */
const MARGEM_SEGUNDOS = 60

// ---- Armazenamento ---------------------------------------------------------

async function lerStorage(chave) {
  const guardado = await chrome.storage.local.get(chave)
  return guardado[chave] ?? null
}

async function gravarStorage(chave, valor) {
  await chrome.storage.local.set({ [chave]: valor })
}

export async function lerSessao() {
  return lerStorage(CHAVE_SESSAO)
}

export async function lerEspacoEscolhido() {
  return lerStorage(CHAVE_ESPACO)
}

export async function gravarEspacoEscolhido(spaceId) {
  await gravarStorage(CHAVE_ESPACO, spaceId)
}

async function limparSessao() {
  await chrome.storage.local.remove(CHAVE_SESSAO)
}

/**
 * Normaliza o que o GoTrue devolve, calculando `expira_em` em milissegundos.
 *
 * O `expires_at` da resposta vem em segundos (época Unix) e o `Date.now()` do
 * JavaScript em milissegundos — misturar os dois faz o token parecer vencido desde
 * 1970 e a extensão renovar a cada clique.
 */
function daResposta(dados) {
  const expiraEmMs = dados.expires_at
    ? dados.expires_at * 1000
    : Date.now() + (dados.expires_in ?? 3600) * 1000

  return {
    access_token: dados.access_token,
    refresh_token: dados.refresh_token,
    expira_em: expiraEmMs,
    email: dados.user?.email ?? null,
    user_id: dados.user?.id ?? null,
  }
}

// ---- Erros -----------------------------------------------------------------

/**
 * A mensagem do Supabase em português.
 *
 * Mesma intenção do `mensagemDeErro` do app (`app/lib/utils.ts`): o texto cru do
 * GoTrue é em inglês e fala de "credentials", que não é o vocabulário de quem só
 * quer entrar. As duas primeiras são as que de fato acontecem.
 */
function mensagemDoErro(dados, resposta) {
  const cru = dados?.error_description ?? dados?.msg ?? dados?.message ?? dados?.error ?? ''

  if (/invalid login credentials/i.test(cru)) return 'E-mail ou senha incorretos.'
  if (/email not confirmed/i.test(cru)) return 'Confirme o e-mail antes de entrar.'
  if (/over_email_send_rate_limit|too many requests/i.test(cru)) {
    return 'Muitas tentativas. Espere um minuto e tente de novo.'
  }
  if (resposta?.status === 401) return 'Sessão expirada. Entre de novo.'

  return cru || `Erro ${resposta?.status ?? ''}`.trim() || 'Algo deu errado.'
}

async function corpoOuErro(resposta) {
  const texto = await resposta.text()
  const dados = texto ? JSON.parse(texto) : null

  if (!resposta.ok) {
    const erro = new Error(mensagemDoErro(dados, resposta))
    erro.status = resposta.status
    throw erro
  }

  return dados
}

// ---- Auth ------------------------------------------------------------------

export async function entrar(email, senha) {
  const resposta = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password: senha }),
  })

  const sessao = daResposta(await corpoOuErro(resposta))
  await gravarStorage(CHAVE_SESSAO, sessao)
  return sessao
}

async function renovar(sessao) {
  const resposta = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: sessao.refresh_token }),
  })

  if (!resposta.ok) {
    // Refresh token revogado ou já usado (o projeto tem rotação ligada). Não há
    // como recuperar — a sessão morre aqui e o popup volta para o login.
    await limparSessao()
    const erro = new Error('Sessão expirada. Entre de novo.')
    erro.status = 401
    throw erro
  }

  const nova = daResposta(await resposta.json())
  await gravarStorage(CHAVE_SESSAO, nova)
  return nova
}

export async function sair() {
  const sessao = await lerSessao()

  if (sessao?.access_token) {
    // Best-effort: se a rede falhar, o token expira sozinho em uma hora. Insistir
    // aqui deixaria a pessoa presa numa sessão que ela pediu para encerrar.
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${sessao.access_token}`,
        },
      })
    }
    catch {
      // ignorado de propósito, ver acima
    }
  }

  await limparSessao()
}

/** A sessão válida, renovando se estiver perto de vencer. `null` se não há. */
async function sessaoValida() {
  const sessao = await lerSessao()
  if (!sessao?.access_token) return null

  const vencendo = sessao.expira_em - MARGEM_SEGUNDOS * 1000 <= Date.now()
  return vencendo ? renovar(sessao) : sessao
}

// ---- PostgREST -------------------------------------------------------------

/**
 * Uma chamada autenticada ao PostgREST, com uma tentativa de renovação.
 *
 * O 401 acontece mesmo com o `expira_em` em dia — relógio da máquina fora de hora,
 * token revogado do outro lado — então o retry não é redundante com a checagem de
 * validade acima: um cobre o caso previsível, o outro o imprevisível. Uma tentativa
 * só, porque se a renovação não resolveu, repetir não vai resolver.
 */
async function chamar(caminho, opcoes = {}, jaRenovou = false) {
  const sessao = await sessaoValida()
  if (!sessao) {
    const erro = new Error('Entre para continuar.')
    erro.status = 401
    throw erro
  }

  const resposta = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${sessao.access_token}`,
      'Content-Type': 'application/json',
      ...opcoes.headers,
    },
  })

  if (resposta.status === 401 && !jaRenovou) {
    await renovar(sessao)
    return chamar(caminho, opcoes, true)
  }

  return corpoOuErro(resposta)
}

/**
 * Os espaços de quem está logado — o mesmo recorte de `app/composables/useEspacos.ts`.
 *
 * A escolha do espaço no app vive em `localStorage` da origem do Vercel, ilegível
 * daqui. Então a extensão pergunta, e lembra da resposta em `chrome.storage`.
 */
export async function listarEspacos() {
  const linhas = await chamar('membership?select=papel,space(id,tipo,nome)')

  return (linhas ?? [])
    .filter(linha => linha.space)
    .map(linha => ({
      id: linha.space.id,
      nome: linha.space.nome,
      tipo: linha.space.tipo,
      papel: linha.papel,
    }))
    // Pessoal primeiro: é o default de quem ainda não escolheu, igual ao app.
    .sort((a, b) => (a.tipo === 'pessoal' ? -1 : 1) - (b.tipo === 'pessoal' ? -1 : 1))
}

/**
 * Os interesses ainda vivos do espaço, para "adicionar a um que já existe".
 *
 * Só rascunho e amadurecendo, e no máximo 50: a lista existe para achar "Trocar o
 * sofá" e pendurar o terceiro sofá nele. Um histórico inteiro num `<select>` de
 * popup não ajudaria ninguém a encontrar nada.
 */
export async function listarInteressesAbertos(spaceId) {
  const params = new URLSearchParams({
    select: 'id,titulo',
    space_id: `eq.${spaceId}`,
    estado: 'in.(rascunho,amadurecendo)',
    order: 'created_at.desc',
    limit: '50',
  })

  return (await chamar(`interesse?${params}`)) ?? []
}

/** Cria o interesse com o produto capturado, numa transação. Devolve o id. */
export async function registrarInteresse({ spaceId, titulo, destino, paraQuem, observacao, produto }) {
  return chamar('rpc/registrar_interesse', {
    method: 'POST',
    body: JSON.stringify({
      p_space: spaceId,
      p_titulo: titulo,
      p_destino: destino ?? 'compra',
      p_para_quem: paraQuem ?? null,
      p_observacao: observacao ?? null,
      p_produto: produto ?? null,
    }),
  })
}

/** Pendura outro candidato num interesse que já existe. Devolve o id do produto. */
export async function adicionarProduto(interesseId, produto) {
  return chamar('rpc/adicionar_produto', {
    method: 'POST',
    body: JSON.stringify({ p_interesse: interesseId, p_produto: produto }),
  })
}
