-- ============================================================================
-- APPingos — Metas (Objetivos › Metas): valor-alvo, prazo e aportes.
--
-- Contrato com a Frente B (Pluggy): docs/contrato-planejamento-open-finance.md,
-- seção 6.
--
-- Três decisões sustentam o módulo:
--
--   1. A meta mora num espaço, como tudo no app: a pessoal no pessoal, a do casal
--      no do casal. O presente surpresa é uma meta pessoal, e a privacidade dele é
--      a mesma das compras pessoais — estrutural, pela policy de membro, e não um
--      filtro que alguém precisa lembrar de aplicar.
--   2. O progresso é a SOMA DOS APORTES, derivada e nunca armazenada — a mesma
--      régua do `SaldoDoMes`. Um campo `acumulado` seria uma segunda verdade, e a
--      primeira importação com aporte duplicado mostraria as duas discordando.
--   3. Aporte é RESERVA NO APP (decisão 5). Não aponta para conta nenhuma, não é
--      compra e não entra em `SaldoDoMes`, `acerto_mes`, total do mês nem gasto
--      por categoria. Ele só sai da sobra do mês, na projeção do Planejamento.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabelas
-- ----------------------------------------------------------------------------

/*
  `estado` é texto com CHECK, não enum — mesmo padrão de `papel`, `tipo` e do
  estado do interesse: acrescentar um valor é alterar a constraint.

  'abandonada' é destino de primeira classe, como 'arquivado' em Interesses: a
  meta que não fazia mais sentido não precisa ser apagada (os aportes contam a
  história do que foi guardado).

  `cumprida_em` acompanha o estado pelo gatilho abaixo, e o CHECK garante que os
  dois nunca discordam.

  `interesse_id` é de onde a meta veio ("transformar interesse em meta"). `on
  delete set null`: apagar a vontade não apaga o dinheiro guardado para ela.
*/
create table public.meta (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.space (id) on delete cascade,
  criado_por    uuid not null references auth.users (id) on delete cascade,
  titulo        text not null check (trim(titulo) <> ''),
  valor_alvo    numeric(12,2) not null check (valor_alvo > 0),
  prazo         date,
  interesse_id  uuid references public.interesse (id) on delete set null,
  estado        text not null default 'ativa'
                  check (estado in ('ativa', 'pausada', 'cumprida', 'abandonada')),
  cumprida_em   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint meta_cumprida_coerente check ((estado = 'cumprida') = (cumprida_em is not null))
);

create index meta_space_idx on public.meta (space_id);
create index meta_interesse_idx on public.meta (interesse_id) where interesse_id is not null;

/*
  Valor com sinal: positivo guarda, negativo resgata. Uma tabela só para os dois
  sentidos é o que mantém o progresso como uma soma simples — dois tipos de linha
  pediriam um `case` em toda leitura, e a primeira que esquecesse o sinal
  mostraria o resgate como aporte.

  `competencia` é GERADA a partir de `data`, e não um campo à parte: o aporte não
  tem fechamento de cartão para separar as duas coisas, e uma competência
  digitada à mão só criaria o caso "aporte de 03/11 contado em outubro".

  `transacao_id` nasce sem FK, como em `renda_recebida`: a constraint é da Frente
  B, depois que `transacao_bancaria` existir.
*/
create table public.meta_aporte (
  id            uuid primary key default gen_random_uuid(),
  meta_id       uuid not null references public.meta (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  valor         numeric(12,2) not null check (valor <> 0),
  data          date not null default current_date,
  competencia   date generated always as ((date_trunc('month', data::timestamp))::date) stored,
  origem        text not null default 'manual' check (origem in ('manual', 'pluggy')),
  transacao_id  uuid,
  created_at    timestamptz not null default now()
);

create index meta_aporte_meta_idx on public.meta_aporte (meta_id);
create index meta_aporte_user_competencia_idx on public.meta_aporte (user_id, competencia);

-- ----------------------------------------------------------------------------
-- O carimbo da meta cumprida
-- ----------------------------------------------------------------------------

/*
  `cumprida_em` é carimbado aqui, e não pela tela, pelo mesmo motivo de
  `planejado_em` em Filmes: o momento em que a meta virou cumprida é um fato do
  banco, e é dele que a regra de Pins `objetivo_cumprido` lê se a meta foi batida
  dentro do prazo.

  O `tg_op` vai num IF próprio — num gatilho de INSERT o registro OLD não está
  atribuído, e uma condição só com `old.estado` estouraria (ver
  `carimbar_planejado_em`).
*/
create function public.carimbar_meta_cumprida()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estado <> 'cumprida' then
    new.cumprida_em := null;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.cumprida_em := now();
    return new;
  end if;

  if old.estado is distinct from 'cumprida' then
    new.cumprida_em := now();
  else
    new.cumprida_em := old.cumprida_em;
  end if;

  return new;
end;
$$;

create trigger meta_carimbar_cumprida
  before insert or update on public.meta
  for each row execute function public.carimbar_meta_cumprida();

create trigger meta_updated_at
  before update on public.meta
  for each row execute function public.tocar_updated_at();

-- ----------------------------------------------------------------------------
-- Integridade que o CHECK não alcança
-- ----------------------------------------------------------------------------

/*
  Quem aporta precisa ser membro do espaço da meta — sem isso, um `user_id` de
  fora apareceria no "Ana R$ 800 · Matheus R$ 1.200" de um casal que não é o
  dele. A policy já exige `user_id = auth.uid()`; o gatilho é o que vale também
  sem JWT (a sincronização da Pluggy roda com service_role).
*/
create function public.validar_meta_aporte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.meta mt
    join public.membership m on m.space_id = mt.space_id
    where mt.id = new.meta_id and m.user_id = new.user_id
  ) then
    raise exception 'quem aporta precisa ser membro do espaço da meta';
  end if;

  return new;
end;
$$;

create trigger meta_aporte_validar
  before insert or update on public.meta_aporte
  for each row execute function public.validar_meta_aporte();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.meta        enable row level security;
alter table public.meta_aporte enable row level security;

/*
  meta — qualquer membro do espaço cria, edita e muda o estado (a meta do casal é
  dos dois). Apagar é do autor ou do admin, como em `interesse`: abandonar é a
  saída de quem desistiu, e apagar some com o histórico de aportes do outro.
*/
create policy meta_select on public.meta
  for select to authenticated
  using (public.is_space_member(space_id));

create policy meta_insert on public.meta
  for insert to authenticated
  with check (public.is_space_member(space_id) and criado_por = auth.uid());

create policy meta_update on public.meta
  for update to authenticated
  using (public.is_space_member(space_id))
  with check (public.is_space_member(space_id));

create policy meta_delete on public.meta
  for delete to authenticated
  using (
    public.is_space_member(space_id)
    and (criado_por = auth.uid() or public.is_space_admin(space_id))
  );

/*
  meta_aporte — lê quem lê a meta. Cada um registra o PRÓPRIO aporte: guardar
  dinheiro em nome do outro seria afirmar um fato sobre o bolso dele. Sem policy
  de UPDATE: um aporte errado se apaga e se registra de novo, que é o que a tela
  oferece. Apagar é de quem aportou, ou do admin do espaço.
*/
create policy meta_aporte_select on public.meta_aporte
  for select to authenticated
  using (exists (
    select 1 from public.meta mt
    where mt.id = meta_id and public.is_space_member(mt.space_id)
  ));

create policy meta_aporte_insert on public.meta_aporte
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.meta mt
      where mt.id = meta_id and public.is_space_member(mt.space_id)
    )
  );

create policy meta_aporte_delete on public.meta_aporte
  for delete to authenticated
  using (exists (
    select 1 from public.meta mt
    where mt.id = meta_id
      and public.is_space_member(mt.space_id)
      and (user_id = auth.uid() or public.is_space_admin(mt.space_id))
  ));

-- ----------------------------------------------------------------------------
-- RPCs
-- ----------------------------------------------------------------------------

/*
  Criar uma meta, e — quando ela vem de um interesse — marcar a conversão no
  interesse na mesma transação. São duas tabelas, daí a RPC: sem ela existiria o
  estado "meta criada, interesse ainda em aberto", e o interesse continuaria na
  lista de vontades como se ninguém tivesse feito nada com ele.

  `convertido_tipo = 'objetivo'`: é o valor que o CHECK de `interesse` já aceita,
  e uma meta é o que Objetivos chama de objetivo. Nenhuma migration em
  `interesse` foi necessária — as colunas `convertido_*` nasceram esperando isto.

  SECURITY INVOKER: as policies já dizem quem cria a meta (membro do espaço) e
  quem altera o interesse (quem o alcança — e o gatilho de intenção do interesse
  deixa qualquer um que o alcance mexer no estado).
*/
create function public.criar_meta(
  p_space       uuid,
  p_titulo      text,
  p_valor_alvo  numeric,
  p_prazo       date default null,
  p_interesse   uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_meta uuid;
begin
  if p_interesse is not null and not public.pode_ver_interesse(p_interesse) then
    raise exception 'interesse não encontrado';
  end if;

  insert into public.meta (space_id, criado_por, titulo, valor_alvo, prazo, interesse_id)
  values (p_space, auth.uid(), trim(p_titulo), p_valor_alvo, p_prazo, p_interesse)
  returning id into v_meta;

  if p_interesse is not null then
    update public.interesse
    set estado            = 'convertido',
        convertido_em     = now(),
        convertido_tipo   = 'objetivo',
        convertido_ref_id = v_meta
    where id = p_interesse;

    if not found then
      raise exception 'você não tem permissão para converter este interesse';
    end if;
  end if;

  return v_meta;
end;
$$;

/*
  Guardar (valor positivo) ou resgatar (negativo) numa meta.

  A meta é travada (`for update`) antes da soma: dois aportes simultâneos — os
  dois do casal no mesmo minuto, ou a Pluggy e a pessoa — leriam o mesmo
  acumulado e um deles decidiria o estado com um número velho.

  Regras, nesta ordem:
    1. Resgatar não pode deixar o guardado negativo. Tirar mais do que se guardou
       não é reserva, é um número errado.
    2. Guardar numa meta cumprida ou abandonada é recusado: o dinheiro iria para
       uma meta que não está mais andando. Resgatar continua valendo nas duas —
       é assim que o dinheiro reservado sai para a compra.
    3. O aporte que faz o guardado alcançar o alvo marca a meta como cumprida.
       O contrário não acontece: resgatar depois de cumprir é gastar o que foi
       juntado para isso, não voltar atrás na meta.

  `auth.uid()` é quem aporta, e por isso esta RPC pede JWT. A caixa de entrada da
  Frente B chama com o usuário que classificou a transação.
*/
create function public.registrar_aporte(
  p_meta       uuid,
  p_valor      numeric,
  p_data       date default current_date,
  p_origem     text default 'manual',
  p_transacao  uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_meta      public.meta%rowtype;
  v_guardado  numeric;
  v_aporte    uuid;
begin
  if auth.uid() is null then
    raise exception 'registrar aporte exige um usuário autenticado';
  end if;

  if coalesce(p_valor, 0) = 0 then
    raise exception 'o aporte precisa de um valor diferente de zero';
  end if;

  select * into v_meta from public.meta where id = p_meta for update;

  if v_meta.id is null then
    raise exception 'meta não encontrada';
  end if;

  select coalesce(sum(a.valor), 0) into v_guardado
  from public.meta_aporte a
  where a.meta_id = p_meta;

  if v_guardado + p_valor < 0 then
    raise exception 'o resgate é maior do que o guardado nesta meta';
  end if;

  if p_valor > 0 and v_meta.estado in ('cumprida', 'abandonada') then
    raise exception 'esta meta não está mais recebendo aportes';
  end if;

  insert into public.meta_aporte (meta_id, user_id, valor, data, origem, transacao_id)
  values (p_meta, auth.uid(), p_valor, coalesce(p_data, current_date),
          coalesce(p_origem, 'manual'), p_transacao)
  returning id into v_aporte;

  if p_valor > 0 and v_meta.estado = 'ativa' and v_guardado + p_valor >= v_meta.valor_alvo then
    update public.meta set estado = 'cumprida' where id = p_meta;
  end if;

  return v_aporte;
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

-- Ver a nota de GRANT em 20261112120000_planejamento_renda.sql.
grant select, insert, update, delete on public.meta        to authenticated;
grant select, insert, delete         on public.meta_aporte to authenticated;

revoke all on function public.carimbar_meta_cumprida() from public, anon, authenticated;
revoke all on function public.validar_meta_aporte()    from public, anon, authenticated;

revoke all on function public.criar_meta(uuid, text, numeric, date, uuid) from public, anon;
grant execute on function public.criar_meta(uuid, text, numeric, date, uuid) to authenticated;

revoke all on function public.registrar_aporte(uuid, numeric, date, text, uuid) from public, anon;
grant execute on function public.registrar_aporte(uuid, numeric, date, text, uuid) to authenticated;
