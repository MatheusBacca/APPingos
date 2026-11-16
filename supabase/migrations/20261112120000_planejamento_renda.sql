-- ============================================================================
-- APPingos — Planejamento financeiro: o salário e a contribuição ao casal.
--
-- Contrato com a Frente B (Pluggy): docs/contrato-planejamento-open-finance.md,
-- seções 1, 2, 3 e 5. As decisões que sustentam este arquivo estão em
-- docs/notion-plano-planejamento-financeiro.md, "Decisões tomadas (12/11/2026)".
--
-- O salário é o dado mais sensível que o app guarda, e quase tudo aqui existe
-- para uma invariante só:
--
--   A RENDA DE UMA PESSOA NUNCA É LEGÍVEL POR OUTRA SEM UM COMPARTILHAMENTO
--   EXPLÍCITO PARA UM ESPAÇO EM COMUM.
--
-- Três consequências, cada uma com o seu porquê:
--
--   1. O salário NÃO é coluna de `profile`. A policy `profile_select` deixa quem
--      divide um espaço ler a linha inteira — uma coluna a mais ali vazaria para
--      o outro no primeiro `select *`. Ele mora numa tabela própria, com RLS do
--      dono, e o compartilhamento é uma segunda tabela, linha por espaço.
--   2. A contribuição ao casal é legível pelo outro só pelo que ela vale em
--      REAIS. Em percentual ela revelaria o salário (30% que valem R$ 1.500 dizem
--      que o salário é R$ 5.000), então a tabela é privada e quem lê o casal lê
--      pela RPC `contribuicoes_do_espaco`, que devolve o valor e só devolve o
--      percentual quando o salário já está compartilhado ali.
--   3. Compartilhar vale enquanto o dono continuar no espaço. Sair do espaço
--      apaga o compartilhamento e a contribuição (gatilho em `membership`), e a
--      policy confere a filiação do dono mesmo assim — uma linha que sobrasse
--      não pode reabrir o salário para ninguém.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. O salário
-- ----------------------------------------------------------------------------

/*
  Uma linha por pessoa: a decisão foi "uma renda por pessoa, não uma lista". Por
  isso `user_id` é a chave primária e não há `space_id` — o salário é da pessoa,
  e onde ele aparece é decidido por `renda_compartilhamento`, não por onde a
  linha mora.

  Valor LÍQUIDO: é o que cai na conta e o que a Pluggy vai ler no extrato.

  `recebimento_dia` muda de sentido com o tipo, e o CHECK combinado é o que
  impede o estado sem sentido ("40º dia útil"):
    - dia_fixo: o dia do mês, 1..31. Num mês mais curto vale o último dia — a
      conta é de `dataPrevistaDoSalario` (app/lib/salario.ts), não do banco.
    - dia_util: o N-ésimo dia útil, 1..23. Um mês tem no máximo 23 dias de
      segunda a sexta; acima disso o valor nunca existiria.
*/
create table public.renda (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  valor_liquido     numeric(12,2) not null check (valor_liquido > 0),
  recebimento_tipo  text not null check (recebimento_tipo in ('dia_fixo', 'dia_util')),
  recebimento_dia   int not null,
  updated_at        timestamptz not null default now(),
  constraint renda_recebimento_dia_valido check (
    (recebimento_tipo = 'dia_fixo' and recebimento_dia between 1 and 31)
    or (recebimento_tipo = 'dia_util' and recebimento_dia between 1 and 23)
  )
);

create trigger renda_updated_at
  before update on public.renda
  for each row execute function public.tocar_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Compartilhar o salário, espaço por espaço
-- ----------------------------------------------------------------------------

/*
  A PRESENÇA DA LINHA é o "compartilhado" — mesmo raciocínio de `acerto_mes`: não
  existe o estado "linha existe mas compartilhado = false". Privado é a ausência,
  que é como todo salário nasce.

  Por espaço, e não um "mostrar para todos": a mesma pessoa pode estar num espaço
  de casal e num espaço com a família, e abrir o salário num não diz nada sobre o
  outro.
*/
create table public.renda_compartilhamento (
  user_id     uuid not null references auth.users (id) on delete cascade,
  space_id    uuid not null references public.space (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, space_id)
);

create index renda_compartilhamento_space_idx on public.renda_compartilhamento (space_id);

/*
  A policy de insert já exige `user_id = auth.uid()` e ser membro do espaço. O
  gatilho é a garantia que sobrevive a um caminho sem JWT (service_role, script
  de manutenção), no mesmo espírito de `validar_compra`: compartilhar com um
  espaço de que o dono não faz parte abriria o salário para estranhos.
*/
create function public.validar_renda_compartilhamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.membership m
    where m.space_id = new.space_id and m.user_id = new.user_id
  ) then
    raise exception 'só dá para compartilhar o salário com um espaço de que você faz parte';
  end if;

  return new;
end;
$$;

create trigger renda_compartilhamento_validar
  before insert or update on public.renda_compartilhamento
  for each row execute function public.validar_renda_compartilhamento();

-- ----------------------------------------------------------------------------
-- 3. O salário do mês caiu
-- ----------------------------------------------------------------------------

/*
  O FATO, separado da regra: `renda` diz quanto e quando deve cair; esta tabela
  diz que caiu. Marcada à mão pela Frente A ("recebi"), e pela Frente B sozinha
  quando reconhece o crédito no extrato — por isso `origem` e `transacao_id`.

  `transacao_id` nasce SEM foreign key: `transacao_bancaria` é da Frente B e
  ainda não existe. A constraint entra numa migration dela (regra do contrato).

  `valor` é o que caiu de verdade, que pode diferir do previsto (desconto de
  falta, adiantamento). A projeção do mês usa o previsto; o realizado usa este.
*/
create table public.renda_recebida (
  user_id       uuid not null references auth.users (id) on delete cascade,
  competencia   date not null check (extract(day from competencia) = 1),
  valor         numeric(12,2) not null check (valor > 0),
  recebido_em   date not null default current_date,
  origem        text not null default 'manual' check (origem in ('manual', 'pluggy')),
  transacao_id  uuid,
  created_at    timestamptz not null default now(),
  primary key (user_id, competencia)
);

-- ----------------------------------------------------------------------------
-- Quem alcança o salário de quem
-- ----------------------------------------------------------------------------

/*
  "Posso ver a renda de `p_user`?" — além do próprio dono, que as policies já
  testam antes de chegar aqui.

  Duas condições, e as duas sobre o MESMO espaço:
    - existe um compartilhamento do salário de `p_user` com um espaço de que eu
      sou membro;
    - `p_user` continua membro desse espaço. O gatilho de saída abaixo apaga o
      compartilhamento, mas a policy não depende de ninguém ter rodado o gatilho:
      uma linha que sobrasse não reabre nada.

  `SECURITY DEFINER` para ler `membership` do dono sem depender da policy dela, e
  `STABLE` para o planner reaproveitar o resultado na mesma consulta.
*/
create function public.renda_visivel(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.renda_compartilhamento c
    join public.membership dono on dono.space_id = c.space_id and dono.user_id = c.user_id
    where c.user_id = p_user
      and public.is_space_member(c.space_id)
  );
$$;

/*
  A mesma pergunta, num espaço só: "o salário de `p_user` está aberto NESTE
  espaço?". É o que decide se o percentual da contribuição pode aparecer ali —
  compartilhar com a família não abre o percentual no espaço do casal.

  Só a RPC abaixo chama esta função, e ela roda como owner — por isso não há
  GRANT para `authenticated`: perguntar isso sobre um espaço alheio diria a um
  estranho quem está nele.
*/
create function public.renda_compartilhada_em(p_user uuid, p_space uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.renda_compartilhamento c
    join public.membership dono on dono.space_id = c.space_id and dono.user_id = c.user_id
    where c.user_id = p_user
      and c.space_id = p_space
  );
$$;

-- ----------------------------------------------------------------------------
-- 4. A contribuição ao casal
-- ----------------------------------------------------------------------------

/*
  "Quanto do meu salário eu ponho nas contas do casal" — a divisão salarial
  conjunta da decisão 4. A soma das contribuições de um espaço é o VALOR CENTRAL
  dele, que alimenta o planejamento do casal.

  `valor` muda de unidade com o `modo`, como `recebimento_dia` acima: reais em
  'valor', de 0 a 100 em 'percentual'. Zero não entra: "não contribuo" é a
  ausência da linha.

  Mora no espaço do casal (`space_id`), mas a linha NÃO é legível pelo outro
  membro — ver o cabeçalho. Quem lê o espaço inteiro usa a RPC.
*/
create table public.contribuicao (
  space_id    uuid not null references public.space (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  modo        text not null check (modo in ('valor', 'percentual')),
  valor       numeric(12,2) not null check (valor > 0),
  updated_at  timestamptz not null default now(),
  primary key (space_id, user_id),
  constraint contribuicao_percentual_valido check (modo <> 'percentual' or valor <= 100)
);

create trigger contribuicao_updated_at
  before update on public.contribuicao
  for each row execute function public.tocar_updated_at();

/*
  Contribuir pede ser membro do espaço — e o espaço não pode ser o pessoal: lá
  não há casal a quem contribuir, e uma linha assim entraria no planejamento
  pessoal como dinheiro que sai sem ir para lugar nenhum.
*/
create function public.validar_contribuicao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.membership m
    where m.space_id = new.space_id and m.user_id = new.user_id
  ) then
    raise exception 'só dá para contribuir com um espaço de que você faz parte';
  end if;

  if exists (select 1 from public.space s where s.id = new.space_id and s.tipo = 'pessoal') then
    raise exception 'contribuição é para um espaço compartilhado, não para o pessoal';
  end if;

  return new;
end;
$$;

create trigger contribuicao_validar
  before insert or update on public.contribuicao
  for each row execute function public.validar_contribuicao();

-- ----------------------------------------------------------------------------
-- Sair do espaço leva junto o compartilhamento e a contribuição
-- ----------------------------------------------------------------------------

/*
  Quem sai de um espaço (ou é removido pelo dono) não deveria continuar com o
  salário aberto ali, nem pesando no valor central de um casal de que não faz
  mais parte. As policies já não deixam ler uma linha órfã; isto é a higiene
  que impede a linha de reviver se a pessoa voltar ao espaço meses depois.

  O espaço excluído não precisa disto: o `on delete cascade` de `space_id` cuida.
*/
create function public.limpar_planejamento_ao_sair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.renda_compartilhamento
  where user_id = old.user_id and space_id = old.space_id;

  delete from public.contribuicao
  where user_id = old.user_id and space_id = old.space_id;

  return old;
end;
$$;

create trigger membership_limpar_planejamento
  after delete on public.membership
  for each row execute function public.limpar_planejamento_ao_sair();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.renda                   enable row level security;
alter table public.renda_compartilhamento  enable row level security;
alter table public.renda_recebida          enable row level security;
alter table public.contribuicao            enable row level security;

-- renda — o dono escreve; os outros só leem, e só com compartilhamento.
create policy renda_select on public.renda
  for select to authenticated
  using (user_id = auth.uid() or public.renda_visivel(user_id));

create policy renda_insert on public.renda
  for insert to authenticated
  with check (user_id = auth.uid());

create policy renda_update on public.renda
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy renda_delete on public.renda
  for delete to authenticated
  using (user_id = auth.uid());

/*
  renda_compartilhamento — quem divide o espaço VÊ que o salário está aberto ali
  (é o que a tela usa para decidir entre mostrar o percentual ou não), mas só o
  dono cria e apaga. Sem policy de UPDATE: as duas colunas são a chave, e trocar
  uma delas é desfazer um compartilhamento e fazer outro.
*/
create policy renda_compartilhamento_select on public.renda_compartilhamento
  for select to authenticated
  using (user_id = auth.uid() or public.is_space_member(space_id));

create policy renda_compartilhamento_insert on public.renda_compartilhamento
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_space_member(space_id));

create policy renda_compartilhamento_delete on public.renda_compartilhamento
  for delete to authenticated
  using (user_id = auth.uid());

-- renda_recebida — mesma visibilidade de `renda`, mesma escrita do dono.
create policy renda_recebida_select on public.renda_recebida
  for select to authenticated
  using (user_id = auth.uid() or public.renda_visivel(user_id));

create policy renda_recebida_insert on public.renda_recebida
  for insert to authenticated
  with check (user_id = auth.uid());

create policy renda_recebida_update on public.renda_recebida
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy renda_recebida_delete on public.renda_recebida
  for delete to authenticated
  using (user_id = auth.uid());

/*
  contribuicao — só o dono lê a própria linha. É a defesa do percentual: com a
  linha legível, `modo = 'percentual', valor = 30` mais o valor efetivo da RPC
  dariam o salário por regra de três.
*/
create policy contribuicao_select on public.contribuicao
  for select to authenticated
  using (user_id = auth.uid());

create policy contribuicao_insert on public.contribuicao
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_space_member(space_id));

create policy contribuicao_update on public.contribuicao
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_space_member(space_id));

create policy contribuicao_delete on public.contribuicao
  for delete to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- RPC: as contribuições de um espaço, legíveis por quem divide o espaço
-- ----------------------------------------------------------------------------

/*
  O que o casal vê da divisão salarial: quanto cada um põe, em reais.

  `SECURITY DEFINER` porque precisa ler o que a RLS esconde de propósito — a
  contribuição em percentual e o salário de quem a declarou — para devolver só o
  RESULTADO. Nada do que sai daqui permite reconstruir o salário de alguém que não
  o compartilhou neste espaço:

    - `valor_efetivo` é sempre em reais. No modo percentual é o percentual sobre
      o salário líquido; sem salário cadastrado, é `null` (não há base para a
      conta, e zero seria afirmar que a pessoa não contribui).
    - `percentual` só sai para você mesmo ou quando o salário daquela pessoa está
      compartilhado NESTE espaço (`renda_compartilhada_em`). No modo valor, com o
      salário aberto, ele é derivado (valor / salário), para a tela mostrar "30%
      do salário" dos dois jeitos.

  Só membros atuais entram — o `join` em `membership` corta a contribuição de
  quem saiu, mesmo que o gatilho de saída não tenha rodado.

  Valor central do espaço = soma de `valor_efetivo` (o `sum` do SQL e o
  `valorCentral` de app/types/planejamento.ts ignoram os nulos).
*/
create function public.contribuicoes_do_espaco(p_space uuid)
returns table (
  user_id        uuid,
  modo           text,
  valor_efetivo  numeric,
  percentual     numeric
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not public.is_space_member(p_space) then
    raise exception 'você não é membro deste espaço';
  end if;

  return query
  select
    c.user_id,
    c.modo,
    case
      when c.modo = 'valor' then c.valor
      when r.valor_liquido is null then null
      else round(r.valor_liquido * c.valor / 100, 2)
    end as valor_efetivo,
    case
      when not (c.user_id = auth.uid() or public.renda_compartilhada_em(c.user_id, p_space)) then null
      when c.modo = 'percentual' then c.valor
      when r.valor_liquido is null then null
      else round(c.valor / r.valor_liquido * 100, 2)
    end as percentual
  from public.contribuicao c
  join public.membership m on m.space_id = c.space_id and m.user_id = c.user_id
  left join public.renda r on r.user_id = c.user_id
  where c.space_id = p_space;
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

/*
  As permissões de tabela são explícitas, e não herdadas do padrão do projeto.
  Projetos novos do Supabase deixaram de expor tabela nova ao PostgREST sem GRANT
  (`auto_expose_new_tables` no config.toml), e o banco local de teste nasce
  assim. Declarar aqui faz a migration valer igual nos dois — e quem protege a
  linha continua sendo a RLS, não o GRANT.
*/
grant select, insert, update, delete on public.renda                  to authenticated;
grant select, insert, delete         on public.renda_compartilhamento to authenticated;
grant select, insert, update, delete on public.renda_recebida         to authenticated;
grant select, insert, update, delete on public.contribuicao           to authenticated;

revoke all on function public.validar_renda_compartilhamento() from public, anon, authenticated;
revoke all on function public.validar_contribuicao()           from public, anon, authenticated;
revoke all on function public.limpar_planejamento_ao_sair()    from public, anon, authenticated;

-- `renda_visivel` é chamada pelas policies, que rodam como o usuário.
revoke all on function public.renda_visivel(uuid) from public, anon;
grant execute on function public.renda_visivel(uuid) to authenticated;

-- `renda_compartilhada_em` é só da RPC, que roda como owner.
revoke all on function public.renda_compartilhada_em(uuid, uuid) from public, anon, authenticated;

revoke all on function public.contribuicoes_do_espaco(uuid) from public, anon;
grant execute on function public.contribuicoes_do_espaco(uuid) to authenticated;
