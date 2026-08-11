-- ============================================================================
-- APPingos — Notificações com hora marcada, e a faxina.
--
-- Tudo dentro do banco, por pg_cron, e versionado por migration — não um cron do
-- Vercel. O agendamento mora junto do dado e sobrevive a troca de hospedagem.
--
-- `cron.schedule` RODA EM UTC. BRT é UTC−3 sem horário de verão desde 2019, e os
-- horários abaixo já estão convertidos. Isso está escrito aqui porque é o erro
-- clássico deste tipo de código: '0 19 * * 0' pareceria "domingo às 19h" e cairia
-- às 16h de Brasília.
-- ============================================================================

create extension if not exists pg_cron;

-- ----------------------------------------------------------------------------
-- Idempotência dos lembretes
-- ----------------------------------------------------------------------------

/*
  Rodar a tarefa duas vezes tem que ser inócuo — e não por um `if not exists`
  dentro da função, que não protege contra duas execuções simultâneas nem contra
  alguém disparando na mão para testar. O índice é a garantia real, e as
  inserções usam `on conflict do nothing`.

  `chave` é a data do domingo, para o lembrete de filmes, e `<roteiro>:<dias>`
  para a viagem que se aproxima — o aviso de 7 dias e o de 1 dia são eventos
  diferentes sobre o mesmo roteiro.
*/
create unique index notificacao_lembrete_unico_idx
  on public.notificacao (user_id, tipo, (dados ->> 'chave'))
  where tipo in ('lembrete_filmes', 'viagem_perto');

-- ----------------------------------------------------------------------------
-- Domingo de filmes
-- ----------------------------------------------------------------------------

/*
  "Viu algo essa semana? Joga no APPingos."

  UM POR PESSOA, e não um por espaço de que ela participa. O lembrete não é sobre
  um espaço — é sobre o hábito de registrar — e quem está em dois espaços
  receberia dois e-mails idênticos no mesmo domingo. Daí `space_id` nulo, que é a
  forma de dizer "notificação da conta".

  Só alcança quem já usou o módulo (`exists ... entry`): lembrar de alimentar uma
  lista que a pessoa nunca começou é a definição de aviso ignorado.

  Sem `notificar()`: aqui não há ator — ninguém causou este evento —, e o motor
  recusa ator nulo justamente para que uma ausência dessas seja deliberada e
  visível, como é aqui, e não um esquecimento num gatilho.
*/
create function public.lembrete_semanal_filmes()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total int;
begin
  insert into public.notificacao (user_id, space_id, tipo, dados, rota)
  select distinct
    m.user_id,
    null,
    'lembrete_filmes',
    jsonb_build_object('chave', to_char(current_date, 'YYYY-MM-DD')),
    '/filmes'
  from public.membership m
  where exists (select 1 from public.entry e where e.space_id = m.space_id)
    and not exists (
      select 1 from public.notificacao_preferencia p
      where p.user_id = m.user_id and p.tipo = 'lembrete_filmes' and not p.ativo
    )
  on conflict do nothing;

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

-- ----------------------------------------------------------------------------
-- A viagem que se aproxima
-- ----------------------------------------------------------------------------

/*
  Duas antecedências: uma semana antes (dá tempo de resolver o que falta) e um
  dia antes (a hora de conferir a lista). Roteiro SECRETO não entra — o `join` é
  em `visibilidade = 'compartilhado'`, e sem ele este seria o caminho mais bobo
  de estragar a surpresa: um e-mail com o nome do roteiro no assunto.

  Diferente dos gatilhos, aqui TODO MUNDO do espaço recebe, inclusive quem criou
  o roteiro. O evento não é "alguém fez algo", é "a data chegou" — e ela chega
  para os dois.
*/
create function public.avisar_viagens_proximas()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total int;
begin
  insert into public.notificacao (user_id, space_id, tipo, dados, entidade, entidade_id, rota)
  select
    m.user_id,
    r.space_id,
    'viagem_perto',
    jsonb_build_object(
      'chave',       r.id::text || ':' || (r.data_inicio - current_date)::text,
      'nome',        r.nome,
      'data_inicio', r.data_inicio,
      'dias',        (r.data_inicio - current_date)
    ),
    'roteiro',
    r.id,
    '/viagens/' || r.id
  from public.roteiro r
  join public.membership m on m.space_id = r.space_id
  where r.visibilidade = 'compartilhado'
    and r.data_inicio in (current_date + 7, current_date + 1)
    and not exists (
      select 1 from public.notificacao_preferencia p
      where p.user_id = m.user_id and p.tipo = 'viagem_perto' and not p.ativo
    )
  on conflict do nothing;

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

-- ----------------------------------------------------------------------------
-- Faxina
-- ----------------------------------------------------------------------------

/*
  Sem isto a tabela cresce para sempre, e ninguém rola até uma notificação de
  três meses atrás. Só o que já foi LIDO é apagado: uma não lida de 100 dias é
  um aviso que nunca chegou a ninguém, e apagá-la seria esconder a falha.

  A fila enviada some junto — ela é registro de entrega, não histórico. O que
  falhou fica, porque é a única pista de que alguém não está recebendo.
*/
create function public.faxina_notificacoes()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total int;
begin
  delete from public.notificacao
  where lida_em is not null
    and lida_em < now() - interval '90 days';

  get diagnostics v_total = row_count;

  delete from public.notificacao_email_fila
  where estado = 'enviado'
    and enviado_em < now() - interval '90 days';

  return v_total;
end;
$$;

-- ----------------------------------------------------------------------------
-- As tarefas
-- ----------------------------------------------------------------------------

-- 19h de domingo em Brasília.
select cron.schedule(
  'appingos-lembrete-filmes',
  '0 22 * * 0',
  $$select public.lembrete_semanal_filmes()$$
);

-- 9h de Brasília, todo dia.
select cron.schedule(
  'appingos-viagens-proximas',
  '0 12 * * *',
  $$select public.avisar_viagens_proximas()$$
);

/*
  A rede de segurança do e-mail. O caminho normal é o gatilho acordar a Edge
  Function no mesmo instante; isto aqui existe para o que escapa dele: o POST que
  não completou, o envio que voltou erro e ainda tem tentativa sobrando, e a fila
  que encheu antes de os segredos do Vault existirem.
*/
select cron.schedule(
  'appingos-fila-de-email',
  '*/5 * * * *',
  $$select public.acordar_envio_de_email()$$
);

-- Dia 1º, 2h de Brasília — a hora mais morta do mês.
select cron.schedule(
  'appingos-faxina-notificacoes',
  '0 5 1 * *',
  $$select public.faxina_notificacoes()$$
);

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

revoke all on function public.lembrete_semanal_filmes()  from public, anon, authenticated;
revoke all on function public.avisar_viagens_proximas()  from public, anon, authenticated;
revoke all on function public.faxina_notificacoes()      from public, anon, authenticated;
