import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const app = fileURLToPath(new URL('./app', import.meta.url))
// Sem a barra final: o apelido é substituído cru, e `raiz` com barra deixaria
// um separador dobrado no meio do caminho resolvido.
const raiz = fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]+$/, '')

export default defineConfig({
  plugins: [
    vue({
      // Mesmo motivo do nuxt.config: sem acesso ao fs, o compiler-sfc não
      // resolve `defineProps<TipoImportado>()`.
      script: {
        fs: {
          fileExists: (file: string) => fs.existsSync(file),
          readFile: (file: string) => {
            try {
              return fs.readFileSync(file, 'utf-8')
            }
            catch {
              return undefined
            }
          },
          realpath: (file: string) => fs.realpathSync(file),
        },
      },
    }),
  ],

  resolve: {
    alias: [
      // Os mesmos apelidos do Nuxt, para os testes importarem como o app importa.
      // `~~` (raiz do projeto) vem ANTES de `~`: o Vite usa o primeiro apelido
      // que casa, e `~` casaria com `~~/server/...` primeiro, resolvendo para
      // um caminho inexistente dentro de app/.
      { find: '~~', replacement: raiz },
      { find: '~', replacement: app },
      { find: '@', replacement: app },

      /*
       * A extensão do Chrome lê a URL e a anon key de `lib/config.gerado.js`, que
       * `scripts/empacotar-extensao.mjs` escreve a partir do `.env` e o git ignora
       * (ver .gitignore). Sem este mapeamento, `test/extensao-api.test.ts` só
       * rodaria em quem já tivesse rodado `npm run extensao` — e quebraria no CI e
       * em todo clone novo.
       *
       * A regex é ancorada no especificador exato que `extensao/lib/api.js` usa,
       * para não capturar mais nada por acidente.
       */
      {
        find: /^\.\/config\.gerado\.js$/,
        replacement: fileURLToPath(new URL('./test/fixtures/config-extensao.js', import.meta.url)),
      },
    ],
  },

  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
  },
})
