/**
 * A versão do APP e o texto do release dela, em JSON, para quem não é TypeScript.
 *
 *   node scripts/versao-atual.mjs
 *   {"versao":"1.1.0","titulo":"...","descricao":"...","tag":"v1.1.0"}
 *
 * Existe por causa do workflow que cria a tag: ele roda em bash e precisa das
 * mesmas três strings que `app/changelog.ts` guarda. Ler TypeScript de dentro de
 * um `run:` seria um `node -p` com regex solta espalhado no YAML — e regex de
 * changelog no YAML é o tipo de coisa que ninguém revisa e quebra calada.
 *
 * Também SERVE DE TRAVA: sai com 1 se `package.json` e o topo do registro
 * discordarem. `test/changelog.test.ts` já checa isso, mas o workflow não roda a
 * suíte antes de taggear — e uma tag `v1.2.0` apontando para um build que se diz
 * v1.1.0 é o tipo de erro que ninguém desfaz depois, porque a tag já foi
 * publicada.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const RAIZ = resolve(import.meta.dirname, '..')

const { version } = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf-8'))
const fonte = readFileSync(join(RAIZ, 'app', 'changelog.ts'), 'utf-8')

/*
 * O primeiro item do array é o release atual — `npm run release` insere no topo,
 * e `test/changelog.test.ts` trava a ordem decrescente. As três chaves são lidas
 * na ordem em que o script as escreve.
 */
const bloco = fonte.slice(fonte.indexOf('export const LANCAMENTOS'))
const topo = bloco.match(
  /versao:\s*'([^']+)',\s*\n\s*titulo:\s*'((?:[^'\\]|\\.)*)',\s*\n\s*descricao:\s*'((?:[^'\\]|\\.)*)'/,
)

if (!topo) {
  console.error('não achei a entrada do topo em app/changelog.ts')
  process.exit(1)
}

const [, versao, titulo, descricao] = topo.map(s => s.replace(/\\'/g, "'").replace(/\\\\/g, '\\'))

if (versao !== version) {
  console.error(
    `package.json diz ${version} e o topo do changelog diz ${versao} — `
    + 'um release pela metade. Rode `npm run release` em vez de editar à mão.',
  )
  process.exit(1)
}

console.log(JSON.stringify({ versao, titulo, descricao, tag: `v${versao}` }))
