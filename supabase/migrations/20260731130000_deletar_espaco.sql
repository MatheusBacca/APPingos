-- ============================================================================
-- APPingos — Exclusão de espaço pelo dono.
--
-- A exclusão é definitiva: o cascade em `space_id` já limpa membership,
-- convites, entries, ratings e coleções. Justamente por isso não sobra nada
-- para o membro ler depois — o espaço só sumiria do seletor dele em silêncio.
-- Daí a tabela de aviso: a RPC grava o recado ANTES de apagar, e ele sobrevive
-- ao cascade por não ter FK para `space`.
-- ============================================================================

create table public.space_deletion_notice (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  space_nome         text not null,   -- snapshot: o espaço não existe mais
  deletado_por_nome  text not null,
  deletado_em        timestamptz not null default now(),
  lido_em            timestamptz
);

create index space_deletion_notice_pendente_idx
  on public.space_deletion_notice (user_id) where lido_em is null;

alter table public.space_deletion_notice enable row level security;

create policy space_deletion_notice_select on public.space_deletion_notice
  for select to authenticated
  using (user_id = auth.uid());

-- Só para marcar `lido_em`. Sem policy de insert: quem grava é a RPC abaixo,
-- rodando como owner — assim ninguém fabrica um aviso falso pela API.
create policy space_deletion_notice_update on public.space_deletion_notice
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- RPC
-- ----------------------------------------------------------------------------

create function public.deletar_espaco(p_space uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text;
  v_tipo text;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  if not public.is_space_owner(p_space) then
    raise exception 'só o dono pode excluir este espaço';
  end if;

  select s.nome, s.tipo into v_nome, v_tipo
  from public.space s
  where s.id = p_space;

  if not found then
    raise exception 'espaço não encontrado';
  end if;

  -- O pessoal é criado pelo trigger de novo usuário e é a âncora de quem não
  -- está em nenhum espaço de casal. Sem ele o app fica sem chão.
  if v_tipo = 'pessoal' then
    raise exception 'o espaço pessoal não pode ser excluído';
  end if;

  insert into public.space_deletion_notice (user_id, space_nome, deletado_por_nome)
  select m.user_id, v_nome, coalesce(dono.nome, 'o dono')
  from public.membership m
  left join public.profile dono on dono.id = auth.uid()
  where m.space_id = p_space
    and m.user_id <> auth.uid();

  delete from public.space where id = p_space;
end;
$$;

grant execute on function public.deletar_espaco(uuid) to authenticated;
