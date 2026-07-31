/**
 * UUID do usuário logado, ou null.
 *
 * Existe porque `useSupabaseUser()` do @nuxtjs/supabase v2 devolve as *claims*
 * do JWT, onde o id do usuário vem em `sub` — e não um objeto `User`, que teria
 * `id`. Ler `.id` direto retorna undefined silenciosamente: as queries nunca
 * habilitam e as avaliações do próprio usuário nunca casam.
 *
 * O fallback para `.id` mantém isto funcionando caso o módulo volte a entregar
 * um `User` completo.
 */
export function useUsuarioId() {
  const user = useSupabaseUser()

  return computed<string | null>(() => {
    const u = user.value as { sub?: string, id?: string } | null
    return u?.sub ?? u?.id ?? null
  })
}
