/**
 * O contrato entre `popup.js` e `popup.html`, e o manifest.
 *
 * Estes testes existem porque a extensão é a única parte do projeto SEM rede de
 * segurança: ela não passa por `nuxt typecheck` (é JS puro fora de `app/`) e um erro
 * de digitação num id só aparece clicando no ícone no Chrome — que é o passo mais
 * caro de repetir do projeto inteiro. `el('campo-preco')` virando `el('campo-prec')`
 * é `null.value` em runtime, silencioso até a hora do uso.
 *
 * A leitura é do FONTE, de propósito. Importar `popup.js` puxaria
 * `lib/config.gerado.js`, que é gerado pelo build e não existe num clone novo — o
 * teste passaria a depender de alguém ter rodado `npm run extensao` antes.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const raiz = resolve(import.meta.dirname, '..')
const ler = (caminho: string) => readFileSync(resolve(raiz, caminho), 'utf8')

/**
 * Sem comentários — uma menção em prosa não é uso de verdade.
 *
 * Mesma regra (e mesma implementação) de `scripts/verificar-imports.mjs`: os
 * arquivos da extensão explicam nos comentários justamente o que NÃO fazem, e uma
 * varredura crua confundiria a explicação com o fato.
 */
const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const html = ler('extensao/popup.html')
const js = ler('extensao/popup.js')
const manifest = JSON.parse(ler('extensao/manifest.json'))

/** Todo `id="..."` presente no HTML. */
const idsNoHtml = new Set(
  [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]!),
)

describe('popup.js contra popup.html', () => {
  it('todo el(...) aponta para um id que existe no HTML', () => {
    const usados = [...js.matchAll(/\bel\(\s*'([^']+)'\s*\)/g)].map(m => m[1]!)

    expect(usados.length).toBeGreaterThan(10)

    const orfaos = usados.filter(id => !idsNoHtml.has(id))
    expect(orfaos).toEqual([])
  })

  /*
   * `mostrar()` alterna as telas por `tela-${nome}`, montando o id por
   * concatenação — então a varredura de `el('...')` acima não o alcança.
   */
  it('as quatro telas de mostrar() existem no HTML', () => {
    for (const nome of ['carregando', 'login', 'captura', 'pronto']) {
      expect(idsNoHtml.has(`tela-${nome}`)).toBe(true)
    }
  })

  it('os ids que recebem mensagem de erro existem', () => {
    const alvos = [...js.matchAll(/mostrarErro\(\s*'([^']+)'/g)].map(m => m[1]!)
    expect(new Set(alvos)).toEqual(new Set(['erro-login', 'erro-captura']))
    for (const id of alvos) expect(idsNoHtml.has(id)).toBe(true)
  })

  it('todo arquivo importado existe (menos o config, que é gerado)', () => {
    const importados = [...js.matchAll(/from\s+'(\.[^']+)'/g)].map(m => m[1]!)

    for (const caminho of importados) {
      if (caminho.includes('config.gerado')) continue
      expect(() => ler(`extensao/${caminho.replace('./', '')}`)).not.toThrow()
    }
  })

  /*
   * O config é gerado pelo build e ignorado pelo git de propósito: ele carrega a
   * anon key, lida do .env, e o ref do projeto não deveria virar texto versionado.
   */
  it('o config gerado está no .gitignore', () => {
    expect(ler('.gitignore')).toContain('extensao/lib/config.gerado.js')
  })
})

describe('manifest.json', () => {
  it('é Manifest V3', () => {
    expect(manifest.manifest_version).toBe(3)
  })

  /*
   * `activeTab` + `scripting` em vez de `content_scripts` com `<all_urls>`: nada
   * roda em página nenhuma antes do clique no ícone, e o Chrome não pede "ler seus
   * dados em todos os sites" na instalação. Se alguém trocar isso por um content
   * script, este teste é o lugar de reabrir a discussão.
   */
  it('pede o mínimo de permissão, e nenhum content script', () => {
    expect(new Set(manifest.permissions)).toEqual(new Set(['storage', 'activeTab', 'scripting']))
    expect(manifest.content_scripts).toBeUndefined()
    expect(manifest.host_permissions).toEqual(['https://*.supabase.co/*'])
  })

  it('o popup e os quatro ícones declarados existem no disco', () => {
    expect(() => ler(`extensao/${manifest.action.default_popup}`)).not.toThrow()

    expect(Object.keys(manifest.icons).sort()).toEqual(['128', '16', '32', '48'])
    for (const caminho of Object.values(manifest.icons) as string[]) {
      expect(() => readFileSync(resolve(raiz, 'extensao', caminho))).not.toThrow()
    }
  })

  it('a versão é a que o empacotador usa para nomear o zip', () => {
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

describe('lib/api.js', () => {
  /*
   * A extensão nunca pode ver uma service_role key: ela roda no navegador de quem
   * instalou, e uma chave de serviço ali ignoraria toda a RLS do projeto.
   */
  it('não menciona service_role em lugar nenhum da extensão', () => {
    for (const arquivo of ['lib/api.js', 'popup.js', 'lib/raspagem.js', 'lib/precos.js']) {
      expect(semComentarios(ler(`extensao/${arquivo}`))).not.toMatch(/service_role/i)
    }
  })

  it('lê a URL e a chave só do config gerado', () => {
    const api = semComentarios(ler('extensao/lib/api.js'))
    expect(api).toContain("from './config.gerado.js'")
    // Nenhuma URL de projeto real chumbada no fonte.
    expect(api).not.toMatch(/https:\/\/[a-z0-9-]+\.supabase\.co/)
  })
})
