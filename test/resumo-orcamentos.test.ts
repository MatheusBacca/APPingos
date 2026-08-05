/**
 * Quais dois meses o painel mostra, e o que cada linha diz.
 *
 * A regra existe porque a competência fecha no dia 1º: na primeira semana do
 * mês o número que importa é o do mês que acabou de fechar e ainda não foi
 * acertado. Quando alguém marca o acerto como pago, essa linha some e entra o
 * mês seguinte.
 */
import { describe, expect, it } from 'vitest'
import { linhaDoMes, mesesDoPainel } from '~/composables/useResumoOrcamentos'
import type { MesDoPainel } from '~/composables/useResumoOrcamentos'
import type { CompraDoMes } from '~/types/orcamento'

const EU = 'eu'
const ELA = 'ela'
const MEMBROS = [EU, ELA]

function compra(valor: number, pagoPor: string): CompraDoMes {
  return {
    id: `c-${valor}-${pagoPor}`,
    descricao: 'Compra',
    valor_total: valor,
    data_compra: '2026-08-01',
    competencia_inicial: '2026-08-01',
    parcelas: 1,
    pago_por: pagoPor,
    registrado_por: pagoPor,
    categoria: null,
    participantes: MEMBROS.map(user_id => ({ user_id, peso: 1, informado_como: 'percentual' as const })),
    numero: 1,
    valor,
  }
}

const mes = (competencia: string, estado: MesDoPainel['estado']): MesDoPainel => ({ competencia, estado })

describe('mesesDoPainel', () => {
  it('cobra o mês fechado enquanto o acerto não é marcado como pago', () => {
    expect(mesesDoPainel('2026-08-05', false)).toEqual([
      { competencia: '2026-07-01', estado: 'Pendente' },
      { competencia: '2026-08-01', estado: 'Aberto' },
    ])
  })

  it('passa a olhar para frente depois do acerto pago', () => {
    expect(mesesDoPainel('2026-08-05', true)).toEqual([
      { competencia: '2026-08-01', estado: 'Aberto' },
      { competencia: '2026-09-01', estado: 'Próximo' },
    ])
  })

  it('atravessa a virada de ano nos dois sentidos', () => {
    expect(mesesDoPainel('2026-01-03', false)[0].competencia).toBe('2025-12-01')
    expect(mesesDoPainel('2026-12-20', true)[1].competencia).toBe('2027-01-01')
  })

  it('não depende do dia dentro do mês', () => {
    expect(mesesDoPainel('2026-08-31', false)).toEqual(mesesDoPainel('2026-08-01', false))
  })
})

describe('linhaDoMes', () => {
  it('mostra a dívida com sinal, cor e a palavra para leitor de tela', () => {
    // Ela pagou 100 de um gasto meio a meio: eu devo 50.
    const linha = linhaDoMes(mes('2026-07-01', 'Pendente'), [compra(100, ELA)], MEMBROS, EU)

    expect(linha).toMatchObject({
      rotulo: 'Pendente',
      nota: 'Julho',
      tom: 'contra',
      valorDescrito: 'você deve',
    })
    expect(linha?.valor).toContain('−')
    expect(linha?.valor).toContain('50,00')
  })

  it('mostra o crédito do outro lado, com o sinal invertido', () => {
    const linha = linhaDoMes(mes('2026-08-01', 'Aberto'), [compra(100, EU)], MEMBROS, EU)

    expect(linha).toMatchObject({ rotulo: 'Aberto', nota: 'Agosto', tom: 'favor', valorDescrito: 'a receber' })
    expect(linha?.valor).toContain('+')
  })

  it('não diz nada quando o mês está quitado, vazio ou sem usuário', () => {
    // Cada um pagou 100 do mesmo jeito — ninguém deve nada.
    const quitado = [compra(100, EU), compra(100, ELA)]

    expect(linhaDoMes(mes('2026-08-01', 'Aberto'), quitado, MEMBROS, EU)).toBeNull()
    expect(linhaDoMes(mes('2026-08-01', 'Aberto'), [], MEMBROS, EU)).toBeNull()
    expect(linhaDoMes(mes('2026-08-01', 'Aberto'), [compra(100, ELA)], MEMBROS, null)).toBeNull()
  })

  it('usa a mesma chave para o mesmo mês, para a lista não repintar', () => {
    const a = linhaDoMes(mes('2026-07-01', 'Pendente'), [compra(100, ELA)], MEMBROS, EU)
    const b = linhaDoMes(mes('2026-07-01', 'Aberto'), [compra(200, ELA)], MEMBROS, EU)

    expect(a?.chave).toBe(b?.chave)
  })
})
