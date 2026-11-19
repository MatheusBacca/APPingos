-- ============================================================================
-- APPingos — Open Finance: tudo o que a Pluggy já manda e o app jogava fora.
--
-- Plano: docs/plano-open-finance-campos-novos.md (onda 1).
--
-- 1. Transação: o final do cartão (físico x virtual x adicional), o MCC, como
--    foi cobrada (à vista/parcelada), a hora, a fatura prevista, a data em que
--    entrou na fatura, moeda estrangeira, a mensagem do Pix, tarifa e boleto.
-- 2. Conta: saldo e dados da conta corrente; bandeira, nível, situação,
--    titularidade e limites detalhados do cartão.
-- 3. Fatura: o fechamento OFICIAL (`billClosingDate` — o `balanceCloseDate` da
--    conta é sempre nulo no Open Finance), juros/IOF/multa, se permite parcelar
--    e os pagamentos.
-- 4. Conexão: quando a Pluggy atualizou e a situação de cada produto.
-- 5. Cartões por final (`cartao_bancario`): o 0750 virtual do casal e o 0025
--    físico pessoal faturam na MESMA conta Nubank. A designação passa a poder
--    ser por cartão, herdando a da conta quando a pessoa não escolheu.
-- 6. Investimentos, movimentos de investimento e empréstimos.
-- 7. Amostras cruas da Pluggy para estudo (a última de cada recurso).
-- 8. `versao_coleta`: a próxima sincronização relê a janela inteira e preenche
--    as colunas novas no que já entrou.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Transação
-- ----------------------------------------------------------------------------

alter table public.transacao_bancaria
  add column cartao_final          text check (cartao_final ~ '^\d{4}$'),
  add column mcc                   int check (mcc between 0 and 9999),
  add column tipo_cobranca         text check (tipo_cobranca in ('a_vista', 'parcelada')),
  add column data_hora             timestamptz,
  add column fatura_prevista       date,
  add column lancada_na_fatura_em  date,
  add column moeda                 text check (moeda ~ '^[A-Z]{3}$'),
  add column valor_moeda_original  numeric(14,2),
  add column mensagem              text,
  add column tarifa_tipo           text,
  add column credito_tipo          text,
  add column boleto                jsonb;

comment on column public.transacao_bancaria.cartao_final is
  'creditCardMetadata.cardNumber, só os 4 últimos dígitos. Difere do número da conta em cartão virtual ou adicional.';
comment on column public.transacao_bancaria.mcc is
  'creditCardMetadata.payeeMCC: código de categoria do estabelecimento. Dado regulado do Open Finance, não enriquecimento pago.';
comment on column public.transacao_bancaria.fatura_prevista is
  'creditCardMetadata.billForecastDate (YYYY-MM) como dia 1: a fatura em que a transação deve cair, também para as pendentes.';
comment on column public.transacao_bancaria.mensagem is
  'paymentData.reason: a mensagem do Pix/TED que quem pagou escreveu.';

create index transacao_bancaria_cartao_idx
  on public.transacao_bancaria (conta_id, cartao_final)
  where cartao_final is not null;

-- ----------------------------------------------------------------------------
-- 2. Conta
-- ----------------------------------------------------------------------------

alter table public.conta_bancaria
  add column saldo                      numeric(14,2),
  add column saldo_atualizado_em        timestamptz,
  add column moeda                      text,
  add column saldo_com_pendentes        numeric(14,2),
  add column saldo_aplicado_automatico  numeric(14,2),
  add column cheque_especial_limite     numeric(14,2),
  add column cheque_especial_usado      numeric(14,2),
  add column agencia_conta              text,
  add column bandeira                   text,
  add column nivel                      text,
  add column situacao_cartao            text check (situacao_cartao in ('ACTIVE', 'BLOCKED', 'CANCELLED')),
  add column titularidade               text check (titularidade in ('MAIN', 'ADDITIONAL')),
  add column limite_flexivel            boolean,
  add column saldo_moeda_estrangeira    numeric(14,2),
  add column limites_detalhados         jsonb;

comment on column public.conta_bancaria.saldo is
  'account.balance. Na conta, o saldo; no cartão, o valor da fatura aberta segundo o banco.';

-- ----------------------------------------------------------------------------
-- 3. Fatura
-- ----------------------------------------------------------------------------

alter table public.fatura_cartao
  add column fechamento        date,
  add column encargos          jsonb not null default '[]'::jsonb,
  add column total_encargos    numeric(12,2) not null default 0,
  add column permite_parcelar  boolean,
  add column pagamentos        jsonb not null default '[]'::jsonb;

comment on column public.fatura_cartao.encargos is
  'financeCharges: [{tipo, valor, info}] — juros, multa e IOF cobrados nesta fatura.';

-- ----------------------------------------------------------------------------
-- 4. Conexão
-- ----------------------------------------------------------------------------

alter table public.conexao_bancaria
  add column atualizada_na_pluggy_em  timestamptz,
  add column situacao_execucao        text,
  add column situacao_produtos        jsonb,
  add column versao_coleta            int not null default 0;

comment on column public.conexao_bancaria.versao_coleta is
  'Que versão da coleta já releu a janela inteira. Abaixo da versão da função, a próxima sincronização relê 90 dias para preencher colunas novas.';

-- ----------------------------------------------------------------------------
-- 5. Cartões por final
-- ----------------------------------------------------------------------------

/*
  Um cartão físico, virtual ou adicional dentro de uma conta de cartão. A conta
  continua sendo a fatura; o cartão é só o "por onde passou".

  `destino = 'herdar'` (o padrão) segue a conta. Os outros valores têm o mesmo
  sentido dos da conta, e o mesmo `designada_em`: escolher só vale para o que
  entrar depois.

  A sincronização cria as linhas (pelos finais das transações e pelos
  `additionalCards` da conta). A pessoa só muda destino, espaço e apelido.
*/
create table public.cartao_bancario (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  conta_id      uuid not null references public.conta_bancaria (id) on delete cascade,
  final         text not null check (final ~ '^\d{4}$'),
  apelido       text check (apelido is null or length(trim(apelido)) between 1 and 40),
  destino       text not null default 'herdar'
                  check (destino in ('herdar', 'casal', 'pessoal', 'perguntar')),
  space_id      uuid references public.space (id) on delete set null,
  designada_em  timestamptz not null default now(),
  visto_em      timestamptz not null default now(),
  criado_em     timestamptz not null default now(),
  unique (conta_id, final)
);

create index cartao_bancario_user_idx on public.cartao_bancario (user_id);

create function public.validar_cartao_bancario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.conta_bancaria c
    where c.id = new.conta_id and c.user_id = new.user_id and c.tipo = 'cartao'
  ) then
    raise exception 'o cartão pertence a uma conta de cartão de outra pessoa';
  end if;

  if new.destino = 'casal' and new.space_id is null then
    new.destino := 'perguntar';
  end if;

  if new.destino <> 'casal' then
    new.space_id := null;
  end if;

  if new.space_id is not null and not exists (
    select 1
    from public.membership m
    join public.space s on s.id = m.space_id
    where m.space_id = new.space_id
      and m.user_id = new.user_id
      and s.tipo = 'casal'
  ) then
    raise exception 'o cartão do casal precisa apontar para um espaço de casal de que você é membro';
  end if;

  if tg_op = 'INSERT' then
    new.designada_em := now();
  elsif new.destino is distinct from old.destino or new.space_id is distinct from old.space_id then
    new.designada_em := now();
  end if;

  return new;
end;
$$;

create trigger cartao_bancario_validar
  before insert or update on public.cartao_bancario
  for each row execute function public.validar_cartao_bancario();

-- Quem sai do espaço do casal para de mandar compras para ele, cartão a cartão também.
create or replace function public.soltar_cartoes_ao_sair_do_espaco()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conta_bancaria
  set destino = 'perguntar'
  where user_id = old.user_id
    and space_id = old.space_id;

  update public.cartao_bancario
  set destino = 'perguntar'
  where user_id = old.user_id
    and space_id = old.space_id;

  return old;
end;
$$;

revoke all on function public.validar_cartao_bancario() from public, anon, authenticated;

alter table public.cartao_bancario enable row level security;

create policy cartao_bancario_dono on public.cartao_bancario
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- A pessoa escolhe destino, espaço e apelido; quem cria é a sincronização.
-- (O Supabase dá tudo a anon/authenticated por padrão: tira antes de dar o que vale.)
revoke all on public.cartao_bancario from anon, authenticated;
grant select on public.cartao_bancario to authenticated;
grant update (destino, space_id, apelido) on public.cartao_bancario to authenticated;
grant all on public.cartao_bancario to service_role;

/*
  O lançamento automático, agora também por cartão.

  Sem `p_cartao`, é o de antes: a conta designada lança tudo o que entrou depois
  da designação — MENOS as transações de um cartão que tem destino próprio
  (o 0025 pessoal numa conta do casal não pode ir para o casal).
  Com `p_cartao`, vale a designação do cartão e só as transações dele.
*/
drop function if exists public.lancar_compras_do_cartao(uuid, jsonb);

create function public.lancar_compras_do_cartao(p_conta uuid, p_compras jsonb, p_cartao uuid default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta    public.conta_bancaria%rowtype;
  v_cartao   public.cartao_bancario%rowtype;
  v_destino  text;
  v_espaco   uuid;
  v_desde    timestamptz;
  v_space    uuid;
  v_item     jsonb;
  v_ids      uuid[];
  v_chave    text;
  v_compra   uuid;
  v_membros  uuid[];
  v_n        int;
  v_fatia    numeric;
  v_total    int := 0;
begin
  select * into v_conta from public.conta_bancaria where id = p_conta;
  if v_conta.id is null then
    return 0;
  end if;

  if p_cartao is not null then
    select * into v_cartao from public.cartao_bancario where id = p_cartao and conta_id = v_conta.id;
    if v_cartao.id is null or v_cartao.destino = 'herdar' then
      return 0;
    end if;
    v_destino := v_cartao.destino;
    v_espaco := v_cartao.space_id;
    v_desde := v_cartao.designada_em;
  else
    v_destino := v_conta.destino;
    v_espaco := v_conta.space_id;
    v_desde := v_conta.designada_em;
  end if;

  if v_destino not in ('casal', 'pessoal') then
    return 0;
  end if;

  if v_destino = 'casal' then
    v_space := v_espaco;
  else
    select s.id into v_space
    from public.space s
    join public.membership m on m.space_id = s.id
    where m.user_id = v_conta.user_id and s.tipo = 'pessoal'
    limit 1;
  end if;

  if v_space is null then
    return 0;
  end if;

  select array_agg(m.user_id order by m.user_id = v_conta.user_id desc, m.user_id)
  into v_membros
  from public.membership m
  where m.space_id = v_space;

  v_n := coalesce(array_length(v_membros, 1), 0);
  if v_n = 0 then
    return 0;
  end if;
  v_fatia := round(100.0 / v_n, 4);

  for v_item in select * from jsonb_array_elements(p_compras) loop
    select array_agg(t.id), max(t.chave_compra)
    into v_ids, v_chave
    from public.transacao_bancaria t
    where t.conta_id = v_conta.id
      and t.provider_id in (select jsonb_array_elements_text(v_item -> 'provider_ids'))
      and t.destino is null
      and not t.pendente
      and t.sentido = 'saida'
      and t.motivo_exclusao is null
      and t.data >= (v_desde at time zone 'America/Sao_Paulo')::date
      and (
        (p_cartao is not null and t.cartao_final = v_cartao.final)
        or (p_cartao is null and not exists (
          select 1 from public.cartao_bancario cb
          where cb.conta_id = v_conta.id
            and cb.final = t.cartao_final
            and cb.destino <> 'herdar'
        ))
      );

    continue when v_ids is null;

    insert into public.compra (
      space_id, descricao, valor_total, data_compra, competencia_inicial,
      parcelas, pago_por, registrado_por
    )
    values (
      v_space,
      v_item ->> 'descricao',
      (v_item ->> 'valor_total')::numeric,
      (v_item ->> 'data_compra')::date,
      date_trunc('month', (v_item ->> 'competencia_inicial')::date)::date,
      greatest(coalesce((v_item ->> 'parcelas')::int, 1), 1),
      v_conta.user_id,
      v_conta.user_id
    )
    returning id into v_compra;

    insert into public.compra_participante (compra_id, user_id, peso, informado_como)
    select
      v_compra,
      u.user_id,
      case when u.ordem = 1 then 100 - v_fatia * (v_n - 1) else v_fatia end,
      'percentual'
    from unnest(v_membros) with ordinality as u(user_id, ordem);

    update public.transacao_bancaria
    set destino = 'compra', compra_id = v_compra, classificada_em = now()
    where id = any(v_ids)
       or (v_chave is not null and user_id = v_conta.user_id and chave_compra = v_chave and destino is null);

    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;
revoke all on function public.lancar_compras_do_cartao(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.lancar_compras_do_cartao(uuid, jsonb, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 6. Investimentos e empréstimos
-- ----------------------------------------------------------------------------

/*
  Uma posição de investimento (caixinha, RDB, CDB, fundo...). Da pessoa, como o
  extrato. `meta_id` é a ponte para as metas (onda 3 do plano): a pessoa diz
  "esta caixinha é a meta Viagem" e os movimentos viram aportes e resgates.
*/
create table public.investimento (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  conexao_id             uuid not null references public.conexao_bancaria (id) on delete cascade,
  pluggy_investment_id   text not null unique,
  nome                   text not null,
  tipo                   text,
  subtipo                text,
  codigo                 text,
  numero                 text,
  emissor                text,
  moeda                  text,
  saldo                  numeric(14,2),
  valor_bruto            numeric(14,2),
  valor_original         numeric(14,2),
  valor_resgatavel       numeric(14,2),
  rendimento             numeric(14,2),
  impostos               numeric(14,2),
  taxa                   numeric(10,4),
  taxa_tipo              text,
  indexador              text,
  data_referencia        date,
  data_compra            date,
  vencimento             date,
  situacao               text,
  meta_id                uuid references public.meta (id) on delete set null,
  atualizado_em          timestamptz not null default now()
);

create index investimento_user_idx on public.investimento (user_id);

create table public.investimento_movimento (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  investimento_id   uuid not null references public.investimento (id) on delete cascade,
  pluggy_id         text not null,
  tipo              text,
  sentido           text check (sentido in ('entrada', 'saida')),
  valor             numeric(14,2),
  valor_liquido     numeric(14,2),
  quantidade        numeric(20,8),
  data              date not null,
  descricao         text,
  unique (investimento_id, pluggy_id)
);

comment on column public.investimento_movimento.sentido is
  'Do ponto de vista da posição: entrada = aplicação (BUY), saida = resgate, imposto, amortização.';

create index investimento_movimento_data_idx on public.investimento_movimento (investimento_id, data desc);

create table public.emprestimo (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  conexao_id            uuid not null references public.conexao_bancaria (id) on delete cascade,
  pluggy_loan_id        text not null unique,
  produto               text,
  tipo                  text,
  contrato              text,
  moeda                 text,
  valor_contratado      numeric(14,2),
  data_contrato         date,
  vencimento            date,
  primeira_parcela_em   date,
  periodicidade         text,
  cet                   numeric(10,4),
  parcelas              jsonb,
  pagamentos            jsonb,
  juros                 jsonb,
  atualizado_em         timestamptz not null default now()
);

create index emprestimo_user_idx on public.emprestimo (user_id);

alter table public.investimento           enable row level security;
alter table public.investimento_movimento enable row level security;
alter table public.emprestimo             enable row level security;

create policy investimento_dono on public.investimento
  for select to authenticated using (user_id = auth.uid());
create policy investimento_meta on public.investimento
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy investimento_movimento_dono on public.investimento_movimento
  for select to authenticated using (user_id = auth.uid());
create policy emprestimo_dono on public.emprestimo
  for select to authenticated using (user_id = auth.uid());

revoke all on public.investimento, public.investimento_movimento, public.emprestimo from anon, authenticated;
grant select on public.investimento, public.investimento_movimento, public.emprestimo to authenticated;
-- Só o vínculo com a meta é da pessoa; o resto vem do banco.
grant update (meta_id) on public.investimento to authenticated;
grant all on public.investimento, public.investimento_movimento, public.emprestimo to service_role;

-- ----------------------------------------------------------------------------
-- 7. Amostras cruas para estudo
-- ----------------------------------------------------------------------------

/*
  A última resposta da Pluggy de cada recurso, como veio. Serve para conferir
  quais campos o banco preenche de verdade (o `cardNumber` do Nubank, o MCC)
  antes de construir em cima deles. Uma linha por (conexão, recurso): cada
  sincronização sobrescreve a anterior, sem acumular extrato duplicado.
*/
create table public.amostra_pluggy (
  conexao_id   uuid not null references public.conexao_bancaria (id) on delete cascade,
  recurso      text not null,
  user_id      uuid not null references auth.users (id) on delete cascade,
  dados        jsonb not null,
  coletada_em  timestamptz not null default now(),
  primary key (conexao_id, recurso)
);

alter table public.amostra_pluggy enable row level security;

create policy amostra_pluggy_dono on public.amostra_pluggy
  for select to authenticated using (user_id = auth.uid());

revoke all on public.amostra_pluggy from anon, authenticated;
grant select on public.amostra_pluggy to authenticated;
grant all on public.amostra_pluggy to service_role;

-- ----------------------------------------------------------------------------
-- 8. A ingestão grava as colunas novas
-- ----------------------------------------------------------------------------

create or replace function public.ingerir_transacoes(
  p_conta  uuid,
  p_desde  date,
  p_linhas jsonb
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta public.conta_bancaria%rowtype;
  v_total int;
begin
  select * into v_conta from public.conta_bancaria where id = p_conta;
  if not found then
    raise exception 'conta % não existe', p_conta;
  end if;

  insert into public.transacao_bancaria (
    user_id, conexao_id, conta_id, pluggy_id, provider_id, descricao, valor,
    sentido, data, competencia, pendente, parcela_numero, parcelas_total,
    valor_total_compra, data_compra, fatura_id, chave_compra, contraparte_nome,
    contraparte_documento, metodo, categoria_pluggy, categoria_pluggy_id,
    estabelecimento_nome, estabelecimento_cnpj, motivo_exclusao, destino,
    classificada_em, cartao_final, mcc, tipo_cobranca, data_hora, fatura_prevista,
    lancada_na_fatura_em, moeda, valor_moeda_original, mensagem, tarifa_tipo,
    credito_tipo, boleto
  )
  select
    v_conta.user_id, v_conta.conexao_id, v_conta.id, x.pluggy_id, x.provider_id,
    x.descricao, x.valor, x.sentido, x.data, x.competencia, coalesce(x.pendente, false),
    x.parcela_numero, x.parcelas_total, x.valor_total_compra, x.data_compra,
    x.fatura_id, x.chave_compra, x.contraparte_nome, x.contraparte_documento,
    x.metodo, x.categoria_pluggy, x.categoria_pluggy_id, x.estabelecimento_nome,
    x.estabelecimento_cnpj, x.motivo_exclusao,
    case when x.motivo_exclusao is not null then 'ignorada' end,
    case when x.motivo_exclusao is not null then now() end,
    x.cartao_final, x.mcc, x.tipo_cobranca, x.data_hora, x.fatura_prevista,
    x.lancada_na_fatura_em, x.moeda, x.valor_moeda_original, x.mensagem,
    x.tarifa_tipo, x.credito_tipo, x.boleto
  from jsonb_to_recordset(p_linhas) as x(
    pluggy_id text, provider_id text, descricao text, valor numeric, sentido text,
    data date, competencia date, pendente boolean, parcela_numero int,
    parcelas_total int, valor_total_compra numeric, data_compra date,
    fatura_id text, chave_compra text, contraparte_nome text,
    contraparte_documento text, metodo text, categoria_pluggy text,
    categoria_pluggy_id text, estabelecimento_nome text, estabelecimento_cnpj text,
    motivo_exclusao text, cartao_final text, mcc int, tipo_cobranca text,
    data_hora timestamptz, fatura_prevista date, lancada_na_fatura_em date,
    moeda text, valor_moeda_original numeric, mensagem text, tarifa_tipo text,
    credito_tipo text, boleto jsonb
  )
  on conflict (user_id, provider_id) do update set
    pluggy_id             = excluded.pluggy_id,
    conta_id              = excluded.conta_id,
    conexao_id            = excluded.conexao_id,
    descricao             = excluded.descricao,
    valor                 = excluded.valor,
    sentido               = excluded.sentido,
    data                  = excluded.data,
    competencia           = excluded.competencia,
    pendente              = excluded.pendente,
    parcela_numero        = excluded.parcela_numero,
    parcelas_total        = excluded.parcelas_total,
    valor_total_compra    = excluded.valor_total_compra,
    data_compra           = excluded.data_compra,
    fatura_id             = excluded.fatura_id,
    chave_compra          = excluded.chave_compra,
    contraparte_nome      = excluded.contraparte_nome,
    contraparte_documento = excluded.contraparte_documento,
    metodo                = excluded.metodo,
    categoria_pluggy      = coalesce(excluded.categoria_pluggy, public.transacao_bancaria.categoria_pluggy),
    categoria_pluggy_id   = coalesce(excluded.categoria_pluggy_id, public.transacao_bancaria.categoria_pluggy_id),
    estabelecimento_nome  = coalesce(excluded.estabelecimento_nome, public.transacao_bancaria.estabelecimento_nome),
    estabelecimento_cnpj  = coalesce(excluded.estabelecimento_cnpj, public.transacao_bancaria.estabelecimento_cnpj),
    motivo_exclusao       = excluded.motivo_exclusao,
    -- Os campos novos: o que o banco parou de mandar mantém o último valor.
    cartao_final          = coalesce(excluded.cartao_final, public.transacao_bancaria.cartao_final),
    mcc                   = coalesce(excluded.mcc, public.transacao_bancaria.mcc),
    tipo_cobranca         = coalesce(excluded.tipo_cobranca, public.transacao_bancaria.tipo_cobranca),
    data_hora             = coalesce(excluded.data_hora, public.transacao_bancaria.data_hora),
    fatura_prevista       = coalesce(excluded.fatura_prevista, public.transacao_bancaria.fatura_prevista),
    lancada_na_fatura_em  = coalesce(excluded.lancada_na_fatura_em, public.transacao_bancaria.lancada_na_fatura_em),
    moeda                 = coalesce(excluded.moeda, public.transacao_bancaria.moeda),
    valor_moeda_original  = coalesce(excluded.valor_moeda_original, public.transacao_bancaria.valor_moeda_original),
    mensagem              = coalesce(excluded.mensagem, public.transacao_bancaria.mensagem),
    tarifa_tipo           = coalesce(excluded.tarifa_tipo, public.transacao_bancaria.tarifa_tipo),
    credito_tipo          = coalesce(excluded.credito_tipo, public.transacao_bancaria.credito_tipo),
    boleto                = coalesce(excluded.boleto, public.transacao_bancaria.boleto),
    destino               = case
                              when public.transacao_bancaria.destino is null and excluded.motivo_exclusao is not null
                                then 'ignorada'
                              else public.transacao_bancaria.destino
                            end,
    classificada_em       = case
                              when public.transacao_bancaria.destino is null and excluded.motivo_exclusao is not null
                                then now()
                              else public.transacao_bancaria.classificada_em
                            end;

  get diagnostics v_total = row_count;

  delete from public.transacao_bancaria t
  where t.conta_id = v_conta.id
    and t.pendente
    and t.destino is null
    and t.data >= p_desde
    and not exists (
      select 1 from jsonb_array_elements(p_linhas) l
      where l ->> 'provider_id' = t.provider_id
    );

  return v_total;
end;
$$;
revoke all on function public.ingerir_transacoes(uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.ingerir_transacoes(uuid, date, jsonb) to service_role;
