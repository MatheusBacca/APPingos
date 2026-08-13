-- APPingos 1.0.0 — Novidades, com versão e changelog
--
-- A primeira do formato, e escrita à mão porque é a que estreia o mecanismo — as
-- próximas saem de `npm run release`. O anúncio acontece no `supabase db push`:
-- uma notificação para cada usuário, com este texto gravado como snapshot.
-- Reaplicar é inócuo — ver o índice em 20260813024604_notificacoes_versao.sql.
--
-- As versões retroativas (v0.001.0 a v0.008.0) NÃO são anunciadas: elas existem
-- só na timeline de `/novidades`, para o histórico não começar vazio. Anunciar
-- oito releases de uma vez seria estrear a feature com oito avisos não lidos.
select public.anunciar_versao(
  '1.0.0',
  'Novidades, com versão e changelog',
  'O app passa a ter versão, e cada atualização vira um aviso na sua caixa e uma parada nesta timeline.'
);
