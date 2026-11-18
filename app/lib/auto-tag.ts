/**
 * O auto-tag da caixa de entrada: a sugestão de destino e categoria para uma
 * transação que acabou de chegar do banco.
 *
 * Três fontes, nesta ordem de confiança:
 *   1. o que a PESSOA escolheu antes para o mesmo estabelecimento
 *      (`regra_classificacao`, que `aprender_classificacao` mantém);
 *   2. o dicionário de marcas conhecidas (`~/lib/estabelecimentos`);
 *   3. a categoria que a Pluggy mandou.
 *
 * É sempre SUGESTÃO PRÉ-PREENCHIDA, nunca lançamento: nada entra no espaço do
 * casal sem um toque humano (docs/notion-plano-open-finance.md, "Lembrar a
 * escolha por estabelecimento"). Por isso o destino só vem da fonte 1 — a marca
 * diz "iFood é Delivery", mas não diz se o seu iFood é do casal ou só seu.
 *
 * Tudo aqui é função pura, testada em test/auto-tag.test.ts.
 */
import {
  ROTULO_CATEGORIA_BASE,
  categoriaBaseDaPluggy,
  categoriaBaseDoNome,
  chaveDoEstabelecimento,
  reconhecerEstabelecimento,
} from '~/lib/estabelecimentos'
import type { CategoriaBase, Estabelecimento } from '~/lib/estabelecimentos'

export type DestinoDaRegra = 'casal' | 'pessoal' | 'ignorar'

/** Uma linha de `regra_classificacao` como a sugestão a lê. */
export interface RegraAprendida {
  chave: string
  rotulo: string
  destino: DestinoDaRegra
  categoria_nome: string | null
  vezes: number
  automatica: boolean
}

export type Origem = 'regra' | 'estabelecimento' | 'pluggy'

export interface Sugestao {
  destino: DestinoDaRegra | null
  categoriaNome: string | null
  categoriaBase: CategoriaBase | null
  origem: Origem
  confianca: 'baixa' | 'media' | 'alta'
  /** pt-BR, para a tela: "Como nas últimas 3 vezes", "iFood costuma ser Delivery". */
  motivo: string
  estabelecimento: Estabelecimento | null
  /** A chave do estabelecimento — é com ela que a classificação ensina. */
  chave: string
}

/** O pedaço de `transacao_bancaria` que a sugestão usa. */
export interface TransacaoParaSugerir {
  descricao: string
  estabelecimento_nome?: string | null
  categoria_pluggy?: string | null
  categoria_pluggy_id?: string | null
}

const normalizar = (s: string) => s.trim().toLowerCase()

/**
 * A categoria do espaço que corresponde a uma base: a que tem o nome padrão
 * ("Mercado") se existir, senão a primeira cujo nome cai na mesma base
 * ("Supermercado"). Sem nenhuma, o nome padrão — a classificação cria a
 * categoria pelo nome (`obter_ou_criar_categoria`), e só se a pessoa confirmar.
 */
function categoriaDoEspaco(base: CategoriaBase, categorias: { nome: string }[]): string {
  const padrao = ROTULO_CATEGORIA_BASE[base]
  const exata = categorias.find(c => normalizar(c.nome) === normalizar(padrao))
  if (exata) return exata.nome
  return categorias.find(c => categoriaBaseDoNome(c.nome) === base)?.nome ?? padrao
}

/** O nome que a regra guardou, na grafia que o espaço usa (as categorias casam por `nome_norm`). */
function nomeNaGrafiaDoEspaco(nome: string, categorias: { nome: string }[]): string {
  return categorias.find(c => normalizar(c.nome) === normalizar(nome))?.nome ?? nome
}

function confiancaPorVezes(vezes: number): Sugestao['confianca'] {
  if (vezes >= 3) return 'alta'
  if (vezes === 2) return 'media'
  return 'baixa'
}

/** De que marca é uma regra — pelo rótulo (que guarda o nome da marca) ou pela chave. */
function marcaDaRegra(r: RegraAprendida): string | null {
  return (reconhecerEstabelecimento(r.rotulo) ?? reconhecerEstabelecimento(r.chave))?.id ?? null
}

/**
 * A regra que vale para esta transação: a da mesma chave; senão a do nome do
 * estabelecimento que a Pluggy mandou; senão — para marca conhecida — a mais
 * repetida entre as regras da mesma marca ("IFOOD *PIZZARIA X" e
 * "IFOOD *RESTAURANTE Y" têm chaves diferentes, mas o iFood é o mesmo).
 */
function regraQueVale(
  chave: string,
  t: TransacaoParaSugerir,
  estabelecimento: Estabelecimento | null,
  regras: RegraAprendida[],
): { regra: RegraAprendida, daMarca: boolean } | null {
  const exata = regras.find(r => r.chave === chave)
  if (exata) return { regra: exata, daMarca: false }

  if (t.estabelecimento_nome) {
    const chaveDoNome = chaveDoEstabelecimento(t.estabelecimento_nome)
    const pelaPluggy = chaveDoNome ? regras.find(r => r.chave === chaveDoNome) : undefined
    if (pelaPluggy) return { regra: pelaPluggy, daMarca: false }
  }

  if (estabelecimento) {
    const daMarca = regras
      .filter(r => marcaDaRegra(r) === estabelecimento.id)
      .sort((a, b) => b.vezes - a.vezes)[0]
    if (daMarca) return { regra: daMarca, daMarca: true }
  }
  return null
}

export function sugerirClassificacao(
  t: TransacaoParaSugerir,
  regras: RegraAprendida[],
  categoriasDoEspaco: { nome: string }[],
): Sugestao | null {
  const chave = chaveDoEstabelecimento(t.descricao)
  const estabelecimento = reconhecerEstabelecimento(t.descricao) ?? reconhecerEstabelecimento(t.estabelecimento_nome)

  // 1. O que a pessoa escolheu antes.
  const achada = regraQueVale(chave, t, estabelecimento, regras)
  if (achada) {
    const { regra, daMarca } = achada
    const categoriaNome = regra.destino === 'ignorar' || !regra.categoria_nome
      ? null
      : nomeNaGrafiaDoEspaco(regra.categoria_nome, categoriasDoEspaco)
    const vezes = Math.max(1, regra.vezes)
    // Uma regra de OUTRO estabelecimento da mesma marca nunca passa de média.
    const confianca = daMarca && vezes >= 3 ? 'media' : confiancaPorVezes(vezes)
    return {
      destino: regra.destino,
      categoriaNome,
      categoriaBase: categoriaBaseDoNome(categoriaNome) ?? (regra.destino === 'ignorar' ? null : estabelecimento?.categoria ?? null),
      origem: 'regra',
      confianca,
      motivo: daMarca
        ? `Como nas outras compras em ${estabelecimento!.nome}`
        : vezes === 1 ? 'Como da última vez' : `Como nas últimas ${vezes} vezes`,
      estabelecimento,
      chave,
    }
  }

  // 2. A marca conhecida.
  if (estabelecimento) {
    const categoriaNome = categoriaDoEspaco(estabelecimento.categoria, categoriasDoEspaco)
    return {
      destino: null,
      categoriaNome,
      categoriaBase: estabelecimento.categoria,
      origem: 'estabelecimento',
      confianca: 'media',
      motivo: `${estabelecimento.nome} costuma ser ${categoriaNome}`,
      estabelecimento,
      chave,
    }
  }

  // 3. A categoria do banco.
  const base = categoriaBaseDaPluggy(t.categoria_pluggy_id, t.categoria_pluggy)
  if (base) {
    const categoriaNome = categoriaDoEspaco(base, categoriasDoEspaco)
    return {
      destino: null,
      categoriaNome,
      categoriaBase: base,
      origem: 'pluggy',
      confianca: 'baixa',
      motivo: `Categoria do banco: ${categoriaNome}`,
      estabelecimento: null,
      chave,
    }
  }

  return null
}

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o'])

/** "padaria do ze" → "Padaria do Ze". */
function capitalizar(texto: string): string {
  return texto
    .split(' ')
    .filter(Boolean)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ')
}

/**
 * O nome humano que a regra guarda (`regra_classificacao.rotulo`) e que a tela
 * de regras mostra: a marca, se for conhecida; senão o nome que a Pluggy deu ao
 * estabelecimento; senão a chave, capitalizada.
 */
export function rotuloParaRegra(t: TransacaoParaSugerir): string {
  const marca = reconhecerEstabelecimento(t.descricao) ?? reconhecerEstabelecimento(t.estabelecimento_nome)
  if (marca) return marca.nome
  const doBanco = t.estabelecimento_nome?.trim()
  if (doBanco) return capitalizar(doBanco.toLowerCase())
  return capitalizar(chaveDoEstabelecimento(t.descricao)) || t.descricao.trim()
}

/** O rótulo curto do destino de uma regra, para a tela. */
export const ROTULO_DESTINO_DA_REGRA: Record<DestinoDaRegra, string> = {
  casal: 'Compartilhada',
  pessoal: 'Pessoal',
  ignorar: 'Ignorar',
}

/**
 * Se a regra pode classificar sozinha: só no espaço pessoal (o check
 * `regra_automatica_so_pessoal` da migration) e só depois de a escolha se
 * repetir três vezes.
 */
export function podeSerAutomatica(r: Pick<RegraAprendida, 'destino' | 'vezes'>): boolean {
  return r.destino === 'pessoal' && r.vezes >= 3
}
