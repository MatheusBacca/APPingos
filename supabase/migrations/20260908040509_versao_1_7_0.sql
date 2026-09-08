-- APPingos 1.7.0 — Livros: a estante de vocês
--
-- Gerada por `npm run release`. O anúncio acontece no `supabase db push`: uma
-- notificação para cada usuário, com este texto gravado como snapshot. Reaplicar
-- é inócuo — ver o índice em 20260813024604_notificacoes_versao.sql.
select public.anunciar_versao(
  '1.7.0',
  'Livros: a estante de vocês',
  'Cada um marca o que quer ler, o que está lendo e o que já leu — a estante é dos dois, e a prateleira é de cada um. Clicando no livro tem o resumo e a sua resenha, que trava depois de enviada: você só vê a do outro depois de mandar a sua. E dá para pôr uma meta de leitura do ano, com a barra dos dois lado a lado.'
);
