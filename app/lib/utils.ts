import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Mensagem de erro para mostrar ao usuário.
 *
 * `e instanceof Error` não serve aqui: o supabase-js rejeita com objetos
 * simples (`PostgrestError`, `AuthError`), não com `Error`. Usar só o
 * `instanceof` fazia toda mensagem vinda do banco cair no texto genérico — foi
 * assim que um "este convite já foi usado" apareceu como "Código inválido.".
 */
export function mensagemDeErro(e: unknown, fallback: string): string {
  /*
   * O corpo antes do `message` do erro, quando vem de uma rota nossa.
   *
   * O `message` de um FetchError é montado pelo ofetch como
   * `[GET] "/api/spotify/busca?q=radiohead": 503 ...` — mostra o método e a URL
   * para quem só queria saber o que deu errado, e vem com os acentos comidos,
   * porque a parte final dele é o `statusMessage`, que viaja na linha de status
   * do HTTP (latin-1). O mesmo texto chega inteiro no corpo JSON, que é UTF-8.
   */
  if (typeof e === 'object' && e !== null && 'data' in e) {
    const corpo = (e as { data?: unknown }).data
    if (typeof corpo === 'object' && corpo !== null) {
      const msg = (corpo as { message?: unknown }).message
      if (typeof msg === 'string' && msg.trim()) return msg
    }
  }

  if (typeof e === 'object' && e !== null && 'message' in e) {
    const msg = (e as { message?: unknown }).message
    if (typeof msg === 'string' && msg.trim()) return msg
  }
  return fallback
}
