-- APPingos 1.4.0 — O painel mostra, e você arruma
--
-- Gerada por `npm run release`. O anúncio acontece no `supabase db push`: uma
-- notificação para cada usuário, com este texto gravado como snapshot. Reaplicar
-- é inócuo — ver o índice em 20260813024604_notificacoes_versao.sql.
select public.anunciar_versao(
  '1.4.0',
  'O painel mostra, e você arruma',
  'A tela inicial virou vitrine: os três últimos meses de gasto, os próximos filmes, as fotos liberadas passando sozinhas, a última música ouvida no espaço, o mapa da próxima viagem e os interesses em aberto. Pela engrenagem dá para reordenar, redimensionar e esconder cada cartão — e o conteúdo de cada um acompanha o tamanho que você deu.'
);
