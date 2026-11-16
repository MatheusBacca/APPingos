/**
 * As regras da importação bancária, do ponto de vista do app.
 *
 * O conteúdo está em `supabase/functions/_shared/importacao-bancaria.ts`, fora
 * de `app/` porque a Edge Function `sincronizar-pluggy` aplica as mesmas regras
 * e o bundler do Deno só enxerga `supabase/functions/`. Mesmo arranjo de
 * `~/lib/notificacoes`.
 */
export * from '../../supabase/functions/_shared/importacao-bancaria'
