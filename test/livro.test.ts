import { describe, expect, it } from 'vitest'
import type { Avaliacao, ItemDoEspaco } from '../app/types/catalogo'
import {
  PRATELEIRAS,
  fraseDaMeta,
  lidosNoAno,
  paginasDoLivro,
  porPrateleira,
  prateleiraDe,
  progressoDaLeitura,
  progressoDaMeta,
  semPrateleira,
} from '../app/types/livro'

const EU = 'eu-123'
const ELE = 'ele-456'

function avaliacao(parcial: Partial<Avaliacao> & { user_id: string }): Avaliacao {
  return {
    status: 'quero',
    nota: null,
    resenha: null,
    planejado_para: null,
    visto_em: null,
    enviado_em: null,
    pagina_atual: null,
    ...parcial,
  }
}

function livro(
  id: string,
  avaliacoes: Avaliacao[],
  metadados: Record<string, unknown> = {},
): ItemDoEspaco {
  return {
    id,
    created_at: '2026-01-01T00:00:00Z',
    media: {
      id: `media-${id}`,
      tipo: 'livro',
      fonte: 'google-books',
      fonte_id: `g-${id}`,
      titulo: `Livro ${id}`,
      titulo_original: null,
      ano: 2020,
      capa_url: null,
      sinopse: null,
      metadados,
    },
    avaliacoes,
  }
}

describe('prateleiraDe', () => {
  it('devolve o status da pessoa que perguntou', () => {
    const item = livro('a', [
      avaliacao({ user_id: EU, status: 'vendo' }),
      avaliacao({ user_id: ELE, status: 'visto' }),
    ])

    expect(prateleiraDe(item, EU)).toBe('vendo')
    expect(prateleiraDe(item, ELE)).toBe('visto')
  })

  /*
   * O caso que dá sentido à faixa de sugestões: o livro está no espaço porque o
   * outro pôs, e para você ele ainda não é nada. Isso não é ausência de dado, é
   * um estado de verdade.
   */
  it('devolve null quando a pessoa não classificou', () => {
    const item = livro('a', [avaliacao({ user_id: ELE, status: 'visto' })])
    expect(prateleiraDe(item, EU)).toBeNull()
  })

  it('devolve null sem usuário', () => {
    expect(prateleiraDe(livro('a', []), null)).toBeNull()
  })
})

describe('porPrateleira', () => {
  it('separa por status da pessoa, e não do espaço', () => {
    const itens = [
      livro('a', [avaliacao({ user_id: EU, status: 'quero' }), avaliacao({ user_id: ELE, status: 'visto' })]),
      livro('b', [avaliacao({ user_id: EU, status: 'visto' })]),
      livro('c', [avaliacao({ user_id: ELE, status: 'vendo' })]),
    ]

    const meu = porPrateleira(itens, EU)
    expect(meu.quero.map(i => i.id)).toEqual(['a'])
    expect(meu.visto.map(i => i.id)).toEqual(['b'])
    expect(meu.vendo).toEqual([])
  })

  /*
   * A tela desenha as quatro prateleiras fixas. Se este contrato quebrar, a
   * seção "Lendo" some da estante quando você termina o último livro — uma
   * estante que muda de forma a cada leitura.
   */
  it('devolve as quatro chaves mesmo vazias', () => {
    const grupos = porPrateleira([], EU)
    expect(Object.keys(grupos).sort()).toEqual(['abandonei', 'quero', 'vendo', 'visto'])
    for (const p of PRATELEIRAS) expect(grupos[p.valor]).toEqual([])
  })
})

describe('semPrateleira', () => {
  it('pega só o que o outro pôs e você não classificou', () => {
    const itens = [
      livro('a', [avaliacao({ user_id: ELE, status: 'quero' })]),
      livro('b', [avaliacao({ user_id: EU, status: 'quero' })]),
    ]

    expect(semPrateleira(itens, EU).map(i => i.id)).toEqual(['a'])
  })
})

describe('paginasDoLivro', () => {
  it('lê o total dos metadados', () => {
    expect(paginasDoLivro(livro('a', [], { paginas: 320 }))).toBe(320)
  })

  it('ignora ausente, zero e lixo', () => {
    expect(paginasDoLivro(livro('a', [], {}))).toBeNull()
    expect(paginasDoLivro(livro('a', [], { paginas: 0 }))).toBeNull()
    expect(paginasDoLivro(livro('a', [], { paginas: 'muitas' }))).toBeNull()
  })
})

describe('progressoDaLeitura', () => {
  it('calcula a porcentagem lida', () => {
    const item = livro('a', [avaliacao({ user_id: EU, status: 'vendo', pagina_atual: 80 })], { paginas: 320 })
    expect(progressoDaLeitura(item, EU)).toBe(25)
  })

  it('devolve null sem página ou sem total', () => {
    const semPagina = livro('a', [avaliacao({ user_id: EU, status: 'vendo' })], { paginas: 320 })
    const semTotal = livro('b', [avaliacao({ user_id: EU, status: 'vendo', pagina_atual: 80 })])

    expect(progressoDaLeitura(semPagina, EU)).toBeNull()
    expect(progressoDaLeitura(semTotal, EU)).toBeNull()
  })

  /*
   * Edição de bolso tem mais páginas que a capa dura que o Google registrou.
   * Sem o teto, a barra passaria de 100% e pareceria defeito — quando na
   * verdade a pessoa anotou a página certa do livro que tem na mão.
   */
  it('limita em 100 quando a edição tem mais páginas que o registro', () => {
    const item = livro('a', [avaliacao({ user_id: EU, status: 'vendo', pagina_atual: 400 })], { paginas: 320 })
    expect(progressoDaLeitura(item, EU)).toBe(100)
  })
})

describe('lidosNoAno', () => {
  const itens = [
    livro('a', [avaliacao({ user_id: EU, status: 'visto', visto_em: '2026-03-10' })]),
    livro('b', [avaliacao({ user_id: EU, status: 'visto', visto_em: '2025-12-31' })]),
    livro('c', [avaliacao({ user_id: ELE, status: 'visto', visto_em: '2026-05-01' })]),
    livro('d', [avaliacao({ user_id: EU, status: 'vendo' })]),
  ]

  it('conta só os seus, terminados naquele ano', () => {
    expect(lidosNoAno(itens, EU, 2026)).toBe(1)
    expect(lidosNoAno(itens, EU, 2025)).toBe(1)
    expect(lidosNoAno(itens, ELE, 2026)).toBe(1)
  })

  /*
   * Mesma regra do "não lembro" de Filmes: sem data não há ano a que pertencer.
   * Chutar o ano corrente inflaria a meta de quem cadastrou a estante velha de
   * uma vez só.
   */
  it('ignora terminado sem data', () => {
    const semData = [livro('x', [avaliacao({ user_id: EU, status: 'visto' })])]
    expect(lidosNoAno(semData, EU, 2026)).toBe(0)
  })

  it('devolve zero sem usuário', () => {
    expect(lidosNoAno(itens, null, 2026)).toBe(0)
  })
})

describe('progressoDaMeta', () => {
  const itens = [
    livro('a', [avaliacao({ user_id: EU, status: 'visto', visto_em: '2026-01-05' })]),
    livro('b', [avaliacao({ user_id: EU, status: 'visto', visto_em: '2026-02-05' })]),
    livro('c', [avaliacao({ user_id: EU, status: 'visto', visto_em: '2026-03-05' })]),
  ]

  it('monta lidos, percentual e quantos faltam', () => {
    const p = progressoDaMeta(itens, EU, { user_id: EU, ano: 2026, alvo: 12 })
    expect(p).toEqual({ alvo: 12, lidos: 3, percentual: 25, faltam: 9, cumprida: false })
  })

  it('marca cumprida e não passa de 100%', () => {
    const p = progressoDaMeta(itens, EU, { user_id: EU, ano: 2026, alvo: 2 })!
    expect(p.cumprida).toBe(true)
    expect(p.percentual).toBe(100)
    expect(p.faltam).toBe(0)
  })

  it('devolve null sem meta', () => {
    expect(progressoDaMeta(itens, EU, null)).toBeNull()
    expect(progressoDaMeta(itens, EU, undefined)).toBeNull()
  })
})

describe('fraseDaMeta', () => {
  it('diz quantos faltam, no singular e no plural', () => {
    expect(fraseDaMeta({ alvo: 12, lidos: 3, percentual: 25, faltam: 9, cumprida: false }))
      .toBe('3 de 12 · faltam 9')
    expect(fraseDaMeta({ alvo: 12, lidos: 11, percentual: 92, faltam: 1, cumprida: false }))
      .toBe('11 de 12 · falta 1')
  })

  it('comemora a meta batida', () => {
    expect(fraseDaMeta({ alvo: 12, lidos: 12, percentual: 100, faltam: 0, cumprida: true }))
      .toBe('12 de 12 · meta batida!')
  })
})
