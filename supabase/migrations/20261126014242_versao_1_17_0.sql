-- APPingos 1.17.0 — O acerto entra no salário
--
-- Gerada por `npm run release`. O anúncio acontece no `supabase db push`: uma
-- notificação para cada usuário, com este texto gravado como snapshot. Reaplicar
-- é inócuo — ver o índice em 20260813024604_notificacoes_versao.sql.
select public.anunciar_versao(
  '1.17.0',
  'O acerto entra no salário',
  'O Salário do mês virou uma conta: as faturas com o que você vai receber ou deve no acerto, o investido e o que sobra do salário. Um olho ao lado de "Como funciona" esconde os valores de Orçamentos, e os investimentos agora moram no Planejamento.'
);
