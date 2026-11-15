-- ============================================================================
-- Devolver à caixa também o salário e o aporte vindos do extrato.
--
-- Era pendência registrada em docs/pendencias-open-finance.md: classificar um
-- crédito como "Salário" ou um débito como "Aporte em meta" não tinha volta pela
-- caixa — `devolver_para_caixa` só aceitava o que tinha sido ignorado ou
-- vinculado a compra, e a linha classificada ficava sem o botão.
--
-- Agora devolver desfaz o efeito junto:
--   renda  → apaga a marcação de salário recebido criada por ESTA transação
--   aporte → apaga o aporte (ou resgate) na meta criado por ESTA transação
--
-- O Pix do acerto (`motivo_exclusao = 'acerto'`) volta para a caixa como qualquer
-- ignorada; o motivo fica (o usuário não tem UPDATE nessa coluna, e a caixa já o
-- trata como neutro — `itensDaCaixa`). O mês continua pago: o acerto pode ter sido
-- marcado à mão antes do Pix, e `acerto_mes` não guarda quem o marcou — desfazer é
-- na tela do mês, e a caixa avisa isso.
--
-- Só o que nasceu da própria transação (`transacao_id = p_transacao`): uma
-- marcação manual que a classificação substituiu já não existe para voltar, e o
-- mês fica como "não marcado" — o mesmo que desmarcar na tela do Planejamento.
--
-- SECURITY INVOKER, como antes: a RLS de `renda_recebida` e de `meta_aporte`
-- decide o que a pessoa pode apagar, e a função não abre nada além dela.
-- ============================================================================

create or replace function public.devolver_para_caixa(p_transacao uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_destino text;
begin
  select destino into v_destino
  from public.transacao_bancaria
  where id = p_transacao
    and user_id = auth.uid();

  if v_destino is null or v_destino not in ('ignorada', 'compra', 'renda', 'aporte') then
    raise exception 'só dá para devolver à caixa o que já foi classificado';
  end if;

  if v_destino = 'renda' then
    delete from public.renda_recebida
    where transacao_id = p_transacao
      and user_id = auth.uid();
  elsif v_destino = 'aporte' then
    delete from public.meta_aporte
    where transacao_id = p_transacao
      and user_id = auth.uid();
  end if;

  update public.transacao_bancaria
  set destino = null, compra_id = null, classificada_em = null
  where id = p_transacao
    and user_id = auth.uid();
end;
$$;

revoke all on function public.devolver_para_caixa(uuid) from public, anon;
grant execute on function public.devolver_para_caixa(uuid) to authenticated;
