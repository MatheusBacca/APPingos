/**
 * O texto das notificações, do ponto de vista do app.
 *
 * O conteúdo de verdade está em `supabase/functions/_shared/notificacoes.ts` —
 * fora de `app/` porque a Edge Function que manda os e-mails também o importa, e
 * o bundler do Deno só enxerga o que está dentro de `supabase/functions/`. O
 * porquê inteiro está no cabeçalho de lá.
 *
 * Este arquivo existe para que nenhuma tela precise saber disso: dentro do app,
 * notificação se importa de `~/lib/notificacoes`, como tudo mais.
 */
export * from '../../supabase/functions/_shared/notificacoes'
