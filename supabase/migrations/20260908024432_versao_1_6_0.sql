-- APPingos 1.6.0 — Pins, a moeda de vocês
--
-- Gerada por `npm run release`. O anúncio acontece no `supabase db push`: uma
-- notificação para cada usuário, com este texto gravado como snapshot. Reaplicar
-- é inócuo — ver o índice em 20260813024604_notificacoes_versao.sql.
select public.anunciar_versao(
  '1.6.0',
  'Pins, a moeda de vocês',
  'Lançar um gasto, marcar um filme, curtir uma foto ou fechar o mês gastando o mesmo que o anterior agora rende Pins — e o outro fica sabendo por quanto e por quê. Fim de semana, viagem em curso e dias seguidos multiplicam o que você ganhou, e o extrato explica a conta de cada conquista.'
);
