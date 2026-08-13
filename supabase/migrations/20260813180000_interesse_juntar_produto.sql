-- ============================================================================
-- APPingos — juntar e separar produtos entre agrupamentos.
--
-- Ao contrário da migration anterior, esta é ADITIVA: só cria duas funções, não
-- mexe em tabela nem em policy. Pode ser aplicada antes do deploy sem quebrar o app
-- publicado — ele simplesmente não chama as funções novas.
--
-- ## Por que RPC, e não um update solto da tela
--
-- "Arrastar o suporte para cima do monitor" parece uma escrita, e são três:
--
--   1. o produto troca de `agrupamento_id`
--   2. o agrupamento de origem, agora vazio, é apagado
--   3. se ele era o favorito, o favorito passa para o destino
--
-- Parar no meio de qualquer ponto deixa um estado que a tela não sabe explicar: um
-- agrupamento vazio concorrendo a favorito (custa nada, então ganharia de todos na
-- comparação de preço), ou um interesse sem favorito nenhum depois de uma ação que
-- não era sobre favorito. Numa transação, ou os três acontecem ou nenhum.
--
-- ## A ordem do passo 3 não é livre
--
-- `interesse_agrupamento_escolhido_idx` é único parcial `where escolhido`: dois
-- favoritos no mesmo interesse é erro de chave duplicada. Então o destino só pode
-- ser marcado DEPOIS de a origem sair — por isso apagar vem antes de escolher, e
-- por isso quem escolhe é `escolher_agrupamento`, que já sabe desmarcar o anterior.
-- ============================================================================

/*
  Move o produto para outro agrupamento do MESMO interesse.

  Junta dois produtos soltos (o destino tem um produto só e passa a ter dois) e
  acrescenta a um conjunto que já existe — do ponto de vista de quem arrasta é o
  mesmo gesto, e por isso é a mesma função. Produto solto não é caso especial: é um
  agrupamento de um produto.

  Devolve o que aconteceu, para a tela poder dizer "e virou o favorito" em vez de
  mudar o favorito em silêncio.
*/
create function public.juntar_produto_ao_agrupamento(
  p_produto     uuid,
  p_agrupamento uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_origem          uuid;
  v_interesse       uuid;
  v_destino_interesse uuid;
  v_origem_escolhida  boolean;
  v_sobraram        int;
  v_origem_apagada  boolean := false;
  v_favorito_movido boolean := false;
begin
  select p.agrupamento_id, p.interesse_id into v_origem, v_interesse
  from public.interesse_produto p where p.id = p_produto;

  if v_origem is null then
    -- Também é o que acontece quando o produto é de outro espaço: a RLS o torna
    -- invisível, e "não encontrado" é a resposta honesta.
    raise exception 'produto não encontrado';
  end if;

  if v_origem = p_agrupamento then
    -- Soltar em cima de onde já estava. Não é erro — é o gesto que a pessoa
    -- desistiu no meio, e um erro aqui viraria um toast de falha sem falha.
    return jsonb_build_object('mudou', false);
  end if;

  select a.interesse_id into v_destino_interesse
  from public.interesse_agrupamento a where a.id = p_agrupamento;

  if v_destino_interesse is null then
    raise exception 'agrupamento não encontrado';
  end if;

  /*
    O trigger `interesse_produto_agrupamento_coerente` também barra isto, e de
    propósito: ele é a garantia, esta checagem é a mensagem. Sem ela, arrastar entre
    dois interesses (que a tela não permite, mas uma chamada direta permitiria)
    chegaria como o texto cru do trigger.
  */
  if v_destino_interesse <> v_interesse then
    raise exception 'o produto e o agrupamento são de interesses diferentes';
  end if;

  select a.escolhido into v_origem_escolhida
  from public.interesse_agrupamento a where a.id = v_origem;

  update public.interesse_produto
     set agrupamento_id = p_agrupamento
   where id = p_produto;

  select count(*) into v_sobraram
  from public.interesse_produto p where p.agrupamento_id = v_origem;

  if v_sobraram = 0 then
    -- Apagar vem ANTES de escolher: com a origem ainda marcada, marcar o destino
    -- estouraria o índice único parcial de "um favorito por interesse".
    delete from public.interesse_agrupamento where id = v_origem;
    v_origem_apagada := true;

    if v_origem_escolhida then
      perform public.escolher_agrupamento(p_agrupamento);
      v_favorito_movido := true;
    end if;
  end if;

  return jsonb_build_object(
    'mudou', true,
    'origem_apagada', v_origem_apagada,
    'favorito_movido', v_favorito_movido
  );
end;
$$;

/*
  Tira o produto do conjunto e o devolve a um agrupamento próprio.

  É o desfazer de `juntar`, e existe porque sem ele juntar seria irreversível: a
  única saída de um produto dentro de um conjunto seria apagá-lo, e apagar leva o
  histórico de preço junto (`interesse_produto_preco` é `on delete cascade`). Um
  gesto de arrastar que não tem volta é uma armadilha, não uma facilidade.

  O agrupamento novo NÃO nasce favorito, mesmo que o de origem seja: separar diz "na
  verdade isto é uma alternativa", não "e é esta que eu quero". Quem decide o
  favorito é o botão de favorito. `criar_agrupamento` só marca o primeiro do
  interesse, e aqui já existe pelo menos o de origem.
*/
create function public.separar_produto(p_produto uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_origem    uuid;
  v_interesse uuid;
  v_sobraram  int;
  v_novo      uuid;
begin
  select p.agrupamento_id, p.interesse_id into v_origem, v_interesse
  from public.interesse_produto p where p.id = p_produto;

  if v_origem is null then
    raise exception 'produto não encontrado';
  end if;

  select count(*) into v_sobraram
  from public.interesse_produto p where p.agrupamento_id = v_origem;

  if v_sobraram <= 1 then
    -- Ele já está sozinho. Separar criaria um agrupamento novo e apagaria o antigo
    -- para chegar exatamente onde já se está — e trocaria o id de um agrupamento
    -- que a tela tem em mão, o que é pior que não fazer nada.
    raise exception 'este produto já está sozinho no conjunto dele';
  end if;

  v_novo := public.criar_agrupamento(v_interesse, null);

  update public.interesse_produto
     set agrupamento_id = v_novo
   where id = p_produto;

  return v_novo;
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

grant execute on function public.juntar_produto_ao_agrupamento(uuid, uuid) to authenticated;
grant execute on function public.separar_produto(uuid) to authenticated;
