-- ============================================================================
-- APPingos — Orçamentos: limite e fatura do cartão, estabelecimento da compra e
-- as regras que o app aprende para sugerir a categoria sozinho.
--
-- Três coisas que a tela de cartões e a caixa de entrada passaram a precisar:
--
-- 1. O LIMITE do cartão e o ciclo da fatura. A Pluggy manda em `creditData`
--    (creditLimit, availableCreditLimit, balanceCloseDate, balanceDueDate,
--    minimumPayment) — quando o banco informa. Quando não informa, a pessoa
--    digita o limite e os dias de fechamento e vencimento: `*_manual`. A tela lê
--    sempre o manual primeiro, porque ele é a correção de quem conhece o cartão.
--
-- 2. As FATURAS fechadas (`/bills`), que até aqui só serviam para descobrir a
--    competência das transações e eram jogadas fora.
--
-- 3. O ESTABELECIMENTO e o id da categoria da Pluggy, que vinham no extrato e não
--    eram guardados. O nome do estabelecimento é a melhor chave para aprender
--    "iFood → Delivery"; o `categoryId` da Pluggy é hierárquico (os dois
--    primeiros dígitos são a categoria-raiz) e dá ícone e cor mesmo quando o
--    nome vem numa grafia nova.
--
-- E `regra_classificacao`: o que a pessoa escolheu para um estabelecimento,
-- para a próxima transação dele já chegar com a sugestão preenchida
-- (docs/notion-plano-open-finance.md, "Lembrar a escolha por estabelecimento").
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Limite e ciclo do cartão
-- ----------------------------------------------------------------------------

alter table public.conta_bancaria
  -- O que a Pluggy disse na última sincronização. Escrito só pelo service_role.
  add column limite               numeric(12,2) check (limite is null or limite >= 0),
  add column limite_disponivel    numeric(12,2),
  add column fecha_em             date,
  add column vence_em             date,
  add column pagamento_minimo     numeric(12,2),
  -- O que a pessoa digitou. Vale mais que o da Pluggy quando existe.
  add column limite_manual        numeric(12,2) check (limite_manual is null or limite_manual > 0),
  add column dia_fechamento_manual int check (dia_fechamento_manual between 1 and 31),
  add column dia_vencimento_manual int check (dia_vencimento_manual between 1 and 31);

/*
  Sem privilégio por coluna aqui, de propósito: `server/api/pluggy/conexoes.post.ts`
  grava as contas com o JWT da pessoa (upsert em `nome`, `numero`, titular...), e
  um `grant update (...)` restrito quebraria esse upsert. O que veio do banco é
  reescrito a cada sincronização de qualquer jeito; a tela só edita os `*_manual`.
*/

-- ----------------------------------------------------------------------------
-- 2. Faturas fechadas
-- ----------------------------------------------------------------------------

create table public.fatura_cartao (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  conta_id        uuid not null references public.conta_bancaria (id) on delete cascade,
  pluggy_bill_id  text not null,
  vencimento      date not null,
  total           numeric(12,2) not null,
  minimo          numeric(12,2),
  atualizada_em   timestamptz not null default now(),
  unique (conta_id, pluggy_bill_id)
);

create index fatura_cartao_conta_idx on public.fatura_cartao (conta_id, vencimento desc);

alter table public.fatura_cartao enable row level security;

-- Como o extrato: só a dona lê. A outra pessoa do espaço vê compras, não faturas.
create policy fatura_cartao_select on public.fatura_cartao
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.fatura_cartao from anon, authenticated;
grant select on public.fatura_cartao to authenticated;
grant all on public.fatura_cartao to service_role;

-- ----------------------------------------------------------------------------
-- 3. Estabelecimento e categoria da Pluggy na transação
-- ----------------------------------------------------------------------------

alter table public.transacao_bancaria
  add column categoria_pluggy_id   text,
  add column estabelecimento_nome  text,
  add column estabelecimento_cnpj  text;

/*
  A mesma ingestão de 20261112110000, com as três colunas novas. Elas seguem a
  regra de `categoria_pluggy`: o que parou de vir não apaga o que já veio (o
  enriquecimento da Pluggy acaba com o trial, e a pista antiga continua boa).
*/
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
    classificada_em
  )
  select
    v_conta.user_id, v_conta.conexao_id, v_conta.id, x.pluggy_id, x.provider_id,
    x.descricao, x.valor, x.sentido, x.data, x.competencia, coalesce(x.pendente, false),
    x.parcela_numero, x.parcelas_total, x.valor_total_compra, x.data_compra,
    x.fatura_id, x.chave_compra, x.contraparte_nome, x.contraparte_documento,
    x.metodo, x.categoria_pluggy, x.categoria_pluggy_id, x.estabelecimento_nome,
    x.estabelecimento_cnpj, x.motivo_exclusao,
    case when x.motivo_exclusao is not null then 'ignorada' end,
    case when x.motivo_exclusao is not null then now() end
  from jsonb_to_recordset(p_linhas) as x(
    pluggy_id text, provider_id text, descricao text, valor numeric, sentido text,
    data date, competencia date, pendente boolean, parcela_numero int,
    parcelas_total int, valor_total_compra numeric, data_compra date,
    fatura_id text, chave_compra text, contraparte_nome text,
    contraparte_documento text, metodo text, categoria_pluggy text,
    categoria_pluggy_id text, estabelecimento_nome text, estabelecimento_cnpj text,
    motivo_exclusao text
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
-- 4. O que o app aprendeu de cada estabelecimento
-- ----------------------------------------------------------------------------

/*
  Uma linha por (pessoa, estabelecimento). `chave` é a descrição normalizada —
  `chaveDoEstabelecimento` em supabase/functions/_shared/estabelecimentos.ts —
  calculada no client, que é quem classifica. A categoria fica pelo NOME, e não
  pelo id: as categorias são por espaço, e "Mercado" no pessoal e "Mercado" no
  casal são linhas diferentes com o mesmo `nome_norm`.

  `vezes` conta as classificações iguais seguidas. Mudar de ideia (outra
  categoria ou outro destino) recomeça do 1 — a sugestão só fica confiante com
  uma escolha que se repete.

  `automatica` é o opt-in por regra: com ela, a sincronização pode classificar
  sozinha no espaço PESSOAL. Para o espaço do casal nunca — nada entra lá sem um
  toque humano (plano, "Lembrar a escolha por estabelecimento").
*/
create table public.regra_classificacao (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chave           text not null check (trim(chave) <> ''),
  rotulo          text not null,
  destino         text not null check (destino in ('casal', 'pessoal', 'ignorar')),
  categoria_nome  text,
  vezes           int not null default 1 check (vezes >= 1),
  automatica      boolean not null default false,
  ultima_vez      timestamptz not null default now(),
  unique (user_id, chave),
  constraint regra_automatica_so_pessoal check (not automatica or destino = 'pessoal')
);

alter table public.regra_classificacao enable row level security;

create policy regra_classificacao_dono on public.regra_classificacao
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.regra_classificacao to authenticated;
grant all on public.regra_classificacao to service_role;

/*
  Registrar uma escolha. Uma RPC, e não um upsert do client, porque a regra do
  `vezes` (soma se repetiu, recomeça se mudou) precisa ler e escrever na mesma
  transação — dois toques rápidos na caixa de entrada contariam errado.
*/
create function public.aprender_classificacao(
  p_chave          text,
  p_rotulo         text,
  p_destino        text,
  p_categoria_nome text default null
)
returns public.regra_classificacao
language plpgsql
set search_path = ''
as $$
declare
  v public.regra_classificacao%rowtype;
begin
  insert into public.regra_classificacao (user_id, chave, rotulo, destino, categoria_nome)
  values (auth.uid(), p_chave, p_rotulo, p_destino, nullif(trim(p_categoria_nome), ''))
  on conflict (user_id, chave) do update set
    rotulo         = excluded.rotulo,
    vezes          = case
                       when public.regra_classificacao.destino = excluded.destino
                        and lower(coalesce(public.regra_classificacao.categoria_nome, ''))
                          = lower(coalesce(excluded.categoria_nome, ''))
                         then public.regra_classificacao.vezes + 1
                       else 1
                     end,
    -- Mudou a escolha: a automação feita para a escolha antiga não vale mais.
    automatica     = case
                       when public.regra_classificacao.destino = excluded.destino
                        and lower(coalesce(public.regra_classificacao.categoria_nome, ''))
                          = lower(coalesce(excluded.categoria_nome, ''))
                         then public.regra_classificacao.automatica
                       else false
                     end,
    destino        = excluded.destino,
    categoria_nome = excluded.categoria_nome,
    ultima_vez     = now()
  returning * into v;

  return v;
end;
$$;

revoke all on function public.aprender_classificacao(text, text, text, text) from public, anon;
grant execute on function public.aprender_classificacao(text, text, text, text) to authenticated;
