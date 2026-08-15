-- ============================================================================
-- APPingos — Fotos: o lote e o nome do arquivo.
--
-- Duas colunas, e as duas existem por causa de como fotos de verdade são usadas.
--
-- `lote_id` é o envio: as doze do sábado chegaram JUNTAS, e a galeria precisa
-- mostrá-las juntas. Dava para agrupar por `created_at` — num único insert todas
-- as linhas recebem o mesmo `now()`, que é o instante da transação — e essa é
-- exatamente a razão de não fazer isso: funcionaria por acidente. Bastaria um dia
-- o envio virar duas transações (um retentar parcial, uma fila) para o lote se
-- partir ao meio, sem erro em lugar nenhum e sem nada no código explicando por que
-- as fotos deveriam estar juntas. Uma coluna diz a intenção em vez de deduzi-la.
--
-- `nome_original` é o nome que o arquivo tinha no aparelho, e ele serve a UMA
-- coisa: o download. O arquivo no bucket se chama `<uuid>.jpg` de propósito (ver
-- o cabeçalho de Storage na migration anterior), e baixar quarenta arquivos
-- chamados `9f3a…-e21b.jpg` é o mesmo que não poder baixar. O nome vai para o
-- `Content-Disposition` da URL assinada, nunca para o caminho.
-- ============================================================================

/*
  O default é `gen_random_uuid()`, e não um valor fixo, para que cada foto que já
  existe vire o seu próprio lote de uma.

  A alternativa — um lote só para tudo o que veio antes — juntaria numa mesma
  faixa fotos mandadas em dias diferentes, e o primeiro efeito visível da coluna
  seria uma mentira sobre o passado.
*/
alter table public.foto
  add column lote_id uuid not null default gen_random_uuid();

alter table public.foto
  add column nome_original text;

/*
  Sem índice novo de propósito.

  O agrupamento por lote acontece na tela, sobre as fotos que a consulta do espaço
  já trouxe — não existe consulta "me dê o lote X". `foto_space_idx (space_id,
  created_at desc)` continua sendo o único caminho de leitura, e um índice que
  nenhuma query percorre só custa escrita.
*/

/*
  `lote_id` entra na lista do que não se edita.

  É a mesma família de `space_id` e `caminho`: descreve de onde a linha veio. Um
  update nele mudaria a faixa em que a foto aparece na galeria de outra pessoa,
  sem que nada na tela sugira que isso é possível.

  `nome_original` fica de fora — ele é rótulo, não origem, e as fotos que entraram
  antes desta migration têm o campo nulo e precisam poder recebê-lo.
*/
create or replace function public.foto_origem_protegida()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.space_id is distinct from old.space_id
     or new.enviada_por is distinct from old.enviada_por
     or new.caminho is distinct from old.caminho
     or new.lote_id is distinct from old.lote_id then
    raise exception 'a origem da foto não muda — apague e envie de novo';
  end if;

  return new;
end;
$$;
