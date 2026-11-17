-- APPingos 1.10.0 — O extrato chega na hora
--
-- Gerada por `npm run release`. O anúncio acontece no `supabase db push`: uma
-- notificação para cada usuário, com este texto gravado como snapshot. Reaplicar
-- é inócuo — ver o índice em 20260813024604_notificacoes_versao.sql.
select public.anunciar_versao(
  '1.10.0',
  'O extrato chega na hora',
  'Conectou o banco? Não precisa esperar o dia seguinte: na Caixa de entrada, "Trazer agora" busca os últimos 90 dias do extrato na hora. Quem não apertar recebe tudo do mesmo jeito na sincronização das 7h.'
);
