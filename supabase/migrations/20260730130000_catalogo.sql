-- ============================================================================
-- APPingos — Motor de catálogo.
--
-- Um só conjunto de tabelas serve filmes, séries, livros, músicas e jogos. Vestir
-- um tipo novo é escrever telas e uma fonte de metadados — não schema novo.
--
-- Três decisões que sustentam isso:
--   1. `media_item` é GLOBAL (sem space_id). O mesmo filme é uma linha só, não
--      importa quantos espaços o adicionem.
--   2. `entry` liga um item a um espaço: "este filme está na nossa lista".
--   3. `rating` é POR USUÁRIO, não por espaço. É daqui que sai o "eu dei 8,
--      ela deu 5" — a graça do app de casal.
-- ============================================================================

create table public.media_item (
  id               uuid primary key default gen_random_uuid(),
  tipo             text not null check (tipo in ('filme', 'serie', 'livro', 'musica', 'jogo')),
  fonte            text not null,             -- 'tmdb', 'openlibrary', 'spotify', 'manual'
  fonte_id         text not null,
  titulo           text not null,
  titulo_original  text,
  ano              int,
  capa_url         text,
  sinopse          text,
  metadados        jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  unique (fonte, fonte_id)
);

create table public.entry (
  id             uuid primary key default gen_random_uuid(),
  space_id       uuid not null references public.space (id) on delete cascade,
  media_item_id  uuid not null references public.media_item (id) on delete cascade,
  added_by       uuid not null references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (space_id, media_item_id)
);

create table public.rating (
  id         uuid primary key default gen_random_uuid(),
  entry_id   uuid not null references public.entry (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'quero' check (status in ('quero', 'vendo', 'visto', 'abandonei')),
  nota       int check (nota between 0 and 10),
  resenha    text,
  visto_em   date,
  updated_at timestamptz not null default now(),
  unique (entry_id, user_id)
);

-- Genérica sobre `entry`, não sobre filme: quando livros e músicas entrarem,
-- a mesma tabela serve.
create table public.collection (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.space (id) on delete cascade,
  nome       text not null,
  icone      text,
  created_at timestamptz not null default now(),
  unique (space_id, nome)
);

create table public.collection_item (
  collection_id uuid not null references public.collection (id) on delete cascade,
  entry_id      uuid not null references public.entry (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (collection_id, entry_id)
);

create index media_item_tipo_idx on public.media_item (tipo);
create index entry_space_idx on public.entry (space_id, created_at desc);
create index entry_media_item_idx on public.entry (media_item_id);
create index rating_entry_idx on public.rating (entry_id);
create index rating_user_idx on public.rating (user_id);
create index collection_space_idx on public.collection (space_id);

-- ----------------------------------------------------------------------------
-- Helper
-- ----------------------------------------------------------------------------

-- Mesma lógica de is_space_member, mas partindo de um entry. SECURITY DEFINER
-- para a policy de `rating` não precisar passar pela RLS de `entry`.
create function public.can_access_entry(p_entry uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.entry e
    join public.membership m on m.space_id = e.space_id
    where e.id = p_entry
      and m.user_id = auth.uid()
  );
$$;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.media_item enable row level security;
alter table public.entry enable row level security;
alter table public.rating enable row level security;
alter table public.collection enable row level security;
alter table public.collection_item enable row level security;

-- Catálogo global: todos leem. Escrita só pela RPC adicionar_item, para ninguém
-- poluir o catálogo compartilhado com lixo.
create policy media_item_select on public.media_item
  for select to authenticated
  using (true);

create policy entry_select on public.entry
  for select to authenticated
  using (public.is_space_member(space_id));

create policy entry_insert on public.entry
  for insert to authenticated
  with check (public.is_space_member(space_id) and added_by = auth.uid());

create policy entry_delete on public.entry
  for delete to authenticated
  using (public.is_space_member(space_id));

-- Ler a nota do par: sim. Escrever no lugar dele: não.
create policy rating_select on public.rating
  for select to authenticated
  using (public.can_access_entry(entry_id));

create policy rating_insert on public.rating
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_entry(entry_id));

create policy rating_update on public.rating
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy rating_delete on public.rating
  for delete to authenticated
  using (user_id = auth.uid());

create policy collection_all on public.collection
  for all to authenticated
  using (public.is_space_member(space_id))
  with check (public.is_space_member(space_id));

create policy collection_item_all on public.collection_item
  for all to authenticated
  using (public.can_access_entry(entry_id))
  with check (public.can_access_entry(entry_id));

-- ----------------------------------------------------------------------------
-- updated_at automático em rating
-- ----------------------------------------------------------------------------

create function public.tocar_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger rating_updated_at
  before update on public.rating
  for each row execute function public.tocar_updated_at();

-- ----------------------------------------------------------------------------
-- RPC de entrada no catálogo
-- ----------------------------------------------------------------------------

/*
  Upsert do item global + criação do entry no espaço, numa transação.

  Feito como RPC por dois motivos: a escrita em media_item é fechada para o
  client, e assim o "adicionar à lista" é um round-trip só em vez de três.

  Idempotente: adicionar o mesmo filme duas vezes devolve o mesmo entry.
*/
create function public.adicionar_item(p_space uuid, p_item jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media uuid;
  v_entry uuid;
  v_tipo  text := p_item ->> 'tipo';
  v_fonte text := p_item ->> 'fonte';
begin
  if not public.is_space_member(p_space) then
    raise exception 'você não é membro deste espaço';
  end if;

  if v_tipo is null or v_tipo not in ('filme', 'serie', 'livro', 'musica', 'jogo') then
    raise exception 'tipo inválido: %', coalesce(v_tipo, '(nulo)');
  end if;

  if coalesce(v_fonte, '') = '' or coalesce(p_item ->> 'fonte_id', '') = '' then
    raise exception 'fonte e fonte_id são obrigatórios';
  end if;

  if coalesce(trim(p_item ->> 'titulo'), '') = '' then
    raise exception 'título é obrigatório';
  end if;

  -- Atualizamos capa/sinopse no conflito: o TMDB melhora os dados com o tempo.
  insert into public.media_item (
    tipo, fonte, fonte_id, titulo, titulo_original, ano, capa_url, sinopse, metadados
  )
  values (
    v_tipo,
    v_fonte,
    p_item ->> 'fonte_id',
    trim(p_item ->> 'titulo'),
    p_item ->> 'titulo_original',
    nullif(p_item ->> 'ano', '')::int,
    p_item ->> 'capa_url',
    p_item ->> 'sinopse',
    coalesce(p_item -> 'metadados', '{}'::jsonb)
  )
  on conflict (fonte, fonte_id) do update
    set titulo    = excluded.titulo,
        capa_url  = coalesce(excluded.capa_url, public.media_item.capa_url),
        sinopse   = coalesce(excluded.sinopse, public.media_item.sinopse),
        metadados = public.media_item.metadados || excluded.metadados
  returning id into v_media;

  insert into public.entry (space_id, media_item_id, added_by)
  values (p_space, v_media, auth.uid())
  on conflict (space_id, media_item_id) do nothing
  returning id into v_entry;

  if v_entry is null then
    select e.id into v_entry
    from public.entry e
    where e.space_id = p_space and e.media_item_id = v_media;
  end if;

  -- Quem adiciona já sinaliza interesse. Sem isto o item apareceria em lugar nenhum.
  insert into public.rating (entry_id, user_id, status)
  values (v_entry, auth.uid(), 'quero')
  on conflict (entry_id, user_id) do nothing;

  return v_entry;
end;
$$;

revoke all on function public.tocar_updated_at() from public, anon, authenticated;

grant execute on function public.can_access_entry(uuid)     to authenticated;
grant execute on function public.adicionar_item(uuid, jsonb) to authenticated;
