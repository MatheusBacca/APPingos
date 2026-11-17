-- APPingos 1.10.1 — Open Finance numa aba só
--
-- Gerada por `npm run release`. O anúncio acontece no `supabase db push`: uma
-- notificação para cada usuário, com este texto gravado como snapshot. Reaplicar
-- é inócuo — ver o índice em 20260813024604_notificacoes_versao.sql.
select public.anunciar_versao(
  '1.10.1',
  'Open Finance numa aba só',
  'Em Orçamentos, Caixa de entrada, Contas e o guia agora moram juntos na aba Open Finance, cada um numa seção. E as abas subiram para o lado do título, com o botão da tela logo abaixo delas.'
);
