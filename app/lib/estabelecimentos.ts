/**
 * Quem é o estabelecimento de uma transação, do ponto de vista do app.
 *
 * O conteúdo está em `supabase/functions/_shared/estabelecimentos.ts`, fora de
 * `app/` porque a chave do estabelecimento precisa ser a mesma no app (que
 * classifica e aprende) e na Edge Function `sincronizar-pluggy` (que um dia
 * aplica a regra `automatica`), e o bundler do Deno só enxerga
 * `supabase/functions/`. Mesmo arranjo de `~/lib/importacao-bancaria`.
 */
export * from '../../supabase/functions/_shared/estabelecimentos'
