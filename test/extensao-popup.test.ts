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
const css = ler('extensao/popup.css')
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

  /*
   * A asserção é "todo destino existe", e não "os destinos são exatamente estes":
   * travar a lista fazia o teste quebrar a cada tela nova sem apontar defeito
   * nenhum — foi o que aconteceu ao acrescentar a rechecagem de preço.
   */
  it('os ids que recebem mensagem de erro existem', () => {
    const alvos = [...js.matchAll(/mostrarErro\(\s*'([^']+)'/g)].map(m => m[1]!)

    expect(new Set(alvos).size).toBeGreaterThanOrEqual(2)
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

describe('popup.css — o atributo hidden precisa ganhar', () => {
  /*
   * Esta suíte existe por causa de dois bugs reais que chegaram ao usuário na
   * 0.1.0, ambos "escondi e não escondeu":
   *
   * 1. `#tela-pronto { display: flex }` é seletor de ID (1,0,0) e vencia o
   *    `.tela[hidden] { display: none }` (0,2,0) por ESPECIFICIDADE — a tela de
   *    "Interesse registrado" ficava por cima da de login, para sempre.
   * 2. `#grupo-novo` usa `.pilha { display: flex }`, e o `[hidden]` dele vinha da
   *    folha do NAVEGADOR. Declaração de autor vence a do agente de usuário
   *    independente de especificidade — os campos de título e destino não sumiam.
   *
   * O que ambos têm em comum é uma regra de layout com `display` num elemento que
   * o JS esconde por `hidden`. A defesa é uma só: `[hidden]` global com
   * `!important`. Os testes abaixo protegem essa regra, porque o sintoma é visual
   * e nenhuma outra verificação do projeto o alcança.
   */
  const TELAS = ['carregando', 'login', 'captura', 'recheck', 'pronto']

  /**
   * Monta o popup no DOM do happy-dom, com o CSS embutido para a cascata valer.
   *
   * Testar o COMPORTAMENTO, e não o texto do CSS, é o que importa aqui: os dois
   * bugs eram de cascata, e uma regra pode estar escrita e ainda perder para outra.
   * O `<script type=module>` sai porque ele precisaria das APIs do `chrome`.
   */
  function montarPopup(folha = css) {
    document.head.innerHTML = `<style>${folha}</style>`
    document.body.innerHTML = html
      .match(/<body>([\s\S]*)<\/body>/)![1]!
      .replace(/<script[\s\S]*?<\/script>/g, '')
  }

  /** Faz o que `mostrar()` faz e devolve quais telas o navegador desenharia. */
  function telasVisiveis(ativa: string): string[] {
    for (const nome of TELAS) {
      (document.getElementById(`tela-${nome}`) as HTMLElement).hidden = nome !== ativa
    }
    return TELAS.filter(nome =>
      getComputedStyle(document.getElementById(`tela-${nome}`)!).display !== 'none',
    )
  }

  function somiuAoOcultar(id: string): boolean {
    const alvo = document.getElementById(id) as HTMLElement
    alvo.hidden = true
    return getComputedStyle(alvo).display === 'none'
  }

  it.each(TELAS)('com "%s" ativa, só ela aparece', (ativa) => {
    montarPopup()
    expect(telasVisiveis(ativa)).toEqual([ativa])
  })

  it('grupo-novo some quando o alvo é um interesse existente', () => {
    montarPopup()
    expect(somiuAoOcultar('grupo-novo')).toBe(true)
  })

  it('as mensagens de erro somem quando vazias', () => {
    montarPopup()
    expect(somiuAoOcultar('erro-login')).toBe(true)
    expect(somiuAoOcultar('erro-captura')).toBe(true)
  })

  /*
   * Prova que os testes acima de fato pegam a regressão, em vez de passarem por
   * acaso: com a regra antiga (`.tela[hidden]`, sem !important) eles falham do jeito
   * exato que o usuário viu — a tela de "pronto" por cima da de login.
   */
  it('detecta a regra antiga, que era o bug da 0.1.0', () => {
    const folhaComBug = semComentarios(css).replace(
      /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/,
      '.tela[hidden] { display: none; }',
    )
    // Garante que a substituição pegou; senão o teste não provaria nada.
    expect(folhaComBug).not.toMatch(/!important/)

    montarPopup(folhaComBug)
    expect(telasVisiveis('login')).toEqual(['login', 'pronto'])
    expect(somiuAoOcultar('grupo-novo')).toBe(false)
  })

  it('todo elemento que o JS esconde existe no HTML', () => {
    const alternados = new Set<string>([
      ...[...js.matchAll(/el\(\s*'([^']+)'\s*\)\.hidden\s*=/g)].map(m => m[1]!),
      ...TELAS.map(n => `tela-${n}`),
    ])

    expect(alternados.size).toBeGreaterThan(3)
    for (const id of alternados) expect(idsNoHtml.has(id)).toBe(true)
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

  /*
   * A rechecagem precisa abrir a página de lojas arbitrárias, e isso exige
   * permissão ampla de host. Ela tem que ficar em `optional_host_permissions`, e
   * NUNCA migrar para `host_permissions`: a diferença é o Chrome pedir no clique
   * do botão contra pedir na instalação. Passar para a lista fixa traria de volta
   * o "ler e alterar seus dados em todos os sites" para quem só quer capturar um
   * produto e nunca vai usar o botão.
   */
  it('a permissão ampla é OPCIONAL, pedida no clique', () => {
    expect(manifest.optional_host_permissions).toEqual(['https://*/*'])

    for (const padrao of manifest.host_permissions) {
      expect(padrao).not.toMatch(/^https:\/\/\*\/|<all_urls>/)
    }
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
