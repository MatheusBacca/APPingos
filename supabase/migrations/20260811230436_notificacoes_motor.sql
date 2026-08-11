-- ============================================================================
-- APPingos — Notificações: o motor.
--
-- Até aqui cada módulo inventou o seu remendo para a mesma pergunta — "o que
-- aconteceu desde a última vez que eu olhei?". São quatro mecanismos diferentes
-- (space_deletion_notice, convite_filme, roteiro_visto, segredos_do_espaco), e
-- nenhum deles alcança quem está com o app fechado. Este arquivo é o canal
-- único: um lugar por onde todo evento passa, e de onde saem tanto a caixa
-- in-app quanto o e-mail.
--
-- Três decisões sustentam o motor:
--
--   1. UMA LINHA POR DESTINATÁRIO, e não um evento do espaço com uma tabela de
--      leitura ao lado. A notificação nasce já recortada por pessoa, então o
--      roteiro-surpresa simplesmente não gera linha para quem não pode saber
--      dele — em vez de existir uma linha com o nome dele que alguém precisa
--      lembrar de filtrar na leitura. Filtro na leitura é exatamente o que a
--      migration do alerta de spoiler recusou fazer.
--   2. AS NOTIFICAÇÕES NASCEM NO BANCO, em triggers, não no client. Vale para
--      mudança vinda da tela, de uma RPC ou de um SQL na mão, e nenhum módulo
--      novo pode esquecer de notificar.
--   3. O TEXTO É RENDERIZADO FORA DAQUI. A linha guarda `tipo` + `dados jsonb`;
--      quem monta a frase é `supabase/functions/_shared/notificacoes.ts`, o
--      mesmo módulo para a tela e para o e-mail. Mudar a copy não pode exigir
--      migration — e principalmente: o agrupamento REESCREVE o conteúdo depois
--      de gravado ("2 alterações" vira "3"), o que com texto pronto significaria
--      reescrever string em SQL.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A caixa
-- ----------------------------------------------------------------------------

/*
  `dados` é SNAPSHOT do que a tela mostra, não só ids: o gasto pode ser apagado
  e a notificação tem que continuar legível. Mesmo motivo do `space_nome` em
  `space_deletion_notice`.

  `space_id` nulo = notificação da conta, não de um espaço. Nenhum tipo de hoje
  é assim, mas o cascade do espaço excluído distingue os dois casos, e é melhor
  a coluna já nascer sabendo disso do que descobrir depois com dado gravado.
*/
create table public.notificacao (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  space_id     uuid references public.space (id) on delete cascade,
  tipo         text not null,
  dados        jsonb not null default '{}'::jsonb,
  ator_id      uuid references auth.users (id) on delete set null,
  entidade     text,        -- 'compra' | 'roteiro' | 'entry' | 'acerto_mes'
  entidade_id  uuid,
  rota         text,        -- para onde o toque leva
  created_at   timestamptz not null default now(),
  lida_em      timestamptz
);

-- A caixa (lista por data), o contador de não-lidas e a busca do agrupamento.
create index notificacao_caixa_idx    on public.notificacao (user_id, created_at desc);
create index notificacao_pendente_idx on public.notificacao (user_id) where lida_em is null;
create index notificacao_agrupar_idx  on public.notificacao (user_id, tipo, entidade_id)
                                      where lida_em is null;

-- ----------------------------------------------------------------------------
-- Preferências
-- ----------------------------------------------------------------------------

/*
  Ausência de linha é "ligado" — para a CAIXA. Um usuário novo já nasce com tudo
  ligado sem trigger de seed, e a tela só grava quando alguém desliga.

  `email` é a mesma ideia por tipo, mas ele NÃO manda sozinho: o interruptor
  mestre é `notificacao_email.ativo` abaixo, e ele nasce desligado. A assimetria
  é deliberada. Uma linha na caixa do próprio app é coisa de quem já entrou;
  mandar e-mail para alguém é sair do app e chegar na caixa de entrada dela, e
  isso se faz com consentimento explícito, não com um default herdado.

  Na tela os ~11 tipos aparecem em 5 interruptores (Orçamentos, Viagens, Filmes,
  Edições, Lembretes) — a tabela é por tipo para o dia em que uma categoria
  precisar ser partida ao meio.
*/
create table public.notificacao_preferencia (
  user_id  uuid not null references auth.users (id) on delete cascade,
  tipo     text not null,
  ativo    boolean not null default true,
  email    boolean not null default true,
  primary key (user_id, tipo)
);

/*
  O consentimento de e-mail, e nada mais.

  `endereco` nulo = o e-mail da conta. A coluna existe porque o e-mail de login
  não é necessariamente o que a pessoa lê no celular, e trocar o login por causa
  disso seria caro demais para um aviso de gasto novo.

  `token` é o descadastro sem login: o link no rodapé de todo e-mail precisa
  funcionar para quem abriu no celular sem sessão aberta — inclusive porque
  "não consigo descadastrar" é o caminho mais curto entre um aviso e o botão de
  spam. Ele é aleatório e único, e é a única credencial daquele caminho.
*/
create table public.notificacao_email (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  endereco      text check (endereco is null or endereco like '%_@_%'),
  ativo         boolean not null default false,
  token         text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- RLS
--
-- Em nenhuma das três há policy de INSERT: quem grava é `notificar()` rodando
-- como owner (e, no caso do e-mail, as RPCs no fim do arquivo). Assim ninguém
-- fabrica notificação pela API — exatamente como em `space_deletion_notice`.
-- ----------------------------------------------------------------------------

alter table public.notificacao             enable row level security;
alter table public.notificacao_preferencia enable row level security;
alter table public.notificacao_email       enable row level security;

-- A caixa é da pessoa. Sem função de autorização, sem risco de recursão: a
-- notificação já nasceu recortada, então `user_id = auth.uid()` é a regra
-- inteira.
create policy notificacao_select on public.notificacao
  for select to authenticated
  using (user_id = auth.uid());

-- Só para marcar `lida_em`. O WITH CHECK repete a condição porque sem ele daria
-- para "marcar como lida" mudando o dono da linha.
create policy notificacao_update on public.notificacao
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notificacao_delete on public.notificacao
  for delete to authenticated
  using (user_id = auth.uid());

-- Preferência é escrita direto pelo PostgREST (upsert da tela) — é dado da
-- própria pessoa sobre si mesma, e uma RPC aqui só repetiria a policy.
create policy notificacao_preferencia_tudo on public.notificacao_preferencia
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

/*
  Leitura da própria linha, e nada de escrita: `token` é credencial de
  descadastro, e um UPDATE livre deixaria qualquer cliente reescrevê-lo (ou
  apontar o `endereco` para outra pessoa e usar o app como remetente). Quem
  escreve é `definir_email_notificacoes()`.
*/
create policy notificacao_email_select on public.notificacao_email
  for select to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Como o app chama uma pessoa
--
-- Espelha `nomeDeExibicao` do client (app/types/database.types.ts): o apelido
-- quando existe, o nome de cadastro quando não. Vive aqui porque `dados` é
-- snapshot — o nome vai gravado na notificação, e não resolvido na leitura.
-- ----------------------------------------------------------------------------

create function public.nome_para_notificacao(p_user uuid)
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(nullif(btrim(p.apelido), ''), p.nome, 'Alguém')
  from public.profile p
  where p.id = p_user;
$$;

-- ----------------------------------------------------------------------------
-- O motor: notificar()
--
-- Uma função só, chamada por todos os gatilhos. É onde moram as três regras que
-- nenhum módulo pode esquecer: não notificar quem causou o evento, respeitar a
-- preferência, e agrupar o que se repete.
-- ----------------------------------------------------------------------------

/*
  Sobre `p_ator` ser obrigatório, e isto ser uma exceção e não um `coalesce`:

  `auth.uid()` é NULO fora do PostgREST — numa escrita vinda do pg_cron, do SQL
  editor ou de outra SECURITY DEFINER. Com ator nulo, "todos menos o ator" vira
  "todos", e a pessoa recebe notificação da própria ação. Esse é o modo de errar
  silencioso da feature inteira: ninguém abre um chamado dizendo "recebi um
  aviso a mais", só sente que o app é barulhento. Então ele estoura, e cada
  gatilho é obrigado a dizer de quem foi a ação — daí os `coalesce(auth.uid(),
  new.registrado_por, ...)` do arquivo de gatilhos.

  `p_janela` não-nulo agrupa: procura uma notificação NÃO LIDA do mesmo
  (user_id, tipo, entidade_id) dentro da janela e incrementa `vezes` em vez de
  inserir. Corrigir três vezes o mesmo gasto em dois minutos é uma edição, não
  três — e "3 alterações em Mercado" é o que a pessoa quer ler.
*/
create function public.notificar(
  p_space        uuid,
  p_tipo         text,
  p_ator         uuid,
  p_dados        jsonb default '{}'::jsonb,
  p_entidade     text     default null,
  p_entidade_id  uuid     default null,
  p_rota         text     default null,
  p_janela       interval default null
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dados     jsonb;
  v_destino   uuid;
  v_existente uuid;
  v_total     int := 0;
begin
  if p_ator is null then
    raise exception 'notificar(%): ator nulo — sem ele o aviso iria para quem causou o evento', p_tipo;
  end if;

  -- Quem agiu e onde entram sempre, para o texto não depender de join na leitura.
  v_dados := coalesce(p_dados, '{}'::jsonb) || jsonb_build_object(
    'ator_nome',  public.nome_para_notificacao(p_ator),
    'space_nome', (select s.nome from public.space s where s.id = p_space)
  );

  for v_destino in
    select m.user_id
    from public.membership m
    where m.space_id = p_space
      and m.user_id <> p_ator
  loop
    if exists (
      select 1 from public.notificacao_preferencia p
      where p.user_id = v_destino and p.tipo = p_tipo and not p.ativo
    ) then
      continue;
    end if;

    v_existente := null;

    if p_janela is not null then
      select n.id into v_existente
      from public.notificacao n
      where n.user_id = v_destino
        and n.tipo = p_tipo
        and n.entidade_id is not distinct from p_entidade_id
        and n.lida_em is null
        and n.created_at > now() - p_janela
      order by n.created_at desc
      limit 1;
    end if;

    if v_existente is not null then
      -- O `created_at` sobe junto: a notificação agrupada é sobre a mexida mais
      -- recente, e continuar no fundo da lista com a data da primeira faria a
      -- caixa mentir sobre quando aquilo aconteceu.
      update public.notificacao
         set dados = dados || v_dados
                     || jsonb_build_object('vezes', coalesce((dados ->> 'vezes')::int, 1) + 1),
             created_at = now()
       where id = v_existente;
    else
      insert into public.notificacao (
        user_id, space_id, tipo, dados, ator_id, entidade, entidade_id, rota
      )
      values (
        v_destino, p_space, p_tipo, v_dados, p_ator, p_entidade, p_entidade_id, p_rota
      );
    end if;

    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;

/*
  A irmã pequena, para o evento dirigido a UMA pessoa — hoje só
  `marcado_assistiu`, que é sobre você e não sobre o espaço.

  Existe separada em vez de virar um parâmetro "destinatário único" em
  `notificar()`, que 90% das chamadas passariam como nulo. As duas regras que
  importam (não notificar o ator, respeitar a preferência) estão repetidas aqui
  de propósito: são cinco linhas, e escondê-las atrás de mais um `if` na função
  grande sairia mais caro de ler.
*/
create function public.notificar_pessoa(
  p_user         uuid,
  p_space        uuid,
  p_tipo         text,
  p_ator         uuid,
  p_dados        jsonb default '{}'::jsonb,
  p_entidade     text default null,
  p_entidade_id  uuid default null,
  p_rota         text default null
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dados jsonb;
begin
  if p_ator is null then
    raise exception 'notificar_pessoa(%): ator nulo', p_tipo;
  end if;

  if p_user is null or p_user = p_ator then
    return 0;
  end if;

  if exists (
    select 1 from public.notificacao_preferencia p
    where p.user_id = p_user and p.tipo = p_tipo and not p.ativo
  ) then
    return 0;
  end if;

  v_dados := coalesce(p_dados, '{}'::jsonb) || jsonb_build_object(
    'ator_nome',  public.nome_para_notificacao(p_ator),
    'space_nome', (select s.nome from public.space s where s.id = p_space)
  );

  insert into public.notificacao (
    user_id, space_id, tipo, dados, ator_id, entidade, entidade_id, rota
  )
  values (p_user, p_space, p_tipo, v_dados, p_ator, p_entidade, p_entidade_id, p_rota);

  return 1;
end;
$$;

-- ----------------------------------------------------------------------------
-- Ler a caixa
-- ----------------------------------------------------------------------------

/*
  "Marcar todas como lidas" numa chamada só. Um UPDATE direto pelo PostgREST
  também passaria pela policy, mas exigiria mandar a lista de ids — e a lista
  que o client tem é a página que ele carregou, não a caixa inteira.
*/
create function public.marcar_notificacoes_lidas(p_ids uuid[] default null)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_total int;
begin
  update public.notificacao
     set lida_em = now()
   where user_id = auth.uid()
     and lida_em is null
     and (p_ids is null or id = any (p_ids));

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

-- ----------------------------------------------------------------------------
-- Ligar e desligar o e-mail
-- ----------------------------------------------------------------------------

/*
  O interruptor mestre. RPC e não UPDATE porque a linha carrega o `token` de
  descadastro: com policy de escrita, qualquer cliente poderia reescrevê-lo — ou
  apontar `endereco` para o e-mail de outra pessoa e usar o app como remetente.
  Aqui a linha é sempre a de quem chama, e o token é gerado pelo default e nunca
  aceito de fora.
*/
create function public.definir_email_notificacoes(
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

  insert into public.notificacao_email (user_id, ativo, endereco)
  values (auth.uid(), coalesce(p_ativo, false), v_endereco)
  on conflict (user_id) do update
    set ativo         = excluded.ativo,
        endereco      = excluded.endereco,
        atualizado_em = now();
end;
$$;

/*
  O descadastro do rodapé do e-mail, sem login.

  `to anon` de propósito: quem clica está na caixa de entrada, possivelmente no
  celular, possivelmente sem sessão. Exigir login aqui é o que faz gente marcar
  como spam em vez de descadastrar. O token é a credencial, e ele não é
  adivinhável (24 bytes aleatórios); a função só sabe desligar — não lê, não
  lista, não devolve e-mail nenhum, e responde igual para token inválido para
  não virar oráculo de "este token existe".
*/
create function public.descadastrar_email(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notificacao_email
     set ativo = false, atualizado_em = now()
   where token = btrim(p_token);
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

-- O motor não é chamável pela API: quem chama são os gatilhos, rodando dentro
-- da transação de quem escreveu. Sem isto, dava para fabricar notificação com
-- qualquer texto no `dados` — inclusive em nome de outra pessoa.
revoke all on function public.notificar(uuid, text, uuid, jsonb, text, uuid, text, interval)
  from public, anon, authenticated;
revoke all on function public.notificar_pessoa(uuid, uuid, text, uuid, jsonb, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.nome_para_notificacao(uuid) from public, anon, authenticated;

grant execute on function public.marcar_notificacoes_lidas(uuid[])        to authenticated;
grant execute on function public.definir_email_notificacoes(boolean, text) to authenticated;
grant execute on function public.descadastrar_email(text)                  to anon, authenticated;
