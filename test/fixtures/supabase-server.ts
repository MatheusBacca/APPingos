/**
 * Substituto de `#supabase/server` para os testes.
 *
 * `#supabase/server` é um alias virtual criado pelo módulo @nuxtjs/supabase
 * durante o build do Nitro — fora do Nuxt ele simplesmente não existe, e o
 * import derruba o arquivo inteiro na coleta do Vitest.
 *
 * Os testes que passam por aqui exercitam funções PURAS de módulos que também
 * conversam com o banco (`linhasDePlaylist`, por exemplo). Elas não tocam
 * nestas funções — o stub existe só para o módulo carregar. Por isso ele
 * ESTOURA se alguém chamar: um teste que dependa de verdade do Supabase
 * precisa de outra abordagem, e falhar alto é melhor do que passar contra um
 * cliente falso que devolve vazio.
 */
function naoUseEmTeste(nome: string): never {
  throw new Error(
    `${nome} não está disponível em teste — este stub existe só para o módulo carregar. `
    + 'Extraia a lógica pura ou monte um teste de integração de verdade.',
  )
}

export function serverSupabaseClient(): never {
  return naoUseEmTeste('serverSupabaseClient')
}

export function serverSupabaseUser(): never {
  return naoUseEmTeste('serverSupabaseUser')
}

export function serverSupabaseSession(): never {
  return naoUseEmTeste('serverSupabaseSession')
}

export function serverSupabaseServiceRole(): never {
  return naoUseEmTeste('serverSupabaseServiceRole')
}
