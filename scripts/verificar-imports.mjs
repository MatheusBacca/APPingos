/**
 * Todo composable e store do PROJETO precisa ser importado à mão.
 *
 * Por quê, se o Nuxt auto-importa? Porque o registro de auto-import de
 * `app/composables/`, `app/utils/` e `app/stores/` é montado por um scan que o
 * dev server REFAZ toda vez que um arquivo entra ou sai dessas pastas. Um
 * transform do Vite que caia no meio dessa reconstrução é cacheado *sem* os
 * imports injetados — e aí o arquivo estoura `X is not defined` só em runtime:
 * sem erro de build, sem erro de tipo, e derrubando o app inteiro quando o
 * arquivo é carregado no boot.
 *
 * Foi exatamente isso em 05/08/2026: `useResumoFilmes` ficou sem
 * `useConvitesFilme`, o setup do widget de Filmes estourou, e o app virou uma
 * tela 500 — com a mensagem apontando para outro lugar (`linhas.length`).
 *
 * Presets do Vue e do Nuxt (`computed`, `ref`, `useHead`, `navigateTo`) e os
 * composables do @nuxtjs/supabase seguem automáticos de propósito: vêm de
 * pacotes que não mudam durante a sessão, então não passam pelo scan que corre.
 *
 *   node scripts/verificar-imports.mjs             lista as faltas, sai com 1
 *   node scripts/verificar-imports.mjs --corrigir  insere os imports que faltam
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const RAIZ = resolve(import.meta.dirname, '..')
const APP = join(RAIZ, 'app')
/** As pastas que o dev server observa — as que motivam esta verificação. */
const PASTAS_ESCANEADAS = ['composables', 'stores', 'utils']
const CORRIGIR = process.argv.includes('--corrigir')

function existe(caminho) {
  try { statSync(caminho); return true }
  catch { return false }
}

function arquivos(dir, exts) {
  if (!existe(dir)) return []
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome)
    return statSync(caminho).isDirectory()
      ? arquivos(caminho, exts)
      : exts.some(e => nome.endsWith(e)) ? [caminho] : []
  })
}

/** Sem comentários — uma menção em prosa não é uso de verdade. */
function semComentarios(fonte) {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** Os nomes que o arquivo já importa, de onde quer que seja. */
function nomesImportados(fonte) {
  const nomes = new Set()

  for (const m of fonte.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from/g)) {
    for (const parte of m[1].split(',')) {
      const nome = parte.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim()
      if (nome) nomes.add(nome)
    }
  }
  // default e namespace: `import x from`, `import * as x from`
  for (const m of fonte.matchAll(/import\s+(?:\*\s+as\s+)?(\w+)\s*(?:,\s*\{[^}]*\}\s*)?from/g)) {
    nomes.add(m[1])
  }

  return nomes
}

/** Nome exportado -> caminho de import, varrendo as pastas escaneadas. */
function mapaDeExports() {
  const mapa = new Map()

  for (const pasta of PASTAS_ESCANEADAS) {
    for (const caminho of arquivos(join(APP, pasta), ['.ts'])) {
      const fonte = readFileSync(caminho, 'utf8')
      const modulo = `~/${relative(APP, caminho).replace(/\\/g, '/').replace(/\.ts$/, '')}`

      for (const m of fonte.matchAll(/^export (?:async )?function (\w+)|^export const (\w+)\s*[:=]/gm)) {
        const nome = m[1] ?? m[2]
        // Só o que parece composable/store — constantes e tipos não interessam.
        if (/^use[A-Z]/.test(nome)) mapa.set(nome, modulo)
      }
    }
  }

  return mapa
}

/**
 * Onde enfiar os imports novos: logo depois do último import existente. Sem
 * nenhum, depois do comentário de cabeçalho (e, num .vue, dentro do <script>).
 */
function inserir(fonte, linhas) {
  const bloco = linhas.join('\n')
  const imports = [...fonte.matchAll(/^import .*?from ['"][^'"]+['"]$/gm)]

  if (imports.length) {
    const ultimo = imports[imports.length - 1]
    const fim = ultimo.index + ultimo[0].length
    return `${fonte.slice(0, fim)}\n${bloco}${fonte.slice(fim)}`
  }

  const abertura = fonte.match(/<script setup[^>]*>\n/)
  if (abertura) {
    const fim = abertura.index + abertura[0].length
    return `${fonte.slice(0, fim)}${bloco}\n${fonte.slice(fim)}`
  }

  const comentario = fonte.match(/^\/\*[\s\S]*?\*\/\n/)
  if (comentario) return `${fonte.slice(0, comentario[0].length)}${bloco}\n${fonte.slice(comentario[0].length)}`

  return `${bloco}\n${fonte}`
}

const exportados = mapaDeExports()
const alvos = [...arquivos(APP, ['.vue', '.ts'])]
  .filter(c => !c.startsWith(join(APP, 'types')))
  .filter(c => !c.startsWith(join(APP, 'components', 'ui')))

const faltas = []

for (const caminho of alvos) {
  const fonte = readFileSync(caminho, 'utf8')
  const codigo = semComentarios(fonte)
  const jaImportados = nomesImportados(codigo)
  const pendentes = new Map()

  for (const [nome, modulo] of exportados) {
    if (jaImportados.has(nome)) continue
    // Definido aqui mesmo? Então não há o que importar.
    if (new RegExp(`export (?:async )?function ${nome}\\b|export const ${nome}\\s*[:=]`).test(codigo)) continue
    // Usado como chamada — é o único uso que quebra em runtime.
    if (!new RegExp(`\\b${nome}\\s*[(<]`).test(codigo)) continue

    faltas.push({ arquivo: relative(RAIZ, caminho).replace(/\\/g, '/'), nome, modulo })
    pendentes.set(modulo, [...(pendentes.get(modulo) ?? []), nome])
  }

  if (CORRIGIR && pendentes.size) {
    const linhas = [...pendentes].map(([modulo, nomes]) => `import { ${nomes.join(', ')} } from '${modulo}'`)
    writeFileSync(caminho, inserir(fonte, linhas), 'utf8')
  }
}

if (faltas.length && CORRIGIR) {
  console.log(`${faltas.length} import(s) inseridos em ${new Set(faltas.map(f => f.arquivo)).size} arquivo(s).`)
  process.exit(0)
}

if (faltas.length) {
  console.error(`\n${faltas.length} uso(s) dependendo de auto-import do projeto:\n`)
  for (const f of faltas) {
    console.error(`  ${f.arquivo}  →  import { ${f.nome} } from '${f.modulo}'`)
  }
  console.error('\nRode `node scripts/verificar-imports.mjs --corrigir`, ou importe à mão.')
  console.error('O porquê está no cabeçalho de scripts/verificar-imports.mjs\n')
  process.exit(1)
}

console.log(`OK — ${alvos.length} arquivos, nenhum dependendo de auto-import do projeto.`)
