-- APPingos 1.13.0 — Cada cartão no seu espaço
--
-- Gerada por `npm run release`. O anúncio acontece no `supabase db push`: uma
-- notificação para cada usuário, com este texto gravado como snapshot. Reaplicar
-- é inócuo — ver o índice em 20260813024604_notificacoes_versao.sql.
select public.anunciar_versao(
  '1.13.0',
  'Cada cartão no seu espaço',
  'O virtual do casal e o físico pessoal da mesma fatura agora vão cada um para o seu lugar. E chegaram o saldo das contas, o fechamento e os juros de cada fatura, a mensagem do Pix e a multa do boleto.'
);
