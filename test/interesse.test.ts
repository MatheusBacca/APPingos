import { describe, expect, it } from 'vitest'
import {
  agrupamentoDoInteresse,
  agruparPorDestino,
  economiaPossivel,
  interesseDeFora,
  interesseNaVista,
  interessesDaVista,
  lojaDaUrl,
  nomeDoAgrupamento,
  paraQuemDoInteresse,
  precoEfetivo,
  produtoDaCapa,
  produtosDoInteresse,
  produtosSemPreco,
  somaDoAgrupamento,
  somaParcial,
  totalDosInteresses,
  totalParcelado,
  valorDoInteresse,
} from '~/types/interesse'
import type { Agrupamento, InteresseComAgrupamentos, InteresseProduto } from '~/types/interesse'

function produto(campos: Partial<InteresseProduto> = {}): InteresseProduto {
  return {
    id: campos.id ?? 'p1',
    interesse_id: 'i1',
    agrupamento_id: 'a1',
    nome: 'Sofá',
    url: 'https://loja.com.br/sofa',
    loja: 'loja.com.br',
    imagem_url: null,
    preco: null,
    preco_pix: null,
    parcelas: null,
    valor_parcela: null,
    origem: 'extensao',
    capturado_em: '2026-08-12T12:00:00Z',
    verificado_em: null,
    falhas_seguidas: 0,
    created_at: '2026-08-12T12:00:00Z',
    ...campos,
  }
}

function agrupamento(campos: Partial<Agrupamento> = {}): Agrupamento {
  return {
    id: campos.id ?? 'a1',
    interesse_id: 'i1',
    nome: null,
    escolhido: false,
    created_at: '2026-08-12T12:00:00Z',
    produtos: [],
    ...campos,
  }
}

/** Atalho para o caso mais comum: um agrupamento de um produto só. */
function solto(id: string, preco: number | null, escolhido = false): Agrupamento {
  return agrupamento({
    id,
    escolhido,
    produtos: [produto({ id: `${id}-p`, agrupamento_id: id, preco })],
  })
}

function interesse(campos: Partial<InteresseComAgrupamentos> = {}): InteresseComAgrupamentos {
  return {
    id: 'i1',
    space_id: 's1',
    criado_por: 'u1',
    titulo: 'Trocar o sofá',
    destino: 'compra',
    estado: 'rascunho',
    para_quem: null,
    para_quem_user_id: null,
    observacao: null,
    assumido_por: null,
    assumido_em: null,
    convertido_em: null,
    convertido_tipo: null,
    convertido_ref_id: null,
    created_at: '2026-08-12T12:00:00Z',
    updated_at: '2026-08-12T12:00:00Z',
    agrupamentos: [],
    compartilhamentos: [],
    ...campos,
  }
}

/** Um compartilhamento pronto, que é o que empresta a visibilidade a um espaço. */
function compartilhadoEm(spaceId: string, interesseId = 'i1') {
  return {
    interesse_id: interesseId,
    space_id: spaceId,
    compartilhado_por: 'u1',
    created_at: '2026-08-12T12:00:00Z',
  }
}

describe('precoEfetivo', () => {
  /*
   * Pix ganha do preço cheio porque é o que se paga à vista — a loja anuncia o
   * cheio para o parcelamento parecer menor.
   */
  it('prefere o Pix ao preço cheio', () => {
    expect(precoEfetivo(produto({ preco: 2399, preco_pix: 2279.05 }))).toBe(2279.05)
  })

  it('cai no preço cheio sem Pix', () => {
    expect(precoEfetivo(produto({ preco: 2399 }))).toBe(2399)
  })

  /*
   * `null`, e não zero: zero diria "de graça" a quem só tem o link, e a tela
   * precisa distinguir "não sei o preço" de "é barato".
   */
  it('devolve null quando não há preço nenhum', () => {
    expect(precoEfetivo(produto())).toBeNull()
  })
})

describe('totalParcelado', () => {
  it('multiplica parcelas pelo valor da parcela', () => {
    expect(totalParcelado(produto({ parcelas: 12, valor_parcela: 219.9 }))).toBeCloseTo(2638.8, 2)
  })

  it('devolve null sem os dois campos', () => {
    expect(totalParcelado(produto({ parcelas: 12 }))).toBeNull()
    expect(totalParcelado(produto({ valor_parcela: 219.9 }))).toBeNull()
  })
})

describe('somaDoAgrupamento', () => {
  it('soma os produtos que só valem juntos', () => {
    const monitor = agrupamento({
      produtos: [
        produto({ id: 'monitor', preco: 1800 }),
        produto({ id: 'braco', preco: 300 }),
      ],
    })
    expect(somaDoAgrupamento(monitor)).toBe(2100)
  })

  it('usa o preço efetivo de cada produto', () => {
    const dois = agrupamento({
      produtos: [
        produto({ id: 'a', preco: 1000, preco_pix: 900 }),
        produto({ id: 'b', preco: 200 }),
      ],
    })
    expect(somaDoAgrupamento(dois)).toBe(1100)
  })

  /*
   * A regra que sustenta a comparação inteira: uma soma parcial não é um preço
   * menor, é um preço incompleto. Devolver 1.800 aqui faria `economiaPossivel`
   * anunciar economia a favor do agrupamento pior documentado.
   */
  it('null enquanto qualquer produto estiver sem preço', () => {
    const incompleto = agrupamento({
      produtos: [produto({ id: 'monitor', preco: 1800 }), produto({ id: 'braco' })],
    })
    expect(somaDoAgrupamento(incompleto)).toBeNull()
    expect(somaParcial(incompleto)).toBe(1800)
    expect(produtosSemPreco(incompleto)).toBe(1)
  })

  /*
   * Ele existe — a tela acabou de criá-lo e os produtos vêm em seguida — mas não
   * custa zero, e zero entraria na comparação como o mais barato de todos.
   */
  it('null para agrupamento vazio, em vez de zero', () => {
    expect(somaDoAgrupamento(agrupamento())).toBeNull()
  })
})

describe('nomeDoAgrupamento', () => {
  it('usa o nome quando existe', () => {
    expect(nomeDoAgrupamento(agrupamento({ nome: 'Monitor + suporte' }))).toBe('Monitor + suporte')
  })

  /*
   * Um agrupamento de um produto só é a maioria dos casos, e um cabeçalho
   * "(sem nome)" acima de "Sofá Retrátil" não informa nada.
   */
  it('sem nome e com um produto, é o nome do produto', () => {
    const um = agrupamento({ produtos: [produto({ nome: 'Sofá Retrátil' })] })
    expect(nomeDoAgrupamento(um)).toBe('Sofá Retrátil')
  })

  it('sem nome e com vários, junta os nomes', () => {
    const dois = agrupamento({
      produtos: [produto({ id: 'a', nome: 'Monitor 27' }), produto({ id: 'b', nome: 'Braço' })],
    })
    expect(nomeDoAgrupamento(dois)).toBe('Monitor 27 + Braço')
  })
})

describe('agrupamentoDoInteresse', () => {
  /*
   * O escolhido manda sempre — é decisão humana. O mais barato não é
   * necessariamente o que se quer: o sofá certo pode ser o caro.
   */
  it('respeita o escolhido mesmo sendo o mais caro', () => {
    const grupos = [solto('barato', 1899), solto('caro', 2999, true)]
    expect(agrupamentoDoInteresse(grupos)?.id).toBe('caro')
  })

  it('sem escolhido, pega o mais barato com soma completa', () => {
    const grupos = [solto('caro', 2999), solto('barato', 1899), solto('sem-preco', null)]
    expect(agrupamentoDoInteresse(grupos)?.id).toBe('barato')
  })

  /*
   * O ponto de existir agrupamento: um monitor de 24" sozinho não concorre com um
   * de 27" mais suporte. Comparado produto a produto, o "mais barato" seria o
   * suporte de R$ 150.
   */
  it('compara conjunto contra conjunto, não produto contra produto', () => {
    const grupos = [
      agrupamento({
        id: 'grande',
        produtos: [
          produto({ id: 'm27', agrupamento_id: 'grande', preco: 1800 }),
          produto({ id: 'braco', agrupamento_id: 'grande', preco: 300 }),
        ],
      }),
      agrupamento({
        id: 'pequeno',
        produtos: [
          produto({ id: 'm24', agrupamento_id: 'pequeno', preco: 1200 }),
          produto({ id: 'base', agrupamento_id: 'pequeno', preco: 150 }),
        ],
      }),
    ]
    expect(agrupamentoDoInteresse(grupos)?.id).toBe('pequeno')
    expect(valorDoInteresse(grupos)).toBe(1350)
  })

  it('sem soma nenhuma, pega o primeiro (tem nome e link)', () => {
    const grupos = [solto('primeiro', null), solto('segundo', null)]
    expect(agrupamentoDoInteresse(grupos)?.id).toBe('primeiro')
  })

  it('devolve null sem agrupamentos', () => {
    expect(agrupamentoDoInteresse([])).toBeNull()
  })
})

describe('valorDoInteresse', () => {
  it('é a soma do agrupamento que representa', () => {
    const grupos = [
      agrupamento({
        produtos: [produto({ preco: 2399, preco_pix: 2279.05 })],
      }),
    ]
    expect(valorDoInteresse(grupos)).toBe(2279.05)
  })

  it('null sem agrupamentos e sem preços', () => {
    expect(valorDoInteresse([])).toBeNull()
    expect(valorDoInteresse([solto('a', null)])).toBeNull()
  })

  /*
   * O escolhido manda mesmo estando incompleto: dizer o valor do segundo colocado
   * seria responder outra pergunta.
   */
  it('null quando o escolhido está incompleto, mesmo havendo outro com preço', () => {
    const grupos = [
      agrupamento({
        id: 'escolhido',
        escolhido: true,
        produtos: [
          produto({ id: 'a', agrupamento_id: 'escolhido', preco: 1800 }),
          produto({ id: 'b', agrupamento_id: 'escolhido' }),
        ],
      }),
      solto('outro', 1350),
    ]
    expect(valorDoInteresse(grupos)).toBeNull()
  })
})

describe('economiaPossivel', () => {
  it('diz quanto o escolhido custa a mais que a saída mais barata', () => {
    const grupos = [solto('barato', 1899), solto('caro', 2399, true)]
    expect(economiaPossivel(grupos)).toBe(500)
  })

  /*
   * Sem nada a dizer, a tela some com a linha em vez de mostrar "R$ 0,00 a mais".
   */
  it('null quando o escolhido já é o mais barato', () => {
    const grupos = [solto('barato', 1899, true), solto('caro', 2399)]
    expect(economiaPossivel(grupos)).toBeNull()
  })

  it('null com menos de duas somas para comparar', () => {
    expect(economiaPossivel([solto('a', 1899)])).toBeNull()
    expect(economiaPossivel([solto('a', 1899), solto('b', null)])).toBeNull()
  })

  /*
   * O agrupamento incompleto fica fora da comparação porque `somaDoAgrupamento` o
   * devolve como `null` — senão a soma parcial de 1.800 apareceria como a opção
   * mais barata e a tela prometeria uma economia que não existe.
   */
  it('ignora agrupamento incompleto na comparação', () => {
    const grupos = [
      solto('escolhido', 2100, true),
      agrupamento({
        id: 'incompleto',
        produtos: [
          produto({ id: 'a', agrupamento_id: 'incompleto', preco: 1800 }),
          produto({ id: 'b', agrupamento_id: 'incompleto' }),
        ],
      }),
    ]
    expect(economiaPossivel(grupos)).toBeNull()
  })
})

describe('produtosDoInteresse', () => {
  it('achata os produtos de todos os agrupamentos', () => {
    const grupos = [
      agrupamento({
        id: 'a',
        produtos: [
          produto({ id: 'p1', agrupamento_id: 'a' }),
          produto({ id: 'p2', agrupamento_id: 'a' }),
        ],
      }),
      agrupamento({ id: 'b', produtos: [produto({ id: 'p3', agrupamento_id: 'b' })] }),
    ]
    expect(produtosDoInteresse(grupos).map(p => p.id)).toEqual(['p1', 'p2', 'p3'])
  })

  it('lista vazia não tem produto nenhum', () => {
    expect(produtosDoInteresse([])).toEqual([])
  })
})

describe('produtoDaCapa', () => {
  it('é o primeiro produto do agrupamento que representa', () => {
    const grupos = [
      solto('barato', 1899),
      agrupamento({
        id: 'escolhido',
        escolhido: true,
        produtos: [
          produto({ id: 'capa', agrupamento_id: 'escolhido', preco: 2999 }),
          produto({ id: 'outro', agrupamento_id: 'escolhido', preco: 300 }),
        ],
      }),
    ]
    expect(produtoDaCapa(grupos)?.id).toBe('capa')
  })

  it('null quando não há produto para ilustrar', () => {
    expect(produtoDaCapa([])).toBeNull()
    expect(produtoDaCapa([agrupamento()])).toBeNull()
  })
})

describe('totalDosInteresses', () => {
  /*
   * Um agrupamento por interesse, não todos: somar os três sofás candidatos diria
   * que a gente quer três sofás — e o número inflaria justamente nos interesses
   * mais pesquisados.
   */
  it('conta um agrupamento por interesse', () => {
    const lista = [
      interesse({
        id: 'sofa',
        agrupamentos: [solto('a', 2399, true), solto('b', 1899), solto('c', 3200)],
      }),
      interesse({ id: 'fone', agrupamentos: [solto('d', 800)] }),
    ]
    expect(totalDosInteresses(lista)).toBe(3199)
  })

  it('soma o agrupamento inteiro, e não só um produto dele', () => {
    const lista = [
      interesse({
        agrupamentos: [
          agrupamento({
            escolhido: true,
            produtos: [
              produto({ id: 'monitor', preco: 1800 }),
              produto({ id: 'braco', preco: 300 }),
            ],
          }),
        ],
      }),
    ]
    expect(totalDosInteresses(lista)).toBe(2100)
  })

  it('interesse sem preço soma zero em vez de virar NaN', () => {
    const lista = [
      interesse({ id: 'com', agrupamentos: [solto('a', 500)] }),
      interesse({ id: 'sem', agrupamentos: [] }),
    ]
    expect(totalDosInteresses(lista)).toBe(500)
  })

  it('lista vazia soma zero', () => {
    expect(totalDosInteresses([])).toBe(0)
  })
})

describe('interesseNaVista', () => {
  const casal = { spaceId: 'casal', pessoal: false, userId: 'ana' }
  const pessoalDaAna = { spaceId: 'pessoal-ana', pessoal: true, userId: 'ana' }

  it('mostra o que mora no espaço', () => {
    const meu = interesse({ space_id: 'casal' })
    expect(interesseNaVista(meu, casal)).toBe(true)
  })

  it('mostra o que foi compartilhado aqui', () => {
    const emprestado = interesse({
      space_id: 'pessoal-ana',
      compartilhamentos: [compartilhadoEm('casal')],
    })
    expect(interesseNaVista(emprestado, casal)).toBe(true)
  })

  /*
   * É o ponto de existir espaço pessoal: a lista de desejos de cada um fica
   * invisível para o outro até que o dono a compartilhe.
   */
  it('esconde do casal o interesse pessoal não compartilhado', () => {
    const guardado = interesse({ space_id: 'pessoal-ana', criado_por: 'ana' })
    expect(interesseNaVista(guardado, casal)).toBe(false)
  })

  /*
   * A feature que o pedido descreveu: o que eu criei no espaço do casal continua
   * sendo assunto meu, e aparece no meu espaço pessoal também. Sem isto, o pessoal
   * seria o único lugar do app que esconde o que a própria pessoa está tocando.
   */
  it('mostra no pessoal o que eu criei em espaço compartilhado', () => {
    const meuNoCasal = interesse({ space_id: 'casal', criado_por: 'ana' })
    expect(interesseNaVista(meuNoCasal, pessoalDaAna)).toBe(true)
  })

  it('mostra no pessoal o que eu assumi, mesmo sendo de outra pessoa', () => {
    const presente = interesse({ space_id: 'casal', criado_por: 'bia', assumido_por: 'ana' })
    expect(interesseNaVista(presente, pessoalDaAna)).toBe(true)
  })

  it('não traz para o meu pessoal o interesse alheio que eu não assumi', () => {
    const daBia = interesse({ space_id: 'casal', criado_por: 'bia' })
    expect(interesseNaVista(daBia, pessoalDaAna)).toBe(false)
  })

  /*
   * A regra do "é meu" vale só no pessoal: dentro do casal, o que eu guardei no meu
   * espaço pessoal segue meu até eu compartilhar — senão o espaço pessoal não
   * esconderia nada de quem divide o casal comigo.
   */
  it('a regra do "é meu" não vale fora do pessoal', () => {
    const meuNoPessoal = interesse({ space_id: 'pessoal-ana', criado_por: 'ana' })
    const outroCasal = { spaceId: 'outro', pessoal: false, userId: 'ana' }
    expect(interesseNaVista(meuNoPessoal, outroCasal)).toBe(false)
  })

  /* Sem usuário (sessão carregando) o pessoal não inventa alcance. */
  it('sem userId, cai só nas duas primeiras regras', () => {
    const meuNoCasal = interesse({ space_id: 'casal', criado_por: 'ana' })
    const semSessao = { spaceId: 'pessoal-ana', pessoal: true, userId: null }
    expect(interesseNaVista(meuNoCasal, semSessao)).toBe(false)
  })

  it('interessesDaVista preserva a ordem recebida', () => {
    const lista = [
      interesse({ id: '1', space_id: 'casal' }),
      interesse({ id: '2', space_id: 'outro' }),
      interesse({ id: '3', space_id: 'casal' }),
    ]
    expect(interessesDaVista(lista, casal).map(i => i.id)).toEqual(['1', '3'])
  })
})

describe('interesseDeFora', () => {
  it('diz quando o interesse está sendo visto fora da casa dele', () => {
    expect(interesseDeFora(interesse({ space_id: 'casal' }), 'pessoal')).toBe(true)
    expect(interesseDeFora(interesse({ space_id: 'casal' }), 'casal')).toBe(false)
  })
})

describe('paraQuemDoInteresse', () => {
  const pessoas = new Map([['bia', 'Bia']])

  it('resolve o nome do membro escolhido', () => {
    const presente = interesse({ para_quem_user_id: 'bia' })
    expect(paraQuemDoInteresse(presente, pessoas)).toBe('Bia')
  })

  it('usa o texto livre quando não há membro', () => {
    expect(paraQuemDoInteresse(interesse({ para_quem: 'minha mãe' }), pessoas)).toBe('minha mãe')
  })

  /*
   * O membro manda mesmo havendo texto antigo: `ParaQuemCampo` zera um ao escolher o
   * outro, mas uma linha gravada antes disso não pode fazer a tela mostrar as duas
   * respostas — nem escolher a errada.
   */
  it('o membro ganha do texto livre', () => {
    const ambos = interesse({ para_quem: 'minha mãe', para_quem_user_id: 'bia' })
    expect(paraQuemDoInteresse(ambos, pessoas)).toBe('Bia')
  })

  /*
   * Rótulo genérico em vez de `null`: a pessoa pode ter saído do espaço, ou a lista
   * de perfis ainda estar carregando, e dizer "não é para ninguém" seria pior.
   */
  it('cai num rótulo neutro quando não sabe o nome', () => {
    expect(paraQuemDoInteresse(interesse({ para_quem_user_id: 'zeca' }), pessoas))
      .toBe('alguém do espaço')
    expect(paraQuemDoInteresse(interesse({ para_quem_user_id: 'bia' }), undefined))
      .toBe('alguém do espaço')
  })

  it('null quando não é para ninguém em especial', () => {
    expect(paraQuemDoInteresse(interesse(), pessoas)).toBeNull()
  })
})

describe('agruparPorDestino', () => {
  it('devolve só os grupos com conteúdo, na ordem de DESTINOS', () => {
    const lista = [
      interesse({ id: '1', destino: 'viagem' }),
      interesse({ id: '2', destino: 'compra' }),
      interesse({ id: '3', destino: 'compra' }),
    ]

    const grupos = agruparPorDestino(lista)

    // 'compra' vem antes de 'viagem' em DESTINOS, independente da ordem da lista.
    expect(grupos.map(g => g.destino)).toEqual(['compra', 'viagem'])
    expect(grupos[0]!.itens).toHaveLength(2)
    expect(grupos[1]!.itens).toHaveLength(1)
  })

  it('lista vazia não gera cabeçalho nenhum', () => {
    expect(agruparPorDestino([])).toEqual([])
  })
})

describe('lojaDaUrl', () => {
  it('tira o www', () => {
    expect(lojaDaUrl('https://www.kabum.com.br/produto/123')).toBe('kabum.com.br')
    expect(lojaDaUrl('https://mercadolivre.com.br/p/MLB123')).toBe('mercadolivre.com.br')
  })

  /*
   * Tolerante de propósito: o campo é digitável na tela de detalhe, e uma url
   * meio digitada não pode derrubar a lista inteira.
   */
  it('devolve null para url inválida em vez de lançar', () => {
    expect(lojaDaUrl('não é url')).toBeNull()
    expect(lojaDaUrl('')).toBeNull()
  })
})
