/**
 * O changelog é conteúdo, e conteúdo quebra em silêncio.
 *
 * Nada aqui testa Vue nem banco. O que estes testes travam é o tipo de erro que
 * não aparece em nenhuma tela e ninguém revisa duas vezes: a versão do
 * `package.json` que ficou atrás do registro, uma entrada duplicada depois de um
 * merge, a ordem que se inverteu num rebase — e o `v0.10.0` que a comparação
 * alfabética coloca antes do `v0.9.0`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LANCAMENTOS, VERSAO_ATUAL, VERSAO_ATUAL_EXIBICAO, compararVersoes } from '~/changelog'
import { formatarVersao, textoDaNotificacao, TIPOS_DA_CATEGORIA, categoriasDePreferencia } from '~/lib/notificacoes'
import type { Notificacao } from '~/lib/notificacoes'

describe('formatarVersao', () => {
  it('preenche o menor com três dígitos', () => {
    expect(formatarVersao('1.0.0')).toBe('v1.000.0')
    expect(formatarVersao('1.2.3')).toBe('v1.002.3')
  })

  it('não trunca o menor quando ele passa de três dígitos', () => {
    expect(formatarVersao('2.1234.0')).toBe('v2.1234.0')
  })

  it('aceita com ou sem o v, e não duplica o prefixo', () => {
    expect(formatarVersao('v0.8.0')).toBe('v0.008.0')
  })

  it('devolve vazio para o que não é versão', () => {
    expect(formatarVersao('1.0')).toBe('')
    expect(formatarVersao('próxima')).toBe('')
    expect(formatarVersao(undefined)).toBe('')
    expect(formatarVersao(3)).toBe('')
  })
})

describe('compararVersoes', () => {
  it('compara como número, não como texto', () => {
    // O caso que a ordem alfabética erra — e que só aparece na décima versão.
    expect(compararVersoes('0.10.0', '0.9.0')).toBeGreaterThan(0)
    expect(compararVersoes('1.0.0', '0.999.9')).toBeGreaterThan(0)
    expect(compararVersoes('1.0.1', '1.0.1')).toBe(0)
  })
})

describe('LANCAMENTOS', () => {
  it('está em ordem decrescente, sem versão repetida', () => {
    const versoes = LANCAMENTOS.map(l => l.versao)
    expect(new Set(versoes).size).toBe(versoes.length)

    for (let i = 1; i < LANCAMENTOS.length; i++) {
      expect(compararVersoes(versoes[i - 1]!, versoes[i]!)).toBeGreaterThan(0)
    }
  })

  it('tem versão, título, descrição e data válidos em toda entrada', () => {
    for (const l of LANCAMENTOS) {
      expect(l.versao, l.versao).toMatch(/^\d+\.\d+\.\d+$/)
      expect(l.titulo.trim(), l.versao).not.toBe('')
      expect(l.descricao.trim(), l.versao).not.toBe('')
      expect(l.data, l.versao).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  /*
   * As duas pontas do versionamento: o `package.json` é a versão do pacote, e o
   * topo do registro é a versão que o app mostra e anuncia. Elas não têm como se
   * derivar uma da outra (não há `fs` no client), então o que as mantém juntas é
   * este teste — e `npm run release` escreve as duas de uma vez para ele nunca
   * ter motivo de falhar.
   */
  it('bate com a versão do package.json', () => {
    // `process.cwd()` é a raiz do projeto sob o Vitest, e `import.meta.url` aqui
    // não é uma URL file:// — a mesma pegadinha anotada em test/imports.test.ts.
    const pacote = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf-8'),
    ) as { version?: string }

    expect(pacote.version).toBe(VERSAO_ATUAL)
  })

  it('expõe a versão atual já formatada para a tela', () => {
    expect(VERSAO_ATUAL_EXIBICAO).toBe(formatarVersao(VERSAO_ATUAL))
    expect(VERSAO_ATUAL_EXIBICAO).toMatch(/^v\d+\.\d{3,}\.\d+$/)
  })
})

// ---------------------------------------------------------------------------
// A notificação do release
// ---------------------------------------------------------------------------

function aviso(dados: Record<string, unknown>): Notificacao {
  return {
    id: 'n1',
    space_id: null,
    tipo: 'app_atualizado',
    dados,
    rota: '/novidades',
    created_at: '2026-08-12T12:00:00Z',
    lida_em: null,
  }
}

describe('textoDaNotificacao — app_atualizado', () => {
  it('põe a versão e o título na linha, e a descrição no corpo', () => {
    const t = textoDaNotificacao(aviso({
      versao: '1.0.0',
      titulo: 'Novidades, com versão e changelog',
      descricao: 'Cada atualização vira um aviso.',
    }))

    expect(t.titulo).toBe('APPingos v1.000.0 — Novidades, com versão e changelog')
    expect(t.corpo).toBe('Cada atualização vira um aviso.')
    expect(t.rota).toBe('/novidades')
    expect(t.icone).toBe('RocketIcon')
  })

  /*
   * Este é o caso que importa de verdade: a linha foi gravada por uma versão do
   * banco mais nova que o app instalado no celular, ou com `dados` incompleto. A
   * frase piora, e é só isso — não pode virar "undefined" na caixa de ninguém.
   */
  it('não mostra lixo quando a versão ou o título não vieram', () => {
    const semVersao = textoDaNotificacao(aviso({ titulo: 'Melhorias' }))
    expect(semVersao.titulo).toBe('Atualização do APPingos: Melhorias')
    expect(semVersao.corpo).toBe('')

    const vazio = textoDaNotificacao(aviso({}))
    expect(vazio.titulo).toBe('Atualização do APPingos: Melhorias e correções')
    expect(vazio.rota).toBe('/novidades')
  })
})

describe('preferências — a categoria do app', () => {
  it('tem o tipo do release num interruptor próprio', () => {
    expect(TIPOS_DA_CATEGORIA.app).toEqual(['app_atualizado'])
  })

  it('nasce ligada, como as outras, e desliga junto com o tipo', () => {
    const nova = categoriasDePreferencia([]).find(c => c.categoria === 'app')
    expect(nova?.app).toBe('ligado')
    expect(nova?.email).toBe('ligado')

    const desligada = categoriasDePreferencia([
      { tipo: 'app_atualizado', ativo: false, email: false },
    ]).find(c => c.categoria === 'app')
    expect(desligada?.app).toBe('desligado')
    expect(desligada?.email).toBe('desligado')
  })
})
