/**
 * O painel arrumado à mão — e o que precisa continuar valendo depois.
 *
 * Duas armadilhas moram aqui, e as duas só aparecem semanas depois de alguém
 * ajustar a tela: o módulo que NASCE depois do layout guardado (e não pode
 * simplesmente sumir do painel de quem já tinha arrumado o dele), e a seta que
 * "não faz nada" porque o vizinho de cima está escondido.
 */
import { describe, expect, it } from 'vitest'
import {
  ALTURA_MAXIMA,
  ALTURA_MINIMA,
  ajusteDe,
  alternarEscondido,
  definirAltura,
  definirLargura,
  foiAjustado,
  layoutPadrao,
  linhasDoCartao,
  moverCard,
  normalizarLayout,
  slugsVisiveis,
  soltarCard,
} from '~/lib/painel'

const SLUGS = ['orcamentos', 'filmes', 'fotos', 'musicas']

describe('normalizarLayout', () => {
  it('lixo no localStorage vira o padrão, e não uma tela em branco', () => {
    for (const lixo of [null, undefined, 'nada disso', 42, { ordem: 'x' }]) {
      expect(normalizarLayout(lixo, SLUGS).ordem).toEqual(SLUGS)
    }
  })

  it('módulo novo entra no fim do layout de quem já tinha arrumado o seu', () => {
    const guardado = { ordem: ['fotos', 'orcamentos'], cards: {} }

    expect(normalizarLayout(guardado, SLUGS).ordem).toEqual([
      'fotos',
      'orcamentos',
      // Os que ainda não estavam lá, na ordem do registro.
      'filmes',
      'musicas',
    ])
  })

  it('módulo que não existe mais não deixa cartão fantasma', () => {
    const guardado = { ordem: ['jogos', 'filmes'], cards: { jogos: { largura: 2 } } }
    const layout = normalizarLayout(guardado, SLUGS)

    expect(layout.ordem).not.toContain('jogos')
    expect(layout.cards.jogos).toBeUndefined()
  })

  it('repetição no disco não vira cartão repetido na tela', () => {
    const layout = normalizarLayout({ ordem: ['filmes', 'filmes'], cards: {} }, SLUGS)
    expect(layout.ordem.filter(s => s === 'filmes')).toHaveLength(1)
  })

  it('ajuste malformado cai no padrão campo a campo', () => {
    const layout = normalizarLayout({
      ordem: SLUGS,
      cards: { filmes: { largura: 7, altura: 'alta', escondido: 'sim' } },
    }, SLUGS)

    expect(ajusteDe(layout, 'filmes')).toEqual({ largura: 1, altura: null, escondido: false })
  })

  it('altura fora dos limites é trazida para dentro deles', () => {
    const baixa = normalizarLayout({ ordem: SLUGS, cards: { filmes: { altura: 10 } } }, SLUGS)
    const alta = normalizarLayout({ ordem: SLUGS, cards: { filmes: { altura: 99999 } } }, SLUGS)

    expect(ajusteDe(baixa, 'filmes').altura).toBe(ALTURA_MINIMA)
    expect(ajusteDe(alta, 'filmes').altura).toBe(ALTURA_MAXIMA)
  })
})

describe('linhasDoCartao', () => {
  /*
   * A malha é de 4px e o vão de 12px vive DENTRO do que o cartão reserva. Um
   * cartão de 200px ocupa (200+12)/4 = 53 linhas; a sobra de arredondamento fica
   * abaixo de 4px, que é o que torna o buraco entre cartões invisível.
   */
  it('reserva a altura do cartão mais o vão, arredondando para cima', () => {
    expect(linhasDoCartao(200)).toBe(53)
    expect(linhasDoCartao(201)).toBe(54)
  })

  it('nunca reserva menos de uma linha', () => {
    expect(linhasDoCartao(0)).toBe(3)
    expect(linhasDoCartao(-100)).toBe(1)
  })
})

describe('moverCard', () => {
  it('troca de lugar com o vizinho', () => {
    const layout = moverCard(layoutPadrao(SLUGS), 'filmes', -1)
    expect(layout.ordem).toEqual(['filmes', 'orcamentos', 'fotos', 'musicas'])
  })

  /*
   * O caso que motivou `slugsVisiveis`: com "filmes" escondido, subir "fotos"
   * tem que passar por cima dele e chegar em "orcamentos". Trocando com o
   * vizinho cru, a tela não mudaria — e o botão pareceria quebrado.
   */
  it('pula o cartão escondido em vez de trocar com ele', () => {
    const escondido = alternarEscondido(layoutPadrao(SLUGS), 'filmes')
    const layout = moverCard(escondido, 'fotos', -1)

    expect(slugsVisiveis(layout)).toEqual(['fotos', 'orcamentos', 'musicas'])
  })

  it('nas pontas, não faz nada', () => {
    const padrao = layoutPadrao(SLUGS)
    expect(moverCard(padrao, 'orcamentos', -1)).toBe(padrao)
    expect(moverCard(padrao, 'musicas', 1)).toBe(padrao)
  })
})

describe('soltarCard', () => {
  it('reinsere no lugar do alvo, empurrando o resto', () => {
    const layout = soltarCard(layoutPadrao(SLUGS), 'musicas', 'orcamentos')
    expect(layout.ordem).toEqual(['musicas', 'orcamentos', 'filmes', 'fotos'])
  })

  it('soltar em cima de si mesmo não mexe em nada', () => {
    const padrao = layoutPadrao(SLUGS)
    expect(soltarCard(padrao, 'filmes', 'filmes')).toBe(padrao)
  })
})

describe('esconder e mostrar', () => {
  it('esconder tira da tela mas guarda o lugar', () => {
    const escondido = alternarEscondido(layoutPadrao(SLUGS), 'filmes')
    expect(slugsVisiveis(escondido)).toEqual(['orcamentos', 'fotos', 'musicas'])

    // De volta para onde estava, e não para o fim da fila.
    expect(slugsVisiveis(alternarEscondido(escondido, 'filmes'))).toEqual(SLUGS)
  })
})

describe('foiAjustado', () => {
  it('o painel de fábrica não tem o que restaurar', () => {
    expect(foiAjustado(layoutPadrao(SLUGS), SLUGS)).toBe(false)
  })

  it('qualquer mexida conta', () => {
    const padrao = layoutPadrao(SLUGS)

    expect(foiAjustado(moverCard(padrao, 'filmes', -1), SLUGS)).toBe(true)
    expect(foiAjustado(definirLargura(padrao, 'filmes', 2), SLUGS)).toBe(true)
    expect(foiAjustado(definirAltura(padrao, 'filmes', 300), SLUGS)).toBe(true)
    expect(foiAjustado(alternarEscondido(padrao, 'filmes'), SLUGS)).toBe(true)
  })

  it('desfazer à mão volta a ser o padrão', () => {
    const ida = definirAltura(layoutPadrao(SLUGS), 'filmes', 300)
    expect(foiAjustado(definirAltura(ida, 'filmes', null), SLUGS)).toBe(false)
  })
})
