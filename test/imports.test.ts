/**
 * A regressão do bug de 05/08/2026.
 *
 * Um arquivo que dependia do auto-import de `app/composables/` foi servido sem
 * os imports injetados (transform do Vite cacheado no meio da reconstrução do
 * scan), estourou `useConvitesFilme is not defined` em runtime e derrubou o app
 * inteiro — sem erro de build e sem erro de tipo para avisar.
 *
 * Este teste é a trava: se alguém voltar a contar com o auto-import do projeto,
 * quebra aqui, e não na tela.
 */
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('imports do projeto', () => {
  it('nenhum arquivo do app depende do auto-import de composables/stores', () => {
    // `process.cwd()` é a raiz do projeto sob o Vitest — `import.meta.url` aqui
    // não é uma URL file://, e sim o caminho do módulo transformado.
    try {
      execFileSync(process.execPath, ['scripts/verificar-imports.mjs'], {
        cwd: process.cwd(),
        encoding: 'utf8',
      })
    }
    catch (e) {
      const erro = e as { stdout?: string, stderr?: string }
      expect.fail(`${erro.stdout ?? ''}${erro.stderr ?? ''}`)
    }
  })
})
