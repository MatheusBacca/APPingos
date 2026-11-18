-- APPingos 1.11.0 — Cartões, categorias e a caixa que aprende
--
-- Gerada por `npm run release`. O anúncio acontece no `supabase db push`: uma
-- notificação para cada usuário, com este texto gravado como snapshot. Reaplicar
-- é inócuo — ver o índice em 20260813024604_notificacoes_versao.sql.
select public.anunciar_versao(
  '1.11.0',
  'Cartões, categorias e a caixa que aprende',
  'Open Finance abre nos seus cartões: a fatura aberta, quando fecha e vence e quanto do limite já foi. As compras ganham o ícone da categoria e o selo da loja, e a caixa de entrada aprende com as suas escolhas — o que ela já sabe, você aceita num toque.'
);
