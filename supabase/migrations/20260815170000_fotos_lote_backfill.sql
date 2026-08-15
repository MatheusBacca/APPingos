-- ============================================================================
-- APPingos — Fotos: reconstruir os lotes de quem subiu antes da coluna.
--
-- A migration anterior deu a cada foto existente o seu próprio `lote_id`, e o
-- comentário de lá defendia isso: um lote só para tudo o que veio antes juntaria
-- numa faixa fotos de dias diferentes.
--
-- O que aquele raciocínio não viu é que o envio em lote deixa uma assinatura
-- exata. As fotos de um envio entram num ÚNICO insert, e num único insert todas as
-- linhas recebem o mesmo `now()` — que no Postgres é o instante da TRANSAÇÃO, não
-- o de cada linha. Não é um "quase ao mesmo tempo" com tolerância a escolher: é
-- igualdade, ao microssegundo, e ela só acontece dentro da mesma transação.
--
-- Então dá para reconstruir os lotes sem adivinhar nada, e o efeito é visível: as
-- três fotos que já estavam lá subiram juntas e apareciam como três faixas de uma
-- foto cada — o oposto do que a coluna foi criada para mostrar.
--
-- `space_id` e `enviada_por` entram na chave junto com o instante. Não porque duas
-- pessoas gravariam no mesmo microssegundo (não gravariam), mas porque um lote é
-- "o que fulano mandou de uma vez" — e uma chave que só olhasse o relógio estaria
-- certa por sorte, não por definição.
-- ============================================================================

/*
  O trigger precisa sair do caminho: `foto_origem_protegida` recusa qualquer update
  em `lote_id`, e ele está certo em recusar — a proteção existe justamente para que
  ninguém remonte as faixas da galeria por fora da tela.

  Esta é a exceção que a regra prevê: uma migration versionada, com o motivo
  escrito, que desliga a proteção, corrige o passado e a religa na mesma transação.
  Se algo estourar no meio, o rollback devolve o trigger junto com os dados.
*/
alter table public.foto disable trigger foto_origem_protegida;

with lotes as (
  select
    space_id,
    enviada_por,
    created_at,
    -- Um id novo por grupo, e não o `lote_id` de uma das linhas: reaproveitar o de
    -- uma delas daria certo e faria o resultado depender de qual linha o Postgres
    -- devolvesse primeiro, que é o tipo de detalhe que não se deve dever a sorte.
    gen_random_uuid() as novo_lote
  from public.foto
  group by space_id, enviada_por, created_at
  having count(*) > 1
)
update public.foto f
   set lote_id = l.novo_lote
  from lotes l
 where f.space_id = l.space_id
   and f.enviada_por = l.enviada_por
   and f.created_at = l.created_at;

alter table public.foto enable trigger foto_origem_protegida;
