-- ============================================================================
-- APPingos — A compra parcelada se classifica inteira, em todo caminho.
--
-- Classificar, "Já lancei", a regra automática e mover a compra já levavam todas
-- as parcelas (as irmãs pela `chave_compra`, as que ainda vão chegar pelo
-- gatilho `vincular_parcela`). Dois caminhos tratavam uma parcela só:
--
-- 1. IGNORAR. A tela ignora as irmãs que estão na caixa, mas a parcela do mês
--    seguinte chegava e caía na caixa de novo: o gatilho só herdava o vínculo
--    com uma compra, nunca o "ignorada".
-- 2. DEVOLVER PARA A CAIXA. Voltava só a parcela clicada; as outras continuavam
--    vinculadas à compra (ou ignoradas). A compra ficava meio no extrato e meio
--    na caixa, e reclassificar a parcela devolvida criaria uma segunda compra.
-- ============================================================================

/*
  A parcela que chega herda a decisão já tomada para a compra:
    - uma irmã virou compra → nasce vinculada a ela (como antes);
    - uma irmã foi IGNORADA pela pessoa → nasce ignorada.
  Só conta o ignorar da pessoa (`motivo_exclusao is null`): o que a importação
  ignorou sozinha por contagem dupla não diz nada sobre a compra.
*/
create or replace function public.vincular_parcela()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.chave_compra is not null and new.destino is null then
    select t.compra_id into new.compra_id
    from public.transacao_bancaria t
    where t.user_id = new.user_id
      and t.chave_compra = new.chave_compra
      and t.compra_id is not null
    limit 1;

    if new.compra_id is not null then
      new.destino := 'compra';
      new.classificada_em := now();
    elsif exists (
      select 1
      from public.transacao_bancaria t
      where t.user_id = new.user_id
        and t.chave_compra = new.chave_compra
        and t.destino = 'ignorada'
        and t.motivo_exclusao is null
    ) then
      new.destino := 'ignorada';
      new.classificada_em := now();
    end if;
  end if;

  return new;
end;
$$;

/*
  Devolver uma parcela devolve a compra inteira: todas as irmãs com a mesma
  decisão (mesmo destino e, se compra, a mesma compra). Renda e aporte não são
  parcelados e seguem como antes.
*/
create or replace function public.devolver_para_caixa(p_transacao uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v public.transacao_bancaria%rowtype;
begin
  select * into v
  from public.transacao_bancaria
  where id = p_transacao
    and user_id = auth.uid();

  if v.destino is null or v.destino not in ('ignorada', 'compra', 'renda', 'aporte') then
    raise exception 'só dá para devolver à caixa o que já foi classificado';
  end if;

  if v.destino = 'renda' then
    delete from public.renda_recebida
    where transacao_id = p_transacao
      and user_id = auth.uid();
  elsif v.destino = 'aporte' then
    delete from public.meta_aporte
    where transacao_id = p_transacao
      and user_id = auth.uid();
  end if;

  update public.transacao_bancaria t
  set destino = null, compra_id = null, classificada_em = null
  where t.user_id = auth.uid()
    and (
      t.id = p_transacao
      or (
        v.chave_compra is not null
        and v.destino in ('compra', 'ignorada')
        and t.chave_compra = v.chave_compra
        and t.destino = v.destino
        and t.compra_id is not distinct from v.compra_id
        and t.motivo_exclusao is null
      )
    );
end;
$$;

revoke all on function public.devolver_para_caixa(uuid) from public, anon;
grant execute on function public.devolver_para_caixa(uuid) to authenticated;
