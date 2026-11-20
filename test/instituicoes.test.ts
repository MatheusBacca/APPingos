import { describe, expect, it } from 'vitest'
import {
  iconeDaInstituicao,
  instituicaoDasContas,
  instituicaoPorCodigo,
  instituicaoPorNome,
  nomeDoBanco,
} from '~/lib/instituicoes'
import { seloDoBanco } from '~/lib/cartoes'

/*
 * Os nomes de conta abaixo são os que a Pluggy mandou na produção em 20/11/2026,
 * pelo MeuPluggy: o conector de todas as conexões era "MeuPluggy", e o banco só
 * aparecia no nome da conta corrente.
 */
describe('instituicaoDasContas', () => {
  it('reconhece o banco pelo nome da conta corrente', () => {
    expect(instituicaoDasContas([
      { type: 'CREDIT', name: 'BANDEIRADO                                         ' },
      { type: 'BANK', name: 'C6 BANK' },
    ])).toBe('c6')
    expect(instituicaoDasContas([
      { type: 'BANK', name: 'Nu Pagamentos S.A. - Instituição de Pagamento', marketingName: 'Nu Pagamentos S.A. - Instituição de Pagamento (Conta Pré-paga)' },
      { type: 'CREDIT', name: 'platinum' },
    ])).toBe('nubank')
    expect(instituicaoDasContas([{ type: 'BANK', name: 'itau' }])).toBe('itau')
  })

  it('a conta corrente ganha do cartão, mesmo vindo depois', () => {
    expect(instituicaoDasContas([
      { type: 'CREDIT', name: 'Cartão Inter' },
      { type: 'BANK', name: 'Bradesco' },
    ])).toBe('bradesco')
  })

  it('sem nada reconhecível, null', () => {
    expect(instituicaoDasContas([{ type: 'CREDIT', name: 'platinum' }])).toBeNull()
    expect(instituicaoDasContas([])).toBeNull()
  })
})

describe('instituicaoPorNome', () => {
  it('não confunde caixinha com a Caixa', () => {
    expect(instituicaoPorNome('Caixinha Viagem')).toBeNull()
    expect(instituicaoPorNome('Caixa Econômica Federal')?.codigo).toBe('caixa')
  })

  it('Daycoval e Revolut ficam de fora: não transmitem dados no Open Finance', () => {
    expect(instituicaoPorNome('Banco Daycoval')).toBeNull()
    expect(instituicaoPorNome('Revolut')).toBeNull()
  })
})

describe('nomeDoBanco', () => {
  it('a instituição reconhecida ganha do conector', () => {
    expect(nomeDoBanco({ banco: 'MeuPluggy', instituicao: 'c6' })).toBe('C6')
  })

  it('o MeuPluggy nunca é nome de banco', () => {
    expect(nomeDoBanco({ banco: 'MeuPluggy', instituicao: null }, 'C6 BANK')).toBe('C6 BANK')
    expect(nomeDoBanco({ banco: 'Itaú', instituicao: null })).toBe('Itaú')
  })
})

describe('o ícone e o cartão de cada banco', () => {
  it('os 4 bancos da lista têm ícone da Pluggy', () => {
    for (const codigo of ['nubank', 'c6', 'itau', 'bradesco']) {
      expect(iconeDaInstituicao(instituicaoPorCodigo(codigo))).toMatch(/^https:\/\/cdn\.pluggy\.ai\/assets\/connector-icons\/\d+\.svg$/)
    }
  })

  it('o selo de um banco desconhecido cai no cinza, sem ícone', () => {
    const selo = seloDoBanco('Banco Xis')
    expect(selo.icone).toBeNull()
    expect(selo.sigla).toBe('Ba')
    expect(selo.cartao.fundo).toContain('gradient')
  })
})
