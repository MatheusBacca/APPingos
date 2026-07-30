-- ============================================================================
-- APPingos — Fundação: perfis, espaços (pessoal/casal) e isolamento por RLS.
--
-- Regra que vale para todo o resto do app: nenhuma tabela de domínio guarda
-- user_id como dono. Ela guarda space_id. "Pessoal" e "do casal" são o mesmo
-- código rodando em espaços diferentes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabelas
-- ----------------------------------------------------------------------------

create table public.profile (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text not null,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

create table public.space (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('pessoal', 'casal')),
  nome        text not null,
  created_at  timestamptz not null default now()
);

create table public.membership (
  space_id    uuid not null references public.space (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  papel       text not null default 'membro' check (papel in ('dono', 'membro')),
  created_at  timestamptz not null default now(),
  primary key (space_id, user_id)
);

-- Convite por código curto: sem SMTP, sem link mágico. A gera o código, B digita.
create table public.space_invite (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.space (id) on delete cascade,
  codigo      text not null unique,
  criado_por  uuid not null references auth.users (id) on delete cascade,
  expira_em   timestamptz not null default now() + interval '7 days',
  usado_em    timestamptz,
  usado_por   uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Índices que as policies percorrem em toda consulta. Sem eles, RLS fica caro.
create index membership_user_id_idx on public.membership (user_id);
create index space_invite_space_id_idx on public.space_invite (space_id);
create index space_invite_codigo_idx on public.space_invite (codigo) where usado_em is null;

-- ----------------------------------------------------------------------------
-- Helpers de autorização
--
-- Por que SECURITY DEFINER: uma policy em `membership` que consultasse
-- `membership` dispararia "infinite recursion detected in policy". Rodando como
-- owner, a consulta interna ignora RLS e o ciclo se rompe. STABLE permite ao
-- planner reaproveitar o resultado dentro da mesma query.
-- `search_path = ''` evita que um schema no path do chamador sequestre os nomes,
-- e é por isso que tudo aqui está qualificado com `public.`.
-- ----------------------------------------------------------------------------

create function public.is_space_member(p_space uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.membership m
    where m.space_id = p_space
      and m.user_id = auth.uid()
  );
$$;

create function public.is_space_owner(p_space uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.membership m
    where m.space_id = p_space
      and m.user_id = auth.uid()
      and m.papel = 'dono'
  );
$$;

-- Usado pela policy de `profile`: você vê o perfil de quem divide um espaço com você.
create function public.shares_space_with(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.membership meu
    join public.membership dele on dele.space_id = meu.space_id
    where meu.user_id = auth.uid()
      and dele.user_id = p_user
  );
$$;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.profile enable row level security;
alter table public.space enable row level security;
alter table public.membership enable row level security;
alter table public.space_invite enable row level security;

-- profile
create policy profile_select on public.profile
  for select to authenticated
  using (id = auth.uid() or public.shares_space_with(id));

create policy profile_update on public.profile
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- space — criação só via RPC create_space (um espaço órfão não deve existir)
create policy space_select on public.space
  for select to authenticated
  using (public.is_space_member(id));

create policy space_update on public.space
  for update to authenticated
  using (public.is_space_owner(id))
  with check (public.is_space_owner(id));

create policy space_delete on public.space
  for delete to authenticated
  using (public.is_space_owner(id) and tipo <> 'pessoal');

-- membership — leitura via helper (não `user_id = auth.uid()`), para você também
-- enxergar a linha do seu par. Entrada só via RPC redeem_invite.
create policy membership_select on public.membership
  for select to authenticated
  using (public.is_space_member(space_id));

create policy membership_delete on public.membership
  for delete to authenticated
  using (user_id = auth.uid() or public.is_space_owner(space_id));

-- space_invite — qualquer membro convida; ler o convite exige já ser membro,
-- por isso o resgate acontece dentro de uma função SECURITY DEFINER.
create policy space_invite_select on public.space_invite
  for select to authenticated
  using (public.is_space_member(space_id));

create policy space_invite_insert on public.space_invite
  for insert to authenticated
  with check (public.is_space_member(space_id) and criado_por = auth.uid());

create policy space_invite_delete on public.space_invite
  for delete to authenticated
  using (public.is_space_member(space_id));

-- ----------------------------------------------------------------------------
-- Novo usuário: perfil + espaço pessoal, atomicamente
-- ----------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome  text;
  v_space uuid;
begin
  v_nome := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'nome'), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profile (id, nome)
  values (new.id, v_nome);

  insert into public.space (tipo, nome)
  values ('pessoal', 'Pessoal')
  returning id into v_space;

  insert into public.membership (space_id, user_id, papel)
  values (v_space, new.id, 'dono');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- RPCs
-- ----------------------------------------------------------------------------

-- Criar espaço + a própria membership de dono. Não dá para fazer isso com um
-- INSERT direto: a policy do espaço exigiria uma membership que ainda não existe.
create function public.create_space(p_nome text, p_tipo text default 'casal')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space uuid;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  if p_tipo not in ('pessoal', 'casal') then
    raise exception 'tipo inválido: %', p_tipo;
  end if;

  if coalesce(trim(p_nome), '') = '' then
    raise exception 'nome do espaço é obrigatório';
  end if;

  insert into public.space (tipo, nome)
  values (p_tipo, trim(p_nome))
  returning id into v_space;

  insert into public.membership (space_id, user_id, papel)
  values (v_space, auth.uid(), 'dono');

  return v_space;
end;
$$;

-- Código curto sem caracteres ambíguos (0/O, 1/I/L).
create function public.gerar_codigo_convite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_codigo   text;
  v_tentativa int := 0;
begin
  loop
    v_codigo := '';
    for _ in 1..6 loop
      v_codigo := v_codigo || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
    end loop;

    exit when not exists (select 1 from public.space_invite i where i.codigo = v_codigo);

    v_tentativa := v_tentativa + 1;
    if v_tentativa > 20 then
      raise exception 'não foi possível gerar um código único';
    end if;
  end loop;

  return v_codigo;
end;
$$;

create function public.criar_convite(p_space uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_codigo text;
begin
  if not public.is_space_member(p_space) then
    raise exception 'você não é membro deste espaço';
  end if;

  v_codigo := public.gerar_codigo_convite();

  insert into public.space_invite (space_id, codigo, criado_por)
  values (p_space, v_codigo, auth.uid());

  return v_codigo;
end;
$$;

-- Resgate: quem chama ainda NÃO é membro, logo não passaria pela policy de
-- select do convite. Daí o SECURITY DEFINER.
create function public.resgatar_convite(p_codigo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.space_invite;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  select * into v_invite
  from public.space_invite
  where codigo = upper(trim(p_codigo))
  for update;

  if not found then
    raise exception 'código inválido';
  end if;

  if v_invite.usado_em is not null then
    raise exception 'este convite já foi usado';
  end if;

  if v_invite.expira_em < now() then
    raise exception 'este convite expirou';
  end if;

  if v_invite.criado_por = auth.uid() then
    raise exception 'você não pode resgatar o seu próprio convite';
  end if;

  insert into public.membership (space_id, user_id, papel)
  values (v_invite.space_id, auth.uid(), 'membro')
  on conflict (space_id, user_id) do nothing;

  update public.space_invite
  set usado_em = now(), usado_por = auth.uid()
  where id = v_invite.id;

  return v_invite.space_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.gerar_codigo_convite() from public, anon, authenticated;

grant execute on function public.is_space_member(uuid)  to authenticated;
grant execute on function public.is_space_owner(uuid)   to authenticated;
grant execute on function public.shares_space_with(uuid) to authenticated;
grant execute on function public.create_space(text, text) to authenticated;
grant execute on function public.criar_convite(uuid)    to authenticated;
grant execute on function public.resgatar_convite(text) to authenticated;
