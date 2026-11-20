-- ============================================================================
-- APPingos — caixinhas: os investimentos que a pessoa cadastra, pessoais ou
-- compartilhados num espaço, e as aplicações e resgates do extrato ligados a
-- elas.
--
-- POR QUE À MÃO: a Pluggy traz as posições (`investimento`), mas não o nome da
-- caixinha. Na produção (20/11/2026) as 74 posições do Nubank vinham todas como
-- "CDB - NU FINANCEIRA S.A.", sem nada que as agrupe, e as aplicações e resgates
-- de novembro ainda não tinham chegado como movimento. Já no extrato da conta
-- elas chegam no dia: "Aplicação RDB 5.000,00", "Resgate RDB 3.090,00". Então a
-- caixinha é do app, e cada aplicação ou resgate do extrato é ligado a uma pela
-- pessoa — a aplicação X foi para a caixinha M; o resgate Y saiu dela (para
-- pagar uma conta, por exemplo).
--
-- 1. `caixinha`: nome, banco, espaço (o pessoal ou um de casal) e, opcional, a
--    meta que ela alimenta.
-- 2. `caixinha_movimento`: + aplicação, − resgate; do extrato (`transacao_id`)
--    ou à mão.
-- 3. `meta_aporte.caixinha_id`: o aporte em meta aponta para o investimento em
--    que o dinheiro foi aplicado.
-- 4. `classificar_investimento`: o destino novo da caixa de entrada. Com meta
--    ligada, a aplicação vira também aporte na meta (e o resgate, retirada) —
--    no que a meta aceitar (`aporte_da_caixinha`).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A caixinha
-- ----------------------------------------------------------------------------

create table public.caixinha (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.space (id) on delete cascade,
  criado_por   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome         text not null check (length(trim(nome)) between 1 and 60),
  instituicao  text check (instituicao is null or instituicao ~ '^[a-z0-9]{2,20}$'),
  meta_id      uuid references public.meta (id) on delete set null,
  arquivada    boolean not null default false,
  criado_em    timestamptz not null default now()
);

create index caixinha_space_idx on public.caixinha (space_id);

comment on table public.caixinha is
  'Um investimento cadastrado pela pessoa (a caixinha do Nubank, um CDB). Do espaço pessoal ou de um espaço de casal; o saldo é a soma de caixinha_movimento.';

/* A meta da caixinha é do mesmo espaço: a caixinha do casal alimenta a meta do casal. */
create function public.validar_caixinha()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.meta_id is not null and not exists (
    select 1 from public.meta m where m.id = new.meta_id and m.space_id = new.space_id
  ) then
    raise exception 'a meta da caixinha precisa ser do mesmo espaço';
  end if;
  return new;
end;
$$;

revoke all on function public.validar_caixinha() from public, anon, authenticated;

create trigger caixinha_validar
  before insert or update of meta_id, space_id on public.caixinha
  for each row execute function public.validar_caixinha();

alter table public.caixinha enable row level security;

create policy caixinha_select on public.caixinha
  for select to authenticated using (public.is_space_member(space_id));
create policy caixinha_insert on public.caixinha
  for insert to authenticated with check (public.is_space_member(space_id) and criado_por = auth.uid());
create policy caixinha_update on public.caixinha
  for update to authenticated using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));
-- Só a vazia se apaga: com movimentos, as transações do extrato ficariam com
-- destino 'investimento' e sem caixinha. A que tem histórico se arquiva.
create policy caixinha_delete on public.caixinha
  for delete to authenticated using (
    public.is_space_member(space_id)
    and criado_por = auth.uid()
    and not exists (select 1 from public.caixinha_movimento m where m.caixinha_id = caixinha.id)
  );

grant select, insert, update, delete on public.caixinha to authenticated;
grant all on public.caixinha to service_role;

-- ----------------------------------------------------------------------------
-- 2. Os movimentos
-- ----------------------------------------------------------------------------

create table public.caixinha_movimento (
  id             uuid primary key default gen_random_uuid(),
  caixinha_id    uuid not null references public.caixinha (id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  valor          numeric(14,2) not null check (valor <> 0),
  data           date not null default current_date,
  -- A transação do extrato, quando veio de lá. Uma transação vai para uma caixinha só.
  transacao_id   uuid unique references public.transacao_bancaria (id) on delete set null,
  meta_aporte_id uuid references public.meta_aporte (id) on delete set null,
  criado_em      timestamptz not null default now()
);

create index caixinha_movimento_caixinha_idx on public.caixinha_movimento (caixinha_id, data desc);

comment on column public.caixinha_movimento.valor is
  'Positivo: aplicação (dinheiro entrando na caixinha). Negativo: resgate.';

alter table public.caixinha_movimento enable row level security;

create policy caixinha_movimento_select on public.caixinha_movimento
  for select to authenticated
  using (exists (select 1 from public.caixinha c where c.id = caixinha_id and public.is_space_member(c.space_id)));
create policy caixinha_movimento_insert on public.caixinha_movimento
  for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.caixinha c where c.id = caixinha_id and public.is_space_member(c.space_id)));
create policy caixinha_movimento_delete on public.caixinha_movimento
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.caixinha_movimento to authenticated;
grant all on public.caixinha_movimento to service_role;

-- ----------------------------------------------------------------------------
-- 3. O aporte em meta aponta para o investimento
-- ----------------------------------------------------------------------------

alter table public.meta_aporte
  add column caixinha_id uuid references public.caixinha (id) on delete set null;

comment on column public.meta_aporte.caixinha_id is
  'O investimento em que o dinheiro do aporte foi aplicado (ou de onde saiu o resgate).';

/*
  `meta_aporte` não tem UPDATE para o client (o aporte é imutável: desfazer é
  apagar), então a ligação com a caixinha passa por aqui. Só o aporte de quem
  chama, recém-criado por `registrar_aporte`, e só para uma caixinha do mesmo
  espaço da meta.
*/
create function public.ligar_aporte_a_caixinha(p_aporte uuid, p_caixinha uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.meta_aporte a
  set caixinha_id = p_caixinha
  from public.meta m, public.caixinha c
  where a.id = p_aporte
    and a.user_id = auth.uid()
    and m.id = a.meta_id
    and c.id = p_caixinha
    and c.space_id = m.space_id;
end;
$$;

revoke all on function public.ligar_aporte_a_caixinha(uuid, uuid) from public, anon;
grant execute on function public.ligar_aporte_a_caixinha(uuid, uuid) to authenticated;

/*
  O aporte que a caixinha leva para a meta ligada — quando a meta aceita. A
  caixinha é o dinheiro de verdade; a meta acompanha o que dá:

  - resgate maior que o guardado na meta (o resgate traz o rendimento: aplicou
    3.000, resgatou 3.090) sai da meta só até zerá-la;
  - aplicação numa meta cumprida ou abandonada fica só na caixinha.

  Sem isso, `registrar_aporte` recusaria e a classificação inteira falharia.
  Devolve o aporte criado, ou null quando a meta não leva nada.
*/
create function public.aporte_da_caixinha(
  p_caixinha  uuid,
  p_meta      uuid,
  p_valor     numeric,
  p_data      date,
  p_origem    text,
  p_transacao uuid
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_estado    text;
  v_guardado  numeric;
  v_valor     numeric := p_valor;
  v_aporte    uuid;
begin
  select m.estado into v_estado from public.meta m where m.id = p_meta;
  if v_estado is null then
    return null;
  end if;

  if v_valor > 0 and v_estado in ('cumprida', 'abandonada') then
    return null;
  end if;

  if v_valor < 0 then
    select coalesce(sum(a.valor), 0) into v_guardado from public.meta_aporte a where a.meta_id = p_meta;
    v_valor := greatest(v_valor, -v_guardado);
    if v_valor >= 0 then
      return null;
    end if;
  end if;

  v_aporte := public.registrar_aporte(p_meta, v_valor, p_data, p_origem, p_transacao);
  perform public.ligar_aporte_a_caixinha(v_aporte, p_caixinha);
  return v_aporte;
end;
$$;

revoke all on function public.aporte_da_caixinha(uuid, uuid, numeric, date, text, uuid) from public, anon;
grant execute on function public.aporte_da_caixinha(uuid, uuid, numeric, date, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. O destino "investimento" na caixa de entrada
-- ----------------------------------------------------------------------------

alter table public.transacao_bancaria drop constraint transacao_bancaria_destino_check;
alter table public.transacao_bancaria
  add constraint transacao_bancaria_destino_check
  check (destino in ('compra', 'ignorada', 'renda', 'aporte', 'investimento'));

/*
  Liga uma transação da caixa a uma caixinha. Saída (a "Aplicação RDB") é
  aplicação; entrada (o "Resgate RDB") é resgate. Com meta ligada à caixinha,
  vira também aporte (ou retirada) na meta, com `caixinha_id` — o aporte aponta
  para o investimento. Tudo numa transação: ou entra inteiro, ou nada.
*/
create function public.classificar_investimento(p_transacao uuid, p_caixinha uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v         public.transacao_bancaria%rowtype;
  v_cx      public.caixinha%rowtype;
  v_valor   numeric;
  v_aporte  uuid;
  v_mov     uuid;
begin
  v := public.transacao_da_caixa(p_transacao);

  select * into v_cx from public.caixinha where id = p_caixinha;
  if v_cx.id is null or not public.is_space_member(v_cx.space_id) then
    raise exception 'caixinha não encontrada';
  end if;

  v_valor := case when v.sentido = 'saida' then v.valor else -v.valor end;

  if v_cx.meta_id is not null then
    v_aporte := public.aporte_da_caixinha(v_cx.id, v_cx.meta_id, v_valor, v.data, 'pluggy', v.id);
  end if;

  insert into public.caixinha_movimento (caixinha_id, user_id, valor, data, transacao_id, meta_aporte_id)
  values (v_cx.id, auth.uid(), v_valor, v.data, v.id, v_aporte)
  returning id into v_mov;

  update public.transacao_bancaria
  set destino = 'investimento', classificada_em = now()
  where id = v.id;

  return v_mov;
end;
$$;

revoke all on function public.classificar_investimento(uuid, uuid) from public, anon;
grant execute on function public.classificar_investimento(uuid, uuid) to authenticated;

/*
  Aplicação ou resgate à mão (o que não passou pelo extrato, ou de banco não
  conectado). Mesma regra da meta ligada.
*/
create function public.registrar_movimento_caixinha(p_caixinha uuid, p_valor numeric, p_data date default current_date)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_cx     public.caixinha%rowtype;
  v_aporte uuid;
  v_mov    uuid;
begin
  if coalesce(p_valor, 0) = 0 then
    raise exception 'o movimento precisa de um valor diferente de zero';
  end if;

  select * into v_cx from public.caixinha where id = p_caixinha;
  if v_cx.id is null or not public.is_space_member(v_cx.space_id) then
    raise exception 'caixinha não encontrada';
  end if;

  if v_cx.meta_id is not null then
    v_aporte := public.aporte_da_caixinha(v_cx.id, v_cx.meta_id, p_valor, p_data, 'manual', null);
  end if;

  insert into public.caixinha_movimento (caixinha_id, user_id, valor, data, meta_aporte_id)
  values (v_cx.id, auth.uid(), p_valor, p_data, v_aporte)
  returning id into v_mov;

  return v_mov;
end;
$$;

revoke all on function public.registrar_movimento_caixinha(uuid, numeric, date) from public, anon;
grant execute on function public.registrar_movimento_caixinha(uuid, numeric, date) to authenticated;

/* Devolver à caixa desfaz também o investimento (e o aporte que ele gerou). */
create or replace function public.devolver_para_caixa(p_transacao uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v public.transacao_bancaria%rowtype;
begin
  select * into v
  from public.transacao_bancaria
  where id = p_transacao
    and user_id = auth.uid();

  if v.destino is null or v.destino not in ('ignorada', 'compra', 'renda', 'aporte', 'investimento') then
    raise exception 'só dá para devolver à caixa o que já foi classificado';
  end if;

  if v.destino = 'renda' then
    delete from public.renda_recebida
    where transacao_id = p_transacao
      and user_id = auth.uid();
  elsif v.destino in ('aporte', 'investimento') then
    delete from public.caixinha_movimento
    where transacao_id = p_transacao
      and user_id = auth.uid();
    delete from public.meta_aporte
    where transacao_id = p_transacao
      and user_id = auth.uid();
  end if;

  update public.transacao_bancaria t
  set destino = null, compra_id = null, classificada_em = null
  where t.user_id = auth.uid()
    and (
      t.id = p_transacao
      or (
        v.chave_compra is not null
        and v.destino in ('compra', 'ignorada')
        and t.chave_compra = v.chave_compra
        and t.destino = v.destino
        and t.compra_id is not distinct from v.compra_id
        and t.motivo_exclusao is null
      )
    );
end;
$$;

revoke all on function public.devolver_para_caixa(uuid) from public, anon;
grant execute on function public.devolver_para_caixa(uuid) to authenticated;
