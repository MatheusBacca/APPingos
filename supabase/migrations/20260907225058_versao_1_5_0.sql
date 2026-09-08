-- APPingos 1.5.0 — O app na cor de vocês
--
-- Gerada por `npm run release`. O anúncio acontece no `supabase db push`: uma
-- notificação para cada usuário, com este texto gravado como snapshot. Reaplicar
-- é inócuo — ver o índice em 20260813024604_notificacoes_versao.sql.
select public.anunciar_versao(
  '1.5.0',
  'O app na cor de vocês',
  'Escolha entre oito cores de destaque, e o app inteiro acompanha — do brilho do fundo aos botões. As telas ganharam superfícies de vidro, que deixam a luz passar por trás. E o filtro "Todas" em Fotos, que voltava sozinho para "Esperando curtida", parou de voltar.'
);
