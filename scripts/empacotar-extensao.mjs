/**
 * Prepara a extensão do Chrome para instalar e para distribuir.
 *
 *   npm run extensao
 *
 * Faz três coisas, nesta ordem:
 *
 *   1. Escreve `extensao/lib/config.gerado.js` com a URL e a anon key lidas do
 *      `.env` — as MESMAS variáveis que o app usa (`SUPABASE_URL`/`SUPABASE_KEY`,
 *      sem prefixo `NUXT_`, porque são do @nuxtjs/supabase).
 *   2. Copia a pasta para `extensao/dist/appingos-extensao/`.
 *   3. Zipa essa cópia.
 *
 * ## Por que o config é gerado e não commitado
 *
 * O `.env` não vai para o git, e o ref do projeto no Supabase não deveria virar
 * texto versionado. Gerar resolve os dois e mantém uma fonte de verdade só para as
 * credenciais — mexer no `.env` já basta, sem um segundo arquivo a lembrar.
 *
 * ## O que instalar, afinal
 *
 * Para usar no dia a dia, carregue **`extensao/`** sem compactação (o passo 1 põe o
 * config lá, então a pasta funciona direto, e um `git pull` já atualiza a extensão
 * sem repetir nada). O `.zip` serve para levar de uma máquina à outra e, depois,
 * para subir na Chrome Web Store — ver `extensao/README.md`.
 */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const executar = promisify(execFile)

const raiz = resolve(import.meta.dirname, '..')
const extensao = resolve(raiz, 'extensao')
const dist = resolve(extensao, 'dist')

/** Os arquivos e pastas que entram no pacote — lista explícita, não "tudo menos". */
const CONTEUDO = ['manifest.json', 'popup.html', 'popup.css', 'popup.js', 'lib', 'icones']

// ---- 1. Ler o .env ---------------------------------------------------------

/**
 * Um parser de .env de três linhas, em vez da dependência `dotenv`.
 *
 * O formato que o projeto usa é `CHAVE=valor` sem aspas, sem multilinha e sem
 * interpolação — ler isso não justifica um pacote a mais no `package.json`.
 */
async function lerEnv() {
  const valores = {}

  let bruto
  try {
    bruto = await readFile(resolve(raiz, '.env'), 'utf8')
  }
  catch {
    return valores
  }

  for (const linha of bruto.split('\n')) {
    const corte = linha.indexOf('=')
    if (corte < 1 || linha.trimStart().startsWith('#')) continue
    valores[linha.slice(0, corte).trim()] = linha.slice(corte + 1).trim()
  }

  return valores
}

const env = { ...(await lerEnv()), ...process.env }

const url = env.SUPABASE_URL
const key = env.SUPABASE_KEY

/*
 * Onde o link "Abrir no APPingos" aponta. O padrão é produção; passe
 * APP_URL=http://localhost:3000 para testar a extensão contra o dev server.
 *
 * `||` e não `??`: uma variável de ambiente NÃO definida no GitHub Actions chega
 * como string vazia, não como undefined — e `?? ` deixaria passar o vazio, gerando
 * um link para lugar nenhum. O mesmo vale para um `APP_URL=` solto no .env.
 */
const appUrl = env.APP_URL?.trim() || 'https://appingos.vercel.app'

if (!url || !key) {
  console.error(
    'Faltam SUPABASE_URL e/ou SUPABASE_KEY.\n'
    + 'Local: preencha o .env (copie de .env.example) — são os mesmos valores do app.\n'
    + 'No CI: cadastre os dois em Settings → Secrets and variables → Actions.',
  )
  process.exit(1)
}

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) {
  // O manifest declara host_permissions para https://*.supabase.co/*. Uma URL fora
  // desse padrão (self-hosted, porta local) passaria daqui e falharia só no
  // primeiro fetch, com um erro de CORS que não explica nada.
  console.error(
    `SUPABASE_URL fora do padrão esperado: ${url}\n`
    + 'A extensão declara host_permissions para https://*.supabase.co/* —\n'
    + 'para um projeto self-hosted, ajuste extensao/manifest.json também.',
  )
  process.exit(1)
}

const versao = JSON.parse(await readFile(resolve(extensao, 'manifest.json'), 'utf8')).version

await writeFile(
  resolve(extensao, 'lib/config.gerado.js'),
  `/*
 * GERADO por scripts/empacotar-extensao.mjs — não edite à mão, não commite.
 * Regerar: npm run extensao
 *
 * A anon key aqui é pública por desenho, exatamente como no bundle do app web.
 * Ela sozinha não abre nada: quem autoriza é o JWT do usuário, e quem protege os
 * dados é a RLS por is_space_member().
 */
export const SUPABASE_URL = ${JSON.stringify(url.replace(/\/$/, ''))}
export const SUPABASE_KEY = ${JSON.stringify(key)}
export const APP_URL = ${JSON.stringify(appUrl.replace(/\/$/, ''))}
`,
  'utf8',
)

console.log('✔ extensao/lib/config.gerado.js')
console.log(`  Supabase: ${url}`)
console.log(`  App:      ${appUrl}`)

// ---- 2. Copiar para dist ---------------------------------------------------

const pasta = resolve(dist, 'appingos-extensao')

await rm(dist, { recursive: true, force: true })
await mkdir(pasta, { recursive: true })

for (const item of CONTEUDO) {
  await cp(resolve(extensao, item), resolve(pasta, item), { recursive: true })
}

// ---- 3. Zipar --------------------------------------------------------------

const zip = resolve(dist, `appingos-extensao-${versao}.zip`)

/**
 * `zip` do sistema quando existe; senão, um ZIP escrito à mão.
 *
 * O fallback existe porque `zip` não vem instalado no Windows nem em toda imagem
 * de CI, e o Node não traz compressão de arquivo na biblioteca padrão. São ~50
 * linhas de formato ZIP contra uma dependência de build — e o Chrome só pede
 * "stored" (sem compressão), que é a metade fácil do formato.
 */
async function zipar() {
  try {
    await executar('zip', ['-qr', zip, 'appingos-extensao'], { cwd: dist })
    return 'zip do sistema'
  }
  catch {
    await ziparNativo()
    return 'implementação interna (sem compressão)'
  }
}

async function ziparNativo() {
  const { readdir, stat } = await import('node:fs/promises')

  const entradas = []

  async function varrer(dir, prefixo) {
    for (const nome of (await readdir(dir)).sort()) {
      const caminho = resolve(dir, nome)
      const info = await stat(caminho)
      if (info.isDirectory()) await varrer(caminho, `${prefixo}${nome}/`)
      else entradas.push({ nome: `${prefixo}${nome}`, dados: await readFile(caminho) })
    }
  }

  await varrer(pasta, 'appingos-extensao/')

  const CRC = (() => {
    const tabela = new Int32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
      tabela[i] = c
    }
    return (buffer) => {
      let c = -1
      for (const byte of buffer) c = tabela[(c ^ byte) & 0xFF] ^ (c >>> 8)
      return (c ^ -1) >>> 0
    }
  })()

  const locais = []
  const centrais = []
  let deslocamento = 0

  for (const { nome, dados } of entradas) {
    const bytesNome = Buffer.from(nome, 'utf8')
    const crc = CRC(dados)

    const local = Buffer.alloc(30 + bytesNome.length)
    local.writeUInt32LE(0x04034B50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // nomes em UTF-8
    local.writeUInt16LE(0, 8) // método 0 = stored
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(dados.length, 18)
    local.writeUInt32LE(dados.length, 22)
    local.writeUInt16LE(bytesNome.length, 26)
    bytesNome.copy(local, 30)

    const central = Buffer.alloc(46 + bytesNome.length)
    central.writeUInt32LE(0x02014B50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(dados.length, 20)
    central.writeUInt32LE(dados.length, 24)
    central.writeUInt16LE(bytesNome.length, 28)
    central.writeUInt32LE(deslocamento, 42)
    bytesNome.copy(central, 46)

    locais.push(local, dados)
    centrais.push(central)
    deslocamento += local.length + dados.length
  }

  const centralInteiro = Buffer.concat(centrais)
  const fim = Buffer.alloc(22)
  fim.writeUInt32LE(0x06054B50, 0)
  fim.writeUInt16LE(entradas.length, 8)
  fim.writeUInt16LE(entradas.length, 10)
  fim.writeUInt32LE(centralInteiro.length, 12)
  fim.writeUInt32LE(deslocamento, 16)

  await writeFile(zip, Buffer.concat([...locais, centralInteiro, fim]))
}

const como = await zipar()
const bytes = (await readFile(zip)).length

console.log(`✔ ${zip.replace(`${raiz}/`, '')} (${(bytes / 1024).toFixed(1)} kB, ${como})`)
console.log('')
console.log('Para instalar: chrome://extensions → modo desenvolvedor →')
console.log('"Carregar sem compactação" apontando para a pasta extensao/')
