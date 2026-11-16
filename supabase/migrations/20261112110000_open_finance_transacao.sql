-- ============================================================================
-- APPingos — Open Finance (Pluggy): o extrato importado.
--
-- Fase 4 de docs/notion-plano-open-finance.md. `transacao_bancaria` é o extrato
-- bruto de UMA pessoa, já normalizado na entrada pelas regras de
-- supabase/functions/_shared/importacao-bancaria.ts (fuso, sinal, parcelas,
-- contagem dupla). Quem escreve aqui é a Edge Function `sincronizar-pluggy`,
-- com service_role; quem lê e classifica é só o dono.
--
-- A decisão que organiza o arquivo (a segunda "decisão central" do plano): a
-- transação é da PESSOA, não do espaço. O extrato de alguém tem o presente para
-- a outra pessoa, o lanche da tarde, a assinatura que é só sua. Se morasse no
-- espaço, a privacidade dependeria de todo agregado lembrar de filtrar. A outra
-- pessoa só vê o que a dona PROMOVE a compra — e aí vê a compra, não a transação.
-- ============================================================================

create table public.transacao_bancaria (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  conexao_id             uuid not null references public.conexao_bancaria (id) on delete cascade,
  conta_id               uuid not null references public.conta_bancaria (id) on delete cascade,

  -- O `id` da Pluggy MUDA quando o banco altera o dado; serve para casar o
  -- webhook de exclusão, não para deduplicar. Quem deduplica é `provider_id`.
  pluggy_id              text not null,
  provider_id            text not null,

  descricao              text not null,
  -- Sempre positivo; a direção é `sentido` (pegadinha 5 do plano). O resto do
  -- app nunca precisa saber a convenção de sinal de cartão vs. conta.
  valor                  numeric(12,2) not null check (valor >= 0),
  sentido                text not null check (sentido in ('saida', 'entrada')),
  -- Data de calendário em Brasília, nunca o UTC truncado (pegadinha 6).
  data                   date not null,
  -- Mês da fatura quando ela é conhecida, senão o da data (pegadinha 7).
  competencia            date not null check (extract(day from competencia) = 1),
  pendente               boolean not null default false,

  -- creditCardMetadata — uma linha por parcela, como a Pluggy manda.
  parcela_numero         int,
  parcelas_total         int,
  valor_total_compra     numeric(12,2),
  data_compra            date,
  fatura_id              text,
  /*
    O que junta as N parcelas de uma compra (`chaveDaCompra`). A primeira
    parcela classificada cria a compra; as seguintes, ao chegar, só se
    vinculam a ela — o gatilho `vincular_parcela` abaixo.
  */
  chave_compra           text,

  -- paymentData (Pix, TED, boleto) — é por aqui que a conciliação do acerto
  -- reconhece um Pix entre os dois (fase 6).
  contraparte_nome       text,
  contraparte_documento  text,
  metodo                 text,

  -- Só vem durante o trial da Pluggy (pegadinha 9). Guardado como pista, nunca
  -- como a categoria do app — essas são por espaço e têm os nomes de vocês.
  categoria_pluggy       text,

  /*
    Contagem dupla reconhecida na entrada (pegadinha 3). Com motivo, a
    transação já nasce `destino = 'ignorada'` e não aparece na caixa de entrada.
  */
  motivo_exclusao        text check (motivo_exclusao in ('pagamento_fatura', 'transferencia_propria', 'valor_zero')),

  /*
    O que a pessoa decidiu. `null` = está na caixa de entrada.
      'compra'    virou (ou foi vinculada a) uma compra — `compra_id`
      'ignorada'  some da caixa e não volta
      'renda'     é o salário recebido (renda_recebida, da Frente A)
      'aporte'    é um aporte numa meta (meta_aporte, da Frente A)
  */
  destino                text check (destino in ('compra', 'ignorada', 'renda', 'aporte')),
  /*
    O vínculo mora AQUI, não na compra: várias transações (as parcelas)
    apontam para a mesma compra, e a compra no espaço do casal não carrega nada
    do extrato de ninguém. Apagar a compra devolve a transação para a caixa de
    entrada (gatilho `voltar_para_caixa`).
  */
  compra_id              uuid references public.compra (id) on delete set null,
  classificada_em        timestamptz,

  importada_em           timestamptz not null default now(),
  atualizada_em          timestamptz not null default now(),

  -- Invariante 3 do plano: reimportar o mesmo período não duplica nada.
  unique (user_id, provider_id),

  constraint transacao_compra_tem_compra
    check (destino is distinct from 'compra' or compra_id is not null)
);

-- A caixa de entrada: as não classificadas de uma pessoa, das mais novas.
create index transacao_bancaria_caixa_idx
  on public.transacao_bancaria (user_id, data desc)
  where destino is null;

create index transacao_bancaria_chave_compra_idx
  on public.transacao_bancaria (user_id, chave_compra)
  where chave_compra is not null;

create index transacao_bancaria_compra_idx on public.transacao_bancaria (compra_id);
create index transacao_bancaria_conta_idx  on public.transacao_bancaria (conta_id, data);

-- ----------------------------------------------------------------------------
-- Gatilhos
-- ----------------------------------------------------------------------------

/*
  As parcelas seguintes só se vinculam (pegadinha 2): se outra parcela da mesma
  compra já virou compra, a que chega agora nasce apontando para ela, fora da
  caixa de entrada. Sem isto, a parcela 4 de 10 apareceria todo mês pedindo
  para ser classificada de novo — e uma classificação distraída a duplicaria.
*/
create function public.vincular_parcela()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.chave_compra is not null and new.destino is null then
    select t.compra_id into new.compra_id
    from public.transacao_bancaria t
    where t.user_id = new.user_id
      and t.chave_compra = new.chave_compra
      and t.compra_id is not null
    limit 1;

    if new.compra_id is not null then
      new.destino := 'compra';
      new.classificada_em := now();
    end if;
  end if;

  return new;
end;
$$;

create trigger transacao_bancaria_vincular_parcela
  before insert on public.transacao_bancaria
  for each row execute function public.vincular_parcela();

/*
  Duas regras de escrita:

  1. A compra apagada devolve a transação para a caixa de entrada. O
     `on delete set null` zera `compra_id`, e este gatilho — que roda nesse
     update — zera o destino junto (senão o CHECK recusaria o próprio delete
     da compra).
  2. Só se vincula a compra de um espaço de que a dona da transação é membro.
     Um `compra_id` qualquer não vaza nada (a compra é invisível a quem não é do
     espaço), mas deixaria a transação "classificada" num lugar que ela não vê.
*/
create function public.validar_transacao_bancaria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Só quando a compra SUMIU (old tinha, new não): um "compra sem compra_id"
  -- vindo do client continua batendo no CHECK, em vez de virar no-op mudo.
  if new.compra_id is null and old.compra_id is not null and new.destino = 'compra' then
    new.destino := null;
    new.classificada_em := null;
  end if;

  if new.compra_id is not null
     and new.compra_id is distinct from old.compra_id
     and not exists (
       select 1
       from public.compra c
       join public.membership m on m.space_id = c.space_id
       where c.id = new.compra_id and m.user_id = new.user_id
     ) then
    raise exception 'a compra pertence a um espaço de que você não é membro';
  end if;

  new.atualizada_em := now();
  return new;
end;
$$;

create trigger transacao_bancaria_validar
  before update on public.transacao_bancaria
  for each row execute function public.validar_transacao_bancaria();

-- ----------------------------------------------------------------------------
-- RLS — invariante 1 do plano: nenhuma transação é legível por outra pessoa
-- ----------------------------------------------------------------------------

alter table public.transacao_bancaria enable row level security;

/*
  `user_id = auth.uid()`, sem exceção — nem quem divide o espaço lê. Não há
  `shares_space_with` aqui de propósito, e é a diferença para as playlists.
*/
create policy transacao_bancaria_select on public.transacao_bancaria
  for select to authenticated
  using (user_id = auth.uid());

create policy transacao_bancaria_update on public.transacao_bancaria
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy transacao_bancaria_delete on public.transacao_bancaria
  for delete to authenticated
  using (user_id = auth.uid());

/*
  Sem policy de INSERT: o extrato só entra pela sincronização (service_role, que
  ignora RLS). Uma transação inventada pelo client seria um extrato falso.

  E o UPDATE do dono é só da CLASSIFICAÇÃO. Valor, data e descrição são o que o
  banco disse; deixar o client reescrevê-los tiraria do extrato a única
  propriedade que ele tem — ser o registro do banco. O privilégio por coluna é
  quem garante isso, independentemente da policy.
*/
revoke insert, update on public.transacao_bancaria from anon, authenticated;
grant select, delete on public.transacao_bancaria to authenticated;
grant update (destino, compra_id, classificada_em) on public.transacao_bancaria to authenticated;
grant all on public.transacao_bancaria to service_role;

-- ----------------------------------------------------------------------------
-- Ingestão
-- ----------------------------------------------------------------------------

/*
  Grava um lote de transações já normalizadas de UMA conta, numa transação só.

  Upsert por (user_id, provider_id) — a idempotência do invariante 3. No
  conflito, reescreve o que é do banco (valor, data, pendente → lançada…) e
  NUNCA a classificação: um reimport não pode desfazer o que a pessoa decidiu.
  A única exceção é a contagem dupla reconhecida depois (a categoria chegou
  atrasada): ela tira da caixa de entrada o que ainda estava lá, e só isso.

  `categoria_pluggy` não é apagada quando para de vir — o trial acaba e o
  campo vira null, mas o que ele disse antes continua sendo a melhor pista.

  As PENDENTES do período que não vieram de novo somem. No Open Finance a
  transação pendente pode voltar como lançada com outro providerId, e sem esta
  faxina a mesma compra apareceria duas vezes na caixa de entrada. Só some o
  que ainda está na caixa: o que a pessoa já classificou fica.
*/
create function public.ingerir_transacoes(
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
    contraparte_documento, metodo, categoria_pluggy, motivo_exclusao, destino,
    classificada_em
  )
  select
    v_conta.user_id, v_conta.conexao_id, v_conta.id, x.pluggy_id, x.provider_id,
    x.descricao, x.valor, x.sentido, x.data, x.competencia, coalesce(x.pendente, false),
    x.parcela_numero, x.parcelas_total, x.valor_total_compra, x.data_compra,
    x.fatura_id, x.chave_compra, x.contraparte_nome, x.contraparte_documento,
    x.metodo, x.categoria_pluggy, x.motivo_exclusao,
    case when x.motivo_exclusao is not null then 'ignorada' end,
    case when x.motivo_exclusao is not null then now() end
  from jsonb_to_recordset(p_linhas) as x(
    pluggy_id text, provider_id text, descricao text, valor numeric, sentido text,
    data date, competencia date, pendente boolean, parcela_numero int,
    parcelas_total int, valor_total_compra numeric, data_compra date,
    fatura_id text, chave_compra text, contraparte_nome text,
    contraparte_documento text, metodo text, categoria_pluggy text,
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

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

revoke all on function public.vincular_parcela()            from public, anon, authenticated;
revoke all on function public.validar_transacao_bancaria()  from public, anon, authenticated;
revoke all on function public.ingerir_transacoes(uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.ingerir_transacoes(uuid, date, jsonb) to service_role;
