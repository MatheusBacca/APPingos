-- APPingos 1.2.0 — Músicas, com o Spotify de cada um
--
-- Gerada por `npm run release`. O anúncio acontece no `supabase db push`: uma
-- notificação para cada usuário, com este texto gravado como snapshot. Reaplicar
-- é inócuo — ver o índice em 20260813024604_notificacoes_versao.sql.
select public.anunciar_versao(
  '1.2.0',
  'Músicas, com o Spotify de cada um',
  'O módulo Músicas estreia: busquem faixas e álbuns e avaliem juntos, tragam as playlists de cada um para o espaço e favoritem as que são de vocês. Com a conta conectada, dá para ver na barra lateral o que a outra pessoa está ouvindo agora.'
);
