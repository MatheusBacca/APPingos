-- ============================================================================
-- APPingos — a regra "Classificar sozinha" passa a valer na sincronização.
--
-- `regra_classificacao.automatica` (20261117120000) era só uma intenção: a tela
-- deixava ligar, e nada acontecia. Aqui a sincronização ganha o que aplicá-la:
-- a transação de um estabelecimento com regra automática entra sozinha no
-- espaço PESSOAL da dona, com a categoria da regra.
--
-- Só o pessoal, nunca o casal (CHECK `regra_automatica_so_pessoal`): nada entra
-- no espaço do casal sem um toque humano. E só daqui para a frente, como o
-- cartão designado (`designada_em`): ligar a regra não esvazia de surpresa o
-- que já estava esperando na caixa de entrada.
-- ============================================================================

alter table public.regra_classificacao
  add column automatica_desde timestamptz;

create function public.marcar_automatica_desde()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.automatica and (tg_op = 'INSERT' or not old.automatica) then
    new.automatica_desde := now();
  elsif not new.automatica then
    new.automatica_desde := null;
  end if;
  return new;
end;
$$;

create trigger regra_classificacao_automatica_desde
  before insert or update on public.regra_classificacao
  for each row execute function public.marcar_automatica_desde();

/*
  Lança no pessoal as compras de UMA regra automática numa conta.

  Mesmo formato de `lancar_compras_do_cartao` (o plano vem de
  `comprasParaLancar`, já com as parcelas agrupadas) e os mesmos filtros de
  elegibilidade, mais um: a transação aconteceu depois de a regra virar
  automática. A categoria é procurada pelo nome no espaço pessoal e criada se
  não existir — com a cor sugerida pela categoria-base.

  Só para conta em 'perguntar': cartão designado já tem o seu destino.
*/
create function public.lancar_compras_por_regra(
  p_conta    uuid,
  p_regra    uuid,
  p_compras  jsonb,
  p_cor      text default 'cinza'
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta     public.conta_bancaria%rowtype;
  v_regra     public.regra_classificacao%rowtype;
  v_space     uuid;
  v_categoria uuid;
  v_item      jsonb;
  v_ids       uuid[];
  v_chave     text;
  v_compra    uuid;
  v_total     int := 0;
begin
  select * into v_conta from public.conta_bancaria where id = p_conta;
  select * into v_regra from public.regra_classificacao where id = p_regra;

  if v_conta.id is null or v_regra.id is null
     or v_conta.destino <> 'perguntar'
     or v_regra.user_id <> v_conta.user_id
     or not v_regra.automatica
     or v_regra.destino <> 'pessoal'
     or v_regra.automatica_desde is null then
    return 0;
  end if;

  select s.id into v_space
  from public.space s
  join public.membership m on m.space_id = s.id
  where m.user_id = v_conta.user_id and s.tipo = 'pessoal'
  limit 1;

  if v_space is null then
    return 0;
  end if;

  if nullif(trim(v_regra.categoria_nome), '') is not null then
    select c.id into v_categoria
    from public.categoria c
    where c.space_id = v_space and c.nome_norm = lower(trim(v_regra.categoria_nome));

    if v_categoria is null then
      insert into public.categoria (space_id, nome, cor)
      values (
        v_space,
        trim(v_regra.categoria_nome),
        case when p_cor in ('cinza', 'marrom', 'laranja', 'amarelo', 'verde', 'azul', 'roxo', 'rosa', 'vermelho')
          then p_cor else 'cinza' end
      )
      returning id into v_categoria;
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_compras) loop
    select array_agg(t.id), max(t.chave_compra)
    into v_ids, v_chave
    from public.transacao_bancaria t
    where t.conta_id = v_conta.id
      and t.provider_id in (select jsonb_array_elements_text(v_item -> 'provider_ids'))
      and t.destino is null
      and not t.pendente
      and t.sentido = 'saida'
      and t.motivo_exclusao is null
      and t.data >= (v_regra.automatica_desde at time zone 'America/Sao_Paulo')::date;

    continue when v_ids is null;

    insert into public.compra (
      space_id, descricao, valor_total, data_compra, competencia_inicial,
      parcelas, pago_por, registrado_por, categoria_id
    )
    values (
      v_space,
      v_item ->> 'descricao',
      (v_item ->> 'valor_total')::numeric,
      (v_item ->> 'data_compra')::date,
      date_trunc('month', (v_item ->> 'competencia_inicial')::date)::date,
      greatest(coalesce((v_item ->> 'parcelas')::int, 1), 1),
      v_conta.user_id,
      v_conta.user_id,
      v_categoria
    )
    returning id into v_compra;

    insert into public.compra_participante (compra_id, user_id, peso, informado_como)
    values (v_compra, v_conta.user_id, 100, 'percentual');

    update public.transacao_bancaria
    set destino = 'compra', compra_id = v_compra, classificada_em = now()
    where id = any(v_ids)
       or (v_chave is not null and user_id = v_conta.user_id and chave_compra = v_chave and destino is null);

    -- Mais uma vez igual: a regra continua contando.
    update public.regra_classificacao
    set vezes = vezes + 1, ultima_vez = now()
    where id = v_regra.id;

    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;

revoke all on function public.marcar_automatica_desde() from public, anon, authenticated;
revoke all on function public.lancar_compras_por_regra(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.lancar_compras_por_regra(uuid, uuid, jsonb, text) to service_role;
