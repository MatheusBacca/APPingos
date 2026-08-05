-- ============================================================================
-- APPingos — Orçamentos: compras compartilhadas, parcelamento e rateio.
--
-- Substitui a lista de gastos que o casal mantinha à mão num grupo de WhatsApp.
-- Três decisões sustentam o módulo:
--
--   1. Uma compra parcelada é UMA linha, não N. As parcelas saem da view
--      `parcela_mensal`, que expande a compra por competência. Corrigir o valor
--      conserta todos os meses futuros de uma vez, em vez de deixar seis linhas
--      para reconciliar à mão.
--   2. Quem pagou e quem deve são coisas diferentes. `pago_por` é o cartão;
--      `compra_participante.peso` é o rateio. O saldo do mês é derivado dos
--      dois, nunca armazenado.
--   3. Categoria é por espaço e reaproveitável: "Mercado" e "mercado" são a
--      mesma linha, garantido por índice único sobre o nome normalizado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Categorias
-- ----------------------------------------------------------------------------

/*
  `nome_norm` é coluna gerada, não trigger: o índice único não pode depender de
  alguém lembrar de manter os dois campos em sincronia. `lower(trim(...))` é
  imutável, que é o que uma coluna STORED exige.

  A cor vem de uma paleta fixa, no espírito das tags do Notion — não um seletor
  livre. Uma cor arbitrária escolhida no claro costuma ficar ilegível no escuro,
  e o app tem alternador de tema.
*/
create table public.categoria (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.space (id) on delete cascade,
  nome        text not null check (trim(nome) <> ''),
  nome_norm   text generated always as (lower(trim(nome))) stored,
  cor         text not null default 'cinza'
                check (cor in ('cinza', 'marrom', 'laranja', 'amarelo', 'verde',
                               'azul', 'roxo', 'rosa', 'vermelho')),
  created_at  timestamptz not null default now()
);

create unique index categoria_space_nome_idx on public.categoria (space_id, nome_norm);

-- ----------------------------------------------------------------------------
-- Compras
-- ----------------------------------------------------------------------------

/*
  `competencia_inicial` NÃO é derivada de `data_compra`. Uma compra feita em
  28/07 cai na fatura de julho ou de agosto dependendo do dia de fechamento do
  cartão — informação que só quem comprou tem. É entrada manual, com default no
  mês da compra, e o CHECK garante que aponta sempre para o dia 1.

  `registrado_por` existe separado de `pago_por` porque um admin pode lançar a
  compra de outra pessoa. Quem pagou é fato do cartão; quem digitou é auditoria.
*/
create table public.compra (
  id                   uuid primary key default gen_random_uuid(),
  space_id             uuid not null references public.space (id) on delete cascade,
  descricao            text not null check (trim(descricao) <> ''),
  valor_total          numeric(12,2) not null check (valor_total > 0),
  data_compra          date not null default current_date,
  competencia_inicial  date not null check (extract(day from competencia_inicial) = 1),
  parcelas             int not null default 1 check (parcelas between 1 and 120),
  pago_por             uuid not null references auth.users (id) on delete cascade,
  registrado_por       uuid not null references auth.users (id) on delete cascade,
  categoria_id         uuid references public.categoria (id) on delete set null,
  created_at           timestamptz not null default now()
);

/*
  Peso, não percentual. R$ 500 de R$ 1.500 é 33,3333...% — guardar isso
  arredondado (33,33%) devolveria R$ 499,95 na hora de exibir, cinco centavos a
  menos do que a pessoa digitou. O peso guarda a razão exata:
    "eu pago 1/3"           -> peso 1 contra 2
    "eu pago 500 de 1500"   -> peso 500 contra 1000
  O percentual é derivado na exibição. `informado_como` registra só a unidade
  que a pessoa usou, para o formulário devolver igual na hora de editar.
*/
create table public.compra_participante (
  compra_id       uuid not null references public.compra (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  peso            numeric(14,4) not null check (peso >= 0),
  informado_como  text not null default 'percentual'
                    check (informado_como in ('percentual', 'valor')),
  primary key (compra_id, user_id)
);

-- Índices que as consultas do módulo percorrem: lista do mês (por espaço e
-- competência) e o rateio de cada compra.
create index compra_space_competencia_idx on public.compra (space_id, competencia_inicial);
create index compra_space_data_idx        on public.compra (space_id, data_compra);
create index compra_categoria_idx         on public.compra (categoria_id);

-- ----------------------------------------------------------------------------
-- Expansão das parcelas
-- ----------------------------------------------------------------------------

/*
  `security_invoker = on` não é detalhe de estilo. Uma view no Postgres roda por
  padrão com os privilégios de quem a criou, o que faria ela IGNORAR a RLS de
  `compra` e devolver as compras de todos os espaços — sem erro nenhum aparecer.

  Arredondamento: as primeiras N-1 parcelas ficam truncadas no centavo e a
  última absorve o resto (100,00 em 3x -> 33,33 / 33,33 / 33,34). Assim a soma
  das parcelas bate exatamente com o total, que é o que a pessoa confere.
*/
create view public.parcela_mensal
with (security_invoker = on)
as
select
  c.id                                                             as compra_id,
  c.space_id,
  (c.competencia_inicial + make_interval(months => n - 1))::date    as competencia,
  n                                                                 as numero,
  c.parcelas                                                        as total,
  case
    when n < c.parcelas then trunc(c.valor_total / c.parcelas, 2)
    else c.valor_total - trunc(c.valor_total / c.parcelas, 2) * (c.parcelas - 1)
  end                                                               as valor
from public.compra c
cross join lateral generate_series(1, c.parcelas) as n;

-- ----------------------------------------------------------------------------
-- Integridade que o CHECK não alcança
-- ----------------------------------------------------------------------------

/*
  Um CHECK não consulta outra tabela, então nada impediria um admin de gravar um
  `pago_por` que não é membro do espaço — e a linha ficaria fora de qualquer
  saldo, sem erro. O mesmo vale para cada participante do rateio e para a
  categoria, que precisa pertencer ao mesmo espaço da compra.
*/
create function public.validar_compra()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.membership m
    where m.space_id = new.space_id and m.user_id = new.pago_por
  ) then
    raise exception 'quem pagou não é membro deste espaço';
  end if;

  if new.categoria_id is not null and not exists (
    select 1 from public.categoria c
    where c.id = new.categoria_id and c.space_id = new.space_id
  ) then
    raise exception 'a categoria pertence a outro espaço';
  end if;

  return new;
end;
$$;

create trigger compra_validar
  before insert or update on public.compra
  for each row execute function public.validar_compra();

create function public.validar_participante()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.compra c
    join public.membership m on m.space_id = c.space_id
    where c.id = new.compra_id and m.user_id = new.user_id
  ) then
    raise exception 'participante do rateio não é membro do espaço da compra';
  end if;

  return new;
end;
$$;

create trigger compra_participante_validar
  before insert or update on public.compra_participante
  for each row execute function public.validar_participante();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.categoria            enable row level security;
alter table public.compra               enable row level security;
alter table public.compra_participante  enable row level security;

-- categoria — qualquer membro cria e usa; a cor é editável por qualquer um.
create policy categoria_select on public.categoria
  for select to authenticated
  using (public.is_space_member(space_id));

create policy categoria_insert on public.categoria
  for insert to authenticated
  with check (public.is_space_member(space_id));

create policy categoria_update on public.categoria
  for update to authenticated
  using (public.is_space_member(space_id))
  with check (public.is_space_member(space_id));

create policy categoria_delete on public.categoria
  for delete to authenticated
  using (public.is_space_admin(space_id));

/*
  A regra do admin vive aqui: você lança a sua própria compra livremente, e
  lançar em nome de outra pessoa exige ser dono ou admin. `registrado_por` é
  forçado a ser você mesmo — não dá para lançar assinando como outro.
*/
create policy compra_select on public.compra
  for select to authenticated
  using (public.is_space_member(space_id));

create policy compra_insert on public.compra
  for insert to authenticated
  with check (
    public.is_space_member(space_id)
    and registrado_por = auth.uid()
    and (pago_por = auth.uid() or public.is_space_admin(space_id))
  );

create policy compra_update on public.compra
  for update to authenticated
  using (
    public.is_space_member(space_id)
    and (registrado_por = auth.uid() or public.is_space_admin(space_id))
  )
  with check (
    public.is_space_member(space_id)
    and (pago_por = auth.uid() or public.is_space_admin(space_id))
  );

create policy compra_delete on public.compra
  for delete to authenticated
  using (
    public.is_space_member(space_id)
    and (registrado_por = auth.uid() or public.is_space_admin(space_id))
  );

-- compra_participante — acompanha a permissão da compra a que pertence.
create policy compra_participante_select on public.compra_participante
  for select to authenticated
  using (exists (
    select 1 from public.compra c
    where c.id = compra_id and public.is_space_member(c.space_id)
  ));

create policy compra_participante_escrita on public.compra_participante
  for all to authenticated
  using (exists (
    select 1 from public.compra c
    where c.id = compra_id
      and public.is_space_member(c.space_id)
      and (c.registrado_por = auth.uid() or public.is_space_admin(c.space_id))
  ))
  with check (exists (
    select 1 from public.compra c
    where c.id = compra_id
      and public.is_space_member(c.space_id)
      and (c.registrado_por = auth.uid() or public.is_space_admin(c.space_id))
  ));

-- ----------------------------------------------------------------------------
-- RPCs
-- ----------------------------------------------------------------------------

/*
  Resolve a categoria pelo nome, criando se não existir. É o que faz "Mercado",
  "mercado" e "MERCADO" caírem na mesma linha, tanto quando a pessoa escolhe da
  lista quanto quando só digita e aperta Enter.

  O `on conflict do nothing` + select cobre a corrida de dois cadastros
  simultâneos com o mesmo nome — o segundo acha a linha do primeiro em vez de
  estourar violação de unicidade.
*/
create function public.obter_ou_criar_categoria(
  p_space uuid,
  p_nome  text,
  p_cor   text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_space_member(p_space) then
    raise exception 'você não é membro deste espaço';
  end if;

  if coalesce(trim(p_nome), '') = '' then
    return null;
  end if;

  insert into public.categoria (space_id, nome, cor)
  values (p_space, trim(p_nome), coalesce(p_cor, 'cinza'))
  on conflict (space_id, nome_norm) do nothing
  returning id into v_id;

  if v_id is null then
    select c.id into v_id
    from public.categoria c
    where c.space_id = p_space and c.nome_norm = lower(trim(p_nome));
  end if;

  return v_id;
end;
$$;

/*
  Compra + rateio + categoria numa transação só, no mesmo espírito do
  `adicionar_item` do catálogo. Sem isso existiria o estado "compra gravada, mas
  o rateio falhou" — e uma compra sem participante quebraria o saldo do mês em
  silêncio, dividindo por zero.

  `p_participantes` é jsonb no formato:
    [{"user_id": "...", "peso": 500, "informado_como": "valor"}, ...]

  A RPC é SECURITY INVOKER de propósito: as policies acima já expressam a regra
  do admin, e rodar como invocador mantém uma fonte de verdade só para isso.
*/
create function public.registrar_compra(
  p_space               uuid,
  p_descricao           text,
  p_valor_total         numeric,
  p_data_compra         date,
  p_competencia_inicial date,
  p_parcelas            int,
  p_pago_por            uuid,
  p_participantes       jsonb,
  p_categoria_nome      text default null,
  p_categoria_cor       text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_compra    uuid;
  v_categoria uuid;
  v_soma      numeric;
begin
  if jsonb_typeof(p_participantes) <> 'array' or jsonb_array_length(p_participantes) = 0 then
    raise exception 'informe ao menos um participante no rateio';
  end if;

  select sum((p ->> 'peso')::numeric) into v_soma
  from jsonb_array_elements(p_participantes) p;

  if coalesce(v_soma, 0) <= 0 then
    raise exception 'a soma dos pesos do rateio precisa ser maior que zero';
  end if;

  v_categoria := public.obter_ou_criar_categoria(p_space, p_categoria_nome, p_categoria_cor);

  insert into public.compra (
    space_id, descricao, valor_total, data_compra,
    competencia_inicial, parcelas, pago_por, registrado_por, categoria_id
  )
  values (
    p_space, trim(p_descricao), p_valor_total, p_data_compra,
    date_trunc('month', p_competencia_inicial)::date,
    coalesce(p_parcelas, 1), p_pago_por, auth.uid(), v_categoria
  )
  returning id into v_compra;

  insert into public.compra_participante (compra_id, user_id, peso, informado_como)
  select
    v_compra,
    (p ->> 'user_id')::uuid,
    (p ->> 'peso')::numeric,
    coalesce(p ->> 'informado_como', 'percentual')
  from jsonb_array_elements(p_participantes) p;

  return v_compra;
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

revoke all on function public.validar_compra() from public, anon, authenticated;
revoke all on function public.validar_participante() from public, anon, authenticated;

grant execute on function public.obter_ou_criar_categoria(uuid, text, text) to authenticated;
grant execute on function public.registrar_compra(
  uuid, text, numeric, date, date, int, uuid, jsonb, text, text
) to authenticated;
