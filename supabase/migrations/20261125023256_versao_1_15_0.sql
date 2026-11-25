-- APPingos 1.15.0 — Orçamentos num painel só
--
-- Gerada por `npm run release`. O anúncio acontece no `supabase db push`: uma
-- notificação para cada usuário, com este texto gravado como snapshot. Reaplicar
-- é inócuo — ver o índice em 20260813024604_notificacoes_versao.sql.
select public.anunciar_versao(
  '1.15.0',
  'Orçamentos num painel só',
  'O mês inteiro numa tela: o saldo das contas, os gastos com as faturas abertas, o salário repartido entre faturas, investido e livre, o planejado semana a semana e as últimas movimentações do extrato. Cada cartão abre a sua tela, em tela larga no computador, e o "Como funciona" explica cada número.'
);
