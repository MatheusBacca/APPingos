-- ============================================================================
-- APPingos — O canal de e-mail sabe dizer que está fora do ar.
--
-- A caixa in-app está pronta e funciona; o envio depende de credenciais que são
-- passo manual (senha de app do Gmail, segredos do Vault). Entre "segurar a
-- feature até tudo existir" e "mostrar um interruptor que não entrega", nenhuma
-- das duas serve: a primeira adia valor pronto, e a segunda é o app mentindo.
--
-- Então o app passa a SABER. Esta migration dá a ele o sinal: um registro de
-- saúde que a própria Edge Function mantém, e uma função que a tela consulta
-- para decidir entre oferecer o e-mail e explicar por que ainda não pode.
--
-- A recusa no servidor é a parte que importa. Sem ela, ligar o e-mail com o
-- canal fora do ar encheria a fila de avisos que sairiam TODOS de uma vez no
-- minuto em que a configuração aparecesse — e quarenta e-mails às sete da manhã
-- é pior do que não ter avisado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- O sinal de vida
-- ----------------------------------------------------------------------------

/*
  Uma linha só, sempre a mesma: `id boolean primary key check (id)` só aceita
  `true`, então a tabela não tem como ganhar uma segunda linha e virar "qual
  delas é a verdadeira?". É mais barato que uma constraint de unicidade sobre
  constante, e diz a intenção no tipo.

  Quem escreve é a Edge Function, a cada acordada — inclusive quando a fila está
  vazia. É o que faz `verificado_em` valer como sinal de vida: com o cron de 5
  minutos batendo na função, uma marca velha significa que o carteiro não está
  sendo alcançado, e isso é exatamente o que a tela precisa saber.
*/
create table public.notificacao_email_saude (
  id             boolean primary key default true check (id),
  ok             boolean not null default false,
  motivo         text,
  verificado_em  timestamptz not null default now()
);

insert into public.notificacao_email_saude (id, ok, motivo)
values (true, false, 'ainda não verificado');

alter table public.notificacao_email_saude enable row level security;

-- Estado do sistema, não dado de ninguém: qualquer pessoa logada lê. Escrita
-- nenhuma — quem grava é a função, com a service role.
create policy notificacao_email_saude_select on public.notificacao_email_saude
  for select to authenticated
  using (true);

-- ----------------------------------------------------------------------------
-- A pergunta que a tela faz
-- ----------------------------------------------------------------------------

/*
  Dá para prometer e-mail agora?

  São DUAS camadas, e as duas precisam estar de pé:
    1. o banco sabe chamar a função (os segredos do Vault existem);
    2. a função tem o que precisa para entregar (ela mesma diz, na tabela acima).

  Uma sozinha não basta, e é fácil ficar só com a primeira: dá para cadastrar a
  URL e o token no Vault hoje e a senha de app do Gmail só semana que vem. Nesse
  intervalo o banco chamaria a função, ela responderia "faltam segredos", e uma
  tela que olhasse só o Vault estaria oferecendo um canal morto.

  A checagem do Vault é de EXISTÊNCIA, em `vault.secrets` e não em
  `vault.decrypted_secrets`: nada é decifrado, e esta função — que é chamável por
  qualquer pessoa logada — não tem como devolver segredo nenhum nem por acidente.

  A janela de 20 minutos é quatro vezes o intervalo do cron: tolera uma execução
  perdida sem declarar o canal morto por causa de um soluço.
*/
create function public.status_do_email()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_vault  boolean;
  v_saude  public.notificacao_email_saude;
  v_fresco boolean;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  select
    exists (select 1 from vault.secrets s where s.name = 'notificacao_email_url')
    and exists (select 1 from vault.secrets s where s.name = 'notificacao_email_token')
  into v_vault;

  select * into v_saude from public.notificacao_email_saude where id;

  v_fresco := v_saude.verificado_em > now() - interval '20 minutes';

  return jsonb_build_object(
    'disponivel', v_vault and v_saude.ok and v_fresco,
    'motivo', case
      when not v_vault then 'o banco ainda não sabe chamar o serviço de envio'
      when not v_fresco then 'o serviço de envio não responde desde ' || to_char(v_saude.verificado_em, 'DD/MM HH24:MI')
      when not v_saude.ok then v_saude.motivo
    end,
    -- A fila é por pessoa: o que interessa a quem está olhando a tela é o que
    -- não chegou PARA ELA. E só conta como travado depois de 10 minutos — antes
    -- disso, "pendente" é o funcionamento normal de uma fila.
    'pendentes', (
      select count(*) from public.notificacao_email_fila f
      where f.user_id = auth.uid() and f.estado = 'pendente'
        and f.criado_em < now() - interval '10 minutes'
    ),
    'falhas', (
      select count(*) from public.notificacao_email_fila f
      where f.user_id = auth.uid() and f.estado = 'erro'
    )
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- A recusa que sustenta a promessa da tela
-- ----------------------------------------------------------------------------

/*
  Desabilitar o botão na interface não é garantia de nada — a RPC é pública para
  quem está logado, e o estado que a tela viu pode ter envelhecido. A regra vive
  aqui.

  Desligar continua sempre permitido, aconteça o que acontecer com o canal:
  nenhuma indisponibilidade pode prender alguém recebendo e-mail.
*/
create or replace function public.definir_email_notificacoes(
  p_ativo    boolean,
  p_endereco text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_endereco text := nullif(btrim(lower(p_endereco)), '');
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  if v_endereco is not null and v_endereco not like '%_@_%' then
    raise exception 'e-mail inválido: %', p_endereco;
  end if;

  if coalesce(p_ativo, false)
     and not (public.status_do_email() ->> 'disponivel')::boolean then
    raise exception 'o envio de e-mail ainda não está configurado neste ambiente';
  end if;

  insert into public.notificacao_email (user_id, ativo, endereco)
  values (auth.uid(), coalesce(p_ativo, false), v_endereco)
  on conflict (user_id) do update
    set ativo         = excluded.ativo,
        endereco      = excluded.endereco,
        atualizado_em = now();
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

grant execute on function public.status_do_email() to authenticated;
