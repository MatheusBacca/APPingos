/**
 * O widget de resumo nas duas superfícies — e, principalmente, quando ele falha.
 *
 * O terceiro teste é a regressão da tela 500 de 05/08/2026: um resumo que
 * estoura no setup era montado pela sidebar no boot e levava o app inteiro
 * junto. Widget quebrado tem que virar "nada a dizer", não tela de erro.
 */
import { computed } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ResumoDoModulo from '~/components/ResumoDoModulo.vue'
import type { AppModule } from '~/modules'
import type { LinhaResumo } from '~/types/resumo'

const global = {
  stubs: {
    NuxtLink: { props: ['to'], template: '<a><slot /></a>' },
    ModuleIcon: { props: ['nome'], template: '<span />' },
  },
}

function modulo(resumo?: AppModule['resumo']): AppModule {
  return {
    slug: 'orcamentos',
    rotulo: 'Orçamentos',
    descricao: 'Gastos, receitas e metas — seus e do casal',
    icone: 'WalletIcon',
    rota: '/orcamentos',
    ativo: true,
    naBarra: true,
    resumo,
  }
}

const comLinhas = (linhas: LinhaResumo[]) => () => computed(() => linhas)

const LINHA: LinhaResumo = {
  chave: 'orcamento-2026-07-01',
  rotulo: 'Pendente',
  nota: 'Julho',
  valor: '−R$ 50,00',
  valorDescrito: 'você deve',
  tom: 'contra',
}

describe('ResumoDoModulo', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('mostra rótulo, nota e valor nas duas variantes', () => {
    for (const variante of ['cartao', 'lateral'] as const) {
      const tela = mount(ResumoDoModulo, {
        props: { modulo: modulo(comLinhas([LINHA])), variante },
        global,
      })

      expect(tela.text()).toContain('Pendente')
      expect(tela.text()).toContain('Julho')
      expect(tela.text()).toContain('−R$ 50,00')
      // A cor não pode ser a única portadora do sentido.
      expect(tela.text()).toContain('você deve')
    }
  })

  it('sem nada a dizer, o cartão cai na descrição do módulo e o bloco lateral some', () => {
    const cartao = mount(ResumoDoModulo, {
      props: { modulo: modulo(comLinhas([])), variante: 'cartao' },
      global,
    })
    expect(cartao.text()).toContain('Gastos, receitas e metas')

    const lateral = mount(ResumoDoModulo, {
      props: { modulo: modulo(comLinhas([])), variante: 'lateral' },
      global,
    })
    expect(lateral.text()).toBe('')
  })

  it('um resumo que estoura não derruba quem o montou', () => {
    const explode = () => { throw new Error('useConvitesFilme is not defined') }

    const cartao = mount(ResumoDoModulo, {
      props: { modulo: modulo(explode as unknown as AppModule['resumo']), variante: 'cartao' },
      global,
    })

    expect(cartao.text()).toContain('Gastos, receitas e metas')
    expect(console.error).toHaveBeenCalled()
  })

  it('um resumo que estoura ao recalcular também degrada para vazio', () => {
    const ruim = () => computed<LinhaResumo[]>(() => { throw new Error('dado inesperado') })

    const lateral = mount(ResumoDoModulo, {
      props: { modulo: modulo(ruim), variante: 'lateral' },
      global,
    })

    expect(lateral.text()).toBe('')
  })

  it('módulo sem resumo registrado não quebra nem inventa caixa', () => {
    const lateral = mount(ResumoDoModulo, { props: { modulo: modulo(), variante: 'lateral' }, global })
    expect(lateral.text()).toBe('')
  })
})
