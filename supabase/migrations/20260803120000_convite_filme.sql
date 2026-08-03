-- ============================================================================
-- APPingos — Convite para assistir junto.
--
-- Muda a leitura de "quem está num item": ter uma linha em `rating` passa a
-- significar INTERESSE. Quem nunca tocou no filme não tem linha e não está em
-- recorte nenhum — antes a tela presumia que todo mundo do espaço queria ver
-- tudo, o que não é verdade.
--
-- A partir daí: quando alguém marca uma data ("queremos ver"), quem tinha
-- interesse e ainda não datou nada recebe um convite para ir junto, e responde
-- sim ou não. Aceitar copia a data proposta para a avaliação da pessoa.
-- ============================================================================

create table public.convite_filme (
  id             uuid primary key default gen_random_uuid(),
  entry_id       uuid not null references public.entry (id) on delete cascade,
  de_user_id     uuid not null references auth.users (id) on delete cascade,
  para_user_id   uuid not null references auth.users (id) on delete cascade,
  data_proposta  date not null,
  aceito         boolean,
  respondido_em  timestamptz,
  created_at     timestamptz not null default now(),
  -- Um convite por pessoa por filme: remarcar a data reabre o mesmo convite em
  -- vez de empilhar vários na tela de quem foi convidado.
  unique (entry_id, para_user_id)
);

create index convite_filme_pendente_idx
  on public.convite_filme (para_user_id) where respondido_em is null;

alter table public.convite_filme enable row level security;

-- Ler: quem convidou e quem foi convidado. Escrever: só pelas RPCs abaixo —
-- sem policy de insert/update, ninguém fabrica nem responde convite alheio.
create policy convite_filme_select on public.convite_filme
  for select to authenticated
  using (para_user_id = auth.uid() or de_user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- RPCs
-- ----------------------------------------------------------------------------

/*
  Marcar "queremos ver" numa data e convidar quem tinha interesse.

  Convida quem tem linha em `rating` (= demonstrou interesse), é do mesmo
  espaço, e ainda não tem data nenhuma. Quem já planejou ou já viu não é
  incomodado.
*/
create function public.planejar_filme(p_entry uuid, p_data date)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space      uuid;
  v_convidados int := 0;
begin
  if not public.can_access_entry(p_entry) then
    raise exception 'este item não é do seu espaço';
  end if;

  select e.space_id into v_space from public.entry e where e.id = p_entry;

  insert into public.rating (entry_id, user_id, status, planejado_para, visto_em)
  values (p_entry, auth.uid(), 'quero', p_data, null)
  on conflict (entry_id, user_id) do update
    set status         = 'quero',
        planejado_para = excluded.planejado_para,
        visto_em       = null;

  insert into public.convite_filme (entry_id, de_user_id, para_user_id, data_proposta)
  select p_entry, auth.uid(), r.user_id, p_data
  from public.rating r
  join public.membership m on m.space_id = v_space and m.user_id = r.user_id
  where r.entry_id = p_entry
    and r.user_id <> auth.uid()
    and r.planejado_para is null
    and r.visto_em is null
    and r.status <> 'visto'
  on conflict (entry_id, para_user_id) do update
    set de_user_id    = excluded.de_user_id,
        data_proposta = excluded.data_proposta,
        aceito        = null,
        respondido_em = null,
        created_at    = now();

  get diagnostics v_convidados = row_count;
  return v_convidados;
end;
$$;

create function public.responder_convite(p_convite uuid, p_aceito boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_convite public.convite_filme;
begin
  select * into v_convite
  from public.convite_filme
  where id = p_convite
  for update;

  if not found then
    raise exception 'convite não encontrado';
  end if;

  if v_convite.para_user_id <> auth.uid() then
    raise exception 'este convite não é seu';
  end if;

  if v_convite.respondido_em is not null then
    raise exception 'este convite já foi respondido';
  end if;

  -- Recusar não mexe na avaliação: a pessoa continua com o interesse, só não
  -- vai nessa data.
  if p_aceito then
    insert into public.rating (entry_id, user_id, status, planejado_para)
    values (v_convite.entry_id, auth.uid(), 'quero', v_convite.data_proposta)
    on conflict (entry_id, user_id) do update
      set status         = 'quero',
          planejado_para = excluded.planejado_para;
  end if;

  update public.convite_filme
  set aceito = p_aceito, respondido_em = now()
  where id = p_convite;
end;
$$;

grant execute on function public.planejar_filme(uuid, date)      to authenticated;
grant execute on function public.responder_convite(uuid, boolean) to authenticated;
