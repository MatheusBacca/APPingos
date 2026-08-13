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
 *
 * ## O `user_id` no filtro não é redundante
 *
 * A policy `membership_select` usa `is_space_member(space_id)`, e não
 * `user_id = auth.uid()` — de propósito, para cada um enxergar a linha do par (é o
 * que faz a tela de Espaços mostrar quem participa). Consequência: sem este filtro,
 * um espaço de casal volta UMA VEZ POR MEMBRO, e o seletor listava "SpacePingos"
 * duas vezes.
 *
 * Filtrar por `user_id` é o que o app já fazia (veja o comentário em
 * `useEspacos.ts`), e resolve por construção em vez de por remendo: a chave
 * primária de `membership` é `(space_id, user_id)`, então com o usuário fixado cada
 * espaço só pode aparecer uma vez. Um `dedupe` aqui esconderia o motivo.
 */
export async function listarEspacos() {
  const sessao = await lerSessao()

  // Dois casos, e a diferença importa para quem lê a mensagem: não ter entrado é
  // o estado normal de quem abriu o popup pela primeira vez, e o popup traduz
  // este erro em "mostre a tela de login".
  if (!sessao?.access_token) {
    const erro = new Error('Entre para continuar.')
    erro.status = 401
    throw erro
  }

  // Já ter sessão mas sem o id é anomalia: sessão de uma versão anterior à que
  // passou a guardá-lo, ou storage corrompido. Sem o id não há como filtrar, e
  // listar duplicado é pior que pedir um login novo.
  if (!sessao.user_id) {
    const erro = new Error('Sessão incompleta. Saia e entre de novo.')
    erro.status = 401
    throw erro
  }

  const params = new URLSearchParams({
    select: 'papel,space(id,tipo,nome)',
    user_id: `eq.${sessao.user_id}`,
  })

  const linhas = await chamar(`membership?${params}`)

  return (linhas ?? [])
    .filter(linha => linha.space)
    .map(linha => ({
      id: linha.space.id,
      nome: linha.space.nome,
      tipo: linha.space.tipo,
      papel: linha.papel,
    }))
    // Pessoal primeiro, depois casal por nome — a mesma ordem do seletor do app,
    // para quem usa os dois não ter de reaprender onde as coisas estão.
    .sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === 'pessoal' ? -1 : 1
      return a.nome.localeCompare(b.nome, 'pt-BR')
    })
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

/**
 * Os produtos a rechecar, do mais esquecido para o mais recente.
 *
 * `verificado_em.asc.nullsfirst` põe na frente quem nunca foi rechecado desde a
 * captura, e depois os mais antigos. Assim uma rodada interrompida no meio (o
 * popup fecha se a pessoa clicar fora) sempre ataca o mais desatualizado — duas
 * rodadas parciais cobrem o conjunto em vez de reler os mesmos dois produtos.
 *
 * Só produtos de interesses vivos: rechecar preço de coisa arquivada é gastar
 * requisição contra a loja para atualizar um número que ninguém vai olhar.
 */
export async function produtosParaRechecar() {
  const params = new URLSearchParams({
    select: 'id,nome,url,loja,preco,preco_pix,parcelas,valor_parcela,verificado_em,falhas_seguidas,interesse!inner(estado)',
    'interesse.estado': 'in.(rascunho,amadurecendo)',
    order: 'verificado_em.asc.nullsfirst',
  })

  return (await chamar(`interesse_produto?${params}`)) ?? []
}

/**
 * Grava o que a rechecagem leu. Devolve `{ atualizado, preco_antes, ... }`.
 *
 * Mandar tudo `null` é o caminho de "não consegui ler": a RPC não mexe em valor
 * nenhum, só carimba a tentativa e conta a falha. A decisão de não sobrescrever
 * mora no banco, e não aqui, para valer igual a qualquer chamador.
 */
export async function registrarPrecoLido(produtoId, achado) {
  return chamar('rpc/registrar_preco_lido', {
    method: 'POST',
    body: JSON.stringify({
      p_produto: produtoId,
      p_preco: achado?.preco ?? null,
      p_preco_pix: achado?.preco_pix ?? null,
      p_parcelas: achado?.parcelas ?? null,
      p_valor_parcela: achado?.valor_parcela ?? null,
    }),
  })
}
