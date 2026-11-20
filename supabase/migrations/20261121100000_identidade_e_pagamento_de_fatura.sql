-- ============================================================================
-- APPingos — a identidade de cada banco, o apelido da conta e o pagamento de
-- fatura entre bancos.
--
-- 1. `conexao_bancaria.instituicao`: o código do banco de verdade ('c6',
--    'nubank', 'itau'…). Pelo MeuPluggy o conector de toda conexão é o próprio
--    MeuPluggy, e `banco` fica "MeuPluggy". O código sai do nome da conta
--    corrente da conexão (ver _shared/instituicoes.ts) — a sincronização grava,
--    e aqui se preenche o que já existe.
-- 2. `conta_bancaria.apelido`: o nome que a pessoa dá à conta ou ao cartão da
--    conta ("Salário", "Uber"). O dos cartões por final já existia
--    (`cartao_bancario.apelido`).
-- 3. `transacao_bancaria.par_id`: a saída da conta e o pagamento que entrou no
--    cartão, ligados. O C6 debita "C6 BANK" (categoria Loans) na conta para
--    pagar o próprio cartão, e nada na transação diz que é fatura; o que diz é o
--    par — mesmo valor, até 3 dias, "Inclusao de Pagamento" no cartão. Vale
--    igual para a transferência de um banco para pagar o cartão de outro e para
--    o boleto do banco 2 pago pelo banco 1, desde que os dois estejam conectados.
--    O pagamento de fatura nunca é gasto (as compras da fatura já são); ele sai
--    da caixa e aparece em "Pagamentos de fatura" e na fatura do cartão.
-- 4. `renda_historico`: ajustar o salário vale dali em diante — a versão
--    anterior fica valendo para os meses que já passaram.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A instituição
-- ----------------------------------------------------------------------------

alter table public.conexao_bancaria
  add column instituicao text check (instituicao is null or instituicao ~ '^[a-z0-9]{2,20}$');

comment on column public.conexao_bancaria.instituicao is
  'Código da instituição (c6, nubank, itau…), deduzido do nome da conta corrente. `banco` é o nome do conector, que pelo MeuPluggy é sempre "MeuPluggy".';

/*
  O mesmo reconhecimento de `instituicaoPorNome` (_shared/instituicoes.ts), só
  para os bancos que já estão conectados — a sincronização cobre os outros.
  A conta corrente primeiro: o nome do cartão é o do produto.
*/
update public.conexao_bancaria x
set instituicao = achada.codigo
from (
  select distinct on (c.conexao_id) c.conexao_id, b.codigo
  from public.conta_bancaria c
  cross join lateral (
    select case
      when c.nome ~* '(nu ?bank|^nu\M|nu pagamentos|nu financeira|nuconta)' then 'nubank'
      when c.nome ~* '(\mc6\M|banco c6)' then 'c6'
      when c.nome ~* 'ita[uú]' then 'itau'
      when c.nome ~* '(bradesco|bradescard)' then 'bradesco'
      when c.nome ~* 'santander' then 'santander'
      when c.nome ~* '(caixa econ|^caixa\M|caixa tem)' then 'caixa'
      when c.nome ~* '(banco do brasil|\mbb\M)' then 'bb'
      when c.nome ~* '\minter\M' then 'inter'
      when c.nome ~* 'btg' then 'btg'
      when c.nome ~* '\mxp\M' then 'xp'
      when c.nome ~* 'mercado ?pago' then 'mercadopago'
      when c.nome ~* 'picpay' then 'picpay'
      when c.nome ~* 'sicredi' then 'sicredi'
      when c.nome ~* 'sicoob' then 'sicoob'
    end as codigo
  ) b
  where b.codigo is not null
  order by c.conexao_id, (c.tipo = 'conta') desc
) achada
where achada.conexao_id = x.id and x.instituicao is null;

-- ----------------------------------------------------------------------------
-- 2. O apelido da conta
-- ----------------------------------------------------------------------------

alter table public.conta_bancaria
  add column apelido text check (apelido is null or length(trim(apelido)) between 1 and 40);

comment on column public.conta_bancaria.apelido is
  'O nome que a pessoa dá à conta (ou ao cartão principal da conta de cartão). A sincronização não toca.';

-- ----------------------------------------------------------------------------
-- 3. O pagamento de fatura em par
-- ----------------------------------------------------------------------------

alter table public.transacao_bancaria
  add column par_id uuid references public.transacao_bancaria (id) on delete set null;

create index transacao_bancaria_par_idx on public.transacao_bancaria (par_id) where par_id is not null;

comment on column public.transacao_bancaria.par_id is
  'A outra ponta do pagamento de fatura: na saída da conta, a entrada no cartão; no cartão, a saída da conta.';

/*
  Liga cada pagamento recebido no cartão à saída da conta que o pagou.

  O cartão diz que recebeu ("Pagamento recebido", "Inclusao de Pagamento Ciclo",
  já com motivo `pagamento_fatura` pela importação). A conta nem sempre diz que
  pagou: o Nubank escreve "Pagamento de fatura", o C6 escreve "C6 BANK". O par é
  o mesmo valor, de uma conta corrente da mesma pessoa, até 3 dias de distância,
  o mais próximo primeiro.

  Só pega saída SEM destino (ainda na caixa) ou já marcada como pagamento de
  fatura: o que a pessoa classificou como compra, renda ou aporte é decisão dela
  e não se mexe. Rodar de novo não muda nada — o que tem par fica de fora.
*/
create function public.parear_pagamentos_de_fatura(p_user uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total int := 0;
  r record;
begin
  for r in
    select c.id as no_cartao, d.id as na_conta
    from public.transacao_bancaria c
    join public.conta_bancaria cc on cc.id = c.conta_id and cc.tipo = 'cartao'
    cross join lateral (
      select d.id
      from public.transacao_bancaria d
      join public.conta_bancaria dc on dc.id = d.conta_id and dc.tipo = 'conta'
      where d.user_id = p_user
        and d.sentido = 'saida'
        and not d.pendente
        and d.par_id is null
        and d.valor = c.valor
        and abs(d.data - c.data) <= 3
        and (d.destino is null or (d.destino = 'ignorada' and d.motivo_exclusao = 'pagamento_fatura'))
      -- O que a importação já reconheceu como pagamento de fatura ganha do Pix de
      -- mesmo valor que só coincidiu; depois, o mais perto em dias.
      order by (d.motivo_exclusao = 'pagamento_fatura') desc nulls last, abs(d.data - c.data), d.data, d.id
      limit 1
    ) d
    where c.user_id = p_user
      and c.sentido = 'entrada'
      and c.motivo_exclusao = 'pagamento_fatura'
      -- Pendente não: a versão lançada chega com outro provider_id, e o par ficaria na pendente.
      and not c.pendente
      and c.par_id is null
    order by c.data, c.id
  loop
    -- Duas entradas iguais no mesmo dia podem ter escolhido a mesma saída: a segunda fica para a próxima rodada.
    update public.transacao_bancaria
    set par_id = r.no_cartao,
        motivo_exclusao = 'pagamento_fatura',
        destino = coalesce(destino, 'ignorada'),
        classificada_em = coalesce(classificada_em, now())
    where id = r.na_conta and par_id is null;

    if found then
      update public.transacao_bancaria set par_id = r.na_conta where id = r.no_cartao;
      v_total := v_total + 1;
    end if;
  end loop;

  return v_total;
end;
$$;

revoke all on function public.parear_pagamentos_de_fatura(uuid) from public, anon, authenticated;
grant execute on function public.parear_pagamentos_de_fatura(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 4. A ingestão preserva o motivo de quem tem par
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
    -- O pareamento (parear_pagamentos_de_fatura) reconhece o que a importação
    -- sozinha não reconhece — o "C6 BANK" que paga a fatura do C6. Com par, o
    -- motivo é dele, e a releitura não pode apagá-lo.
    motivo_exclusao       = case
                              when public.transacao_bancaria.par_id is not null
                                then public.transacao_bancaria.motivo_exclusao
                              else excluded.motivo_exclusao
                            end,
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

-- ----------------------------------------------------------------------------
-- 5. O salário vale dali em diante
-- ----------------------------------------------------------------------------

/*
  `renda` é uma linha por pessoa. Trocar o valor (ou a regra do dia) não pode
  reescrever os meses que já passaram: antes da troca, a versão anterior vai para
  `renda_historico`, valendo até o fim do mês anterior. A tela de um mês passado
  usa a versão que valia nele; o mês corrente e os próximos usam `renda`.

  Duas trocas no mesmo mês: só a primeira guarda histórico (`do nothing`) — o que
  valia nos meses anteriores é o valor de antes da primeira troca.
*/
create table public.renda_historico (
  user_id           uuid not null references auth.users (id) on delete cascade,
  valor_liquido     numeric(12,2) not null check (valor_liquido > 0),
  recebimento_tipo  text not null check (recebimento_tipo in ('dia_fixo', 'dia_util')),
  recebimento_dia   int not null,
  -- O último dia em que esta versão valeu (o fim do mês anterior à troca).
  vigente_ate       date not null,
  criado_em         timestamptz not null default now(),
  primary key (user_id, vigente_ate)
);

comment on table public.renda_historico is
  'As versões anteriores do salário (`renda`), cada uma com o último dia em que valeu. Gravada pelo gatilho de `renda`.';

alter table public.renda_historico enable row level security;

create policy renda_historico_select on public.renda_historico
  for select to authenticated using (user_id = auth.uid());

grant select on public.renda_historico to authenticated;
grant all on public.renda_historico to service_role;

create function public.guardar_renda_anterior()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.valor_liquido is distinct from new.valor_liquido
     or old.recebimento_tipo is distinct from new.recebimento_tipo
     or old.recebimento_dia is distinct from new.recebimento_dia then
    insert into public.renda_historico (user_id, valor_liquido, recebimento_tipo, recebimento_dia, vigente_ate)
    values (
      old.user_id, old.valor_liquido, old.recebimento_tipo, old.recebimento_dia,
      (date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date - 1)
    )
    on conflict (user_id, vigente_ate) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.guardar_renda_anterior() from public, anon, authenticated;

create trigger renda_guardar_anterior
  before update on public.renda
  for each row execute function public.guardar_renda_anterior();

-- ----------------------------------------------------------------------------
-- 6. O que já está no banco
-- ----------------------------------------------------------------------------

select public.parear_pagamentos_de_fatura(u.user_id)
from (select distinct user_id from public.conexao_bancaria) u;
