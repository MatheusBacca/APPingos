/**
 * O que o painel diz sobre as fotos.
 *
 * A regra que este arquivo protege é o recorte: das três situações, só duas viram
 * linha, e nunca "quantas fotos existem". Uma galeria cresce para sempre — um
 * painel que dissesse "142 fotos" estaria certo e seria inútil no segundo mês.
 *
 * E a primeira linha é a MINHA pendência, não a do espaço: é a única linha do
 * painel inteiro que pede uma ação de quem está olhando.
 */
import { describe, expect, it } from 'vitest'
import type { Foto } from '~/types/foto'
import { linhasDeFotos } from '~/composables/useResumoFotos'

function foto(id: string, quemCurtiu: string[], extras: Partial<Foto> = {}): Foto {
  return {
    id,
    space_id: 's1',
    enviada_por: 'ana',
    caminho: `s1/${id}.jpg`,
    lote_id: `lote-${id}`,
    tipo: 'imagem',
    mime: 'image/jpeg',
    tamanho: 1024,
    nome_original: null,
    legenda: null,
    aprovada_em: null,
    postada_em: null,
    created_at: '2026-08-15T12:00:00Z',
    updated_at: '2026-08-15T12:00:00Z',
    curtidas: quemCurtiu.map(user_id => ({
      foto_id: id,
      user_id,
      created_at: '2026-08-15T12:00:00Z',
    })),
    ...extras,
  }
}

describe('linhasDeFotos', () => {
  it('sem fotos, o painel não desenha bloco nenhum', () => {
    expect(linhasDeFotos([], 'bruno', 2)).toEqual([])
  })

  it('conta o que espera o MEU coração', () => {
    const fotos = [foto('f1', ['ana']), foto('f2', ['ana'])]
    const linhas = linhasDeFotos(fotos, 'bruno', 2)

    expect(linhas[0]!.rotulo).toBe('2 fotos')
    expect(linhas[0]!.nota).toBe('esperando o seu coração')
  })

  /*
    A assimetria que dá sentido à linha: a mesma foto é pendência de quem ainda
    não curtiu e não é de quem já curtiu. Vista pela Ana, que enviou (e portanto
    já curtiu), não há nada a fazer.
  */
  it('quem já curtiu não vê pendência', () => {
    const fotos = [foto('f1', ['ana'])]

    expect(linhasDeFotos(fotos, 'bruno', 2)[0]!.nota).toBe('esperando o seu coração')
    expect(linhasDeFotos(fotos, 'ana', 2)).toEqual([])
  })

  it('marca a pendência como destaque — ela espera resposta', () => {
    expect(linhasDeFotos([foto('f1', ['ana'])], 'bruno', 2)[0]!.destaque).toBe(true)
  })

  it('singular quando é uma só', () => {
    expect(linhasDeFotos([foto('f1', ['ana'])], 'bruno', 2)[0]!.rotulo).toBe('1 foto')
  })

  it('anuncia o que já pode ser postado', () => {
    const linhas = linhasDeFotos([foto('f1', ['ana', 'bruno'])], 'ana', 2)

    expect(linhas).toHaveLength(1)
    expect(linhas[0]!.rotulo).toBe('1 aprovada')
    expect(linhas[0]!.nota).toBe('pode postar')
    expect(linhas[0]!.tom).toBe('favor')
  })

  /*
    A ordem é a leitura: primeiro o que devo, depois o que ganhei. Invertida, o
    painel abriria com um resultado e esconderia o pedido embaixo dele.
  */
  it('a pendência vem antes do que já está liberado', () => {
    const fotos = [foto('f1', ['ana']), foto('f2', ['ana', 'bruno'])]
    const linhas = linhasDeFotos(fotos, 'bruno', 2)

    expect(linhas.map(l => l.chave)).toEqual(['fotos-esperando-por-mim', 'fotos-liberadas'])
  })

  it('o que já foi postado não vira linha — é arquivo, não pendência', () => {
    const fotos = [foto('f1', ['ana', 'bruno'], { postada_em: '2026-08-15T18:00:00Z' })]
    expect(linhasDeFotos(fotos, 'ana', 2)).toEqual([])
  })

  /*
    Enquanto a lista de membros carrega, o total chega como 0. Nada pode ser
    anunciado como liberado nesse instante — ver o teste irmão em fotos.test.ts.
  */
  it('não anuncia liberação enquanto o total de membros é desconhecido', () => {
    const linhas = linhasDeFotos([foto('f1', ['ana', 'bruno'])], 'bruno', 0)
    expect(linhas.some(l => l.chave === 'fotos-liberadas')).toBe(false)
  })
})
