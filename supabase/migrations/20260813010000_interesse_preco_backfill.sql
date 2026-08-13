-- ============================================================================
-- APPingos — o histórico dos produtos que já existiam.
--
-- O trigger `interesse_produto_preco_inicial` só dispara em INSERT, então os
-- produtos capturados ANTES da migration anterior ficaram sem a primeira linha de
-- histórico. Na primeira rechecagem que mudasse alguma coisa, o preço de quando a
-- pessoa decidiu salvar — o mais interessante de todos, porque é o que motivou o
-- interesse — simplesmente não estaria em lugar nenhum.
--
-- Migration separada, e não uma alteração na anterior: aquela já foi aplicada, e
-- reescrever migration aplicada é o começo da deriva entre o git e o banco.
--
-- `visto_em` recebe `capturado_em`, e não `now()`: a observação aconteceu quando a
-- extensão leu a página, não agora. Carimbar com a data de hoje faria o gráfico
-- futuro mostrar todos os produtos "vistos" no mesmo instante.
--
-- Idempotente pelo `not exists`: num banco novo não há o que preencher e a
-- migration é um no-op, o que mantém `db reset` e a nuvem com o mesmo resultado.
-- ============================================================================

insert into public.interesse_produto_preco (
  produto_id, preco, preco_pix, parcelas, valor_parcela, visto_em
)
select p.id, p.preco, p.preco_pix, p.parcelas, p.valor_parcela, p.capturado_em
from public.interesse_produto p
where (p.preco is not null or p.preco_pix is not null)
  and not exists (
    select 1 from public.interesse_produto_preco h where h.produto_id = p.id
  );
