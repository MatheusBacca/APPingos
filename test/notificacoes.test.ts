/**
 * O texto é a feature.
 *
 * O motor é gatilho e RLS, e nada disso aparece em teste de unidade — a
 * verificação dele é com duas contas reais, como foi em Viagens. O que dá para
 * travar aqui é o que quebra em silêncio: a frase que muda quando o evento é
 * agrupado, a data que volta um dia por causa de fuso, o e-mail que sai sem link
 * de descadastro.
 */
import { describe, expect, it } from 'vitest'
import {
  agruparPorDia,
  categoriasDePreferencia,
  emailDaNotificacao,
  tempoRelativo,
  textoDaNotificacao,
  textoDoBadge,
} from '~/lib/notificacoes'
import type { Notificacao } from '~/lib/notificacoes'

function notificacao(extra: Partial<Notificacao> = {}): Notificacao {
  return {
    id: 'n1',
    space_id: 'casal',
    tipo: 'gasto_novo',
    dados: { ator_nome: 'Ana', space_nome: 'Nós dois', descricao: 'Mercado', valor: 250.5 },
    ator_id: 'ana',
    entidade: 'compra',
    entidade_id: 'c1',
    rota: '/orcamentos',
    created_at: '2026-08-11T14:00:00Z',
    lida_em: null,
    ...extra,
  }
}

describe('textoDaNotificacao', () => {
  it('põe quem e o quê no título, e o valor no corpo', () => {
    const t = textoDaNotificacao(notificacao())

    expect(t.titulo).toBe('Ana lançou Mercado')
    expect(t.corpo).toContain('250,50')
    expect(t.rota).toBe('/orcamentos')
  })

  it('conta as parcelas só quando há mais de uma', () => {
    const uma = textoDaNotificacao(notificacao({ dados: { descricao: 'Mercado', valor: 10, parcelas: 1 } }))
    const tres = textoDaNotificacao(notificacao({ dados: { descricao: 'Sofá', valor: 900, parcelas: 3 } }))

    expect(uma.corpo).not.toContain('x')
    expect(tres.corpo).toContain('em 3x')
  })

  it('troca a frase quando a edição foi agrupada', () => {
    const uma = textoDaNotificacao(notificacao({ tipo: 'gasto_editado' }))
    const tres = textoDaNotificacao(notificacao({
      tipo: 'gasto_editado',
      dados: { ator_nome: 'Ana', descricao: 'Mercado', valor: 300, vezes: 3 },
    }))

    expect(uma.titulo).toBe('Ana editou Mercado')
    expect(tres.titulo).toBe('3 alterações em Mercado')
  })

  it('mostra o valor de antes e o de agora numa edição', () => {
    const t = textoDaNotificacao(notificacao({
      tipo: 'gasto_editado',
      dados: { descricao: 'Mercado', valor: 300, valor_antigo: 250 },
    }))

    expect(t.corpo).toContain('250,00')
    expect(t.corpo).toContain('300,00')
  })

  it('anuncia a surpresa revelada com o nome do roteiro', () => {
    const t = textoDaNotificacao(notificacao({
      tipo: 'roteiro_liberado',
      dados: { ator_nome: 'Ana', nome: 'Litoral', data_inicio: '2026-09-05' },
      rota: '/viagens/r1',
    }))

    expect(t.titulo).toBe('Ana revelou a surpresa: Litoral')
    expect(t.corpo).toBe('Começa em 5 de setembro')
    expect(t.rota).toBe('/viagens/r1')
  })

  it('fala "amanhã" no aviso de um dia, e conta os dias nos outros', () => {
    const amanha = textoDaNotificacao(notificacao({
      tipo: 'viagem_perto',
      dados: { nome: 'Litoral', dias: 1, data_inicio: '2026-08-12' },
    }))
    const semana = textoDaNotificacao(notificacao({
      tipo: 'viagem_perto',
      dados: { nome: 'Litoral', dias: 7, data_inicio: '2026-08-18' },
    }))

    expect(amanha.titulo).toBe('Litoral é amanhã')
    expect(semana.titulo).toBe('Litoral é em 7 dias')
  })

  /*
    O app instalado no celular pode estar duas versões atrás do banco. Um tipo
    que ele não conhece não pode deixar buraco na lista nem quebrar a tela.
  */
  it('não quebra num tipo que ainda não conhece', () => {
    const t = textoDaNotificacao(notificacao({ tipo: 'coisa_do_futuro', rota: null }))

    expect(t.titulo).toBe('Novidade no APPingos')
    expect(t.rota).toBe('/')
  })

  /*
    A data vem do banco como 'YYYY-MM-DD'. Passá-la por new Date(iso) a
    interpretaria em UTC e, num fuso a oeste, devolveria o dia anterior — o
    clássico "a viagem aparece um dia antes".
  */
  it('não recua um dia na data da viagem', () => {
    const t = textoDaNotificacao(notificacao({
      tipo: 'roteiro_novo',
      dados: { nome: 'Serra', data_inicio: '2026-01-01' },
    }))

    expect(t.corpo).toBe('Começa em 1 de janeiro')
  })
})

describe('textoDoBadge', () => {
  it('some com zero e trava em 9+', () => {
    expect(textoDoBadge(0)).toBe('')
    expect(textoDoBadge(3)).toBe('3')
    expect(textoDoBadge(9)).toBe('9')
    expect(textoDoBadge(42)).toBe('9+')
  })
})

describe('agruparPorDia', () => {
  const HOJE = '2026-08-11'

  it('nomeia hoje, ontem e o resto pela data', () => {
    const lista = [
      notificacao({ id: 'a', created_at: '2026-08-11T10:00:00' }),
      notificacao({ id: 'b', created_at: '2026-08-10T22:00:00' }),
      notificacao({ id: 'c', created_at: '2026-08-04T09:00:00' }),
    ]

    const dias = agruparPorDia(lista, HOJE)

    expect(dias.map(d => d.rotulo)).toEqual(['Hoje', 'Ontem', '4 de agosto'])
  })

  it('junta o que caiu no mesmo dia, mais recente primeiro', () => {
    const lista = [
      notificacao({ id: 'velha', created_at: '2026-08-11T08:00:00' }),
      notificacao({ id: 'nova', created_at: '2026-08-11T18:00:00' }),
    ]

    const dias = agruparPorDia(lista, HOJE)

    expect(dias).toHaveLength(1)
    expect(dias[0]!.itens.map(n => n.id)).toEqual(['nova', 'velha'])
  })

  it('não inventa grupo com a caixa vazia', () => {
    expect(agruparPorDia([], HOJE)).toEqual([])
  })
})

describe('tempoRelativo', () => {
  const AGORA = new Date('2026-08-11T14:00:00Z').getTime()

  it('diz "agora" para o que acabou de chegar', () => {
    expect(tempoRelativo('2026-08-11T13:59:30Z', AGORA)).toBe('agora')
  })

  it('conta minutos, horas e dias', () => {
    expect(tempoRelativo('2026-08-11T13:30:00Z', AGORA)).toContain('30')
    expect(tempoRelativo('2026-08-11T11:00:00Z', AGORA)).toContain('3')
    expect(tempoRelativo('2026-08-10T14:00:00Z', AGORA)).toBe('ontem')
  })

  it('vira data depois de uma semana', () => {
    expect(tempoRelativo('2026-08-01T14:00:00Z', AGORA)).toBe('1 de agosto')
  })
})

describe('categoriasDePreferencia', () => {
  it('sem linha nenhuma, tudo ligado', () => {
    const cats = categoriasDePreferencia([])

    expect(cats).toHaveLength(5)
    expect(cats.every(c => c.app === 'ligado' && c.email === 'ligado')).toBe(true)
  })

  it('desliga a categoria só quando todos os tipos dela estão desligados', () => {
    const cats = categoriasDePreferencia([
      { tipo: 'gasto_novo', ativo: false, email: false },
      { tipo: 'mes_fechado', ativo: false, email: false },
    ])

    const orcamentos = cats.find(c => c.categoria === 'orcamentos')!
    expect(orcamentos.app).toBe('desligado')
    expect(orcamentos.email).toBe('desligado')
  })

  /*
    "Parcial" existe porque a tabela é por tipo e a tela é por categoria: se
    alguém desligar um tipo por SQL, a tela precisa mostrar isso em vez de dizer
    "ligado" e reativar o resto no primeiro clique.
  */
  it('mostra parcial quando só uma parte da categoria foi desligada', () => {
    const cats = categoriasDePreferencia([{ tipo: 'gasto_novo', ativo: false, email: true }])

    const orcamentos = cats.find(c => c.categoria === 'orcamentos')!
    expect(orcamentos.app).toBe('parcial')
    expect(orcamentos.email).toBe('ligado')
  })

  it('trata os dois canais separadamente', () => {
    const cats = categoriasDePreferencia([
      { tipo: 'gasto_editado', ativo: true, email: false },
      { tipo: 'gasto_removido', ativo: true, email: false },
      { tipo: 'roteiro_editado', ativo: true, email: false },
    ])

    const edicoes = cats.find(c => c.categoria === 'edicoes')!
    expect(edicoes.app).toBe('ligado')
    expect(edicoes.email).toBe('desligado')
  })
})

describe('emailDaNotificacao', () => {
  const OPCOES = {
    appUrl: 'https://appingos.exemplo.app',
    urlDescadastro: 'https://appingos.exemplo.app/descadastrar?token=abc',
  }

  it('leva o espaço no assunto e o link absoluto no corpo', () => {
    const { assunto, html, texto } = emailDaNotificacao(notificacao(), OPCOES)

    expect(assunto).toBe('Ana lançou Mercado · Nós dois')
    expect(html).toContain('https://appingos.exemplo.app/orcamentos')
    expect(texto).toContain('https://appingos.exemplo.app/orcamentos')
  })

  /*
    Sem saída visível, a saída que a pessoa acha é o botão de spam — e aí o
    domínio inteiro passa a entregar pior. O link vai nas duas versões.
  */
  it('sempre traz o descadastro, no HTML e no texto', () => {
    const { html, texto } = emailDaNotificacao(notificacao(), OPCOES)

    expect(html).toContain(OPCOES.urlDescadastro)
    expect(texto).toContain(OPCOES.urlDescadastro)
  })

  it('escapa o que veio do usuário, em vez de confiar', () => {
    const { html } = emailDaNotificacao(
      notificacao({ dados: { ator_nome: 'Ana', descricao: '<script>alert(1)</script>' } }),
      OPCOES,
    )

    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('não duplica a barra quando a raiz do app vem com uma', () => {
    const { html } = emailDaNotificacao(notificacao(), {
      ...OPCOES,
      appUrl: 'https://appingos.exemplo.app/',
    })

    expect(html).toContain('https://appingos.exemplo.app/orcamentos')
    expect(html).not.toContain('app//orcamentos')
  })
})
