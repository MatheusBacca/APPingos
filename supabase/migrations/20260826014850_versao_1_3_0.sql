-- APPingos 1.3.0 — Memória da viagem
--
-- Gerada por `npm run release`. O anúncio acontece no `supabase db push`: uma
-- notificação para cada usuário, com este texto gravado como snapshot. Reaplicar
-- é inócuo — ver o índice em 20260813024604_notificacoes_versao.sql.
select public.anunciar_versao(
  '1.3.0',
  'Memória da viagem',
  'Quando a viagem termina, o roteiro vira caderno: seções por dia, as fotos do mural e as músicas que tocaram, tudo em folhas A4 prontas para baixar em PDF. O app avisa no dia seguinte ao fim da viagem, e de novo quando alguém fecha o documento.'
);
