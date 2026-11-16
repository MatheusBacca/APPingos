/**
 * A conciliação do Pix do acerto (fase 6 do plano de Open Finance, passo 3).
 *
 * Errar para o lado de marcar é o erro caro: um mês marcado como pago sem ter
 * sido some do painel de quem ainda deve. Por isso cada condição tem um teste
 * que a derruba sozinha.
 */
import { describe, expect, it } from 'vitest'
import { acertoDoPix, contraparteEhParceiro, mesesCandidatos } from '~/lib/conciliacao-pix'
import type { Parceiro, TransacaoParaConciliar } from '~/lib/conciliacao-pix'
import { saldoDoMes } from '~/types/orcamento'
import type { CompraDoMes } from '~/types/orcamento'

const EU = 'eu'
const ELA: Parceiro = { user_id: 'ela', nome: 'Ana Exemplo', chave_pix: '98765432100', chave_pix_tipo: 'cpf' }

function compra(valor: number, pagoPor: string): CompraDoMes {
  return {
    id: `c-${valor}`,
    space_id: 'casal',
    descricao: 'x',
    valor_total: valor,
    data_compra: '2026-10-10',
    competencia_inicial: '2026-10-01',
    parcelas: 1,
    pago_por: pagoPor,
    registrado_por: pagoPor,
    categoria: null,
    participantes: [
      { user_id: EU, peso: 50, informado_como: 'percentual' },
      { user_id: 'ela', peso: 50, informado_como: 'percentual' },
    ],
    numero: 1,
    valor,
  }
}

// Outubro: ela pagou 824,74 de compras divididas meio a meio → eu devo 412,37.
const saldos = { '2026-10-01': saldoDoMes([compra(824.74, 'ela')], [EU, 'ela']) }

const pix = (extra: Partial<TransacaoParaConciliar> = {}): TransacaoParaConciliar => ({
  id: 't',
  sentido: 'saida',
  valor: 412.37,
  data: '2026-11-03',
  pendente: false,
  metodo: 'PIX',
  contraparte_nome: 'ANA MARIA EXEMPLO',
  contraparte_documento: '987.654.321-00',
  ...extra,
})

describe('quem é a outra ponta', () => {
  it('pelo CPF quando a chave dela é CPF', () => {
    expect(contraparteEhParceiro({ contraparte_nome: 'Outro Nome', contraparte_documento: '987.654.321-00' }, ELA)).toBe(true)
  })

  it('pelo nome de cadastro dentro do nome do banco, sem acento nem caixa', () => {
    const semCpf = { ...ELA, chave_pix_tipo: 'email', chave_pix: 'ana@x.com' }
    expect(contraparteEhParceiro({ contraparte_nome: 'ANA MARIA EXEMPLO', contraparte_documento: null }, semCpf)).toBe(true)
    expect(contraparteEhParceiro({ contraparte_nome: 'Ána Exemplo', contraparte_documento: null }, semCpf)).toBe(true)
  })

  it('outra pessoa não casa', () => {
    expect(contraparteEhParceiro({ contraparte_nome: 'ANA SOUZA', contraparte_documento: '111.222.333-44' }, ELA)).toBe(false)
    expect(contraparteEhParceiro({ contraparte_nome: null, contraparte_documento: null }, ELA)).toBe(false)
  })
})

describe('que mês o Pix acerta', () => {
  it('a ordem é mês anterior, o próprio e o retrasado', () => {
    expect(mesesCandidatos('2026-11-03')).toEqual(['2026-10-01', '2026-11-01', '2026-09-01'])
    expect(mesesCandidatos('2026-01-10')).toEqual(['2025-12-01', '2026-01-01', '2025-11-01'])
  })

  it('o Pix que eu mandei com o valor que eu devia acerta outubro', () => {
    expect(acertoDoPix(pix(), EU, ELA, saldos, [])).toBe('2026-10-01')
  })

  it('do lado de quem recebe, a entrada com o valor do meu saldo também acerta', () => {
    // visto pelo lado dela: eu sou o parceiro
    const euComoParceiro: Parceiro = { user_id: EU, nome: 'Matheus Exemplo', chave_pix: null, chave_pix_tipo: null }
    const entrada = pix({ sentido: 'entrada', contraparte_nome: 'MATHEUS EXEMPLO', contraparte_documento: null })
    expect(acertoDoPix(entrada, 'ela', euComoParceiro, saldos, [])).toBe('2026-10-01')
  })

  it('valor diferente do saldo não acerta — nem por um centavo', () => {
    expect(acertoDoPix(pix({ valor: 412.36 }), EU, ELA, saldos, [])).toBeNull()
    expect(acertoDoPix(pix({ valor: 400 }), EU, ELA, saldos, [])).toBeNull()
  })

  it('mês já acertado não acerta de novo', () => {
    expect(acertoDoPix(pix(), EU, ELA, saldos, ['2026-10-01'])).toBeNull()
  })

  it('pendente, boleto ou contraparte estranha não acertam', () => {
    expect(acertoDoPix(pix({ pendente: true }), EU, ELA, saldos, [])).toBeNull()
    expect(acertoDoPix(pix({ metodo: 'BOLETO' }), EU, ELA, saldos, [])).toBeNull()
    expect(acertoDoPix(pix({ metodo: null }), EU, ELA, saldos, [])).toBeNull()
    expect(acertoDoPix(pix({ contraparte_nome: 'LOJA X', contraparte_documento: null }), EU, ELA, saldos, [])).toBeNull()
  })

  it('o Pix que vai na direção errada (quem recebe pagando) não acerta', () => {
    // eu sou credor em outubro? Não: devo. Uma ENTRADA dela para mim não é o acerto.
    const entrada = pix({ sentido: 'entrada' })
    expect(acertoDoPix(entrada, EU, ELA, saldos, [])).toBeNull()
  })

  it('Pix fora da janela de três meses não acerta', () => {
    expect(acertoDoPix(pix({ data: '2027-02-03' }), EU, ELA, saldos, [])).toBeNull()
  })

  it('TED também conta', () => {
    expect(acertoDoPix(pix({ metodo: 'ted' }), EU, ELA, saldos, [])).toBe('2026-10-01')
  })
})
