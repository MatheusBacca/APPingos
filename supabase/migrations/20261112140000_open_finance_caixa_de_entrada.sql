-- ============================================================================
-- APPingos — Open Finance (Pluggy): a caixa de entrada.
--
-- Fase 5 de docs/notion-plano-open-finance.md — "lançar vira classificar" — já
-- sobre o contrato ESTÁVEL da Frente A (docs/contrato-planejamento-open-finance.md).
-- Depois de 20261112120200 de propósito: referencia `renda_recebida`,
-- `meta_aporte`, `registrar_aporte` e `mover_compra`, que são da Frente A.
--
-- Cada destino da caixa é uma RPC SECURITY INVOKER: quem classifica é a dona da
-- transação, com o JWT dela, e as policies de `compra`, `renda_recebida` e
-- `meta_aporte` valem como num lançamento manual. A única exceção é a entrada
-- automática do cartão designado, que roda na sincronização (service_role) e
-- por isso é SECURITY DEFINER e só o service_role executa.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- As FKs que cruzam as frentes (contrato, "Regras de convivência")
-- ----------------------------------------------------------------------------

/*
  Nascem aqui, e não na Frente A, porque `transacao_bancaria` é desta frente.
  `on delete set null`: desconectar o banco apaga o extrato, mas o salário que
  caiu e o aporte que foi feito continuam sendo fatos — só perdem a prova.

  E cada transação vira no máximo UM salário e UM aporte: sem o índice único, um
  duplo toque na caixa de entrada contaria o mesmo crédito duas vezes.
*/
alter table public.renda_recebida
  add constraint renda_recebida_transacao_id_fkey
  foreign key (transacao_id) references public.transacao_bancaria (id) on delete set null;

alter table public.meta_aporte
  add constraint meta_aporte_transacao_id_fkey
  foreign key (transacao_id) references public.transacao_bancaria (id) on delete set null;

create unique index renda_recebida_transacao_idx
  on public.renda_recebida (transacao_id) where transacao_id is not null;

create unique index meta_aporte_transacao_idx
  on public.meta_aporte (transacao_id) where transacao_id is not null;

-- ----------------------------------------------------------------------------
-- Desde quando o cartão está designado
-- ----------------------------------------------------------------------------

/*
  Marcar um cartão como "do casal" vale DAQUI PARA A FRENTE. Sem esta data, a
  primeira sincronização depois de marcar (que relê 10 dias para trás) lançaria
  no espaço do casal compras que já estavam esperando na caixa de entrada — e
  que a pessoa pode ter deixado lá de propósito.
*/
alter table public.conta_bancaria
  add column designada_em timestamptz not null default now();

create or replace function public.validar_conta_bancaria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.conexao_bancaria c
    where c.id = new.conexao_id and c.user_id = new.user_id
  ) then
    raise exception 'a conta pertence a uma conexão de outra pessoa';
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

  -- `old` só existe no UPDATE, então o teste dele fica num IF próprio.
  if tg_op = 'INSERT' then
    new.designada_em := now();
  elsif new.destino is distinct from old.destino or new.space_id is distinct from old.space_id then
    new.designada_em := now();
  end if;

  new.atualizado_em := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- O que todas as RPCs da caixa conferem
-- ----------------------------------------------------------------------------

/*
  A transação, se ela é da pessoa e está na caixa. Lê com a RLS de quem chama
  (SECURITY INVOKER): a transação de outra pessoa simplesmente "não existe".
  Pendente não se classifica — ela pode sumir ou voltar com outro id, e a
  classificação iria junto para o limbo.
*/
create function public.transacao_da_caixa(p_transacao uuid)
returns public.transacao_bancaria
language plpgsql
set search_path = ''
as $$
declare
  v public.transacao_bancaria%rowtype;
begin
  select * into v from public.transacao_bancaria
  where id = p_transacao and user_id = auth.uid()
  for update;

  if v.id is null then
    raise exception 'transação não encontrada';
  end if;
  if v.destino is not null then
    raise exception 'esta transação já foi classificada';
  end if;
  if v.pendente then
    raise exception 'a transação ainda está pendente no banco — espere ela ser lançada';
  end if;

  return v;
end;
$$;

-- ----------------------------------------------------------------------------
-- Compartilhada / Pessoal — vira compra
-- ----------------------------------------------------------------------------

/*
  Cria a compra pelo `registrar_compra` de sempre (rateio, categoria e as
  validações valem igual a um lançamento manual) e vincula a transação — e, se
  ela é parcela, TODAS as irmãs que estão na caixa (pegadinha 2: compra
  parcelada é uma linha só). As parcelas que ainda vão chegar se vinculam
  sozinhas pelo gatilho `vincular_parcela`.

  Os campos da compra vêm de quem chama, e não são recalculados aqui: a tela
  mostra o plano (`planoDaCompra`, com o recuo da competência) e a pessoa pode
  ajustar descrição e rateio antes de salvar. `pago_por` é sempre quem chama —
  o extrato é dela, então foi ela quem pagou.
*/
create function public.classificar_compra(
  p_transacao            uuid,
  p_space                uuid,
  p_descricao            text,
  p_valor_total          numeric,
  p_data_compra          date,
  p_competencia_inicial  date,
  p_parcelas             int,
  p_participantes        jsonb,
  p_categoria_nome       text default null,
  p_categoria_cor        text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v       public.transacao_bancaria%rowtype;
  v_compra uuid;
begin
  v := public.transacao_da_caixa(p_transacao);

  if v.sentido <> 'saida' then
    raise exception 'só gasto vira compra — uma entrada é salário, resgate ou estorno';
  end if;

  v_compra := public.registrar_compra(
    p_space, p_descricao, p_valor_total, p_data_compra, p_competencia_inicial,
    p_parcelas, auth.uid(), p_participantes, p_categoria_nome, p_categoria_cor
  );

  update public.transacao_bancaria
  set destino = 'compra', compra_id = v_compra, classificada_em = now()
  where user_id = auth.uid()
    and (id = v.id or (v.chave_compra is not null and chave_compra = v.chave_compra and destino is null));

  return v_compra;
end;
$$;

-- ----------------------------------------------------------------------------
-- Já lancei — vincula a uma compra que existe
-- ----------------------------------------------------------------------------

/*
  O lançamento manual feito na hora encontra o extrato no dia seguinte (pegadinha
  10). A compra precisa ser de um espaço de que a pessoa é membro — conferido
  pelo gatilho `validar_transacao_bancaria` —, e as irmãs da parcela vão junto.
*/
create function public.vincular_transacao(p_transacao uuid, p_compra uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v public.transacao_bancaria%rowtype;
begin
  v := public.transacao_da_caixa(p_transacao);

  if not exists (select 1 from public.compra where id = p_compra) then
    raise exception 'compra não encontrada';
  end if;

  update public.transacao_bancaria
  set destino = 'compra', compra_id = p_compra, classificada_em = now()
  where user_id = auth.uid()
    and (id = v.id or (v.chave_compra is not null and chave_compra = v.chave_compra and destino is null));
end;
$$;

-- ----------------------------------------------------------------------------
-- Receita → salário recebido
-- ----------------------------------------------------------------------------

/*
  Marca "o salário daquela competência caiu" em `renda_recebida`, com
  `origem = 'pluggy'` e o vínculo com a transação. A competência vem de quem
  chama: a tela casa a data do crédito com `dataPrevistaDoSalario` (o salário
  do 5º dia útil de dezembro pode cair em 30/11 e ainda ser de dezembro).

  Se o mês já estava marcado à mão, a marcação vira a do banco (valor e data
  reais). Se já estava casado com OUTRA transação, recusa: dois créditos não são
  o mesmo salário.
*/
create function public.classificar_renda(p_transacao uuid, p_competencia date)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v public.transacao_bancaria%rowtype;
begin
  v := public.transacao_da_caixa(p_transacao);

  if v.sentido <> 'entrada' then
    raise exception 'salário é uma entrada na conta';
  end if;

  if exists (
    select 1 from public.renda_recebida r
    where r.user_id = auth.uid()
      and r.competencia = date_trunc('month', p_competencia)::date
      and r.transacao_id is not null
      and r.transacao_id <> v.id
  ) then
    raise exception 'o salário deste mês já foi casado com outro crédito do extrato';
  end if;

  insert into public.renda_recebida (user_id, competencia, valor, recebido_em, origem, transacao_id)
  values (auth.uid(), date_trunc('month', p_competencia)::date, v.valor, v.data, 'pluggy', v.id)
  on conflict (user_id, competencia) do update set
    valor        = excluded.valor,
    recebido_em  = excluded.recebido_em,
    origem       = 'pluggy',
    transacao_id = excluded.transacao_id;

  update public.transacao_bancaria
  set destino = 'renda', classificada_em = now()
  where id = v.id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Aporte em meta
-- ----------------------------------------------------------------------------

/*
  Pelo `registrar_aporte` da Frente A, com `origem = 'pluggy'`. Saída da conta
  (para a caixinha, o investimento) é aporte; entrada (o resgate voltando) é
  aporte negativo. A meta continua sendo reserva no app (decisão 5): isto só
  registra que o dinheiro foi separado, a transação não "vira" nada no espaço.
*/
create function public.classificar_aporte(p_transacao uuid, p_meta uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v        public.transacao_bancaria%rowtype;
  v_aporte uuid;
begin
  v := public.transacao_da_caixa(p_transacao);

  v_aporte := public.registrar_aporte(
    p_meta,
    case when v.sentido = 'saida' then v.valor else -v.valor end,
    v.data,
    'pluggy',
    v.id
  );

  update public.transacao_bancaria
  set destino = 'aporte', classificada_em = now()
  where id = v.id;

  return v_aporte;
end;
$$;

-- ----------------------------------------------------------------------------
-- Reclassificar — mover a compra de gaveta
-- ----------------------------------------------------------------------------

/*
  `mover_compra` (Frente A) apaga e recria, e devolve o id NOVO. O `on delete
  set null` solta as transações da compra velha (e o gatilho as devolve para a
  caixa); aqui elas são religadas à nova, na mesma transação. Sem isto, mover
  uma compra importada a faria reaparecer na caixa de entrada.

  Só as transações de quem chama são religadas (é o que a RLS deixa ver). Se a
  outra pessoa tinha vinculado o extrato DELA à mesma compra ("Já lancei"), a
  dela volta para a caixa dela — o que é o certo: a compra mudou de lugar, e
  cabe a ela decidir de novo.
*/
create function public.reclassificar_compra(
  p_compra         uuid,
  p_space_destino  uuid,
  p_participantes  jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_ids  uuid[];
  v_nova uuid;
begin
  select array_agg(id) into v_ids
  from public.transacao_bancaria
  where compra_id = p_compra and user_id = auth.uid();

  v_nova := public.mover_compra(p_compra, p_space_destino, p_participantes);

  if v_ids is not null then
    update public.transacao_bancaria
    set destino = 'compra', compra_id = v_nova, classificada_em = now()
    where id = any(v_ids);
  end if;

  return v_nova;
end;
$$;

-- ----------------------------------------------------------------------------
-- Devolver para a caixa
-- ----------------------------------------------------------------------------

/*
  Desfaz uma classificação que não criou nada: o "Ignorar" (inclusive o que a
  regra de contagem dupla ignorou sozinha e errou) e o vínculo de "Já lancei" —
  a compra fica, só a transação solta. Salário e aporte desfazem-se apagando o
  registro na tela da Frente A; a transação volta por lá.
*/
create function public.devolver_para_caixa(p_transacao uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.transacao_bancaria
  set destino = null, compra_id = null, classificada_em = null
  where id = p_transacao
    and user_id = auth.uid()
    and destino in ('ignorada', 'compra');

  if not found then
    raise exception 'só dá para devolver à caixa o que foi ignorado ou vinculado';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- O cartão designado — a entrada automática
-- ----------------------------------------------------------------------------

/*
  Decisão nº 3 de 12/11/2026: as compras do cartão do casal ENTRAM no espaço do
  casal, 50% para cada um, editáveis depois. Marcar o cartão é o toque humano
  que a invariante 4 do plano pedia. 'pessoal' segue a mesma lógica, no espaço
  pessoal de quem conectou, com 100% dela.

  Roda na sincronização, sem JWT — por isso SECURITY DEFINER e só o service_role
  executa. Insere a compra direto (e não por `registrar_compra`, que exige
  `auth.uid()`), com `registrado_por` = a dona do cartão: é ele que os gatilhos
  de notificação e de Pins usam quando não há usuário na sessão.

  `p_compras` vem da Edge Function, montado por `comprasParaLancar`
  (_shared/importacao-bancaria.ts) — o plano de cada compra já com o recuo das
  parcelas:
    [{ "provider_ids": [...], "descricao": "...", "valor_total": 300,
       "parcelas": 3, "data_compra": "2026-11-07",
       "competencia_inicial": "2026-11-01" }, ...]

  Entra só o que: é desta conta, é gasto, não é pendente, não é contagem dupla,
  ainda está na caixa e aconteceu DEPOIS de o cartão ter sido designado.

  O rateio é o de `rateioIgual` (Frente A) em SQL: percentual igual entre os
  membros, o primeiro absorvendo o resto do arredondamento — como
  `dividirIgualmente`.
*/
create function public.lancar_compras_do_cartao(p_conta uuid, p_compras jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta   public.conta_bancaria%rowtype;
  v_space   uuid;
  v_item    jsonb;
  v_ids     uuid[];
  v_chave   text;
  v_compra  uuid;
  v_membros uuid[];
  v_n       int;
  v_fatia   numeric;
  v_total   int := 0;
begin
  select * into v_conta from public.conta_bancaria where id = p_conta;
  if v_conta.id is null or v_conta.destino not in ('casal', 'pessoal') then
    return 0;
  end if;

  if v_conta.destino = 'casal' then
    v_space := v_conta.space_id;
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
      and t.data >= (v_conta.designada_em at time zone 'America/Sao_Paulo')::date;

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

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

revoke all on function public.transacao_da_caixa(uuid) from public, anon;
grant execute on function public.transacao_da_caixa(uuid) to authenticated;

revoke all on function public.classificar_compra(uuid, uuid, text, numeric, date, date, int, jsonb, text, text) from public, anon;
grant execute on function public.classificar_compra(uuid, uuid, text, numeric, date, date, int, jsonb, text, text) to authenticated;

revoke all on function public.vincular_transacao(uuid, uuid) from public, anon;
grant execute on function public.vincular_transacao(uuid, uuid) to authenticated;

revoke all on function public.classificar_renda(uuid, date) from public, anon;
grant execute on function public.classificar_renda(uuid, date) to authenticated;

revoke all on function public.classificar_aporte(uuid, uuid) from public, anon;
grant execute on function public.classificar_aporte(uuid, uuid) to authenticated;

revoke all on function public.reclassificar_compra(uuid, uuid, jsonb) from public, anon;
grant execute on function public.reclassificar_compra(uuid, uuid, jsonb) to authenticated;

revoke all on function public.devolver_para_caixa(uuid) from public, anon;
grant execute on function public.devolver_para_caixa(uuid) to authenticated;

revoke all on function public.lancar_compras_do_cartao(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.lancar_compras_do_cartao(uuid, jsonb) to service_role;
