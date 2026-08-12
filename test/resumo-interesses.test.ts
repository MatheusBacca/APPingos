/**
 * O que o painel diz sobre os interesses.
 *
 * A regra que este arquivo protege é qual subconjunto entra na conta: só os
 * estados abertos. 'convertido' já virou outra coisa e seria contado duas vezes;
 * 'arquivado' é decisão tomada, não vontade pendente. Um painel que somasse os
 * quatro cresceria para sempre e pararia de significar algo depois do primeiro mês.
 */
import { describe, expect, it } from 'vitest'
// Comparar com `formatarDinheiro`, e não com o literal 'R$ 3.199,00': o separador
// que o Intl usa em pt-BR é espaço NÃO-separável (U+00A0), invisível no código —
// um literal digitado com espaço comum falha com as duas strings idênticas na tela.
import { formatarDinheiro } from '@/lib/dinheiro'
import { linhasDoResumo } from '~/composables/useResumoInteresses'
import type { EstadoInteresse, InteresseComProdutos, InteresseProduto } from '~/types/interesse'

function produto(preco: number | null): InteresseProduto {
  return {
    id: `p-${preco}`,
    interesse_id: 'i1',
    nome: 'Produto',
    url: 'https://loja.com.br/p',
    loja: 'loja.com.br',
    imagem_url: null,
    preco,
    preco_pix: null,
    parcelas: null,
    valor_parcela: null,
    escolhido: true,
    origem: 'extensao',
    capturado_em: '2026-08-12T12:00:00Z',
    created_at: '2026-08-12T12:00:00Z',
  }
}

function interesse(
  id: string,
  estado: EstadoInteresse,
  produtos: InteresseProduto[] = [],
): InteresseComProdutos {
  return {
    id,
    space_id: 's1',
    criado_por: 'u1',
    titulo: `Interesse ${id}`,
    destino: 'compra',
    estado,
    para_quem: null,
    observacao: null,
    convertido_em: null,
    convertido_tipo: null,
    convertido_ref_id: null,
    created_at: '2026-08-12T12:00:00Z',
    updated_at: '2026-08-12T12:00:00Z',
    produtos,
  }
}

describe('linhasDoResumo', () => {
  it('conta só os estados abertos', () => {
    const linhas = linhasDoResumo([
      interesse('1', 'rascunho'),
      interesse('2', 'amadurecendo'),
      interesse('3', 'convertido'),
      interesse('4', 'arquivado'),
    ])

    expect(linhas[0]?.rotulo).toBe('2 interesses')
    expect(linhas[0]?.nota).toBe('em aberto')
  })

  it('usa singular com um interesse só', () => {
    const linhas = linhasDoResumo([interesse('1', 'rascunho')])
    expect(linhas[0]?.rotulo).toBe('1 interesse')
  })

  it('soma o valor dos escolhidos numa segunda linha', () => {
    const linhas = linhasDoResumo([
      interesse('1', 'rascunho', [produto(2399)]),
      interesse('2', 'amadurecendo', [produto(800)]),
    ])

    expect(linhas).toHaveLength(2)
    expect(linhas[1]?.rotulo).toBe('Somando')
    expect(linhas[1]?.valor).toBe(formatarDinheiro(3199))
    expect(linhas[1]?.nota).toBe('os escolhidos')
  })

  /*
   * A ressalva existe porque o total mente sem ela: cinco interesses somando
   * R$ 300 pode ser "tudo barato" ou "quatro sem preço nenhum".
   */
  it('avisa quantos ainda não têm preço', () => {
    const linhas = linhasDoResumo([
      interesse('1', 'rascunho', [produto(500)]),
      interesse('2', 'rascunho'),
      interesse('3', 'rascunho'),
    ])

    expect(linhas[1]?.nota).toBe('2 sem preço ainda')
  })

  it('omite a linha do total quando ninguém tem preço', () => {
    const linhas = linhasDoResumo([interesse('1', 'rascunho'), interesse('2', 'rascunho')])
    expect(linhas).toHaveLength(1)
  })

  /*
   * Lista vazia devolve zero linhas, e não uma linha com zero: o contrato de
   * `LinhaResumo` diz que lista vazia faz a superfície sumir com o bloco, em vez
   * de desenhar uma caixa vazia no painel.
   */
  it('não diz nada quando não há nada em aberto', () => {
    expect(linhasDoResumo([])).toEqual([])
    expect(linhasDoResumo([interesse('1', 'arquivado')])).toEqual([])
  })

  it('cabe no teto de três linhas do painel', () => {
    const muitos = Array.from({ length: 30 }, (_, i) =>
      interesse(String(i), 'rascunho', [produto(100)]),
    )
    expect(linhasDoResumo(muitos).length).toBeLessThanOrEqual(3)
  })
})
