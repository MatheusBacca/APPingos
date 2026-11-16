-- ============================================================================
-- APPingos — Open Finance (Pluggy): a conexão bancária e as contas de cada um.
--
-- Fase 3 de docs/notion-plano-open-finance.md. Duas tabelas, e as duas são de
-- uma PESSOA, não de um espaço — o desenho de `integracao_spotify`
-- (20260815172135_spotify_integracao.sql): um espaço de casal pode ter zero, um
-- ou dois membros conectados, e cada um conecta só o que quiser.
--
--   conexao_bancaria   um item da Pluggy: o banco de uma pessoa (no MeuPluggy,
--                      uma conexão feita lá).
--   conta_bancaria     as contas e cartões daquele item, com a DESIGNAÇÃO de
--                      cada um: para onde as compras vão (`destino`).
--
-- Nenhum segredo mora aqui. O client id/secret da Pluggy ficam no servidor
-- (runtimeConfig do Nuxt e secrets da Edge Function); o item_id sozinho não abre
-- nada sem eles.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A conexão
-- ----------------------------------------------------------------------------

/*
  `item_id` é único no app inteiro, e não por pessoa: o mesmo item cadastrado
  por duas pessoas faria o extrato de uma cair na caixa de entrada da outra.
  Quem cadastra primeiro fica com ele.

  E ainda assim a sincronização não confia só nisto: o item da Pluggy carrega o
  `clientUserId` com que o connect token foi criado (o `auth.uid()` de quem
  conectou), e `sincronizar-pluggy` recusa o item cujo dono declarado não é o
  `user_id` desta linha. É a defesa contra alguém gravar, direto pela API, o
  item_id de outra pessoa.

  `status`, `consentimento_expira_em`, `sincronizado_em` e `erro_sincronizacao`
  são escritos pela sincronização (service_role). A tela só os lê: é o que mostra
  "atualizado ontem", "consentimento vence em 12 dias" ou "reconecte".
*/
create table public.conexao_bancaria (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null default auth.uid()
                             references auth.users (id) on delete cascade,
  item_id                  text not null unique check (trim(item_id) <> ''),
  banco                    text not null default '',
  banco_logo_url           text,
  -- O status do item como a Pluggy o chama (UPDATED, LOGIN_ERROR, OUTDATED…).
  -- Texto livre de propósito: a lista é da Pluggy e cresce sem avisar.
  status                   text not null default 'UPDATING',
  consentimento_expira_em  timestamptz,
  sincronizado_em          timestamptz,
  erro_sincronizacao       text,
  conectado_em             timestamptz not null default now(),
  atualizado_em            timestamptz not null default now()
);

create index conexao_bancaria_user_idx on public.conexao_bancaria (user_id);

-- ----------------------------------------------------------------------------
-- As contas e cartões
-- ----------------------------------------------------------------------------

/*
  A designação do cartão é a decisão nº 3 de 12/11/2026
  (docs/notion-plano-planejamento-financeiro.md):

    'casal'      as compras deste cartão ENTRAM no espaço do casal (`space_id`),
                 com 50% para cada um, editáveis depois. Marcar o cartão é o
                 toque humano que a invariante 4 do plano de Open Finance exige.
    'pessoal'    entram no espaço pessoal de quem conectou.
    'perguntar'  vão para a caixa de entrada, uma a uma. É o padrão: nada entra
                 em espaço nenhum sem alguém ter decidido.

  `space_id` só faz sentido com 'casal'. O espaço pessoal não é guardado: ele é
  deduzido de quem conectou, e guardá-lo seria uma segunda fonte para a mesma
  verdade.

  `titular_nome`/`titular_documento` são o que reconhece uma transferência entre
  contas próprias (ver `motivoDeExclusao` em _shared/importacao-bancaria.ts). É
  dado pessoal, e por isso a linha inteira é só do dono.
*/
create table public.conta_bancaria (
  id                 uuid primary key default gen_random_uuid(),
  conexao_id         uuid not null references public.conexao_bancaria (id) on delete cascade,
  user_id            uuid not null default auth.uid()
                       references auth.users (id) on delete cascade,
  pluggy_account_id  text not null unique,
  tipo               text not null check (tipo in ('conta', 'cartao')),
  nome               text not null,
  numero             text,
  titular_nome       text,
  titular_documento  text,
  destino            text not null default 'perguntar'
                       check (destino in ('casal', 'pessoal', 'perguntar')),
  space_id           uuid references public.space (id) on delete set null,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),

  constraint conta_bancaria_casal_tem_espaco
    check (destino <> 'casal' or space_id is not null)
);

create index conta_bancaria_conexao_idx on public.conta_bancaria (conexao_id);
create index conta_bancaria_user_idx    on public.conta_bancaria (user_id);

-- ----------------------------------------------------------------------------
-- Integridade que o CHECK não alcança
-- ----------------------------------------------------------------------------

/*
  Três regras que dependem de outra tabela:

  1. A conta pertence a uma conexão da MESMA pessoa — sem isto, dava para
     pendurar uma conta numa conexão alheia e herdar a sincronização dela.
  2. 'casal' aponta para um espaço de casal de que a pessoa é membro. Um
     `space_id` qualquer faria as compras do cartão caírem num espaço estranho.
  3. Quando o espaço do casal é apagado (`on delete set null`), o cartão volta
     para 'perguntar' em vez de estourar o CHECK — e o delete do espaço passa.
     Com destino diferente de 'casal', `space_id` é limpo: ele não significa nada
     ali, e um valor velho esquecido confundiria quem ler a linha.
*/
create function public.validar_conta_bancaria()
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

  new.atualizado_em := now();
  return new;
end;
$$;

create trigger conta_bancaria_validar
  before insert or update on public.conta_bancaria
  for each row execute function public.validar_conta_bancaria();

/*
  Quem sai de um espaço de casal não pode continuar mandando compras para ele.
  O trigger acima pega isso só na próxima escrita da conta; este pega na hora
  em que a membership some.
*/
create function public.soltar_cartoes_ao_sair_do_espaco()
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

  return old;
end;
$$;

create trigger membership_soltar_cartoes
  after delete on public.membership
  for each row execute function public.soltar_cartoes_ao_sair_do_espaco();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.conexao_bancaria enable row level security;
alter table public.conta_bancaria   enable row level security;

/*
  Só o dono, para tudo — nem quem divide o espaço lê. "Fulano conectou o banco?"
  não é pergunta que o app responde para a outra pessoa: o que ela vê são as
  compras que viram compra, nunca a conexão nem as contas.
*/
create policy conexao_bancaria_dono on public.conexao_bancaria
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy conta_bancaria_dono on public.conta_bancaria
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

/*
  GRANT explícito: o banco local novo não expõe tabela sem ele (a lição que a
  Frente A registrou em 20261112120000_planejamento_renda.sql). No remoto, que
  ainda expõe por padrão, é redundante e inofensivo.
*/
grant select, insert, update, delete on public.conexao_bancaria to authenticated;
grant select, insert, update, delete on public.conta_bancaria   to authenticated;
grant all on public.conexao_bancaria to service_role;
grant all on public.conta_bancaria   to service_role;

revoke all on function public.validar_conta_bancaria()            from public, anon, authenticated;
revoke all on function public.soltar_cartoes_ao_sair_do_espaco()  from public, anon, authenticated;
