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
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const msg = (e as { message?: unknown }).message
    if (typeof msg === 'string' && msg.trim()) return msg
  }
  return fallback
}
