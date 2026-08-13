-- APPingos 1.1.0 — Interesses que se comparam por conjunto
--
-- Gerada por `npm run release`. O anúncio acontece no `supabase db push`: uma
-- notificação para cada usuário, com este texto gravado como snapshot. Reaplicar
-- é inócuo — ver o índice em 20260813024604_notificacoes_versao.sql.
select public.anunciar_versao(
  '1.1.0',
  'Interesses que se comparam por conjunto',
  'Um interesse agora tem saídas possíveis — produtos que só valem juntos —, e a comparação é entre elas: dá para juntar e separar produtos arrastando, compartilhar o interesse com o espaço, e escolher na extensão quais preços reler.'
);
