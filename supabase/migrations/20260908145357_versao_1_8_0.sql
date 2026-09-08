-- APPingos 1.8.0 — Menos tela, mais resposta
--
-- Gerada por `npm run release`. O anúncio acontece no `supabase db push`: uma
-- notificação para cada usuário, com este texto gravado como snapshot. Reaplicar
-- é inócuo — ver o índice em 20260813024604_notificacoes_versao.sql.
select public.anunciar_versao(
  '1.8.0',
  'Menos tela, mais resposta',
  'O acerto do mês saiu do card e virou uma linha na barra de Orçamentos, com a conta a um clique — e "Em que foi" agora alterna entre as categorias e a lista corrida das compras do mês. Em Filmes, o plano que ninguém cumpriu volta sozinho para Disponível depois de dois dias, o calendário marca uma bolinha por filme (e não uma por pessoa), e o cartaz da busca abre a ficha com sinopse antes de você adicionar. Em Objetivos dá para mover o status pelo próprio card e ver de quem é cada interesse e quem vai dar de presente. E os seus Pins agora aparecem ao lado do seu nome na tela inicial, com um fogo quando algum hotspot está multiplicando.'
);
