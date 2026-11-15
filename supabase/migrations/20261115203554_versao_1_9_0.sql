-- APPingos 1.9.0 — Planejamento e Open Finance
--
-- Gerada por `npm run release`. O anúncio acontece no `supabase db push`: uma
-- notificação para cada usuário, com este texto gravado como snapshot. Reaplicar
-- é inócuo — ver o índice em 20260813024604_notificacoes_versao.sql.
select public.anunciar_versao(
  '1.9.0',
  'Planejamento e Open Finance',
  'Orçamentos ganhou a aba Planejamento: cada um informa o salário e vê quanto entra no casal e como o mês fecha. Em Objetivos, as metas têm aportes, progresso e uma sugestão de quanto guardar por mês, e um interesse vira meta com um toque. E dá para conectar o banco pelo Open Finance: o extrato chega numa caixa de entrada só sua, onde você decide se cada gasto é do casal ou só seu, e o Pix do acerto marca o mês como pago sozinho.'
);
