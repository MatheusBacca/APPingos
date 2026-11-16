-- ============================================================================
-- APPingos — Open Finance (Pluggy): o Pix do acerto marca o mês como pago.
--
-- Fase 6 de docs/notion-plano-open-finance.md, passo 3 de "Acertar com Pix": o
-- Pix entre os dois chega no extrato no dia seguinte, e o app marca o
-- `acerto_mes` sozinho. QUEM DECIDE que o Pix é o acerto é a regra pura de
-- app/lib/conciliacao-pix.ts, sobre o mesmo `saldoDoMes` que a tela mostra — a
-- conta não é refeita aqui, para não divergir um centavo do valor que a pessoa
-- copiou. Esta migration só grava a decisão, conferindo quem pode.
-- ============================================================================

/*
  O Pix do acerto sai da caixa de entrada como "ignorado por ser o acerto": ele
  não é compra (o dinheiro só mudou de bolso entre os dois), e deixá-lo na caixa
  convidaria a classificá-lo como gasto — contando o mês duas vezes.
*/
alter table public.transacao_bancaria
  drop constraint transacao_bancaria_motivo_exclusao_check;

alter table public.transacao_bancaria
  add constraint transacao_bancaria_motivo_exclusao_check
  check (motivo_exclusao in ('pagamento_fatura', 'transferencia_propria', 'valor_zero', 'acerto'));

/*
  Marca o acerto e tira o Pix da caixa, numa transação só.

  SECURITY DEFINER porque escreve `motivo_exclusao`, que o privilégio de coluna
  tira do client — e por isso confere tudo à mão: a transação é de quem chama,
  está na caixa e não está pendente; quem chama é membro do espaço. O
  `acerto_mes` segue a régua da tela: `pago_por` é quem marcou, e o gatilho
  `validar_acerto_mes` confere a membership de novo.

  Mês que alguém já marcou à mão continua como está (`on conflict do nothing`):
  o Pix só sai da caixa, como prova do que já tinha sido registrado.
*/
create function public.conciliar_acerto(
  p_transacao   uuid,
  p_space       uuid,
  p_competencia date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.transacao_bancaria%rowtype;
begin
  select * into v from public.transacao_bancaria
  where id = p_transacao and user_id = auth.uid()
  for update;

  if v.id is null then
    raise exception 'transação não encontrada';
  end if;
  if v.destino is not null or v.pendente then
    raise exception 'esta transação não está esperando na caixa de entrada';
  end if;
  if not public.is_space_member(p_space) then
    raise exception 'você não é membro deste espaço';
  end if;

  insert into public.acerto_mes (space_id, competencia, pago_em, pago_por)
  values (
    p_space,
    date_trunc('month', p_competencia)::date,
    (v.data + time '12:00') at time zone 'America/Sao_Paulo',
    auth.uid()
  )
  on conflict (space_id, competencia) do nothing;

  update public.transacao_bancaria
  set destino = 'ignorada', motivo_exclusao = 'acerto', classificada_em = now()
  where id = v.id;
end;
$$;

revoke all on function public.conciliar_acerto(uuid, uuid, date) from public, anon;
grant execute on function public.conciliar_acerto(uuid, uuid, date) to authenticated;
