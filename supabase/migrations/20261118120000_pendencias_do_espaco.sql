-- ============================================================================
-- APPingos — Orçamentos: quantas compras dos cartões do casal esperam destino.
--
-- O extrato é só da dona (RLS de `transacao_bancaria`: `user_id = auth.uid()`),
-- e continua assim. Mas o cartão marcado como "do casal" é, por decisão da
-- própria dona, um cartão de gastos dos dois: o que ele traz e ainda está na
-- caixa de entrada é gasto do casal que ainda não entrou no acerto. A outra
-- pessoa precisa saber que ele EXISTE — não o que é.
--
-- Por isso esta função devolve só a CONTAGEM, por pessoa: nada de descrição,
-- valor ou data. A lista continua visível só para a dona, na caixa de entrada e
-- no Chico Moedas.
--
-- O que conta, igual à caixa de entrada:
--   - transação ainda na caixa (`destino is null`);
--   - gasto (`sentido = 'saida'`), já lançado pelo banco (`pendente = false`) —
--     a pendente não dá para classificar ainda, e contá-la prometeria uma
--     compra que a lista não mostra;
--   - de um cartão designado a ESTE espaço (`destino = 'casal'`);
--   - da competência pedida — o mês da fatura, que é o mês em que a compra
--     pesa no acerto.
-- As parcelas de uma mesma compra contam uma vez (`chave_compra`), como a
-- caixa de entrada as mostra numa linha só.
-- ============================================================================

create function public.pendencias_do_espaco(p_space uuid, p_competencia date)
returns table (user_id uuid, quantidade int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_space_member(p_space) then
    raise exception 'você não é membro deste espaço';
  end if;

  return query
    select t.user_id, count(distinct coalesce(t.chave_compra, t.id::text))::int
    from public.transacao_bancaria t
    join public.conta_bancaria c on c.id = t.conta_id
    where c.destino = 'casal'
      and c.space_id = p_space
      and t.destino is null
      and t.sentido = 'saida'
      and not t.pendente
      and t.competencia = p_competencia
    group by t.user_id;
end;
$$;

revoke all on function public.pendencias_do_espaco(uuid, date) from public, anon;
grant execute on function public.pendencias_do_espaco(uuid, date) to authenticated;
