/**
 * A camada de rede da extensão: sessão, renovação de token e mensagens de erro.
 *
 * É a parte hand-rolled que o supabase-js daria de graça, então é a parte que
 * precisa de teste. Os três bugs que ela pode ter são silenciosos e chatos de
 * reproduzir à mão:
 *
 *   1. segundos × milissegundos no `expires_at` — faz o token parecer vencido desde
 *      1970, e a extensão renova a cada clique;
 *   2. não renovar num 401 — a captura falha depois de uma hora parada, sempre;
 *   3. renovar em laço quando o refresh token já morreu.
 *
 * `chrome.storage.local` e `fetch` são dublês daqui; o resto é o código de verdade.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  adicionarProduto,
  entrar,
  lerSessao,
  listarEspacos,
  listarInteressesAbertos,
  registrarInteresse,
  sair,
} from '../extensao/lib/api.js'

const URL_BASE = 'https://projeto-de-teste.supabase.co'

/** Dublê de `chrome.storage.local` com um objeto em memória. */
let guardado: Record<string, unknown> = {}

/** As chamadas que o código fez, para inspecionar depois. */
let chamadas: { url: string, opcoes: RequestInit }[] = []

function resposta(corpo: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (corpo === undefined ? '' : JSON.stringify(corpo)),
    json: async () => corpo,
  }
}

/** Uma sessão como o GoTrue devolve: `expires_at` em SEGUNDOS da época. */
function sessaoDoGoTrue(segundosDeVida = 3600, sufixo = '1') {
  return {
    access_token: `access-${sufixo}`,
    refresh_token: `refresh-${sufixo}`,
    expires_at: Math.floor(Date.now() / 1000) + segundosDeVida,
    user: { id: 'user-1', email: 'ana@teste.com' },
  }
}

beforeEach(() => {
  guardado = {}
  chamadas = []

  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (chave: string) => (chave in guardado ? { [chave]: guardado[chave] } : {}),
        set: async (par: Record<string, unknown>) => { Object.assign(guardado, par) },
        remove: async (chave: string) => { delete guardado[chave] },
      },
    },
  })
})

/** Instala um fetch que responde conforme a fila de respostas dada. */
function dublarFetch(fila: ReturnType<typeof resposta>[]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, opcoes: RequestInit = {}) => {
    chamadas.push({ url, opcoes })
    const proxima = fila.shift()
    if (!proxima) throw new Error(`fetch inesperado para ${url}`)
    return proxima
  }))
}

describe('entrar', () => {
  it('manda a anon key e guarda a sessão', async () => {
    dublarFetch([resposta(sessaoDoGoTrue())])

    const sessao = await entrar('  ana@teste.com  ', 'senha123')

    expect(chamadas[0]!.url).toBe(`${URL_BASE}/auth/v1/token?grant_type=password`)
    expect((chamadas[0]!.opcoes.headers as Record<string, string>).apikey).toBe('anon-key-de-teste')
    // O e-mail vai sem espaços em volta — colar de um gerenciador de senhas traz.
    expect(JSON.parse(chamadas[0]!.opcoes.body as string)).toEqual({
      email: 'ana@teste.com',
      password: 'senha123',
    })

    expect(sessao.access_token).toBe('access-1')
    expect(await lerSessao()).toMatchObject({ access_token: 'access-1', email: 'ana@teste.com' })
  })

  /*
   * O bug nº 1: `expires_at` vem em segundos e `Date.now()` em milissegundos.
   * Guardar o número cru faria todo token parecer vencido desde 1970.
   */
  it('converte expires_at de segundos para milissegundos', async () => {
    const doGoTrue = sessaoDoGoTrue(3600)
    dublarFetch([resposta(doGoTrue)])

    const sessao = await entrar('ana@teste.com', 'x')

    expect(sessao.expira_em).toBe(doGoTrue.expires_at * 1000)
    expect(sessao.expira_em).toBeGreaterThan(Date.now())
  })

  it('traduz credencial errada para português', async () => {
    dublarFetch([resposta({ error_description: 'Invalid login credentials' }, 400)])

    await expect(entrar('ana@teste.com', 'errada')).rejects.toThrow('E-mail ou senha incorretos.')
    expect(await lerSessao()).toBeNull()
  })

  it('traduz e-mail não confirmado', async () => {
    dublarFetch([resposta({ msg: 'Email not confirmed' }, 400)])
    await expect(entrar('a@b.c', 'x')).rejects.toThrow('Confirme o e-mail antes de entrar.')
  })

  it('traduz excesso de tentativas', async () => {
    dublarFetch([resposta({ message: 'Too Many Requests' }, 429)])
    await expect(entrar('a@b.c', 'x')).rejects.toThrow(/Muitas tentativas/)
  })
})

describe('renovação de token', () => {
  it('renova antes de chamar quando falta menos que a margem', async () => {
    // 30s de vida: dentro da margem de 60s, então precisa renovar ANTES do REST.
    guardado['appingos:sessao'] = {
      access_token: 'velho',
      refresh_token: 'refresh-velho',
      expira_em: Date.now() + 30_000,
      user_id: 'user-1',
    }

    dublarFetch([
      resposta(sessaoDoGoTrue(3600, 'novo')),
      resposta([]),
    ])

    await listarEspacos()

    expect(chamadas[0]!.url).toBe(`${URL_BASE}/auth/v1/token?grant_type=refresh_token`)
    expect(JSON.parse(chamadas[0]!.opcoes.body as string)).toEqual({ refresh_token: 'refresh-velho' })

    // A chamada REST já sai com o token novo.
    expect((chamadas[1]!.opcoes.headers as Record<string, string>).Authorization).toBe('Bearer access-novo')
    expect(await lerSessao()).toMatchObject({ access_token: 'access-novo' })
  })

  it('não renova quando o token ainda tem vida', async () => {
    guardado['appingos:sessao'] = {
      access_token: 'bom',
      refresh_token: 'r',
      expira_em: Date.now() + 3_600_000,
      user_id: 'user-1',
    }

    dublarFetch([resposta([])])

    await listarEspacos()

    expect(chamadas).toHaveLength(1)
    expect(chamadas[0]!.url).toContain('/rest/v1/membership')
  })

  /*
   * O bug nº 2. Acontece com o `expira_em` em dia: relógio da máquina fora de hora,
   * token revogado do outro lado. Sem o retry, a captura falha e a pessoa não tem o
   * que fazer além de sair e entrar de novo.
   */
  it('num 401 inesperado, renova e repete a chamada', async () => {
    guardado['appingos:sessao'] = {
      access_token: 'parece-bom',
      refresh_token: 'r',
      expira_em: Date.now() + 3_600_000,
      user_id: 'user-1',
    }

    dublarFetch([
      resposta({ message: 'JWT expired' }, 401),
      resposta(sessaoDoGoTrue(3600, 'novo')),
      resposta([{ papel: 'dono', space: { id: 's1', tipo: 'pessoal', nome: 'Ana' } }]),
    ])

    const espacos = await listarEspacos()

    const membership = `${URL_BASE}/rest/v1/membership?select=papel%2Cspace%28id%2Ctipo%2Cnome%29&user_id=eq.user-1`
    expect(chamadas.map(c => c.url)).toEqual([
      membership,
      `${URL_BASE}/auth/v1/token?grant_type=refresh_token`,
      membership,
    ])
    expect(espacos).toEqual([{ id: 's1', nome: 'Ana', tipo: 'pessoal', papel: 'dono' }])
  })

  /*
   * O bug nº 3: uma tentativa só. O projeto tem rotação de refresh token ligada, e
   * insistir num refresh já usado seria um laço contra o servidor.
   */
  it('desiste depois de uma renovação, sem entrar em laço', async () => {
    guardado['appingos:sessao'] = {
      access_token: 'a',
      refresh_token: 'r',
      expira_em: Date.now() + 3_600_000,
      user_id: 'user-1',
    }

    dublarFetch([
      resposta({ message: 'JWT expired' }, 401),
      resposta(sessaoDoGoTrue(3600, 'novo')),
      resposta({ message: 'JWT expired' }, 401),
    ])

    await expect(listarEspacos()).rejects.toThrow(/Sessão expirada/)
    expect(chamadas).toHaveLength(3)
  })

  it('refresh token morto limpa a sessão e pede login', async () => {
    guardado['appingos:sessao'] = {
      access_token: 'a',
      refresh_token: 'revogado',
      expira_em: Date.now() - 1000,
      user_id: 'user-1',
    }

    dublarFetch([resposta({ message: 'Invalid Refresh Token' }, 400)])

    await expect(listarEspacos()).rejects.toThrow('Sessão expirada. Entre de novo.')
    expect(await lerSessao()).toBeNull()
  })

  it('sem sessão nenhuma, nem tenta a rede', async () => {
    dublarFetch([])
    await expect(listarEspacos()).rejects.toThrow('Entre para continuar.')
    expect(chamadas).toHaveLength(0)
  })
})

describe('leituras', () => {
  beforeEach(() => {
    guardado['appingos:sessao'] = {
      access_token: 'bom',
      refresh_token: 'r',
      expira_em: Date.now() + 3_600_000,
      user_id: 'user-1',
    }
  })

  /*
   * Pessoal primeiro, como no app: é o default de quem ainda não escolheu, e o
   * espaço em que um interesse solto é menos capaz de estragar surpresa.
   */
  it('lista espaços com o pessoal na frente', async () => {
    dublarFetch([resposta([
      { papel: 'membro', space: { id: 'casal', tipo: 'casal', nome: 'Nós' } },
      { papel: 'dono', space: { id: 'meu', tipo: 'pessoal', nome: 'Ana' } },
    ])])

    expect((await listarEspacos()).map(e => e.id)).toEqual(['meu', 'casal'])
  })

  it('ordena os espaços de casal por nome', async () => {
    dublarFetch([resposta([
      { papel: 'membro', space: { id: 'z', tipo: 'casal', nome: 'Zurique' } },
      { papel: 'membro', space: { id: 'a', tipo: 'casal', nome: 'Ártico' } },
      { papel: 'dono', space: { id: 'meu', tipo: 'pessoal', nome: 'Ana' } },
    ])])

    expect((await listarEspacos()).map(e => e.id)).toEqual(['meu', 'a', 'z'])
  })

  /*
   * O bug da 0.1.0: o seletor mostrava "SpacePingos (casal)" DUAS VEZES.
   *
   * A policy `membership_select` usa `is_space_member(space_id)`, e não
   * `user_id = auth.uid()` — de propósito, para cada um ver a linha do par. Então
   * um espaço de casal volta uma vez por membro. O filtro no `user_id` é o que
   * resolve, e a chave primária `(space_id, user_id)` é o que garante que resolve.
   */
  it('pede só as memberships do próprio usuário', async () => {
    dublarFetch([resposta([])])

    await listarEspacos()

    const url = new URL(chamadas[0]!.url)
    expect(url.searchParams.get('user_id')).toBe('eq.user-1')
    expect(url.searchParams.get('select')).toBe('papel,space(id,tipo,nome)')
  })

  it('sem sessão completa, recusa em vez de listar duplicado', async () => {
    // Sessão de uma versão anterior à que passou a guardar o id do usuário.
    guardado['appingos:sessao'] = {
      access_token: 'sem-id',
      refresh_token: 'r',
      expira_em: Date.now() + 3_600_000,
    }
    dublarFetch([])

    await expect(listarEspacos()).rejects.toThrow(/Sessão incompleta/)
    expect(chamadas).toHaveLength(0)
  })

  it('descarta linha de membership sem espaço embutido', async () => {
    dublarFetch([resposta([
      { papel: 'dono', space: null },
      { papel: 'dono', space: { id: 'meu', tipo: 'pessoal', nome: 'Ana' } },
    ])])

    expect(await listarEspacos()).toHaveLength(1)
  })

  it('pede só os interesses abertos, com teto', async () => {
    dublarFetch([resposta([])])

    await listarInteressesAbertos('space-1')

    const url = new URL(chamadas[0]!.url)
    expect(url.searchParams.get('space_id')).toBe('eq.space-1')
    expect(url.searchParams.get('estado')).toBe('in.(rascunho,amadurecendo)')
    expect(url.searchParams.get('limit')).toBe('50')
  })
})

describe('escritas', () => {
  beforeEach(() => {
    guardado['appingos:sessao'] = {
      access_token: 'bom',
      refresh_token: 'r',
      expira_em: Date.now() + 3_600_000,
      user_id: 'user-1',
    }
  })

  it('registrar_interesse manda os parâmetros da RPC', async () => {
    dublarFetch([resposta('novo-id')])

    const id = await registrarInteresse({
      spaceId: 'space-1',
      titulo: 'Trocar o sofá',
      destino: 'compra',
      paraQuem: null,
      observacao: null,
      produto: { nome: 'Sofá', url: 'https://loja.com/s', preco: 2399 },
    })

    expect(id).toBe('novo-id')
    expect(chamadas[0]!.url).toBe(`${URL_BASE}/rest/v1/rpc/registrar_interesse`)
    expect(chamadas[0]!.opcoes.method).toBe('POST')
    expect(JSON.parse(chamadas[0]!.opcoes.body as string)).toEqual({
      p_space: 'space-1',
      p_titulo: 'Trocar o sofá',
      p_destino: 'compra',
      p_para_quem: null,
      p_observacao: null,
      p_produto: { nome: 'Sofá', url: 'https://loja.com/s', preco: 2399 },
    })
  })

  it('destino ausente cai em compra, que é o que a extensão captura', async () => {
    dublarFetch([resposta('id')])

    await registrarInteresse({ spaceId: 's', titulo: 't', produto: null })

    expect(JSON.parse(chamadas[0]!.opcoes.body as string).p_destino).toBe('compra')
  })

  it('adicionar_produto manda interesse e produto', async () => {
    dublarFetch([resposta('produto-id')])

    await adicionarProduto('interesse-1', { nome: 'Outro sofá', url: 'https://b.com/x' })

    expect(chamadas[0]!.url).toBe(`${URL_BASE}/rest/v1/rpc/adicionar_produto`)
    expect(JSON.parse(chamadas[0]!.opcoes.body as string)).toEqual({
      p_interesse: 'interesse-1',
      p_produto: { nome: 'Outro sofá', url: 'https://b.com/x' },
    })
  })
})

describe('sair', () => {
  it('avisa o servidor e limpa a sessão', async () => {
    guardado['appingos:sessao'] = { access_token: 'a', refresh_token: 'r', expira_em: Date.now() + 1000 }
    dublarFetch([resposta(undefined, 204)])

    await sair()

    expect(chamadas[0]!.url).toBe(`${URL_BASE}/auth/v1/logout`)
    expect(await lerSessao()).toBeNull()
  })

  /*
   * Rede caída não pode prender ninguém numa sessão que ela pediu para encerrar —
   * o token expira sozinho em uma hora de qualquer forma.
   */
  it('limpa a sessão mesmo se a rede falhar', async () => {
    guardado['appingos:sessao'] = { access_token: 'a', refresh_token: 'r', expira_em: Date.now() + 1000 }
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))

    await sair()

    expect(await lerSessao()).toBeNull()
  })

  it('sem sessão, não chama nada', async () => {
    dublarFetch([])
    await sair()
    expect(chamadas).toHaveLength(0)
  })
})
