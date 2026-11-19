-- APPingos 1.12.0 — A caixa por mês, e o que falta no acerto
--
-- Gerada por `npm run release`. O anúncio acontece no `supabase db push`: uma
-- notificação para cada usuário, com este texto gravado como snapshot. Reaplicar
-- é inócuo — ver o índice em 20260813024604_notificacoes_versao.sql.
select public.anunciar_versao(
  '1.12.0',
  'A caixa por mês, e o que falta no acerto',
  'A Caixa de entrada agora vai mês a mês, com um calendário ao lado que mostra quantas compras chegaram em cada dia — toque num dia para ver só ele, e o que ficou de meses anteriores está a um toque. No Chico Moedas, as compras do cartão do casal que ainda esperam destino aparecem antes do acerto, e os dois veem quantas faltam. E Orçamentos parou de escapar da tela no celular.'
);
