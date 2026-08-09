-- ============================================================================
-- APPingos — Viagens: roteiros com paradas ordenadas do Google Maps.
--
-- Três decisões sustentam o módulo:
--
--   1. O roteiro é do espaço, como tudo aqui — mas pode nascer SECRETO, visível
--      só para quem criou, até ser liberado. É a única exceção à doutrina de
--      privacidade do repo ("privacidade é estrutural, não é flag na linha"),
--      e ela existe porque o ponto todo de um roteiro-surpresa é ser revelado
--      DENTRO do espaço do casal. Por isso a regra vive na policy de RLS: com a
--      anon key na mão, um `select` cru precisa voltar vazio.
--   2. A ordem das paradas é posição na lista, não campo que o client escolhe.
--      `salvar_paradas` recebe o array inteiro e reescreve `ordem` a partir da
--      posição — não há como gravar duas paradas na mesma casa, nem buracos.
--   3. Nome e endereço do lugar são CACHE do Google, não dado nosso. O ToS
--      permite guardar `place_id` para sempre e o resto por 30 dias; guardamos
--      com `atualizado_em` para que a dívida fique visível, em vez de fingir
--      que a linha é nossa.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Roteiros
-- ----------------------------------------------------------------------------

/*
  `visibilidade` tem dois valores e não três. A primeira versão do plano previa
  também 'rascunho', com ele como default — mas 'rascunho' e 'segredo' escondem
  exatamente a mesma coisa das mesmas pessoas (a diferença era só de intenção), e
  o default fazia todo roteiro comum nascer invisível, exigindo um passo extra de
  "compartilhar" que ninguém pediu. A escolha acontece uma vez, na criação.

  `modo_transporte` guarda os quatro modos que o Google sabe rotear, e só eles.
  Avião não é "mais um modo": não há rota a desenhar entre dois aeroportos, e um
  roteiro aéreo é outro produto (trechos com data e horário). Se um dia entrar, é
  um valor a mais neste CHECK — não uma tabela nova.

  As datas são opcionais em par: dá para ter um roteiro sem data nenhuma, ou só
  com o início ("saímos dia 15, voltamos quando der"), mas não um fim solto — um
  fim sem início não datava nada e ainda quebraria o cálculo do dia da parada.
*/
create table public.roteiro (
  id               uuid primary key default gen_random_uuid(),
  space_id         uuid not null references public.space (id) on delete cascade,
  nome             text not null check (trim(nome) <> ''),
  descricao        text,
  modo_transporte  text not null default 'driving'
                     check (modo_transporte in ('driving', 'walking', 'bicycling', 'transit')),
  data_inicio      date,
  data_fim         date,
  visibilidade     text not null default 'compartilhado'
                     check (visibilidade in ('segredo', 'compartilhado')),
  liberado_em      timestamptz,
  criado_por       uuid not null references auth.users (id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint roteiro_datas_coerentes check (
    data_fim is null or (data_inicio is not null and data_fim >= data_inicio)
  )
);

-- A lista do módulo e o resumo do painel percorrem os dois: espaço e próxima viagem.
create index roteiro_space_idx        on public.roteiro (space_id);
create index roteiro_space_inicio_idx on public.roteiro (space_id, data_inicio);

-- ----------------------------------------------------------------------------
-- Paradas
-- ----------------------------------------------------------------------------

/*
  `google_place_id` nulo é parada de texto livre — "casa da vó" não está no Maps
  e mesmo assim pertence ao roteiro. Ela conta na lista, no agrupamento por dia e
  na numeração, mas NÃO entra na rota: não há como pedir ao Google uma rota até
  um lugar que ele não conhece. Quem decide isso é a camada do app, num lugar só
  (`trechosDoMaps` recebe a lista já filtrada).

  `nome` e `endereco` são o cache do contorno 3, e `atualizado_em` é o carimbo
  que diz desde quando. Não há revalidação hoje; o campo existe para que ela seja
  possível sem migration.

  A unicidade de `ordem` é DEFERRABLE porque reordenar é, por natureza, um estado
  intermediário inválido: trocar a parada 2 com a 3 passa por "duas na casa 3".
  Adiar a checagem para o fim da transação é o que permite escrever a lista nova
  sem inventar posições temporárias negativas.
*/
create table public.parada (
  id               uuid primary key default gen_random_uuid(),
  roteiro_id       uuid not null references public.roteiro (id) on delete cascade,
  ordem            int not null check (ordem >= 0),
  google_place_id  text check (google_place_id is null or trim(google_place_id) <> ''),
  nome             text not null check (trim(nome) <> ''),
  endereco         text,
  atualizado_em    timestamptz not null default now(),
  dia              int check (dia is null or dia >= 1),
  anotacao         text,
  created_at       timestamptz not null default now(),

  constraint parada_ordem_unica unique (roteiro_id, ordem) deferrable initially deferred
);

-- ----------------------------------------------------------------------------
-- Quem já viu o quê
-- ----------------------------------------------------------------------------

/*
  O selo "Novo" e a linha em destaque no painel valem por pessoa, inclusive para
  quem criou o roteiro: abrir é o que marca como visto, e cada um some com o seu
  no seu tempo. Guardar "foi liberado" só no roteiro faria o aviso sumir para os
  dois no instante em que o primeiro abrisse.
*/
create table public.roteiro_visto (
  roteiro_id  uuid not null references public.roteiro (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  visto_em    timestamptz not null default now(),
  primary key (roteiro_id, user_id)
);

-- ----------------------------------------------------------------------------
-- Quem enxerga um roteiro
-- ----------------------------------------------------------------------------

/*
  A definição de "este roteiro existe para mim", num lugar só.

  `parada` e `roteiro_visto` poderiam consultar `public.roteiro` direto e deixar
  a RLS do roteiro se aplicar ao subselect sozinha. Preferi chamar por nome: esta
  é a linha que separa uma surpresa guardada de uma surpresa estragada, e ela não
  deveria depender de quem lê a migration lembrar que RLS aninhada existe.

  Ver e poder editar são hoje a MESMA condição, de propósito — um roteiro
  compartilhado é dos dois, e os dois mexem nele; um secreto não existe para o
  outro, então não há o que editar. Se um dia surgir "compartilhado, mas só eu
  edito", é aqui que a função se parte em duas.
*/
create function public.pode_ver_roteiro(p_roteiro uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.roteiro r
    where r.id = p_roteiro
      and public.is_space_member(r.space_id)
      and (r.visibilidade = 'compartilhado' or r.criado_por = auth.uid())
  );
$$;

-- ----------------------------------------------------------------------------
-- Integridade que o CHECK não alcança
-- ----------------------------------------------------------------------------

/*
  Três coisas que um CHECK não consegue ver:

  1. `criado_por` precisa ser membro do espaço — senão o roteiro nasceria órfão,
     visível para ninguém quando secreto, e sem erro nenhum aparecer.
  2. `liberado_em` é do banco, nunca do client. Ele é o carimbo do momento em que
     o roteiro passou a existir para o outro, e é o que alimenta o "Novo": deixar
     o client escrevê-lo seria deixar o client decidir se o aviso aparece.
     Um roteiro que já nasce compartilhado é liberado no instante em que nasce.
  3. Voltar para 'segredo' é privilégio de quem criou. O outro membro pode editar
     um roteiro compartilhado à vontade — mas não pode escondê-lo de volta, o que
     na prática seria tomar posse dele.
*/
create function public.validar_roteiro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.membership m
    where m.space_id = new.space_id and m.user_id = new.criado_por
  ) then
    raise exception 'quem criou o roteiro não é membro deste espaço';
  end if;

  if tg_op = 'INSERT' then
    new.liberado_em := case when new.visibilidade = 'compartilhado' then now() end;
    return new;
  end if;

  if new.space_id <> old.space_id then
    raise exception 'um roteiro não muda de espaço';
  end if;

  if new.criado_por <> old.criado_por then
    raise exception 'o criador de um roteiro não muda';
  end if;

  if new.visibilidade is distinct from old.visibilidade then
    if new.visibilidade = 'segredo' and old.criado_por <> auth.uid() then
      raise exception 'só quem criou o roteiro pode torná-lo secreto';
    end if;
    new.liberado_em := case when new.visibilidade = 'compartilhado' then now() end;
  else
    new.liberado_em := old.liberado_em;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger roteiro_validar
  before insert or update on public.roteiro
  for each row execute function public.validar_roteiro();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.roteiro        enable row level security;
alter table public.parada         enable row level security;
alter table public.roteiro_visto  enable row level security;

/*
  Esta é A policy do módulo. Ser membro do espaço não basta: um roteiro secreto
  só existe para quem o criou. Nenhum filtro equivalente deve aparecer no client
  — se aparecer, é redundância, e no dia em que as duas divergirem a que vale é
  esta.
*/
create policy roteiro_select on public.roteiro
  for select to authenticated
  using (
    public.is_space_member(space_id)
    and (visibilidade = 'compartilhado' or criado_por = auth.uid())
  );

create policy roteiro_insert on public.roteiro
  for insert to authenticated
  with check (public.is_space_member(space_id) and criado_por = auth.uid());

-- Editar acompanha ver: o roteiro compartilhado é dos dois. O que o outro NÃO
-- pode fazer está no trigger (esconder de volta), não aqui.
create policy roteiro_update on public.roteiro
  for update to authenticated
  using (
    public.is_space_member(space_id)
    and (visibilidade = 'compartilhado' or criado_por = auth.uid())
  )
  with check (
    public.is_space_member(space_id)
    and (visibilidade = 'compartilhado' or criado_por = auth.uid())
  );

create policy roteiro_delete on public.roteiro
  for delete to authenticated
  using (
    public.is_space_member(space_id)
    and (criado_por = auth.uid() or public.is_space_admin(space_id))
  );

-- parada — acompanha a permissão do roteiro a que pertence, e o segredo se
-- propaga por consequência: sem ver o roteiro, não se vê nenhuma parada dele.
create policy parada_select on public.parada
  for select to authenticated
  using (public.pode_ver_roteiro(roteiro_id));

create policy parada_escrita on public.parada
  for all to authenticated
  using (public.pode_ver_roteiro(roteiro_id))
  with check (public.pode_ver_roteiro(roteiro_id));

/*
  "Já vi" é fato de uma pessoa só. Ninguém lê nem escreve o de ninguém — o outro
  ter aberto ou não é dele, e ler isso seria confirmação de leitura, que não é o
  que o módulo promete.
*/
create policy roteiro_visto_select on public.roteiro_visto
  for select to authenticated
  using (user_id = auth.uid());

create policy roteiro_visto_escrita on public.roteiro_visto
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.pode_ver_roteiro(roteiro_id));

-- ----------------------------------------------------------------------------
-- RPCs
-- ----------------------------------------------------------------------------

/*
  A lista inteira de paradas numa transação só.

  Substituir tudo em vez de diffar é escolha, não preguiça: um roteiro tem no
  máximo umas 20 paradas, e o diff teria que reconciliar inserção, remoção e
  reordenação ao mesmo tempo — três formas de deixar o roteiro num estado que a
  tela não mostrava. Aqui o que a pessoa vê na tela é literalmente o que fica
  gravado.

  `ordem` sai da posição no array (`with ordinality`), nunca do que o client
  mandou. É o que garante uma sequência 0..n-1 sem buraco nem empate.

  `p_paradas` é jsonb no formato:
    [{"google_place_id": "...", "nome": "...", "endereco": "...",
      "dia": 1, "anotacao": "..."}, ...]

  SECURITY INVOKER de propósito, como `registrar_compra`: as policies acima já
  dizem quem pode escrever. A checagem explícita no topo existe só para trocar o
  "new row violates row-level security policy" por uma frase que cabe num toast.
*/
create function public.salvar_paradas(p_roteiro uuid, p_paradas jsonb)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_total int;
begin
  if jsonb_typeof(p_paradas) <> 'array' then
    raise exception 'a lista de paradas precisa ser um array';
  end if;

  if not public.pode_ver_roteiro(p_roteiro) then
    raise exception 'você não pode editar este roteiro';
  end if;

  delete from public.parada where roteiro_id = p_roteiro;

  insert into public.parada (
    roteiro_id, ordem, google_place_id, nome, endereco, dia, anotacao
  )
  select
    p_roteiro,
    (p.posicao - 1)::int,
    nullif(trim(coalesce(p.item ->> 'google_place_id', '')), ''),
    trim(p.item ->> 'nome'),
    nullif(trim(coalesce(p.item ->> 'endereco', '')), ''),
    nullif(p.item ->> 'dia', '')::int,
    nullif(trim(coalesce(p.item ->> 'anotacao', '')), '')
  from jsonb_array_elements(p_paradas) with ordinality as p(item, posicao);

  get diagnostics v_total = row_count;

  -- Toca o roteiro para que "atualizado em" reflita a mexida nas paradas, e não
  -- só a edição do cabeçalho.
  update public.roteiro set updated_at = now() where id = p_roteiro;

  return v_total;
end;
$$;

/*
  O momento da revelação.

  SECURITY DEFINER e com o `criado_por` no WHERE: a policy de update já
  permitiria isso, mas liberar é o único caminho de ida do módulo — depois dele o
  outro passa a ver tudo — e vale que a condição esteja escrita aqui, à vista, em
  vez de deduzida de duas policies. Quem preenche `liberado_em` é o trigger.
*/
create function public.liberar_roteiro(p_roteiro uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.roteiro
     set visibilidade = 'compartilhado'
   where id = p_roteiro
     and criado_por = auth.uid()
     and visibilidade = 'segredo';

  if not found then
    raise exception 'só quem criou um roteiro secreto pode liberá-lo';
  end if;
end;
$$;

/*
  Abrir o roteiro apaga o "Novo" — o seu, não o do outro. Upsert em vez de
  insert-se-não-existe porque abrir de novo é normal, e um erro de chave
  duplicada no meio da navegação não teria o que dizer a quem está olhando.
*/
create function public.marcar_roteiro_visto(p_roteiro uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.roteiro_visto (roteiro_id, user_id)
  values (p_roteiro, auth.uid())
  on conflict (roteiro_id, user_id) do update set visto_em = now();
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

revoke all on function public.validar_roteiro() from public, anon, authenticated;

grant execute on function public.pode_ver_roteiro(uuid)       to authenticated;
grant execute on function public.salvar_paradas(uuid, jsonb)  to authenticated;
grant execute on function public.liberar_roteiro(uuid)        to authenticated;
grant execute on function public.marcar_roteiro_visto(uuid)   to authenticated;
