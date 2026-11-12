-- ============================================================================
-- APPingos — Open Finance (Pluggy): a sincronização diária.
--
-- O `pg_cron` acorda a Edge Function `sincronizar-pluggy` uma vez por dia — o
-- MeuPluggy só atualiza diariamente, e chamar mais que isso é desperdício
-- (docs/notion-plano-open-finance.md, "a sincronização mora numa Edge Function").
-- Mesmo desenho de `acordar_envio_de_email` (20260811230545_notificacoes_email.sql):
-- o endereço da função e a chave que o banco usa para chamá-la ficam no Vault,
-- fora das migrations, porque migration é texto versionado no git.
--
-- Sem os segredos do Vault, a tarefa roda e não faz nada. Nenhum erro, nenhum
-- aviso: a integração é opcional, e o app funciona inteiro sem ela.
-- ============================================================================

create extension if not exists pg_net;

create function public.acordar_sincronizacao_pluggy()
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
  from vault.decrypted_secrets where name = 'pluggy_sincronizar_url';

  select decrypted_secret into v_token
  from vault.decrypted_secrets where name = 'pluggy_sincronizar_token';

  if v_url is null or v_token is null then
    return;
  end if;

  /*
    Timeout curto de propósito: a função sincroniza todas as conexões e pode
    passar de 5 s; quem espera a resposta é o `pg_net`, e ninguém lê o
    resultado. O trabalho continua do lado da função depois do timeout.
  */
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
  when others then
    raise warning 'não consegui acordar a sincronização da Pluggy: %', sqlerrm;
end;
$$;

revoke all on function public.acordar_sincronizacao_pluggy() from public, anon, authenticated;

/*
  `cron.schedule` RODA EM UTC: '0 10 * * *' é 7h de Brasília.

  O horário certo é DEPOIS da atualização diária do MeuPluggy, e ele só se
  descobre com dado real (o plano deixa isso em aberto). 7h é o chute: cedo o
  bastante para a caixa de entrada estar pronta no café da manhã. Trocar é um
  `cron.alter_job`, sem mexer em mais nada.
*/
select cron.schedule(
  'appingos-sincronizar-pluggy',
  '0 10 * * *',
  $$select public.acordar_sincronizacao_pluggy()$$
);
