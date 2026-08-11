-- ============================================================================
-- APPingos — Notificações por e-mail: a fila e o disparo.
--
-- POR QUE E-MAIL, E NÃO PUSH PRIMEIRO. O push web é bom no Android e capenga no
-- iOS: só funciona com o app instalado na tela de início, e ainda assim com mais
-- restrições. Construir push antes de e-mail seria fazer a feature nascer boa
-- para metade do casal. O e-mail chega igual nos dois celulares, no navegador e
-- no desktop, não depende de service worker, não expira, e não precisa de
-- permissão do sistema operacional. O push continua no plano — e vai entrar em
-- cima deste mesmo motor, sem refazer nada disto.
--
-- O CAMINHO, EM QUATRO PASSOS:
--
--   notificar()  ->  linha em `notificacao`
--        trigger ->  linha em `notificacao_email_fila`  (se a pessoa optou)
--        trigger ->  net.http_post acorda a Edge Function  (uma vez por statement)
--   Edge Function -> drena a fila, chama o Resend, marca enviado/erro
--
-- A FILA É O PONTO. Sem ela, o envio seria uma chamada HTTP presa à transação
-- de quem lançou o gasto: a menor instabilidade do provedor viraria erro na cara
-- de quem estava só salvando uma compra, ou um aviso perdido em silêncio. Com
-- ela, gravar é local e barato, o envio é assíncrono e retentável, e o que
-- falhou fica visível numa tabela em vez de num log que ninguém lê.
-- ============================================================================

/*
  pg_net faz a chamada HTTP de dentro do banco, DEPOIS do commit — é o que
  permite acordar a função sem prender a transação. Ele cria o schema `net`.
*/
create extension if not exists pg_net;

-- ----------------------------------------------------------------------------
-- A fila
-- ----------------------------------------------------------------------------

/*
  `unique (notificacao_id)` é a garantia de "no máximo um e-mail por
  notificação". Ela vale mais do que parece: o disparo é um POST que pode ser
  repetido (retry do pg_net, cron de reprocessamento, alguém chamando a função
  na mão), e sem esta restrição um único gasto poderia render três e-mails.

  `destinatario` é gravado aqui, e não resolvido na hora do envio, porque é o
  endereço que valia no momento do evento. Trocar o e-mail nas preferências não
  deve redirecionar o que já estava na fila para o endereço novo.

  `estado = 'erro'` não é o fim: o cron reprocessa enquanto `tentativas < 5`. O
  teto existe para um endereço inválido não ficar batendo no Resend para sempre.
*/
create table public.notificacao_email_fila (
  id              uuid primary key default gen_random_uuid(),
  notificacao_id  uuid not null unique references public.notificacao (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  destinatario    text not null,
  estado          text not null default 'pendente'
                    check (estado in ('pendente', 'enviado', 'erro')),
  tentativas      int not null default 0,
  erro            text,
  criado_em       timestamptz not null default now(),
  enviado_em      timestamptz
);

-- O que a Edge Function busca a cada acordada: o que ainda não saiu, mais antigo
-- primeiro. Índice parcial porque a fila drenada é quase toda 'enviado'.
create index notificacao_email_fila_pendente_idx
  on public.notificacao_email_fila (criado_em)
  where estado <> 'enviado';

alter table public.notificacao_email_fila enable row level security;

-- Leitura da própria fila, para a tela de preferências poder dizer "o último
-- e-mail falhou" em vez de deixar a pessoa achando que o app parou de avisar.
-- Escrita nenhuma: quem grava é o gatilho; quem atualiza é a Edge Function, com
-- a service role.
create policy notificacao_email_fila_select on public.notificacao_email_fila
  for select to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Da notificação para a fila
-- ----------------------------------------------------------------------------

/*
  AFTER INSERT, e não AFTER INSERT OR UPDATE: a notificação AGRUPADA é um update
  ("2 alterações" vira "3"), e mandar um e-mail a cada incremento desfaria
  justamente o que o agrupamento existe para evitar. Quem corrige o mesmo gasto
  três vezes em dois minutos gera um e-mail, não três — e quem abrir o app vê o
  texto já atualizado.

  A cadeia de condições é toda de opt-in: sem linha em `notificacao_email`, sem
  e-mail. Sem `ativo`, sem e-mail. Com a preferência daquele tipo desligada, sem
  e-mail. Sem endereço nenhum resolvido, sem e-mail.
*/
create function public.enfileirar_email_notificacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_destinatario text;
begin
  select coalesce(e.endereco, u.email) into v_destinatario
  from public.notificacao_email e
  join auth.users u on u.id = e.user_id
  where e.user_id = new.user_id
    and e.ativo;

  if v_destinatario is null then
    return null;
  end if;

  if exists (
    select 1 from public.notificacao_preferencia p
    where p.user_id = new.user_id and p.tipo = new.tipo and not p.email
  ) then
    return null;
  end if;

  insert into public.notificacao_email_fila (notificacao_id, user_id, destinatario)
  values (new.id, new.user_id, v_destinatario)
  on conflict (notificacao_id) do nothing;

  return null;
end;
$$;

create trigger notificacao_enfileirar_email
  after insert on public.notificacao
  for each row execute function public.enfileirar_email_notificacao();

-- ----------------------------------------------------------------------------
-- O disparo
-- ----------------------------------------------------------------------------

/*
  A URL da função e a chave que a autentica moram no Vault, não no arquivo de
  migration: uma é o endereço do projeto e a outra é a service role key, e
  migration é texto versionado no git. Rode UMA VEZ, no SQL editor do projeto
  (os valores estão em Project Settings > API):

    select vault.create_secret(
      'https://SEU-PROJETO.supabase.co/functions/v1/enviar-emails',
      'notificacao_email_url'
    );
    select vault.create_secret('SUA-SERVICE-ROLE-KEY', 'notificacao_email_token');

  Enquanto os segredos não existirem, a fila enche e nada sai — que é o
  comportamento certo para um projeto recém-clonado, e é reversível: o cron de
  reprocessamento manda o que estava parado assim que os segredos aparecerem.
*/
create function public.acordar_envio_de_email()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url   text;
  v_token text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'notificacao_email_url';

  select decrypted_secret into v_token
  from vault.decrypted_secrets where name = 'notificacao_email_token';

  if v_url is null or v_token is null then
    return;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_token
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
exception
  /*
    Isto roda dentro da transação de quem lançou o gasto. Se o Vault mudar de
    forma, se o pg_net for desabilitado, se a extensão sumir num restore — nada
    disso pode impedir a compra de ser gravada. O aviso fica na fila e sai no
    próximo ciclo do cron.
  */
  when others then
    raise warning 'não consegui acordar o envio de e-mail: %', sqlerrm;
end;
$$;

/*
  FOR EACH STATEMENT, não FOR EACH ROW. Uma RPC que gera notificação para os
  dois membros insere duas linhas na fila; o que a Edge Function precisa saber é
  "há trabalho", uma vez, e não uma vez por linha. Ela drena a fila inteira de
  qualquer jeito.
*/
create function public.disparar_fila_de_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.acordar_envio_de_email();
  return null;
end;
$$;

create trigger notificacao_email_fila_disparar
  after insert on public.notificacao_email_fila
  for each statement execute function public.disparar_fila_de_email();

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

revoke all on function public.enfileirar_email_notificacao() from public, anon, authenticated;
revoke all on function public.disparar_fila_de_email()       from public, anon, authenticated;
revoke all on function public.acordar_envio_de_email()       from public, anon, authenticated;
