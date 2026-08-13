-- ============================================================================
-- APPingos — histórico de preço, e a rechecagem que não estraga o que já sabe.
--
-- O botão "Atualizar preços" da extensão reabre a página de cada produto e relê o
-- que a loja mostra hoje. Duas coisas precisam existir para isso valer:
--
--   1. **Saber quando foi a última olhada.** Sem `verificado_em`, o preço na tela
--      não distingue "custa isso" de "custava isso em agosto".
--   2. **Guardar o que era antes.** Sobrescrever em silêncio troca 2.399 por 1.999
--      e some com a informação de que baixou — que é o motivo de rechecar.
--
-- Por que a rechecagem roda no navegador de quem usa, e não num cron de servidor:
-- o HTML cru não traz preço Pix nem parcelamento (são montados por JS), e IP de
-- datacenter toma 403 das lojas grandes. O navegador de quem já está logado tem IP
-- residencial, Chrome de verdade e a sessão — é o que as lojas não barram.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Quando foi a última olhada
-- ----------------------------------------------------------------------------

alter table public.interesse_produto
  add column verificado_em timestamptz,
  -- Quantas rechecagens seguidas não conseguiram ler preço nenhum. Serve para a
  -- tela poder dizer "esta loja não deixa mais" em vez de tentar para sempre em
  -- silêncio. `null` em verificado_em = nunca foi rechecado desde a captura.
  add column falhas_seguidas int not null default 0
    check (falhas_seguidas >= 0);

-- ----------------------------------------------------------------------------
-- O histórico
-- ----------------------------------------------------------------------------

/*
  Uma linha por observação que MUDOU alguma coisa.

  Não é um log de tentativas — para isso existem `verificado_em` e
  `falhas_seguidas`. Aqui só entra o que altera o retrato do produto, senão uma
  rechecagem diária de um preço estável geraria trezentas linhas idênticas por ano.

  A linha carrega o retrato inteiro (os quatro campos), e não só o que mudou:
  assim ler o histórico é ler linhas independentes, sem reconstruir estado
  aplicando diferenças em ordem.
*/
create table public.interesse_produto_preco (
  id            uuid primary key default gen_random_uuid(),
  produto_id    uuid not null references public.interesse_produto (id) on delete cascade,
  preco         numeric(12,2) check (preco > 0),
  preco_pix     numeric(12,2) check (preco_pix > 0),
  parcelas      int           check (parcelas between 1 and 120),
  valor_parcela numeric(12,2) check (valor_parcela > 0),
  visto_em      timestamptz not null default now()
);

create index interesse_produto_preco_produto_idx
  on public.interesse_produto_preco (produto_id, visto_em desc);

-- ----------------------------------------------------------------------------
-- RLS — herda do produto, que herda do interesse
-- ----------------------------------------------------------------------------

alter table public.interesse_produto_preco enable row level security;

/*
  Mesmo padrão de `interesse_produto_tudo`: quem alcança o produto manda no
  histórico dele. A corrente inteira desemboca em `is_space_member` lá no
  interesse, então não há regra nova a manter aqui.
*/
create policy interesse_produto_preco_tudo on public.interesse_produto_preco
  for all to authenticated
  using (
    exists (select 1 from public.interesse_produto p where p.id = produto_id)
  )
  with check (
    exists (select 1 from public.interesse_produto p where p.id = produto_id)
  );

-- ----------------------------------------------------------------------------
-- O histórico começa na captura
-- ----------------------------------------------------------------------------

/*
  Sem isto, a linha mais antiga do histórico seria a primeira RECHECAGEM, e o preço
  de quando o produto foi capturado — o que a pessoa viu quando decidiu salvar —
  não estaria em lugar nenhum depois da primeira mudança.

  Trigger, e não um insert dentro de `adicionar_produto`, para valer também para
  produto criado à mão pela tela e para qualquer caminho futuro.
*/
create function public.registrar_preco_inicial()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.preco is not null or new.preco_pix is not null then
    insert into public.interesse_produto_preco (
      produto_id, preco, preco_pix, parcelas, valor_parcela, visto_em
    )
    values (
      new.id, new.preco, new.preco_pix, new.parcelas, new.valor_parcela, new.capturado_em
    );
  end if;

  return new;
end;
$$;

create trigger interesse_produto_preco_inicial
  after insert on public.interesse_produto
  for each row execute function public.registrar_preco_inicial();

-- ----------------------------------------------------------------------------
-- A rechecagem
-- ----------------------------------------------------------------------------

/*
  Grava o que a rechecagem leu, e devolve o antes e o depois para a tela poder
  dizer "2.399 → 1.999" sem uma segunda consulta.

  ## A regra que o pedido original definiu

  "Não atualizar caso não consiga ler o preço." Aqui isso vale **por campo**, e não
  só para a chamada inteira: um campo que voltou `null` significa "não achei", não
  "a loja tirou". Por isso o `coalesce` — reler uma página onde o parcelamento não
  carregou não pode apagar o parcelamento que já estava guardado.

  O custo dessa escolha, consciente: um desconto de Pix que a loja de fato removeu
  fica registrado para sempre, porque some da página do mesmo jeito que um campo
  que falhou. Distinguir os dois exigiria confiar na raspagem mais do que ela
  merece, e o erro nessa direção é pior — apagaria dado bom.

  Chamada sem preço nenhum não mexe em valor: só carimba a tentativa e conta a
  falha. É `SECURITY INVOKER` (o padrão), então a RLS decide quem pode.
*/
create function public.registrar_preco_lido(
  p_produto       uuid,
  p_preco         numeric default null,
  p_preco_pix     numeric default null,
  p_parcelas      int     default null,
  p_valor_parcela numeric default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_antes  public.interesse_produto%rowtype;
  v_depois public.interesse_produto%rowtype;
  v_mudou  boolean;
begin
  select * into v_antes from public.interesse_produto where id = p_produto;

  if not found then
    -- Também é o que acontece quando o produto é de outro espaço: a RLS o torna
    -- invisível, e "não encontrado" é a resposta honesta.
    raise exception 'produto não encontrado';
  end if;

  if p_preco is null and p_preco_pix is null then
    update public.interesse_produto
       set verificado_em = now(),
           falhas_seguidas = falhas_seguidas + 1
     where id = p_produto
    returning * into v_depois;

    return jsonb_build_object(
      'atualizado', false,
      'motivo', 'sem_preco',
      'falhas_seguidas', v_depois.falhas_seguidas
    );
  end if;

  update public.interesse_produto
     set preco         = coalesce(p_preco, preco),
         preco_pix     = coalesce(p_preco_pix, preco_pix),
         parcelas      = coalesce(p_parcelas, parcelas),
         valor_parcela = coalesce(p_valor_parcela, valor_parcela),
         verificado_em = now(),
         falhas_seguidas = 0
   where id = p_produto
  returning * into v_depois;

  v_mudou := (v_depois.preco         is distinct from v_antes.preco)
          or (v_depois.preco_pix     is distinct from v_antes.preco_pix)
          or (v_depois.parcelas      is distinct from v_antes.parcelas)
          or (v_depois.valor_parcela is distinct from v_antes.valor_parcela);

  if v_mudou then
    insert into public.interesse_produto_preco (
      produto_id, preco, preco_pix, parcelas, valor_parcela
    )
    values (
      p_produto, v_depois.preco, v_depois.preco_pix, v_depois.parcelas, v_depois.valor_parcela
    );
  end if;

  return jsonb_build_object(
    'atualizado', v_mudou,
    'preco_antes', v_antes.preco,
    'preco_depois', v_depois.preco,
    'pix_antes', v_antes.preco_pix,
    'pix_depois', v_depois.preco_pix
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

revoke all on function public.registrar_preco_inicial() from public, anon, authenticated;

grant execute on function public.registrar_preco_lido(uuid, numeric, numeric, int, numeric)
  to authenticated;
