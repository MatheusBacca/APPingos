-- APPingos 1.14.0 — Cada banco com a sua cara, e as caixinhas no Planejamento
--
-- Gerada por `npm run release`. O anúncio acontece no `supabase db push`: uma
-- notificação para cada usuário, com este texto gravado como snapshot. Reaplicar
-- é inócuo — ver o índice em 20260813024604_notificacoes_versao.sql.
select public.anunciar_versao(
  '1.14.0',
  'Cada banco com a sua cara, e as caixinhas no Planejamento',
  'Os bancos aparecem com nome, ícone e cores de verdade, e contas e cartões ganham apelido. O pagamento de fatura entre bancos é reconhecido e sai da caixa sozinho. O salário se ajusta no Planejamento e vale dali em diante. Com o CPF cadastrado, os Pix entre vocês aparecem como "Pinga Fogo transferiu para Bixo Pingo". E as aplicações e resgates do extrato agora vão para caixinhas, que podem alimentar uma meta.'
);
