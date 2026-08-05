-- ============================================================================
-- APPingos — Edição de compra.
--
-- Simétrica a `registrar_compra`, e pelo mesmo motivo: compra, rateio e
-- categoria mudam numa transação só. Sem isso existiria o estado "atualizei o
-- valor, mas o rateio antigo ficou" — ou, pior, o intervalo entre apagar os
-- participantes e inserir os novos, onde a compra fica sem rateio e o saldo do
-- mês divide por zero.
--
-- SECURITY INVOKER de propósito: quem pode editar já está dito nas policies de
-- `compra` (autor ou admin). Repetir a regra aqui criaria uma segunda fonte de
-- verdade para a mesma autorização.
--
-- Nota sobre datas: mudar `competencia_inicial` reexpande todas as parcelas na
-- view, sem nada a reconciliar. O efeito colateral é de significado, não de
-- cálculo — o saldo de um mês já acertado muda retroativamente, porque o app
-- ainda não tem o conceito de competência fechada.
-- ============================================================================

create function public.atualizar_compra(
  p_compra              uuid,
  p_descricao           text,
  p_valor_total         numeric,
  p_data_compra         date,
  p_competencia_inicial date,
  p_parcelas            int,
  p_pago_por            uuid,
  p_participantes       jsonb,
  p_categoria_nome      text default null,
  p_categoria_cor       text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_space     uuid;
  v_categoria uuid;
  v_soma      numeric;
begin
  -- A policy de select já filtra: quem não é do espaço não acha a linha.
  select c.space_id into v_space
  from public.compra c
  where c.id = p_compra;

  if v_space is null then
    raise exception 'compra não encontrada';
  end if;

  if jsonb_typeof(p_participantes) <> 'array' or jsonb_array_length(p_participantes) = 0 then
    raise exception 'informe ao menos um participante no rateio';
  end if;

  select sum((p ->> 'peso')::numeric) into v_soma
  from jsonb_array_elements(p_participantes) p;

  if coalesce(v_soma, 0) <= 0 then
    raise exception 'a soma dos pesos do rateio precisa ser maior que zero';
  end if;

  v_categoria := public.obter_ou_criar_categoria(v_space, p_categoria_nome, p_categoria_cor);

  update public.compra
  set descricao           = trim(p_descricao),
      valor_total         = p_valor_total,
      data_compra         = p_data_compra,
      competencia_inicial = date_trunc('month', p_competencia_inicial)::date,
      parcelas            = coalesce(p_parcelas, 1),
      pago_por            = p_pago_por,
      categoria_id        = v_categoria
  where id = p_compra;

  -- A RLS não levanta erro: ela simplesmente não deixa a linha ser atingida.
  if not found then
    raise exception 'você não tem permissão para editar esta compra';
  end if;

  delete from public.compra_participante where compra_id = p_compra;

  insert into public.compra_participante (compra_id, user_id, peso, informado_como)
  select
    p_compra,
    (p ->> 'user_id')::uuid,
    (p ->> 'peso')::numeric,
    coalesce(p ->> 'informado_como', 'percentual')
  from jsonb_array_elements(p_participantes) p;
end;
$$;

grant execute on function public.atualizar_compra(
  uuid, text, numeric, date, date, int, uuid, jsonb, text, text
) to authenticated;
