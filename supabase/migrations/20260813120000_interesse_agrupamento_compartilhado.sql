-- ============================================================================
-- ⚠️  NÃO APLIQUE ESTA MIGRATION SOZINHA — ELA QUEBRA O APP EM PRODUÇÃO.
--
-- Ela REMOVE `interesse_produto.escolhido`, e o app publicado hoje lê essa coluna
-- (`CAMPOS_PRODUTO` em app/composables/useInteresses.ts, e `precoEfetivo` /
-- `produtoDoInteresse` em app/types/interesse.ts). Entre o `db push` e o deploy do
-- app novo, a tela de Interesses erra a consulta e não carrega.
--
-- Aplique junto com o deploy que move o app para agrupamentos. A extensão 0.2.0
-- instalada continua funcionando (as RPCs dela foram preservadas de propósito — ver
-- a última seção); o que não sobrevive é o app antigo.
-- ============================================================================
--
-- APPingos — Interesses: agrupamentos de produtos, e interesse compartilhado.
--
-- Três mudanças estruturais, e uma restrição que amarra as três.
--
-- ## 1. O que se compara passa a ser um AGRUPAMENTO, não um produto
--
-- "Monitor novo" não é um produto: é um monitor MAIS um suporte de braço. Comparar
-- produto contra produto não responde "quanto custa esse interesse" quando a
-- vontade precisa de duas caixas.
--
-- Então entra um nível no meio: `interesse_agrupamento`. Um interesse tem N
-- agrupamentos, cada agrupamento tem N produtos, e UM agrupamento é o escolhido. O
-- custo do interesse é a soma do agrupamento escolhido, e a comparação é contra a
-- soma do agrupamento mais barato — a mesma conta de antes, um nível acima.
--
-- Produto solto não é caso especial: é um agrupamento de um produto. Isso mantém a
-- matemática com um caminho só, em vez de "se tem agrupamento faz assim, senão
-- assim".
--
-- `escolhido` MUDA DE TABELA: sai de `interesse_produto`, entra em
-- `interesse_agrupamento`. Escolher um produto dentro de um agrupamento não faz
-- sentido — o agrupamento é a unidade de escolha.
--
-- ## 2. Um interesse pessoal pode ser compartilhado em espaços de casal
--
-- Isto quebra, de propósito e pela primeira vez, a regra de que todo dado pertence
-- a UM espaço. A regra continua valendo para a posse (`space_id` é a casa do
-- interesse, e o dono é `criado_por`); o que a tabela nova acrescenta é
-- VISIBILIDADE emprestada a outros espaços.
--
-- Foi feito como tabela de junção, e não como um array de space_ids na linha,
-- porque toda policy do projeto é `exists (...)` — uma junção entra nesse formato
-- sem inventar um segundo jeito de escrever autorização.
--
-- ## 3. Alguém pode ASSUMIR o interesse de outra pessoa
--
-- "Darei de presente para ele": B assume o interesse do A e passa a poder trabalhar
-- nele. Quem assumiu é visível para todos, inclusive para o dono — decisão
-- consciente de quem usa o app, que prefere coordenar a surpreender.
--
-- O que B pode: acrescentar produtos e agrupamentos, escolher o favorito, e mover o
-- estado. O que B NÃO pode: título, destino, "para quem", ou apagar. Esses campos
-- dizem o que o A quer, e quem quer é o A. A separação é imposta por trigger,
-- porque RLS no Postgres é por linha e isto é por coluna.
--
-- ## A restrição que amarra tudo
--
-- A extensão 0.2.0 já está instalada e em uso. `registrar_interesse`,
-- `adicionar_produto`, `escolher_produto` e `registrar_preco_lido` precisam
-- continuar funcionando com a MESMA assinatura — por isso elas são reescritas por
-- dentro (criando/achando o agrupamento) em vez de substituídas por versões novas.
-- Uma extensão que quebra ao atualizar o banco deixaria de capturar até alguém
-- reinstalar, e ninguém repara nisso no mesmo dia.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Agrupamentos
-- ----------------------------------------------------------------------------

create table public.interesse_agrupamento (
  id           uuid primary key default gen_random_uuid(),
  interesse_id uuid not null references public.interesse (id) on delete cascade,

  -- "Monitor + suporte". `null` para o agrupamento de um produto só, que é a
  -- maioria: batizar "Sofá" de "Sofá" é ruído na tela.
  nome         text check (nome is null or trim(nome) <> ''),

  escolhido    boolean not null default false,
  created_at   timestamptz not null default now()
);

create index interesse_agrupamento_interesse_idx
  on public.interesse_agrupamento (interesse_id);

-- Um escolhido por interesse. Índice parcial pelo mesmo motivo de antes: a regra é
-- entre linhas irmãs, que CHECK não alcança.
create unique index interesse_agrupamento_escolhido_idx
  on public.interesse_agrupamento (interesse_id)
  where escolhido;

alter table public.interesse_produto
  add column agrupamento_id uuid references public.interesse_agrupamento (id) on delete cascade;

/*
  Backfill: um agrupamento por produto que já existe, carregando o `escolhido` dele.

  Roda antes do `not null` para que o schema novo nasça consistente com os dados
  antigos. `interesse_produto.interesse_id` é mantido (não fica redundante por
  acidente — ver o trigger de coerência abaixo) porque a RLS e a consulta da
  extensão 0.2.0 passam por ele; removê-lo quebraria o embed `interesse!inner(...)`
  que a extensão em uso já faz.
*/
/*
  A coluna temporária existe para o casamento ser por identidade, e não por
  semelhança. A primeira versão casava por (interesse_id, escolhido, created_at) e
  era uma armadilha: `now()` é o timestamp da TRANSAÇÃO, então dois produtos
  gravados na mesma transação têm `created_at` idêntico e o casamento viraria
  produto cruzado com o agrupamento do irmão.
*/
alter table public.interesse_agrupamento add column veio_do_produto uuid;

insert into public.interesse_agrupamento (interesse_id, escolhido, created_at, veio_do_produto)
select p.interesse_id, p.escolhido, p.created_at, p.id
from public.interesse_produto p;

update public.interesse_produto p
   set agrupamento_id = a.id
  from public.interesse_agrupamento a
 where a.veio_do_produto = p.id;

alter table public.interesse_agrupamento drop column veio_do_produto;

alter table public.interesse_produto
  alter column agrupamento_id set not null;

-- `escolhido` agora vive no agrupamento. O índice antigo sai junto com a coluna.
drop index if exists public.interesse_produto_escolhido_idx;
alter table public.interesse_produto drop column escolhido;

create index interesse_produto_agrupamento_idx
  on public.interesse_produto (agrupamento_id);

/*
  Coerência entre os dois caminhos até o interesse.

  `interesse_produto` guarda `interesse_id` E `agrupamento_id`, e o agrupamento
  também aponta para um interesse. Sem esta guarda daria para pendurar um produto
  num agrupamento de OUTRO interesse, e o produto apareceria em dois lugares com
  contas diferentes. CHECK não resolve — a regra atravessa tabelas.
*/
create function public.validar_produto_agrupamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.interesse_agrupamento a
    where a.id = new.agrupamento_id and a.interesse_id = new.interesse_id
  ) then
    raise exception 'o agrupamento pertence a outro interesse';
  end if;

  return new;
end;
$$;

create trigger interesse_produto_agrupamento_coerente
  before insert or update of agrupamento_id, interesse_id on public.interesse_produto
  for each row execute function public.validar_produto_agrupamento();

-- ----------------------------------------------------------------------------
-- 2. Compartilhamento, posse e responsabilidade
-- ----------------------------------------------------------------------------

/*
  Visibilidade emprestada: o interesse continua morando em `interesse.space_id`, e
  cada linha aqui o torna visível também num espaço compartilhado.

  Só o dono compartilha e descompartilha (ver as RPCs no fim). `compartilhado_por`
  fica registrado porque um dia o dono pode não ser quem compartilhou — se a posse
  vier a ser transferível.
*/
create table public.interesse_compartilhamento (
  interesse_id       uuid not null references public.interesse (id) on delete cascade,
  space_id           uuid not null references public.space (id) on delete cascade,
  compartilhado_por  uuid not null references auth.users (id) on delete cascade,
  created_at         timestamptz not null default now(),
  primary key (interesse_id, space_id)
);

create index interesse_compartilhamento_space_idx
  on public.interesse_compartilhamento (space_id);

alter table public.interesse
  -- Quem assumiu a responsabilidade de comprar. Visível para todos, inclusive para
  -- o dono: o app é de gente que coordena, não que surpreende.
  add column assumido_por uuid references auth.users (id) on delete set null,
  add column assumido_em  timestamptz,

  -- "Para quem" com duas formas: um membro do espaço, ou texto livre para quem não
  -- tem conta aqui ("minha mãe"). As duas colunas coexistem porque as duas
  -- respostas são legítimas, e forçar tudo em texto perderia o vínculo com a pessoa.
  add column para_quem_user_id uuid references auth.users (id) on delete set null,

  add constraint interesse_assumido_completo check (
    (assumido_por is null and assumido_em is null)
    or (assumido_por is not null and assumido_em is not null)
  );

-- ----------------------------------------------------------------------------
-- 3. Quem alcança um interesse
-- ----------------------------------------------------------------------------

/*
  `SECURITY DEFINER` pelo mesmo motivo de `pode_ver_roteiro`: a policy de
  `interesse` precisa consultar `interesse_compartilhamento`, cuja própria policy
  consulta `interesse` — rodando como owner, o ciclo se rompe.
*/
create function public.pode_ver_interesse(p_interesse uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.interesse i
    where i.id = p_interesse
      and (
        public.is_space_member(i.space_id)
        or exists (
          select 1
          from public.interesse_compartilhamento c
          where c.interesse_id = i.id
            and public.is_space_member(c.space_id)
        )
      )
  );
$$;

/** Sou o dono do interesse? Usado pela guarda de colunas e pelas RPCs de posse. */
create function public.sou_dono_do_interesse(p_interesse uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.interesse i
    where i.id = p_interesse and i.criado_por = auth.uid()
  );
$$;

-- ----------------------------------------------------------------------------
-- 4. RLS
-- ----------------------------------------------------------------------------

/*
  As policies de `interesse` são reescritas: ler e alterar passam a valer também
  para quem alcança o interesse por compartilhamento. Apagar continua só do dono ou
  do admin da casa dele — descompartilhar é a saída de quem não quer mais ver, e
  não apagar a vontade de outra pessoa.
*/
drop policy interesse_select on public.interesse;
drop policy interesse_update on public.interesse;
drop policy interesse_delete on public.interesse;

create policy interesse_select on public.interesse
  for select to authenticated
  using (
    public.is_space_member(space_id)
    or exists (
      select 1 from public.interesse_compartilhamento c
      where c.interesse_id = id and public.is_space_member(c.space_id)
    )
  );

-- O que cada um pode MUDAR é por coluna, e quem impõe isso é o trigger abaixo.
create policy interesse_update on public.interesse
  for update to authenticated
  using (
    public.is_space_member(space_id)
    or exists (
      select 1 from public.interesse_compartilhamento c
      where c.interesse_id = id and public.is_space_member(c.space_id)
    )
  )
  with check (
    public.is_space_member(space_id)
    or exists (
      select 1 from public.interesse_compartilhamento c
      where c.interesse_id = id and public.is_space_member(c.space_id)
    )
  );

create policy interesse_delete on public.interesse
  for delete to authenticated
  using (
    public.is_space_member(space_id)
    and (criado_por = auth.uid() or public.is_space_admin(space_id))
  );

/*
  A guarda de colunas.

  RLS decide QUAIS LINHAS, nunca quais colunas — então a regra "B mexe em produtos,
  favorito e estado, mas não na intenção" não cabe numa policy. Um trigger cabe.

  O dono (e o admin da casa do interesse) passa direto. Qualquer outro só pode
  deixar os campos de intenção como estavam.
*/
create function public.validar_interesse_alheio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  /*
   * `auth.uid()` nulo é contexto sem JWT — migration, script de manutenção, job do
   * banco. Não é um usuário tentando editar interesse alheio, e barrar aqui
   * quebraria qualquer backfill futuro nesta tabela. Quem não tem JWT não passa
   * pela RLS de qualquer forma.
   */
  if auth.uid() is null
     or old.criado_por = auth.uid()
     or public.is_space_admin(old.space_id) then
    return new;
  end if;

  if new.titulo is distinct from old.titulo
     or new.destino is distinct from old.destino
     or new.para_quem is distinct from old.para_quem
     or new.para_quem_user_id is distinct from old.para_quem_user_id
     or new.observacao is distinct from old.observacao
     or new.space_id is distinct from old.space_id
     or new.criado_por is distinct from old.criado_por then
    raise exception 'só quem criou o interesse muda o que ele quer; você pode mexer nos produtos, no favorito e no estado';
  end if;

  return new;
end;
$$;

create trigger interesse_intencao_protegida
  before update on public.interesse
  for each row execute function public.validar_interesse_alheio();

-- Compartilhamento: quem vê o interesse vê onde ele está compartilhado. Escrever é
-- pelas RPCs, que exigem ser o dono.
alter table public.interesse_compartilhamento enable row level security;

create policy interesse_compartilhamento_select on public.interesse_compartilhamento
  for select to authenticated
  using (public.pode_ver_interesse(interesse_id));

/*
  A policy É a regra, e a RPC só a traduz para uma mensagem legível.
  Sem ela `compartilhar_interesse` precisaria ser `SECURITY DEFINER` — e aí a regra
  passaria a viver dentro da função, com a policy calada. Duas fontes de verdade
  para a mesma coisa é o que se está evitando.
*/
create policy interesse_compartilhamento_insert on public.interesse_compartilhamento
  for insert to authenticated
  with check (
    public.sou_dono_do_interesse(interesse_id)
    and public.is_space_member(space_id)
    and compartilhado_por = auth.uid()
  );

create policy interesse_compartilhamento_delete on public.interesse_compartilhamento
  for delete to authenticated
  using (public.sou_dono_do_interesse(interesse_id));

-- Agrupamento e produto: herdam de quem alcança o interesse.
alter table public.interesse_agrupamento enable row level security;

create policy interesse_agrupamento_tudo on public.interesse_agrupamento
  for all to authenticated
  using (public.pode_ver_interesse(interesse_id))
  with check (public.pode_ver_interesse(interesse_id));

/*
  A policy de `interesse_produto` é substituída: a antiga fazia
  `exists (select 1 from interesse i where i.id = interesse_id)`, que dependia da
  policy de `interesse` — e agora essa policy virou uma condição com dois ramos.
  Chamar o helper deixa uma definição só de "quem alcança", em vez de duas cópias.
*/
drop policy interesse_produto_tudo on public.interesse_produto;

create policy interesse_produto_tudo on public.interesse_produto
  for all to authenticated
  using (public.pode_ver_interesse(interesse_id))
  with check (public.pode_ver_interesse(interesse_id));

-- ----------------------------------------------------------------------------
-- 5. RPCs de posse e compartilhamento
-- ----------------------------------------------------------------------------

/*
  Compartilhar num espaço. Só o dono, e só em espaço de que ele participa — senão
  daria para empurrar a própria lista de desejos para dentro de espaço alheio.
*/
create function public.compartilhar_interesse(p_interesse uuid, p_space uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.sou_dono_do_interesse(p_interesse) then
    raise exception 'só quem criou o interesse pode compartilhá-lo';
  end if;

  if not public.is_space_member(p_space) then
    raise exception 'você não participa desse espaço';
  end if;

  insert into public.interesse_compartilhamento (interesse_id, space_id, compartilhado_por)
  values (p_interesse, p_space, auth.uid())
  on conflict (interesse_id, space_id) do nothing;
end;
$$;

create function public.descompartilhar_interesse(p_interesse uuid, p_space uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.sou_dono_do_interesse(p_interesse) then
    raise exception 'só quem criou o interesse pode descompartilhá-lo';
  end if;

  delete from public.interesse_compartilhamento
   where interesse_id = p_interesse and space_id = p_space;
end;
$$;

/*
  "Darei de presente para ele."

  Não é o dono que assume — assumir o próprio interesse não quer dizer nada. E
  ninguém tira a responsabilidade de outra pessoa: quem assumiu libera, ou o dono
  libera. Sem isso, dois membros ficariam alternando quem vai comprar.
*/
create function public.assumir_interesse(p_interesse uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_dono   uuid;
  v_atual  uuid;
begin
  select i.criado_por, i.assumido_por into v_dono, v_atual
  from public.interesse i where i.id = p_interesse;

  if v_dono is null then
    raise exception 'interesse não encontrado';
  end if;

  if v_dono = auth.uid() then
    raise exception 'assumir o próprio interesse não faz sentido';
  end if;

  if v_atual is not null and v_atual <> auth.uid() then
    raise exception 'outra pessoa já assumiu este interesse';
  end if;

  update public.interesse
     set assumido_por = auth.uid(), assumido_em = now()
   where id = p_interesse;
end;
$$;

create function public.liberar_interesse(p_interesse uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.interesse
     set assumido_por = null, assumido_em = null
   where id = p_interesse
     and (assumido_por = auth.uid() or criado_por = auth.uid());

  if not found then
    raise exception 'só quem assumiu, ou quem criou, pode liberar';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. RPCs de agrupamento
-- ----------------------------------------------------------------------------

/** Um agrupamento vazio, para receber produtos. O primeiro do interesse já nasce escolhido. */
create function public.criar_agrupamento(p_interesse uuid, p_nome text default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id       uuid;
  v_primeiro boolean;
begin
  select not exists (
    select 1 from public.interesse_agrupamento a where a.interesse_id = p_interesse
  ) into v_primeiro;

  insert into public.interesse_agrupamento (interesse_id, nome, escolhido)
  values (p_interesse, nullif(trim(p_nome), ''), v_primeiro)
  returning id into v_id;

  return v_id;
end;
$$;

/*
  Acrescenta um produto a um agrupamento que já existe — o "e também preciso do
  suporte" que transforma um produto solto num agrupamento de verdade.
*/
create function public.adicionar_produto_ao_agrupamento(p_agrupamento uuid, p_produto jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_interesse uuid;
  v_produto   uuid;
begin
  if p_produto is null or jsonb_typeof(p_produto) <> 'object' then
    raise exception 'informe os dados do produto';
  end if;

  select a.interesse_id into v_interesse
  from public.interesse_agrupamento a where a.id = p_agrupamento;

  if v_interesse is null then
    raise exception 'agrupamento não encontrado';
  end if;

  insert into public.interesse_produto (
    interesse_id, agrupamento_id, nome, url, loja, imagem_url,
    preco, preco_pix, parcelas, valor_parcela, origem
  )
  values (
    v_interesse,
    p_agrupamento,
    trim(p_produto ->> 'nome'),
    trim(p_produto ->> 'url'),
    nullif(trim(coalesce(p_produto ->> 'loja', '')), ''),
    nullif(trim(coalesce(p_produto ->> 'imagem_url', '')), ''),
    nullif(p_produto ->> 'preco', '')::numeric,
    nullif(p_produto ->> 'preco_pix', '')::numeric,
    nullif(p_produto ->> 'parcelas', '')::int,
    nullif(p_produto ->> 'valor_parcela', '')::numeric,
    coalesce(nullif(trim(coalesce(p_produto ->> 'origem', '')), ''), 'extensao')
  )
  returning id into v_produto;

  return v_produto;
end;
$$;

/** Troca o agrupamento escolhido. Duas escritas, contra o índice único parcial. */
create function public.escolher_agrupamento(p_agrupamento uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_interesse uuid;
begin
  select a.interesse_id into v_interesse
  from public.interesse_agrupamento a where a.id = p_agrupamento;

  if v_interesse is null then
    raise exception 'agrupamento não encontrado';
  end if;

  update public.interesse_agrupamento
     set escolhido = false
   where interesse_id = v_interesse and escolhido and id <> p_agrupamento;

  update public.interesse_agrupamento
     set escolhido = true
   where id = p_agrupamento;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. As RPCs antigas, reescritas por dentro
--
-- Mesmas assinaturas, porque a extensão 0.2.0 instalada as chama. Cada uma agora
-- cria ou acha o agrupamento por baixo, e continua fazendo o que fazia do ponto de
-- vista de quem chama: "salva este produto neste interesse".
-- ----------------------------------------------------------------------------

/** Um produto solto = um agrupamento de um produto. */
create or replace function public.adicionar_produto(p_interesse uuid, p_produto jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_agrupamento uuid;
begin
  if p_produto is null or jsonb_typeof(p_produto) <> 'object' then
    raise exception 'informe os dados do produto';
  end if;

  v_agrupamento := public.criar_agrupamento(p_interesse, null);

  return public.adicionar_produto_ao_agrupamento(v_agrupamento, p_produto);
end;
$$;

/*
  Escolher um produto passa a escolher O AGRUPAMENTO dele.

  A extensão 0.2.0 não chama esta função, mas a tela do app chamava — e um app
  antigo aberto numa aba pode chamar depois do deploy. Traduzir é mais barato que
  quebrar.
*/
create or replace function public.escolher_produto(p_produto uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_agrupamento uuid;
begin
  select p.agrupamento_id into v_agrupamento
  from public.interesse_produto p where p.id = p_produto;

  if v_agrupamento is null then
    raise exception 'produto não encontrado';
  end if;

  perform public.escolher_agrupamento(v_agrupamento);
end;
$$;

/*
  `registrar_interesse` ganha `p_para_quem_user_id`, com default `null`.

  Parâmetro NOVO no fim e opcional: a extensão 0.2.0 chama a função sem ele, e
  acrescentar no meio (ou sem default) invalidaria a chamada dela.

  ## O DROP não é opcional, e essa foi a pegadinha

  `create or replace function` com uma lista de parâmetros diferente **não
  substitui: cria uma sobrecarga**. Sem o drop abaixo o banco fica com as duas
  versões (6 e 7 argumentos), e uma chamada de 6 argumentos passa a ser AMBÍGUA —
  os dois candidatos servem, porque o sétimo tem default. O Postgres recusa com
  "function is not unique", e quem quebraria seria justamente a extensão instalada
  que esta seção existe para proteger.
*/
drop function public.registrar_interesse(uuid, text, text, text, text, jsonb);

create function public.registrar_interesse(
  p_space             uuid,
  p_titulo            text,
  p_destino           text  default 'compra',
  p_para_quem         text  default null,
  p_observacao        text  default null,
  p_produto           jsonb default null,
  p_para_quem_user_id uuid  default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_interesse uuid;
begin
  insert into public.interesse (
    space_id, criado_por, titulo, destino, para_quem, para_quem_user_id, observacao
  )
  values (
    p_space,
    auth.uid(),
    trim(p_titulo),
    coalesce(nullif(trim(p_destino), ''), 'compra'),
    nullif(trim(p_para_quem), ''),
    p_para_quem_user_id,
    nullif(trim(p_observacao), '')
  )
  returning id into v_interesse;

  if p_produto is not null and jsonb_typeof(p_produto) = 'object' then
    perform public.adicionar_produto(v_interesse, p_produto);
  end if;

  return v_interesse;
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

revoke all on function public.validar_produto_agrupamento() from public, anon, authenticated;
revoke all on function public.validar_interesse_alheio() from public, anon, authenticated;

grant execute on function public.pode_ver_interesse(uuid)        to authenticated;
grant execute on function public.sou_dono_do_interesse(uuid)     to authenticated;
grant execute on function public.compartilhar_interesse(uuid, uuid)    to authenticated;
grant execute on function public.descompartilhar_interesse(uuid, uuid) to authenticated;
grant execute on function public.assumir_interesse(uuid)         to authenticated;
grant execute on function public.liberar_interesse(uuid)         to authenticated;
grant execute on function public.criar_agrupamento(uuid, text)   to authenticated;
grant execute on function public.adicionar_produto_ao_agrupamento(uuid, jsonb) to authenticated;
grant execute on function public.escolher_agrupamento(uuid)      to authenticated;
grant execute on function public.registrar_interesse(uuid, text, text, text, text, jsonb, uuid) to authenticated;
