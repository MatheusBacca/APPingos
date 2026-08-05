import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const app = fileURLToPath(new URL('./app', import.meta.url))

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

  // Os mesmos apelidos do Nuxt, para os testes importarem como o app importa.
  resolve: {
    alias: { '~': app, '@': app },
  },

  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
  },
})
