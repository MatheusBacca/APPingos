-- ============================================================================
-- APPingos — Meta pessoal compartilhada com um espaço conjunto.
--
-- Ajuste de escopo do usuário (12/11/2026), registrado em
-- docs/notion-plano-planejamento-financeiro.md, "Decisões tomadas", item 6: a
-- meta pessoal continua morando no espaço pessoal, mas o dono pode EMPRESTÁ-LA a
-- um espaço de que participa, para os outros acompanharem e comemorarem.
--
-- O molde é o de Interesses (`interesse_compartilhamento`, `pode_ver_interesse`,
-- `compartilhar_interesse`), com uma diferença que é o ponto deste arquivo:
--
--   QUEM VÊ PELO COMPARTILHAMENTO SÓ LÊ.
--
-- O interesse emprestado deixa o outro assumir, trocar favorito e estado — é
-- coordenação. A meta emprestada não: é o dinheiro de outra pessoa. Por isso só as
-- policies de LEITURA ganham o caminho do compartilhamento; as de escrita em `meta`
-- e em `meta_aporte` continuam exigindo ser membro do espaço da meta, e
-- `registrar_aporte` (que trava a meta com `for update`, sujeito à policy de
-- update) recusa quem só lê.
--
-- E a projeção do casal continua sem esse aporte: ela soma os aportes das metas
-- cujo `space_id` é o do casal, e a meta compartilhada segue com o `space_id` do
-- pessoal. Não há filtro a lembrar — a linha simplesmente não é do casal.
--
-- Este arquivo é só da Frente A e não muda nada para a Frente B (seção 6 do
-- contrato). O timestamp é posterior ao das migrations das duas frentes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A tabela
-- ----------------------------------------------------------------------------

create table public.meta_compartilhamento (
  meta_id            uuid not null references public.meta (id) on delete cascade,
  space_id           uuid not null references public.space (id) on delete cascade,
  compartilhado_por  uuid not null references auth.users (id) on delete cascade,
  created_at         timestamptz not null default now(),
  primary key (meta_id, space_id)
);

create index meta_compartilhamento_space_idx on public.meta_compartilhamento (space_id);

/*
  O que a policy de insert não alcança, ou não deve ser a única a garantir:

    - só META PESSOAL se compartilha. A do casal já é vista pelo casal; emprestá-la
      a outro espaço abriria o dinheiro dos dois para quem um deles escolheu;
    - não se empresta ao próprio espaço da meta, nem a outro espaço pessoal (não
      há ninguém lá para ver);
    - quem compartilha é o dono, e ele é membro do espaço de destino — vale também
      sem JWT (service_role, script), como `validar_renda_compartilhamento`.
*/
create function public.validar_meta_compartilhamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta public.meta%rowtype;
begin
  select * into v_meta from public.meta m where m.id = new.meta_id;

  if not exists (select 1 from public.space s where s.id = v_meta.space_id and s.tipo = 'pessoal') then
    raise exception 'só uma meta pessoal pode ser compartilhada — a do espaço já é de todos ali';
  end if;

  if new.compartilhado_por is distinct from v_meta.criado_por then
    raise exception 'só quem criou a meta pode compartilhá-la';
  end if;

  if new.space_id = v_meta.space_id
     or exists (select 1 from public.space s where s.id = new.space_id and s.tipo = 'pessoal') then
    raise exception 'compartilhe com um espaço conjunto';
  end if;

  if not exists (
    select 1 from public.membership m
    where m.space_id = new.space_id and m.user_id = new.compartilhado_por
  ) then
    raise exception 'você não participa desse espaço';
  end if;

  return new;
end;
$$;

create trigger meta_compartilhamento_validar
  before insert or update on public.meta_compartilhamento
  for each row execute function public.validar_meta_compartilhamento();

-- ----------------------------------------------------------------------------
-- 2. Quem alcança uma meta
-- ----------------------------------------------------------------------------

/*
  As duas funções são `SECURITY DEFINER` pelo mesmo motivo de `pode_ver_interesse`:
  a policy de `meta` precisa consultar `meta_compartilhamento`, cuja policy consulta
  `meta` — rodando como owner, o ciclo se rompe.

  `meta_compartilhada_comigo` é a metade que a policy de `meta` usa (o "é membro do
  espaço da meta" ela já testa sozinha); `pode_ver_meta` é a pergunta inteira, para
  as tabelas que herdam a visibilidade da meta.
*/
create function public.meta_compartilhada_comigo(p_meta uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.meta_compartilhamento c
    where c.meta_id = p_meta
      and public.is_space_member(c.space_id)
  );
$$;

create function public.pode_ver_meta(p_meta uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.meta m
    where m.id = p_meta
      and (public.is_space_member(m.space_id) or public.meta_compartilhada_comigo(m.id))
  );
$$;

-- ----------------------------------------------------------------------------
-- 3. RLS — só a leitura ganha o caminho do compartilhamento
-- ----------------------------------------------------------------------------

drop policy meta_select on public.meta;

create policy meta_select on public.meta
  for select to authenticated
  using (public.is_space_member(space_id) or public.meta_compartilhada_comigo(id));

-- meta_insert, meta_update e meta_delete ficam como estão: membro do espaço da meta.

drop policy meta_aporte_select on public.meta_aporte;

create policy meta_aporte_select on public.meta_aporte
  for select to authenticated
  using (public.pode_ver_meta(meta_id));

-- meta_aporte_insert e meta_aporte_delete ficam como estão: membro do espaço da meta.

alter table public.meta_compartilhamento enable row level security;

-- Quem vê a meta vê onde ela está compartilhada (é o que desenha o selo).
create policy meta_compartilhamento_select on public.meta_compartilhamento
  for select to authenticated
  using (public.pode_ver_meta(meta_id));

/*
  A policy É a regra (dono, membro do destino, assinando como ele mesmo); as RPCs
  abaixo só a traduzem em mensagem legível — o mesmo arranjo de Interesses.
*/
create policy meta_compartilhamento_insert on public.meta_compartilhamento
  for insert to authenticated
  with check (
    compartilhado_por = auth.uid()
    and public.is_space_member(space_id)
    and exists (select 1 from public.meta m where m.id = meta_id and m.criado_por = auth.uid())
  );

create policy meta_compartilhamento_delete on public.meta_compartilhamento
  for delete to authenticated
  using (exists (select 1 from public.meta m where m.id = meta_id and m.criado_por = auth.uid()));

-- ----------------------------------------------------------------------------
-- 4. RPCs
-- ----------------------------------------------------------------------------

create function public.compartilhar_meta(p_meta uuid, p_space uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.meta m where m.id = p_meta and m.criado_por = auth.uid()) then
    raise exception 'só quem criou a meta pode compartilhá-la';
  end if;

  if not public.is_space_member(p_space) then
    raise exception 'você não participa desse espaço';
  end if;

  insert into public.meta_compartilhamento (meta_id, space_id, compartilhado_por)
  values (p_meta, p_space, auth.uid())
  on conflict (meta_id, space_id) do nothing;
end;
$$;

create function public.descompartilhar_meta(p_meta uuid, p_space uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.meta m where m.id = p_meta and m.criado_por = auth.uid()) then
    raise exception 'só quem criou a meta pode deixar de compartilhá-la';
  end if;

  delete from public.meta_compartilhamento
  where meta_id = p_meta and space_id = p_space;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Sair do espaço leva o compartilhamento junto
-- ----------------------------------------------------------------------------

/*
  Mesma higiene do salário (`limpar_planejamento_ao_sair`): quem sai de um espaço
  não deixa a própria meta pessoal aberta lá dentro, e voltar não a reabre.
*/
create function public.limpar_meta_compartilhada_ao_sair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.meta_compartilhamento
  where space_id = old.space_id and compartilhado_por = old.user_id;
  return old;
end;
$$;

create trigger membership_limpar_meta_compartilhada
  after delete on public.membership
  for each row execute function public.limpar_meta_compartilhada_ao_sair();

-- ----------------------------------------------------------------------------
-- 6. Comemorar
-- ----------------------------------------------------------------------------

/*
  Quando a meta compartilhada é cumprida, cada espaço com que ela foi emprestada
  recebe o aviso pelo motor — `notificar()` já tira o ator (o dono) da lista e
  respeita as preferências. O texto mora em supabase/functions/_shared/
  notificacoes.ts (`meta_cumprida`), como o de todo tipo.

  O gatilho olha a TRANSIÇÃO para cumprida, e não o estado: reabrir e cumprir de
  novo avisaria de novo, o que é verdade (cumpriu de novo); ficar parada como
  cumprida não avisa nada. A meta do casal não passa por aqui — o casal já a vê, e
  os Pins de `objetivo_cumprido` já viram notificação para ele.
*/
create function public.notificar_meta_cumprida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space uuid;
begin
  if tg_op = 'UPDATE' then
    if new.estado <> 'cumprida' or old.estado = 'cumprida' then
      return new;
    end if;
  elsif new.estado <> 'cumprida' then
    return new;
  end if;

  for v_space in
    select c.space_id from public.meta_compartilhamento c where c.meta_id = new.id
  loop
    perform public.notificar(
      p_space       => v_space,
      p_tipo        => 'meta_cumprida',
      p_ator        => coalesce(auth.uid(), new.criado_por),
      p_dados       => jsonb_build_object('titulo', new.titulo, 'valor_alvo', new.valor_alvo),
      p_entidade    => 'meta',
      p_entidade_id => new.id,
      p_rota        => '/objetivos'
    );
  end loop;

  return new;
end;
$$;

create trigger meta_notificar_cumprida
  after insert or update on public.meta
  for each row execute function public.notificar_meta_cumprida();

/*
  A reação: "🎉" de quem acompanha. Uma por pessoa por meta — a presença da linha
  é a comemoração, como em `foto_curtida`. Só em meta CUMPRIDA (comemorar o que não
  aconteceu ainda é torcida, e torcida é outra feature) e só por quem a vê.

  Quem comemora a própria meta não gera aviso (`notificar_pessoa` ignora ator =
  destino), mas a linha vale: a tela mostra quem comemorou.
*/
create table public.meta_comemoracao (
  meta_id     uuid not null references public.meta (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (meta_id, user_id)
);

create function public.validar_meta_comemoracao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.meta m where m.id = new.meta_id and m.estado = 'cumprida') then
    raise exception 'só dá para comemorar uma meta cumprida';
  end if;
  return new;
end;
$$;

create trigger meta_comemoracao_validar
  before insert on public.meta_comemoracao
  for each row execute function public.validar_meta_comemoracao();

/*
  O aviso vai para o dono da meta. O espaço da notificação é um em que quem
  comemorou e o dono se encontram — um dos compartilhamentos, ou o próprio espaço
  da meta (a do casal) —, para o sino mostrar "em Nós dois".
*/
create function public.notificar_meta_comemorada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta  public.meta%rowtype;
  v_space uuid;
begin
  select * into v_meta from public.meta m where m.id = new.meta_id;

  select c.space_id into v_space
  from public.meta_compartilhamento c
  join public.membership m on m.space_id = c.space_id and m.user_id = new.user_id
  where c.meta_id = new.meta_id
  limit 1;

  perform public.notificar_pessoa(
    p_user        => v_meta.criado_por,
    p_space       => coalesce(v_space, v_meta.space_id),
    p_tipo        => 'meta_comemorada',
    p_ator        => new.user_id,
    p_dados       => jsonb_build_object('titulo', v_meta.titulo),
    p_entidade    => 'meta',
    p_entidade_id => v_meta.id,
    p_rota        => '/objetivos'
  );

  return new;
end;
$$;

create trigger meta_comemoracao_notificar
  after insert on public.meta_comemoracao
  for each row execute function public.notificar_meta_comemorada();

alter table public.meta_comemoracao enable row level security;

create policy meta_comemoracao_select on public.meta_comemoracao
  for select to authenticated
  using (public.pode_ver_meta(meta_id));

create policy meta_comemoracao_insert on public.meta_comemoracao
  for insert to authenticated
  with check (user_id = auth.uid() and public.pode_ver_meta(meta_id));

create policy meta_comemoracao_delete on public.meta_comemoracao
  for delete to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

-- Ver a nota de GRANT em 20261112120000_planejamento_renda.sql.
grant select, insert, delete on public.meta_compartilhamento to authenticated;
grant select, insert, delete on public.meta_comemoracao      to authenticated;

revoke all on function public.validar_meta_compartilhamento()     from public, anon, authenticated;
revoke all on function public.limpar_meta_compartilhada_ao_sair() from public, anon, authenticated;
revoke all on function public.notificar_meta_cumprida()           from public, anon, authenticated;
revoke all on function public.validar_meta_comemoracao()          from public, anon, authenticated;
revoke all on function public.notificar_meta_comemorada()         from public, anon, authenticated;

-- As de visibilidade são chamadas pelas policies, que rodam como o usuário.
revoke all on function public.meta_compartilhada_comigo(uuid) from public, anon;
revoke all on function public.pode_ver_meta(uuid)             from public, anon;
grant execute on function public.meta_compartilhada_comigo(uuid) to authenticated;
grant execute on function public.pode_ver_meta(uuid)             to authenticated;

revoke all on function public.compartilhar_meta(uuid, uuid)   from public, anon;
revoke all on function public.descompartilhar_meta(uuid, uuid) from public, anon;
grant execute on function public.compartilhar_meta(uuid, uuid)   to authenticated;
grant execute on function public.descompartilhar_meta(uuid, uuid) to authenticated;
