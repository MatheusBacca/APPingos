-- ============================================================================
-- APPingos — Mover uma compra entre gavetas (pessoal ↔ compartilhado).
--
-- Contrato com a Frente B (Pluggy): docs/contrato-planejamento-open-finance.md,
-- seção 7. Com a caixa de entrada, "classifiquei errado" vira rotina, e sem isto
-- a única saída seria apagar e lançar de novo à mão.
--
-- Apaga e recria, e não um `update space_id`. O plano de gastos pessoais já
-- tinha chegado aqui: o rateio antigo aponta para membros do espaço de origem, e
-- o gatilho `validar_participante` recusa — com razão — um participante que não é
-- membro do espaço da compra. Trocar o espaço e o rateio numa linha só exigiria
-- desligar essa garantia no meio da operação.
--
-- Consequências de recriar, todas aceitas:
--
--   - O id MUDA. A RPC devolve o novo, e quem guarda vínculo com a compra (a
--     Frente B, em `transacao_bancaria.compra_id`) troca para ele.
--   - `created_at` passa a ser o do movimento, e `registrado_por` passa a ser
--     quem moveu (a policy de insert exige isso). Nada no app ordena pelo
--     primeiro; o segundo decide quem edita, e quem moveu já podia editar.
--   - Os gatilhos de compra rodam como num lançamento: o espaço de destino recebe
--     "gasto novo" e o de origem "gasto removido". É o que aconteceu do ponto de
--     vista de cada espaço — a compra apareceu num e sumiu do outro. A regra de
--     Pins `gasto_novo` também roda; o teto diário dela (5) é o limite de quanto
--     ir e voltar pode render.
-- ============================================================================

/*
  `p_participantes` tem o formato de `registrar_compra`:
    [{"user_id": "...", "peso": 50, "informado_como": "percentual"}, ...]
  e precisa apontar para membros do DESTINO — `rateioIgual()` em
  app/types/orcamento.ts monta o 50/50; para o pessoal é você com peso 1.

  `pago_por` acompanha a compra quando quem pagou também é membro do destino. Se
  não é (a compra que ela pagou, movida para o SEU pessoal), passa a ser você: no
  espaço pessoal não há outro membro possível, e o gatilho `validar_compra`
  recusaria qualquer outro.

  SECURITY INVOKER, como `registrar_compra` e `atualizar_compra`: as policies de
  `compra` já dizem quem pode apagar na origem (autor ou admin) e quem pode lançar
  no destino (membro, e em nome de outro só admin). Se qualquer uma recusar, a
  transação inteira volta — não existe o meio do caminho "recriei no destino mas
  não consegui apagar a original", que deixaria a compra contada duas vezes.
*/
create function public.mover_compra(
  p_compra         uuid,
  p_space_destino  uuid,
  p_participantes  jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_compra   public.compra%rowtype;
  v_cat_nome text;
  v_cat_cor  text;
  v_pago_por uuid;
  v_nova     uuid;
begin
  -- A policy de select já filtra: quem não é do espaço de origem não acha a linha.
  select * into v_compra from public.compra where id = p_compra;

  if v_compra.id is null then
    raise exception 'compra não encontrada';
  end if;

  if v_compra.space_id = p_space_destino then
    raise exception 'a compra já está neste espaço';
  end if;

  if not public.is_space_member(p_space_destino) then
    raise exception 'você não é membro do espaço de destino';
  end if;

  -- A categoria é por espaço: viaja pelo nome, e o destino resolve a sua.
  select c.nome, c.cor into v_cat_nome, v_cat_cor
  from public.categoria c
  where c.id = v_compra.categoria_id;

  v_pago_por := case
    when exists (
      select 1 from public.membership m
      where m.space_id = p_space_destino and m.user_id = v_compra.pago_por
    ) then v_compra.pago_por
    else auth.uid()
  end;

  v_nova := public.registrar_compra(
    p_space               => p_space_destino,
    p_descricao           => v_compra.descricao,
    p_valor_total         => v_compra.valor_total,
    p_data_compra         => v_compra.data_compra,
    p_competencia_inicial => v_compra.competencia_inicial,
    p_parcelas            => v_compra.parcelas,
    p_pago_por            => v_pago_por,
    p_participantes       => p_participantes,
    p_categoria_nome      => v_cat_nome,
    p_categoria_cor       => v_cat_cor
  );

  delete from public.compra where id = p_compra;

  -- A RLS não levanta erro: ela só não deixa a linha ser atingida.
  if not found then
    raise exception 'você não tem permissão para mover esta compra';
  end if;

  return v_nova;
end;
$$;

revoke all on function public.mover_compra(uuid, uuid, jsonb) from public, anon;
grant execute on function public.mover_compra(uuid, uuid, jsonb) to authenticated;
