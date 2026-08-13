/**
 * Publica uma versão do APPingos — em um comando, nos três lugares.
 *
 *   npm run release 1.1.0 "Título curto" "Uma ou duas frases sobre o que chegou."
 *
 * O que ele escreve:
 *
 *   1. `package.json`     → a versão do pacote;
 *   2. `app/changelog.ts` → a entrada nova no topo de `LANCAMENTOS`, que é o que
 *                           a timeline de `/novidades` desenha;
 *   3. uma migration      → `select public.anunciar_versao(...)`, que gera a
 *                           notificação para todo mundo no `supabase db push`.
 *
 * POR QUE UM SCRIPT, E NÃO TRÊS EDIÇÕES À MÃO. Porque o mesmo título e a mesma
 * descrição precisam existir no changelog (conteúdo do build, que muda com o
 * deploy) e na notificação (snapshot no banco, que não muda nunca) — e três
 * arquivos editados à mão em três formatos diferentes é a receita para a versão
 * subir sem o aviso, ou o aviso sair com o texto da versão anterior. Aqui o texto
 * é digitado uma vez.
 *
 * O script NÃO commita, NÃO builda e NÃO dá push: o release ainda é uma decisão,
 * e ele só prepara as três pontas. As instruções do que fazer depois saem no fim.
 *
 * NÃO É A VERSÃO DA EXTENSÃO. A do Chrome vive em `extensao/manifest.json` e é ela
 * que dispara o workflow de Releases; esta é a do app. Duas versões porque são
 * dois artefatos, publicados por caminhos diferentes e em ritmos diferentes.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const RAIZ = resolve(import.meta.dirname, '..')
const PACKAGE = join(RAIZ, 'package.json')
const CHANGELOG = join(RAIZ, 'app', 'changelog.ts')
const MIGRATIONS = join(RAIZ, 'supabase', 'migrations')

const [versao, titulo, descricao] = process.argv.slice(2)

function morrer(mensagem) {
  console.error(`\n  ✖ ${mensagem}\n`)
  process.exit(1)
}

if (!versao || !titulo || !descricao) {
  morrer('uso: npm run release <MAIOR.MENOR.CORRECAO> "<título>" "<descrição>"')
}

if (!/^\d+\.\d+\.\d+$/.test(versao)) {
  morrer(`versão inválida: ${versao} — esperado MAIOR.MENOR.CORRECAO, sem o "v"`)
}

// ---------------------------------------------------------------------------
// A versão nova tem que ser maior que a atual
// ---------------------------------------------------------------------------

const fonteChangelog = readFileSync(CHANGELOG, 'utf-8')

/*
 * Lê a versão do topo do registro por regex, e não importando o módulo: o
 * arquivo usa `~/lib/notificacoes`, um apelido que só existe dentro do Vite. Um
 * `import()` daqui quebraria, e resolver o apelido só para ler uma string seria
 * carregar o bundler inteiro num script de três passos.
 */
const versaoAtual = fonteChangelog.match(/versao:\s*'(\d+\.\d+\.\d+)'/)?.[1]
if (!versaoAtual) morrer(`não achei a versão do topo em ${CHANGELOG}`)

const ordem = (v) => v.split('.').map(Number)
const compara = (a, b) => {
  const [ma, na, ca] = ordem(a)
  const [mb, nb, cb] = ordem(b)
  return ma - mb || na - nb || ca - cb
}

if (compara(versao, versaoAtual) <= 0) {
  morrer(`${versao} não é maior que a versão atual (${versaoAtual})`)
}

// ---------------------------------------------------------------------------
// 1. package.json
// ---------------------------------------------------------------------------

const pacote = JSON.parse(readFileSync(PACKAGE, 'utf-8'))
pacote.version = versao
// `\n` no fim porque é como o npm grava — sem ele, todo release sujaria o diff.
writeFileSync(PACKAGE, `${JSON.stringify(pacote, null, 2)}\n`)

// ---------------------------------------------------------------------------
// 2. app/changelog.ts
// ---------------------------------------------------------------------------

const hoje = new Date()
const data = [
  hoje.getFullYear(),
  String(hoje.getMonth() + 1).padStart(2, '0'),
  String(hoje.getDate()).padStart(2, '0'),
].join('-')

/** Para dentro de string com aspas simples no TS. */
const paraTs = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

const ABERTURA = 'export const LANCAMENTOS: Lancamento[] = ['
if (!fonteChangelog.includes(ABERTURA)) {
  morrer(`não achei "${ABERTURA}" em ${CHANGELOG} — o registro mudou de forma?`)
}

const entrada = [
  '  {',
  `    versao: '${versao}',`,
  `    titulo: '${paraTs(titulo)}',`,
  `    descricao: '${paraTs(descricao)}',`,
  `    data: '${data}',`,
  '  },',
].join('\n')

writeFileSync(CHANGELOG, fonteChangelog.replace(ABERTURA, `${ABERTURA}\n${entrada}`))

// ---------------------------------------------------------------------------
// 3. A migration do anúncio
// ---------------------------------------------------------------------------

/*
 * O nome segue o padrão da CLI do Supabase (`YYYYMMDDHHMMSS_slug.sql`) porque é
 * a ordem em que o `db push` aplica. Em UTC, como a CLI faz: o carimbo é ordem,
 * não hora de leitura, e um arquivo gerado em BRT-3 poderia ordenar antes de um
 * gerado minutos antes por outra máquina.
 */
const carimbo = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
const arquivo = join(MIGRATIONS, `${carimbo}_versao_${versao.replace(/\./g, '_')}.sql`)

/** Para dentro de literal SQL — a aspas simples dobrada é o escape do Postgres. */
const paraSql = (s) => s.replace(/'/g, "''")

const sql = `-- APPingos ${versao} — ${titulo}
--
-- Gerada por \`npm run release\`. O anúncio acontece no \`supabase db push\`: uma
-- notificação para cada usuário, com este texto gravado como snapshot. Reaplicar
-- é inócuo — ver o índice em 20260813024604_notificacoes_versao.sql.
select public.anunciar_versao(
  '${versao}',
  '${paraSql(titulo)}',
  '${paraSql(descricao)}'
);
`

writeFileSync(arquivo, sql)

// ---------------------------------------------------------------------------
// O que falta fazer
// ---------------------------------------------------------------------------

console.log(`
  ✓ APPingos ${versao} preparado

    package.json      versão ${versaoAtual} → ${versao}
    app/changelog.ts  entrada nova no topo
    ${arquivo.replace(`${RAIZ}\\`, '').replace(`${RAIZ}/`, '')}

  Antes de publicar:

    npm run verificar          tipos, imports e testes (inclui o changelog)
    git add -A && git commit
    npx supabase db push       é aqui que a notificação é criada
    git push                   o deploy do Vercel sai daqui
`)
