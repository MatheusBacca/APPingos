-- ============================================================================
-- APPingos — Viagens: parada desligada continua no roteiro, fora da rota.
--
-- Montar um roteiro é descartar coisas: o museu que não caberia no sábado, a
-- praia que ficou longe demais. Hoje o único jeito de tirar uma parada da rota é
-- apagá-la — e com ela vai o endereço já pesquisado, a anotação e a memória de
-- que aquilo foi considerado. Quem muda de ideia de volta pesquisa tudo outra
-- vez.
--
-- Daí uma coluna e não uma tabela de "descartadas": a parada não sai do roteiro,
-- ela sai da ROTA. Continua na lista, continua no dia, continua com anotação — o
-- que muda é que mapa, links e atalhos do dia deixam de contá-la. É um bit sobre
-- a mesma linha, e a alternativa (mover a linha para outro lugar) faria reativar
-- ser uma reinserção, com ordem nova e id novo.
--
-- `not null default false` porque toda parada que existe hoje está ligada: uma
-- parada desativada é sempre resultado de alguém ter desligado, nunca de uma
-- linha que nasceu sem opinião.
-- ============================================================================

alter table public.parada
  add column desativada boolean not null default false;

/*
  `salvar_paradas` reescrita para carregar o bit novo.

  A RPC continua substituindo a lista inteira — ver o comentário original em
  20260809160118_viagens.sql, que ainda vale palavra por palavra. A única
  diferença é que `desativada` viaja no mesmo jsonb, com `coalesce` para falso:
  um cliente antigo (a aba que ficou aberta durante o deploy) manda paradas sem
  o campo, e o pior que pode acontecer é uma parada voltar ligada — nunca um
  erro de "campo obrigatório ausente" no meio do salvamento automático.

  `p_paradas` é jsonb no formato:
    [{"google_place_id": "...", "nome": "...", "endereco": "...",
      "dia": 1, "anotacao": "...", "desativada": false}, ...]
*/
create or replace function public.salvar_paradas(p_roteiro uuid, p_paradas jsonb)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_total int;
begin
  if jsonb_typeof(p_paradas) <> 'array' then
    raise exception 'a lista de paradas precisa ser um array';
  end if;

  if not public.pode_ver_roteiro(p_roteiro) then
    raise exception 'você não pode editar este roteiro';
  end if;

  delete from public.parada where roteiro_id = p_roteiro;

  insert into public.parada (
    roteiro_id, ordem, google_place_id, nome, endereco, dia, anotacao, desativada
  )
  select
    p_roteiro,
    (p.posicao - 1)::int,
    nullif(trim(coalesce(p.item ->> 'google_place_id', '')), ''),
    trim(p.item ->> 'nome'),
    nullif(trim(coalesce(p.item ->> 'endereco', '')), ''),
    nullif(p.item ->> 'dia', '')::int,
    nullif(trim(coalesce(p.item ->> 'anotacao', '')), ''),
    coalesce((p.item ->> 'desativada')::boolean, false)
  from jsonb_array_elements(p_paradas) with ordinality as p(item, posicao);

  get diagnostics v_total = row_count;

  -- Toca o roteiro para que "atualizado em" reflita a mexida nas paradas, e não
  -- só a edição do cabeçalho.
  update public.roteiro set updated_at = now() where id = p_roteiro;

  return v_total;
end;
$$;

grant execute on function public.salvar_paradas(uuid, jsonb) to authenticated;
