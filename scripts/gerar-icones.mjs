/**
 * Gera os PNGs do PWA e da extensão do Chrome a partir de assets/icone-origem.svg.
 *
 * Rode depois de mexer no SVG:  npm run icones
 *
 * A versão maskable ganha padding extra: Android recorta o ícone num círculo e
 * come as bordas, então o desenho precisa caber num círculo inscrito.
 *
 * Os quatro tamanhos de `extensao/icones/` são os que o `manifest.json` declara.
 * Eles são COMMITADOS, ao contrário do resto do pacote da extensão: são ativos
 * estáticos, e quem clona o repositório para carregar a extensão sem compactação
 * não deveria precisar do sharp instalado para ter um ícone na barra.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'

const raiz = resolve(import.meta.dirname, '..')
const origem = resolve(raiz, 'assets/icone-origem.svg')
const svg = await readFile(origem)

const alvos = [
  { arquivo: 'public/icons/icon-192.png', tamanho: 192, padding: 0 },
  { arquivo: 'public/icons/icon-512.png', tamanho: 512, padding: 0 },
  { arquivo: 'public/icons/icon-maskable-512.png', tamanho: 512, padding: 0.12 },
  { arquivo: 'public/icons/apple-touch-icon.png', tamanho: 180, padding: 0 },
  // .png e não .ico: o sharp emite PNG, e renomear o arquivo não muda o formato.
  { arquivo: 'public/favicon-32.png', tamanho: 32, padding: 0 },
  { arquivo: 'public/favicon-192.png', tamanho: 192, padding: 0 },
  // Extensão do Chrome — os tamanhos que o manifest.json pede.
  { arquivo: 'extensao/icones/16.png', tamanho: 16, padding: 0 },
  { arquivo: 'extensao/icones/32.png', tamanho: 32, padding: 0 },
  { arquivo: 'extensao/icones/48.png', tamanho: 48, padding: 0 },
  { arquivo: 'extensao/icones/128.png', tamanho: 128, padding: 0 },
]

for (const { arquivo, tamanho, padding } of alvos) {
  const destino = resolve(raiz, arquivo)
  await mkdir(dirname(destino), { recursive: true })

  const interno = Math.round(tamanho * (1 - padding * 2))
  const margem = Math.round((tamanho - interno) / 2)

  let img = sharp(svg, { density: 512 }).resize(interno, interno)

  if (margem > 0) {
    img = img.extend({
      top: margem,
      bottom: margem,
      left: margem,
      right: margem,
      background: '#0f172a',
    })
  }

  const buffer = await img.png().toBuffer()
  await writeFile(destino, buffer)
  console.log(`✔ ${arquivo} (${tamanho}px)`)
}
