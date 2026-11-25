-- APPingos 1.16.0 — Cada espaço no seu painel
--
-- Gerada por `npm run release`. O anúncio acontece no `supabase db push`: uma
-- notificação para cada usuário, com este texto gravado como snapshot. Reaplicar
-- é inócuo — ver o índice em 20260813024604_notificacoes_versao.sql.
select public.anunciar_versao(
  '1.16.0',
  'Cada espaço no seu painel',
  'O painel de Orçamentos agora segue o espaço aberto: o Planejamento mostra os gastos do espaço semana a semana, com o acerto do mês no compartilhado e o que você tem a pagar do salário no pessoal. Gastos do mês e Em que foi começam pelo espaço aberto e mostram, numa linha por espaço, quanto os outros tiram do seu mês. As cores da barra do salário se ajustam em Espaços › Seu salário, e o painel se acomoda em celular, tablet e computador.'
);
