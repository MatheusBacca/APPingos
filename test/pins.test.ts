/**
 * A lógica pura dos Pins.
 *
 * Três coisas concentram o risco aqui, e são as três que este arquivo cobre:
 *
 * 1. A CONTA DO EXTRATO. Ela é lida de `base` e `multiplicador` GRAVADOS, nunca
 *    recalculada — é o que faz a linha de ontem continuar dizendo a verdade
 *    depois de a economia ser rebalanceada.
 * 2. A SEQUÊNCIA. O caso que quebra é o primeiro Pin do dia: até ele existir, o
 *    dia de hoje está vazio, e contar a partir dele zeraria a sequência de quem
 *    está justamente mantendo-a.
 * 3. O ASSUNTO. Cada módulo guardou o seu sob a chave que fazia sentido para
 *    ele; a tela não pode precisar saber disso.
 */
import { describe, expect, it } from 'vitest'
import type { Pin } from '~/types/pin'
import {
  agruparPorDia,
  assuntoDoPin,
  formatarConta,
  formatarMultiplicador,
  pinsEmTexto,
  seloDoMultiplicador,
  sequenciaDeDias,
  totalDe,
} from '~/types/pin'

const HOJE = '2026-09-07'

/** Meio-dia local, para o Pin cair no dia pedido em qualquer fuso a oeste. */
function pin(extra: Partial<Pin> & { dia?: string } = {}): Pin {
  const { dia = HOJE, ...resto } = extra
  const [ano, mes, d] = dia.split('-').map(Number)

  return {
    id: 'p1',
    user_id: 'eu',
    space_id: 'casal',
    regra: 'filme_visto',
    base: 10,
    multiplicador: 1,
    pontos: 10,
    hotspots: [],
    dados: {},
    entidade: 'rating',
    entidade_id: 'r1',
    created_at: new Date(ano!, mes! - 1, d!, 12, 0, 0).toISOString(),
    ...resto,
  }
}

describe('pinsEmTexto', () => {
  it('concorda em número', () => {
    expect(pinsEmTexto(1)).toBe('1 Pin')
    expect(pinsEmTexto(12)).toBe('12 Pins')
    expect(pinsEmTexto(0)).toBe('0 Pins')
  })
})

describe('formatarMultiplicador', () => {
  it('sempre com duas casas, para a lista não desalinhar', () => {
    expect(formatarMultiplicador(1.5)).toBe('1,50×')
    expect(formatarMultiplicador(1.15)).toBe('1,15×')
  })
})

/*
  O selo da tela inicial. O risco aqui não é a conta — é ele APARECER quando não
  deveria: um "1,00×" fixo ao lado do "Oi, Fulano" seria ruído permanente, e um
  "NaN×" vindo de uma RPC que respondeu torto seria pior.
*/
describe('seloDoMultiplicador', () => {
  const ROTULOS: Record<string, string> = {
    sequencia: 'Sequência',
    fim_de_semana: 'Fim de semana',
  }
  const rotuloDe = (chave: string) => ROTULOS[chave] ?? chave

  it('apaga em 1× — sem hotspot não há selo', () => {
    expect(seloDoMultiplicador(1, [], rotuloDe).aceso).toBe(false)
  })

  it('apaga em valor inválido, em vez de escrever NaN na saudação', () => {
    expect(seloDoMultiplicador(Number.NaN, ['sequencia'], rotuloDe).aceso).toBe(false)
  })

  it('acende acima de 1 e diz de onde o número veio', () => {
    const selo = seloDoMultiplicador(1.35, ['sequencia', 'fim_de_semana'], rotuloDe)

    expect(selo.aceso).toBe(true)
    expect(selo.numero).toBe('1,35×')
    expect(selo.explicacao).toBe('Está rendendo 1,35× — Sequência · Fim de semana')
  })

  /*
    Hotspot que a tela ainda não sabe nomear (o banco ganhou um novo, o app
    instalado no celular é de antes) cai na chave crua em vez de sumir: um selo
    aceso sem explicação nenhuma seria o número mágico que ele existe para evitar.
  */
  it('usa a chave crua quando o rótulo ainda não é conhecido', () => {
    expect(seloDoMultiplicador(1.2, ['hotspot_novo'], rotuloDe).explicacao)
      .toBe('Está rendendo 1,20× — hotspot_novo')
  })

  it('acende sem lista quando o banco não disse quais hotspots entraram', () => {
    expect(seloDoMultiplicador(1.1, [], rotuloDe).explicacao).toBe('Está rendendo 1,10×')
  })
})

describe('formatarConta', () => {
  it('mostra a conta quando houve multiplicador', () => {
    expect(formatarConta({ base: 3, multiplicador: 1.5, pontos: 5 })).toBe('3 × 1,50 = 5')
  })

  it('some com a conta quando não houve — "3 × 1,00 = 3" não informa nada', () => {
    expect(formatarConta({ base: 3, multiplicador: 1, pontos: 3 })).toBe('3')
  })

  /*
    O ponto da regra: a linha guarda a conta DAQUELE dia. Se a base da regra
    mudar por migration amanhã, o extrato de hoje continua batendo com os pontos
    que a pessoa realmente recebeu.
  */
  it('usa o que está gravado, não a economia de hoje', () => {
    expect(formatarConta({ base: 99, multiplicador: 1.2, pontos: 119 })).toBe('99 × 1,20 = 119')
  })
})

describe('totalDe', () => {
  it('soma os pontos', () => {
    expect(totalDe([{ pontos: 10 }, { pontos: 5 }, { pontos: 1 }])).toBe(16)
  })

  it('lista vazia é zero, não NaN', () => {
    expect(totalDe([])).toBe(0)
  })
})

describe('agruparPorDia', () => {
  it('junta o mesmo dia e soma o total dele', () => {
    const dias = agruparPorDia([
      pin({ id: 'a', dia: '2026-09-07', pontos: 10 }),
      pin({ id: 'b', dia: '2026-09-07', pontos: 5 }),
      pin({ id: 'c', dia: '2026-09-05', pontos: 3 }),
    ])

    expect(dias).toHaveLength(2)
    expect(dias[0]!.dia).toBe('2026-09-07')
    expect(dias[0]!.total).toBe(15)
    expect(dias[1]!.total).toBe(3)
  })

  it('preserva a ordem que veio do banco em vez de reordenar', () => {
    const dias = agruparPorDia([
      pin({ id: 'a', dia: '2026-09-01' }),
      pin({ id: 'b', dia: '2026-09-07' }),
    ])

    expect(dias.map(d => d.dia)).toEqual(['2026-09-01', '2026-09-07'])
  })
})

describe('sequenciaDeDias', () => {
  it('conta os dias seguidos até hoje', () => {
    const pins = [
      pin({ dia: '2026-09-07' }),
      pin({ dia: '2026-09-06' }),
      pin({ dia: '2026-09-05' }),
    ]

    expect(sequenciaDeDias(pins, HOJE)).toBe(3)
  })

  /*
    O caso que a implementação existe para acertar. São 8h da manhã, a pessoa
    ainda não fez nada hoje, e a sequência de ontem continua de pé — o próximo
    Pin do dia é que decide se ela cresce ou quebra.
  */
  it('não zera antes do primeiro Pin do dia', () => {
    const pins = [pin({ dia: '2026-09-06' }), pin({ dia: '2026-09-05' })]

    expect(sequenciaDeDias(pins, HOJE)).toBe(2)
  })

  it('quebra quando o último Pin é de anteontem', () => {
    expect(sequenciaDeDias([pin({ dia: '2026-09-05' })], HOJE)).toBe(0)
  })

  it('ignora buraco no meio — conta só o trecho colado em hoje', () => {
    const pins = [
      pin({ dia: '2026-09-07' }),
      pin({ dia: '2026-09-04' }),
      pin({ dia: '2026-09-03' }),
    ]

    expect(sequenciaDeDias(pins, HOJE)).toBe(1)
  })

  it('vários Pins no mesmo dia contam como um dia', () => {
    const pins = [
      pin({ id: 'a', dia: '2026-09-07' }),
      pin({ id: 'b', dia: '2026-09-07' }),
      pin({ id: 'c', dia: '2026-09-06' }),
    ]

    expect(sequenciaDeDias(pins, HOJE)).toBe(2)
  })

  /*
    Sem teto, ao contrário do hotspot no banco (que satura em 3 dias): a tela
    mostra a sequência real, porque é ela que faz a sequência valer a pena.
  */
  it('não para no teto do multiplicador', () => {
    const sete = ['07', '06', '05', '04', '03', '02', '01']
      .map(d => pin({ dia: `2026-09-${d}` }))

    expect(sequenciaDeDias(sete, HOJE)).toBe(7)
  })

  it('atravessa a virada do mês', () => {
    const pins = [
      pin({ dia: '2026-09-02' }),
      pin({ dia: '2026-09-01' }),
      pin({ dia: '2026-08-31' }),
    ]

    expect(sequenciaDeDias(pins, '2026-09-02')).toBe(3)
  })
})

describe('assuntoDoPin', () => {
  it('acha o assunto na chave que cada módulo usou', () => {
    expect(assuntoDoPin({ dados: { titulo: 'Duna' } })).toBe('Duna')
    expect(assuntoDoPin({ dados: { nome: 'Litoral' } })).toBe('Litoral')
    expect(assuntoDoPin({ dados: { descricao: 'Mercado' } })).toBe('Mercado')
  })

  it('escreve o mês por extenso, e não a data crua do banco', () => {
    expect(assuntoDoPin({ dados: { competencia: '2026-09-01' } })).toBe('Setembro de 2026')
  })

  it('sem assunto devolve vazio — o rótulo da regra já diz tudo', () => {
    expect(assuntoDoPin({ dados: {} })).toBe('')
    expect(assuntoDoPin({ dados: { tipo: 'imagem' } })).toBe('')
    expect(assuntoDoPin({ dados: { titulo: '  ' } })).toBe('')
  })
})
