/**
 * O dicionário de estabelecimentos do auto-tag.
 *
 * O que mais importa aqui é a ESTABILIDADE da chave: ela é a chave de
 * `regra_classificacao`, e uma chave que muda de uma parcela para a outra (ou
 * de uma cidade para a outra) é uma regra que nunca mais casa — o app
 * "esquece" em silêncio o que a pessoa ensinou.
 */
import { describe, expect, it } from 'vitest'
import {
  CATEGORIAS_BASE,
  COR_CATEGORIA_BASE,
  ROTULO_CATEGORIA_BASE,
  TOTAL_DE_MARCAS,
  agruparPorRegra,
  categoriaBaseDaPluggy,
  categoriaBaseDoNome,
  chaveDoEstabelecimento,
  reconhecerEstabelecimento,
} from '~/lib/estabelecimentos'

describe('chaveDoEstabelecimento', () => {
  it.each([
    ['IFD*IFOOD.COM AGENCIA DE', 'ifood agencia'],
    ['UBER *TRIP HELP.UBER.COM', 'uber trip help uber'],
    ['MERCADOLIVRE*3PRODUTOS', 'mercadolivre'],
    ['PAG*CondorSuperCentro CURITIBA BR', 'condorsupercentro'],
    ['NETFLIX.COM', 'netflix'],
    ['DROGASIL 1234 SAO PAULO', 'drogasil'],
    ['POSTO SHELL 123', 'posto shell'],
    ['AMAZON PRIME*1A2B3C', 'amazon prime'],
    ['PG *TON 02/10', 'ton'],
    ['MP*PADARIADOZE', 'padariadoze'],
    ['PAYPAL *STEAM GAMES', 'steam games'],
    ['EBN*SPOTIFY', 'spotify'],
    ['EC *PANIFICADORA ALEGRIA', 'panificadora alegria'],
    ['Padaria São João', 'padaria sao joao'],
  ])('%s → %s', (descricao, chave) => {
    expect(chaveDoEstabelecimento(descricao)).toBe(chave)
  })

  it('é a mesma em todas as parcelas da compra', () => {
    const chaves = ['PG *TON 01/10', 'PG *TON 02/10', 'PG *TON PARC 03/10', 'PG *TON PARCELA 4 DE 10']
      .map(chaveDoEstabelecimento)
    expect(new Set(chaves)).toEqual(new Set(['ton']))
  })

  it('não muda com a cidade, a UF ou o país no fim', () => {
    const chaves = [
      'UBER *TRIP HELP.UBER.COM',
      'UBER *TRIP HELP.UBER.COM SAO PAULO BR',
      'UBER *TRIP HELP.UBER.COM CURITIBA PR',
      'uber *trip help.uber.com   Rio de Janeiro  BRA',
    ].map(chaveDoEstabelecimento)
    expect(new Set(chaves).size).toBe(1)
  })

  it('não muda com o número da loja nem com o código do pedido', () => {
    expect(chaveDoEstabelecimento('DROGASIL 1234 SAO PAULO')).toBe(chaveDoEstabelecimento('DROGASIL 5678 CURITIBA'))
    expect(chaveDoEstabelecimento('AMAZON PRIME*1A2B3C')).toBe(chaveDoEstabelecimento('AMAZON PRIME*9Z8Y7X'))
    expect(chaveDoEstabelecimento('MERCADOLIVRE*3PRODUTOS')).toBe(chaveDoEstabelecimento('MERCADOLIVRE*12PRODUTOS'))
  })

  it('não muda com caixa, acento nem espaço dobrado', () => {
    expect(chaveDoEstabelecimento('  Açougue  do   Zé ')).toBe(chaveDoEstabelecimento('ACOUGUE DO ZE'))
  })

  it('tira o sufixo societário e a preposição solta do fim', () => {
    expect(chaveDoEstabelecimento('RESTAURANTE BOM PRATO LTDA')).toBe('restaurante bom prato')
    expect(chaveDoEstabelecimento('IFD*IFOOD.COM AGENCIA DE')).toBe('ifood agencia')
  })

  it('sem nada depois do gateway, a chave é o gateway', () => {
    expect(chaveDoEstabelecimento('APPLE.COM/BILL')).toBe('apple')
    expect(chaveDoEstabelecimento('APPLE.COM/BILL 0800 761 0867')).toBe('apple')
  })

  it('nunca devolve vazio para uma descrição com letras', () => {
    expect(chaveDoEstabelecimento('SP')).toBe('sp')
    expect(chaveDoEstabelecimento('BR')).not.toBe('')
  })

  it('separa estabelecimentos diferentes', () => {
    expect(chaveDoEstabelecimento('PG *TON 02/10')).not.toBe(chaveDoEstabelecimento('PG *PADARIA X 02/10'))
  })
})

describe('reconhecerEstabelecimento', () => {
  it.each([
    ['IFD*IFOOD.COM AGENCIA DE', 'ifood', 'delivery'],
    ['UBER *TRIP HELP.UBER.COM', 'uber', 'transporte'],
    ['UBER* EATS', 'uber-eats', 'delivery'],
    ['MERCADOLIVRE*3PRODUTOS', 'mercado-livre', 'compras'],
    ['PAG*CondorSuperCentro CURITIBA BR', 'condor', 'mercado'],
    ['NETFLIX.COM', 'netflix', 'streaming'],
    ['DROGASIL 1234 SAO PAULO', 'drogasil', 'farmacia'],
    ['POSTO SHELL 123', 'shell', 'combustivel'],
    ['AMAZON PRIME*1A2B3C', 'prime-video', 'streaming'],
    ['AMAZON.COM.BR', 'amazon', 'compras'],
    ['DL*GOOGLE YouTube', 'youtube-premium', 'streaming'],
    ['GOOGLE *Google One', 'google', 'eletronicos'],
    ['APPLE.COM/BILL', 'apple', 'eletronicos'],
    ['EBN*SPOTIFY', 'spotify', 'streaming'],
    ['IFOOD *SUBWAY CENTRO', 'ifood', 'delivery'],
    ['SUBWAY SHOPPING MUELLER', 'subway', 'restaurante'],
    ['99APP *99APP', '99', 'transporte'],
    ['99 POP', '99', 'transporte'],
    ['DROGA RAIA 123', 'droga-raia', 'farmacia'],
    ['PAO DE ACUCAR-1234', 'pao-de-acucar', 'mercado'],
    ['PAODEACUCAR LJ 12', 'pao-de-acucar', 'mercado'],
    ['C&A MODAS', 'cea', 'roupas'],
    ['C & A', 'cea', 'roupas'],
    ['SMARTFIT ESCOLA DE GINASTICA', 'smart-fit', 'academia'],
    ['MICROSOFT*XBOX GAME PASS', 'xbox', 'jogos'],
    ['MICROSOFT*365 PERSONAL', 'microsoft', 'eletronicos'],
    ['OPENAI *CHATGPT SUBSCR', 'openai', 'eletronicos'],
    ['ANTHROPIC', 'anthropic', 'eletronicos'],
    ['TIM S/A', 'tim', 'telefone'],
    ['AZUL LINHAS AEREAS', 'azul', 'viagem'],
    ['HBO MAX', 'max', 'streaming'],
    ['Disney Plus', 'disney-plus', 'streaming'],
    ['SEM PARAR', 'sem-parar', 'transporte'],
    ['ZE DELIVERY', 'ze-delivery', 'delivery'],
    ['McDonald\'s', 'mcdonalds', 'restaurante'],
    ['Tok & Stok', 'tok-stok', 'casa'],
  ])('%s → %s', (texto, id, categoria) => {
    const e = reconhecerEstabelecimento(texto)
    expect(e?.id).toBe(id)
    expect(e?.categoria).toBe(categoria)
  })

  it.each([
    'PG *TON 02/10',
    'PADARIA DO ZE',
    'PIX ENVIADO MARIA SILVA',
    'APPLEBEES SHOPPING',
    'BAR DO GOL',
    'PADARIA CEU AZUL',
    'MAXI ATACADO',
    'TIMBIRAS LANCHES',
    'NATURAL DA TERRA',
    'VIVONA PIZZARIA',
  ])('%s não é marca conhecida', (texto) => {
    expect(reconhecerEstabelecimento(texto)).toBeNull()
  })

  it('nulo e vazio não são marca', () => {
    expect(reconhecerEstabelecimento(null)).toBeNull()
    expect(reconhecerEstabelecimento(undefined)).toBeNull()
    expect(reconhecerEstabelecimento('   ')).toBeNull()
  })

  it('reconhece pelo nome do estabelecimento que a Pluggy manda', () => {
    expect(reconhecerEstabelecimento('IFOOD.COM AGENCIA DE RESTAURANTES ONLINE S.A.')?.id).toBe('ifood')
    expect(reconhecerEstabelecimento('RAIA DROGASIL S/A')?.id).toBe('drogasil')
  })

  it('cada marca traz cor, cor de texto e sigla utilizáveis no selo', () => {
    const exemplos = ['ifood', 'mercado livre', 'netflix', 'shell', 'spotify', 'uber']
      .map(t => reconhecerEstabelecimento(t)!)
    for (const e of exemplos) {
      expect(e.cor).toMatch(/^#[0-9A-F]{6}$/i)
      expect(e.corTexto).toMatch(/^#[0-9A-F]{6}$/i)
      expect(e.sigla.length).toBeGreaterThanOrEqual(1)
      expect(e.sigla.length).toBeLessThanOrEqual(3)
      expect(e).not.toHaveProperty('termos')
    }
    // Amarelo pede texto escuro; vermelho, branco.
    expect(reconhecerEstabelecimento('99 POP')!.corTexto).toBe('#111111')
    expect(reconhecerEstabelecimento('ifood')!.corTexto).toBe('#FFFFFF')
  })

  it('o dicionário tem as ~120 marcas combinadas', () => {
    expect(TOTAL_DE_MARCAS).toBeGreaterThanOrEqual(120)
  })
})

describe('categoriaBaseDoNome', () => {
  it.each([
    ['Mercado', 'mercado'],
    ['Supermercado', 'mercado'],
    ['Restaurantes', 'restaurante'],
    ['Comida', 'restaurante'],
    ['Alimentação', 'restaurante'],
    ['Bares e restaurantes', 'restaurante'],
    ['Delivery', 'delivery'],
    ['Uber/Táxi', 'transporte'],
    ['Farmácia', 'farmacia'],
    ['Cinema', 'cinema'],
    ['Celular', 'telefone'],
    ['Luz e água', 'contas'],
    ['Pets', 'pet'],
    ['Assinaturas', 'streaming'],
    ['Padaria e café', 'padaria'],
    ['Saúde', 'saude'],
  ])('%s → %s', (nome, base) => {
    expect(categoriaBaseDoNome(nome)).toBe(base)
  })

  it('não inventa base para nome desconhecido', () => {
    expect(categoriaBaseDoNome('Xyzzy')).toBeNull()
    expect(categoriaBaseDoNome('')).toBeNull()
    expect(categoriaBaseDoNome(null)).toBeNull()
  })

  it('o rótulo padrão de cada base volta para a mesma base', () => {
    for (const base of CATEGORIAS_BASE) {
      expect(categoriaBaseDoNome(ROTULO_CATEGORIA_BASE[base]), base).toBe(base)
    }
  })

  it('toda base tem rótulo e cor da paleta', () => {
    expect(CATEGORIAS_BASE).toHaveLength(31)
    const paleta = ['cinza', 'marrom', 'laranja', 'amarelo', 'verde', 'azul', 'roxo', 'rosa', 'vermelho']
    for (const base of CATEGORIAS_BASE) {
      expect(ROTULO_CATEGORIA_BASE[base]).toBeTruthy()
      expect(paleta).toContain(COR_CATEGORIA_BASE[base])
    }
  })
})

describe('categoriaBaseDaPluggy', () => {
  it('pelo id, do mais fino para o mais grosso', () => {
    expect(categoriaBaseDaPluggy('10000000')).toBe('mercado')
    expect(categoriaBaseDaPluggy('11020000')).toBe('delivery')
    expect(categoriaBaseDaPluggy('11010000')).toBe('restaurante')
    expect(categoriaBaseDaPluggy('19050001')).toBe('combustivel')
    expect(categoriaBaseDaPluggy('19050002')).toBe('estacionamento')
    expect(categoriaBaseDaPluggy('19010000')).toBe('transporte')
    expect(categoriaBaseDaPluggy('18020000')).toBe('farmacia')
    expect(categoriaBaseDaPluggy('09020000')).toBe('streaming')
  })

  it('renda, investimento e pagamento de fatura não têm categoria de gasto', () => {
    expect(categoriaBaseDaPluggy('01010000')).toBeNull()
    expect(categoriaBaseDaPluggy('03020000')).toBeNull()
    expect(categoriaBaseDaPluggy('05100000')).toBeNull()
    expect(categoriaBaseDaPluggy('05100000', 'Groceries')).toBeNull()
  })

  it('sem id (ou id estranho), pelo nome em inglês', () => {
    expect(categoriaBaseDaPluggy(null, 'Groceries')).toBe('mercado')
    expect(categoriaBaseDaPluggy(undefined, ' food delivery ')).toBe('delivery')
    expect(categoriaBaseDaPluggy('abc', 'Gas stations')).toBe('combustivel')
    expect(categoriaBaseDaPluggy(null, 'Categoria nova')).toBeNull()
    expect(categoriaBaseDaPluggy()).toBeNull()
  })
})

describe('agruparPorRegra', () => {
  const linha = (descricao: string, extra: Partial<{ estabelecimento_nome: string | null, sentido: string }> = {}) =>
    ({ descricao, estabelecimento_nome: null, sentido: 'saida', ...extra })

  it('casa pela descrição, inclusive com parcela e cidade diferentes', () => {
    const regras = [{ id: 'r1', chave: chaveDoEstabelecimento('IFD*IFOOD.COM AGENCIA DE') }]
    const grupos = agruparPorRegra([
      linha('IFD*IFOOD.COM AGENCIA DE'),
      linha('UBER *TRIP HELP.UBER.COM'),
    ], regras)
    expect([...grupos.keys()]).toEqual(['r1'])
    expect(grupos.get('r1')).toHaveLength(1)
  })

  it('casa pelo nome do estabelecimento quando a descrição muda', () => {
    const regras = [{ id: 'r1', chave: chaveDoEstabelecimento('Padaria São José') }]
    const grupos = agruparPorRegra([linha('PG *XYZ 123', { estabelecimento_nome: 'Padaria São José' })], regras)
    expect(grupos.get('r1')).toHaveLength(1)
  })

  it('estorno e crédito não entram, e sem regra não há grupo', () => {
    const regras = [{ id: 'r1', chave: chaveDoEstabelecimento('NETFLIX.COM') }]
    expect(agruparPorRegra([linha('NETFLIX.COM', { sentido: 'entrada' })], regras).size).toBe(0)
    expect(agruparPorRegra([linha('NETFLIX.COM')], []).size).toBe(0)
  })
})
