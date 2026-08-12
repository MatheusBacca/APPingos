-- ============================================================================
-- APPingos — Interesses (submódulo de Objetivos).
--
-- Um interesse é o ANTES de um objetivo: "queria trocar o sofá", "acho que ela
-- ia gostar deste fone". A ideia crua, registrada antes de ter meta e prazo.
--
-- Duas tabelas, e a segunda é o ponto: um interesse tem VÁRIOS produtos
-- candidatos. "Trocar o sofá" com três sofás de três lojas é o caso normal, não
-- a borda — é comparar preço dentro da mesma ideia. Um produto por interesse
-- obrigaria a criar três interesses para a mesma vontade, e aí nenhum dos três
-- seria "a vontade".
--
-- É aqui que a extensão do Chrome grava. Ver docs/notion-plano-extensao-chrome.md.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabelas
-- ----------------------------------------------------------------------------

create table public.interesse (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.space (id) on delete cascade,
  criado_por  uuid not null references auth.users (id) on delete cascade,
  titulo      text not null check (trim(titulo) <> ''),

  -- Para qual módulo isto aponta quando amadurecer. Texto com CHECK, e não enum
  -- do Postgres, pelo mesmo motivo de `papel` e `tipo`: acrescentar um destino é
  -- alterar a constraint, não migrar um tipo.
  destino     text not null default 'compra'
                check (destino in ('compra', 'objetivo', 'viagem', 'projeto', 'orcamento')),

  -- 'arquivado' é destino de primeira classe, não fracasso escondido: a maioria
  -- das ideias não vira nada, e tudo bem.
  estado      text not null default 'rascunho'
                check (estado in ('rascunho', 'amadurecendo', 'convertido', 'arquivado')),

  -- Presente para alguém. Texto livre, e não referência a auth.users, porque a
  -- pessoa presenteada quase nunca tem conta aqui ("minha mãe").
  para_quem   text,

  -- O "por quê", curto. Vira `nota_id` quando o módulo de Notas existir
  -- (docs/notion-plano-notas.md); até lá, um interesse sem lugar para escrever
  -- seria uma lista de títulos soltos.
  observacao  text,

  -- Conversão (fase 3). As colunas nascem aqui, não usadas, para que ligar a
  -- conversão depois não peça uma segunda migration nem um backfill.
  convertido_em     timestamptz,
  convertido_tipo   text check (convertido_tipo in ('objetivo', 'compra', 'viagem')),
  convertido_ref_id uuid,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Meio convertido não existe: ou os três campos estão preenchidos, ou nenhum.
  constraint interesse_conversao_completa check (
    (convertido_em is null and convertido_tipo is null and convertido_ref_id is null)
    or (convertido_em is not null and convertido_tipo is not null and convertido_ref_id is not null)
  )
);

create table public.interesse_produto (
  id            uuid primary key default gen_random_uuid(),
  interesse_id  uuid not null references public.interesse (id) on delete cascade,
  nome          text not null check (trim(nome) <> ''),
  url           text not null check (trim(url) <> ''),

  -- O hostname da página. Guardado em vez de derivado da url em toda leitura
  -- porque é o que a tela mostra e o que agrupa "o mesmo produto em três lojas".
  loja          text,

  -- Só a URL da imagem na loja; nada é baixado para o Storage nesta fase. Se o
  -- link apodrecer, é um card sem foto — não um dado perdido.
  imagem_url    text,

  /*
   * Os três preços são NULLABLE de propósito.
   *
   * A raspagem acerta o nome quase sempre e o preço com frequência menor. Um
   * `not null` aqui transformaria "não achei o preço" em "não dá para salvar" —
   * e o link com o nome já vale sozinho, com o valor entrando à mão depois.
   */
  preco         numeric(12,2) check (preco > 0),
  preco_pix     numeric(12,2) check (preco_pix > 0),
  parcelas      int           check (parcelas between 1 and 120),
  valor_parcela numeric(12,2) check (valor_parcela > 0),

  -- Qual candidato ganhou. É dele que sai o valor quando o interesse virar
  -- objetivo ou compra.
  escolhido     boolean not null default false,

  origem        text not null default 'extensao'
                  check (origem in ('extensao', 'manual')),
  capturado_em  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- Índices que as policies e as telas percorrem.
create index interesse_space_id_idx on public.interesse (space_id);
create index interesse_produto_interesse_id_idx on public.interesse_produto (interesse_id);

-- Um escolhido por interesse. Índice parcial, e não CHECK: a regra é entre
-- linhas irmãs, que CHECK não alcança.
create unique index interesse_produto_escolhido_idx
  on public.interesse_produto (interesse_id)
  where escolhido;

-- ----------------------------------------------------------------------------
-- updated_at
--
-- Reusa `public.tocar_updated_at()`, criado em 20260730130000_catalogo.sql.
-- ----------------------------------------------------------------------------

create trigger interesse_updated_at
  before update on public.interesse
  for each row execute function public.tocar_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.interesse enable row level security;
alter table public.interesse_produto enable row level security;

create policy interesse_select on public.interesse
  for select to authenticated
  using (public.is_space_member(space_id));

-- `criado_por = auth.uid()` no insert espelha `registrado_por` em compra: dá
-- para registrar no espaço do casal, nunca em nome do outro.
create policy interesse_insert on public.interesse
  for insert to authenticated
  with check (public.is_space_member(space_id) and criado_por = auth.uid());

create policy interesse_update on public.interesse
  for update to authenticated
  using (public.is_space_member(space_id))
  with check (public.is_space_member(space_id));

-- Apagar é do autor ou do admin. Editar não: amadurecer e arquivar a ideia do
-- outro é o uso normal de uma lista de casal.
create policy interesse_delete on public.interesse
  for delete to authenticated
  using (
    public.is_space_member(space_id)
    and (criado_por = auth.uid() or public.is_space_admin(space_id))
  );

/*
 * Produto herda a permissão do interesse — mesmo padrão de compra_participante
 * e parada. Um `for all` com o mesmo exists nos dois lados vale aqui porque não
 * há regra própria a expressar: quem alcança o interesse manda nos candidatos
 * dele.
 *
 * O subselect roda sob a RLS de `interesse` (a policy é SECURITY INVOKER, e
 * `interesse` não consulta a si mesma, então não há recursão a temer).
 */
create policy interesse_produto_tudo on public.interesse_produto
  for all to authenticated
  using (
    exists (select 1 from public.interesse i where i.id = interesse_id)
  )
  with check (
    exists (select 1 from public.interesse i where i.id = interesse_id)
  );

-- ----------------------------------------------------------------------------
-- RPCs
-- ----------------------------------------------------------------------------

/*
  Interesse + primeiro produto numa transação, no mesmo espírito de
  `registrar_compra` e `adicionar_item`.

  Existe por duas razões. A primeira é a transação: sem ela, existiria o estado
  "interesse gravado, produto não" — um título sem preço nem link, que é
  exatamente o que a captura vinha registrar. A segunda é a extensão do Chrome,
  que fala REST cru: uma chamada, e não duas encadeadas com o id no meio.

  `p_produto` é jsonb no formato (todos os campos além de nome/url opcionais):
    {"nome": "...", "url": "...", "loja": "kabum.com.br", "imagem_url": "...",
     "preco": 2399.00, "preco_pix": 2279.05, "parcelas": 12, "valor_parcela": 219.90}

  `null` grava o interesse sem produto — é o caminho de quem cria à mão pelo app.

  SECURITY INVOKER (o padrão) de propósito: as policies acima já expressam a
  regra, e rodar como invocador mantém uma fonte de verdade só para ela.
*/
create function public.registrar_interesse(
  p_space      uuid,
  p_titulo     text,
  p_destino    text  default 'compra',
  p_para_quem  text  default null,
  p_observacao text  default null,
  p_produto    jsonb default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_interesse uuid;
begin
  insert into public.interesse (space_id, criado_por, titulo, destino, para_quem, observacao)
  values (
    p_space,
    auth.uid(),
    trim(p_titulo),
    coalesce(nullif(trim(p_destino), ''), 'compra'),
    nullif(trim(p_para_quem), ''),
    nullif(trim(p_observacao), '')
  )
  returning id into v_interesse;

  if p_produto is not null and jsonb_typeof(p_produto) = 'object' then
    perform public.adicionar_produto(v_interesse, p_produto);
  end if;

  return v_interesse;
end;
$$;

/*
  Acrescenta um candidato a um interesse que já existe — o "achei outro, mais
  barato" da extensão, e o botão de mesmo nome na tela de detalhe.

  O primeiro produto de um interesse entra já escolhido: com um candidato só, ele
  é o valor do interesse, e obrigar um segundo clique para dizer o óbvio deixaria
  a maioria dos interesses sem valor nenhum.
*/
create function public.adicionar_produto(p_interesse uuid, p_produto jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_produto  uuid;
  v_primeiro boolean;
begin
  if p_produto is null or jsonb_typeof(p_produto) <> 'object' then
    raise exception 'informe os dados do produto';
  end if;

  select not exists (
    select 1 from public.interesse_produto p where p.interesse_id = p_interesse
  ) into v_primeiro;

  insert into public.interesse_produto (
    interesse_id, nome, url, loja, imagem_url,
    preco, preco_pix, parcelas, valor_parcela, escolhido, origem
  )
  values (
    p_interesse,
    trim(p_produto ->> 'nome'),
    trim(p_produto ->> 'url'),
    nullif(trim(coalesce(p_produto ->> 'loja', '')), ''),
    nullif(trim(coalesce(p_produto ->> 'imagem_url', '')), ''),
    -- `nullif(..., '')` antes do cast: um campo que a raspagem não achou chega
    -- como string vazia com a mesma facilidade que chega ausente, e `''::numeric`
    -- estoura "invalid input syntax" em vez de gravar o produto sem preço.
    nullif(p_produto ->> 'preco', '')::numeric,
    nullif(p_produto ->> 'preco_pix', '')::numeric,
    nullif(p_produto ->> 'parcelas', '')::int,
    nullif(p_produto ->> 'valor_parcela', '')::numeric,
    v_primeiro,
    coalesce(nullif(trim(coalesce(p_produto ->> 'origem', '')), ''), 'extensao')
  )
  returning id into v_produto;

  return v_produto;
end;
$$;

/*
  Troca o candidato escolhido.

  Como RPC porque são duas escritas — desmarcar o antigo e marcar o novo — e o
  índice único parcial recusaria a ordem inversa. Um update solto pela tela
  falharia em "duplicate key" sempre que já houvesse um escolhido, que é sempre.
*/
create function public.escolher_produto(p_produto uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_interesse uuid;
begin
  select p.interesse_id into v_interesse
  from public.interesse_produto p
  where p.id = p_produto;

  if v_interesse is null then
    raise exception 'produto não encontrado';
  end if;

  update public.interesse_produto
     set escolhido = false
   where interesse_id = v_interesse
     and escolhido
     and id <> p_produto;

  update public.interesse_produto
     set escolhido = true
   where id = p_produto;
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

grant execute on function public.registrar_interesse(uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.adicionar_produto(uuid, jsonb) to authenticated;
grant execute on function public.escolher_produto(uuid) to authenticated;
