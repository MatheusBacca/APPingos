-- ============================================================================
-- APPingos — Pins: os gatilhos.
--
-- Onde cada regra de `pin_regra` se pendura no que o app já faz. Nenhum deles
-- decide QUANTO vale nada — isso é `conceder_pins()` lendo a tabela. O gatilho
-- só sabe responder três coisas: aconteceu?, de quem foi?, e qual é a chave
-- idempotente.
--
-- Todos são AFTER: um Pin concedido antes de a linha existir seria um Pin sobre
-- um fato que a transação ainda pode desfazer.
--
-- E todos passam o ator explicitamente com `coalesce(auth.uid(), <coluna>)`,
-- pela mesma razão documentada no motor de notificações: `auth.uid()` é nulo
-- fora do PostgREST, e sem ator a notificação voltaria para quem causou o
-- evento.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Quando a data foi combinada
--
-- `rating.planejado_para` diz PARA QUANDO o filme está marcado, mas nada diz
-- QUANDO isso foi decidido — e a regra "marcou com um dia de antecedência e viu
-- na data" precisa exatamente dessa diferença. Sem esta coluna a regra não tem
-- como existir: marcar hoje para hoje e marcar semana passada para hoje são
-- linhas idênticas.
--
-- Ela também fecha a porta do retroativo. Escrever agora `planejado_para =
-- ontem` carimba `planejado_em = agora`, e a antecedência sai negativa.
-- ----------------------------------------------------------------------------

alter table public.rating add column planejado_em timestamptz;

create function public.carimbar_planejado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.planejado_para is null then
    new.planejado_em := null;
    return new;
  end if;

  /*
    O `tg_op` é testado num IF PRÓPRIO, e não junto do resto numa condição só.
    Num gatilho de INSERT o registro OLD não está atribuído, e `tg_op = 'INSERT'
    or old.planejado_para ...` é UMA expressão SQL — os dois lados podem ser
    avaliados, e o segundo estoura. É a mesma estrutura dos gatilhos de
    notificação, e pelo mesmo motivo.
  */
  if tg_op = 'INSERT' then
    new.planejado_em := now();
    return new;
  end if;

  if new.planejado_para is distinct from old.planejado_para then
    new.planejado_em := now();
  end if;

  return new;
end;
$$;

create trigger rating_carimbar_planejado
  before insert or update on public.rating
  for each row execute function public.carimbar_planejado_em();

revoke all on function public.carimbar_planejado_em() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Filmes & Séries
-- ----------------------------------------------------------------------------

/*
  Três regras num gatilho só, porque as três olham a mesma linha:

    - virou 'visto'                      -> filme_visto
    - virou 'visto' na data combinada    -> filme_combinado (linha própria no
                                            extrato, e não um bônus embutido:
                                            "por que este rendeu mais?" é
                                            justamente o que o extrato responde)
    - a avaliação foi enviada            -> avaliacao_enviada

  Os Pins vão para `new.user_id`, o DONO da avaliação — que nem sempre é quem
  escreveu. No espaço de casal um pode marcar que o outro assistiu (é o que a
  notificação `marcado_assistiu` avisa), e nesse caso a conquista é de quem viu
  o filme, não de quem digitou.
*/
create function public.conceder_pins_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space       uuid;
  v_titulo      text;
  v_tipo        text;
  v_dados       jsonb;
  v_virou_visto boolean;
  v_avaliou     boolean;
begin
  /*
    O que mudou é decidido AQUI, num ramo por `tg_op`, e não dentro das
    condições lá embaixo. Num gatilho de INSERT o registro OLD não está
    atribuído, e `tg_op = 'INSERT' or old.status ...` é uma expressão SQL só:
    os dois lados podem ser avaliados, e o segundo estoura. É a mesma estrutura
    dos gatilhos de notificação deste repo.
  */
  if tg_op = 'INSERT' then
    v_virou_visto := new.status = 'visto';
    v_avaliou     := new.enviado_em is not null;
  else
    v_virou_visto := new.status = 'visto' and old.status is distinct from 'visto';
    v_avaliou     := new.enviado_em is not null and old.enviado_em is null;
  end if;

  if not v_virou_visto and not v_avaliou then
    return new;
  end if;

  select e.space_id, mi.titulo, mi.tipo
    into v_space, v_titulo, v_tipo
  from public.entry e
  join public.media_item mi on mi.id = e.media_item_id
  where e.id = new.entry_id;

  if v_space is null then
    return new;
  end if;

  v_dados := jsonb_build_object('titulo', v_titulo, 'tipo_midia', v_tipo);

  -- Visto -----------------------------------------------------------------
  if v_virou_visto then
    perform public.conceder_pins(
      p_user        => new.user_id,
      p_space       => v_space,
      p_regra       => 'filme_visto',
      p_chave       => 'filme_visto:' || new.id::text,
      p_dados       => v_dados,
      p_entidade    => 'rating',
      p_entidade_id => new.id,
      p_rota        => '/filmes'
    );

    /*
      O combinado cumprido: marcado com um dia OU MAIS de antecedência, e visto
      exatamente na data marcada. Marcar hoje e assistir hoje ganha a base e
      nada mais — que é o pedido, ao pé da letra.

      `planejado_em` é comparado no fuso de Brasília: marcar às 22h de segunda
      para terça é um dia de antecedência para quem vive aqui, e seria zero se a
      conta fosse em UTC.
    */
    if new.planejado_para is not null
       and new.planejado_em is not null
       and new.visto_em = new.planejado_para
       and (new.planejado_para - (new.planejado_em at time zone 'America/Sao_Paulo')::date) >= 1
    then
      perform public.conceder_pins(
        p_user        => new.user_id,
        p_space       => v_space,
        p_regra       => 'filme_combinado',
        p_chave       => 'filme_combinado:' || new.id::text,
        p_dados       => v_dados || jsonb_build_object('planejado_para', new.planejado_para),
        p_entidade    => 'rating',
        p_entidade_id => new.id,
        p_rota        => '/filmes'
      );
    end if;
  end if;

  -- Avaliação enviada -----------------------------------------------------
  if v_avaliou then
    perform public.conceder_pins(
      p_user        => new.user_id,
      p_space       => v_space,
      p_regra       => 'avaliacao_enviada',
      p_chave       => 'avaliacao_enviada:' || new.id::text,
      p_dados       => v_dados || jsonb_build_object('nota', new.nota),
      p_entidade    => 'rating',
      p_entidade_id => new.id,
      p_rota        => '/filmes'
    );
  end if;

  return new;
end;
$$;

create trigger rating_conceder_pins
  after insert or update on public.rating
  for each row execute function public.conceder_pins_rating();

-- ----------------------------------------------------------------------------
-- Orçamentos
-- ----------------------------------------------------------------------------

/*
  Lançar o gasto rende — o VALOR dele, não (decisão 4 do motor). O único tempero
  é o `calor_da_hora`: comprou hoje e lançou hoje. Ele chega como hotspot de
  contexto porque depende da `data_compra` desta linha, que a função de hotspots
  não teria como conhecer sem receber a compra inteira.
*/
create function public.conceder_pins_compra()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_extra text[] := '{}';
begin
  if new.data_compra = (now() at time zone 'America/Sao_Paulo')::date then
    v_extra := array['calor_da_hora'];
  end if;

  perform public.conceder_pins(
    p_user           => coalesce(auth.uid(), new.registrado_por),
    p_space          => new.space_id,
    p_regra          => 'gasto_novo',
    p_chave          => 'gasto_novo:' || new.id::text,
    p_dados          => jsonb_build_object('descricao', new.descricao),
    p_entidade       => 'compra',
    p_entidade_id    => new.id,
    p_rota           => '/orcamentos',
    p_hotspots_extra => v_extra
  );

  return new;
end;
$$;

create trigger compra_conceder_pins
  after insert on public.compra
  for each row execute function public.conceder_pins_compra();

/*
  Fechar o mês, e a única regra que compara dois meses.

  Duas defesas contra o incentivo perverso, e elas são o coração da regra:

    1. PISO DE LANÇAMENTOS. O jeito mais fácil de "gastar menos que o mês
       passado" é não registrar o gasto — exatamente o que o módulo de
       Orçamentos existe para combater. Abaixo de cinco compras no mês, a regra
       nem é avaliada.
    2. MÊS ANTERIOR COM MOVIMENTO. Sem isso, o primeiro mês de um espaço novo
       (total anterior = 0) cairia direto na melhor faixa, porque qualquer
       número é "menor ou igual" a nada — e a divisão nem existiria.

  A faixa é UMA só, a melhor que couber. `mes_fechado` é de quem acertou;
  `mes_segurou` é dos dois, porque segurar o mês não é mérito de quem clicou no
  botão.
*/
create function public.conceder_pins_acerto_mes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_piso constant int := 5;

  v_ator        uuid := coalesce(auth.uid(), new.pago_por);
  v_atual       numeric;
  v_anterior    numeric;
  v_lancamentos int;
  v_razao       numeric;
  v_extra       int;
  v_faixa       text;
begin
  perform public.conceder_pins(
    p_user        => v_ator,
    p_space       => new.space_id,
    p_regra       => 'mes_fechado',
    p_chave       => 'mes_fechado:' || new.space_id::text || ':' || new.competencia::text,
    p_dados       => jsonb_build_object('competencia', new.competencia),
    p_entidade    => 'acerto_mes',
    p_rota        => '/orcamentos'
  );

  select coalesce(sum(pm.valor), 0), count(distinct pm.compra_id)
    into v_atual, v_lancamentos
  from public.parcela_mensal pm
  where pm.space_id = new.space_id
    and pm.competencia = new.competencia;

  select coalesce(sum(pm.valor), 0)
    into v_anterior
  from public.parcela_mensal pm
  where pm.space_id = new.space_id
    and pm.competencia = (new.competencia - interval '1 month')::date;

  if v_lancamentos < c_piso or v_anterior <= 0 then
    return new;
  end if;

  v_razao := v_atual / v_anterior;

  if v_razao <= 0.85 then
    v_extra := 80;
    v_faixa := 'apertou';
  elsif v_razao <= 1.00 then
    v_extra := 40;
    v_faixa := 'gastou_menos';
  elsif v_razao <= 1.15 then
    -- A tolerância de 15%: fechar empatado com o mês passado já é segurar.
    v_extra := 0;
    v_faixa := 'segurou';
  else
    return new;
  end if;

  perform public.conceder_pins_todos(
    p_space       => new.space_id,
    p_regra       => 'mes_segurou',
    p_chave       => 'mes_segurou:' || new.space_id::text || ':' || new.competencia::text,
    p_dados       => jsonb_build_object(
                       'competencia', new.competencia,
                       'faixa',       v_faixa,
                       'razao',       round(v_razao, 2)
                     ),
    p_entidade    => 'acerto_mes',
    p_rota        => '/orcamentos',
    p_base_extra  => v_extra
  );

  return new;
end;
$$;

create trigger acerto_mes_conceder_pins
  after insert on public.acerto_mes
  for each row execute function public.conceder_pins_acerto_mes();

-- ----------------------------------------------------------------------------
-- Fotos
--
-- As duas pontas rendem, e cada uma no relógio de quem agiu: quem manda a foto
-- ganha no momento do envio, quem curte ganha no momento da curtida. É isso que
-- faz uma foto mandada no sábado — ou curtida no sábado, ou qualquer uma das
-- duas coisas durante uma viagem — valer mais para a pessoa certa. Curtir hoje
-- uma foto da viagem do mês passado rende a base: o hotspot é sobre quando você
-- agiu, não sobre quando a foto nasceu.
-- ----------------------------------------------------------------------------

create function public.conceder_pins_foto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.conceder_pins(
      p_user        => coalesce(auth.uid(), new.enviada_por),
      p_space       => new.space_id,
      p_regra       => 'foto_nova',
      p_chave       => 'foto_nova:' || new.id::text,
      p_dados       => jsonb_build_object('tipo', new.tipo, 'legenda', new.legenda),
      p_entidade    => 'foto',
      p_entidade_id => new.id,
      p_rota        => '/fotos'
    );
    return new;
  end if;

  -- O par fechado: todo mundo do espaço curtiu. É conquista dos dois, como o
  -- aviso `foto_aprovada` que sai junto.
  if new.aprovada_em is not null and old.aprovada_em is null then
    perform public.conceder_pins_todos(
      p_space       => new.space_id,
      p_regra       => 'foto_aprovada',
      p_chave       => 'foto_aprovada:' || new.id::text,
      p_dados       => jsonb_build_object('tipo', new.tipo, 'legenda', new.legenda),
      p_entidade    => 'foto',
      p_entidade_id => new.id,
      p_rota        => '/fotos'
    );
  end if;

  return new;
end;
$$;

create trigger foto_conceder_pins
  after insert or update on public.foto
  for each row execute function public.conceder_pins_foto();

create function public.conceder_pins_foto_curtida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space uuid;
  v_tipo  text;
begin
  select f.space_id, f.tipo into v_space, v_tipo
  from public.foto f where f.id = new.foto_id;

  if v_space is null then
    return new;
  end if;

  perform public.conceder_pins(
    p_user        => new.user_id,
    p_space       => v_space,
    p_regra       => 'foto_curtida',
    -- A curtida não tem id próprio: a chave primária dela é (foto, pessoa), e a
    -- chave do Pin é a mesma coisa escrita em texto.
    p_chave       => 'foto_curtida:' || new.foto_id::text || ':' || new.user_id::text,
    p_dados       => jsonb_build_object('tipo', v_tipo),
    p_entidade    => 'foto',
    p_entidade_id => new.foto_id,
    p_rota        => '/fotos'
  );

  return new;
end;
$$;

create trigger foto_curtida_conceder_pins
  after insert on public.foto_curtida
  for each row execute function public.conceder_pins_foto_curtida();

-- ----------------------------------------------------------------------------
-- Viagens
-- ----------------------------------------------------------------------------

/*
  Roteiro SECRETO não concede no nascimento — concede na revelação, com a mesma
  chave.

  Não é preciosismo: a concessão notifica, e `dados` guarda o nome. Um Pin de
  "Roteiro criado" no extrato do espaço no dia em que a surpresa foi montada
  entrega a surpresa tão bem quanto uma notificação com o nome dela. O módulo
  inteiro de Viagens já pagou essa lição (ver o alerta de spoiler); a mesma
  verificação de `notificar_roteiro()` vale aqui.
*/
create function public.conceder_pins_roteiro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visibilidade <> 'compartilhado' then
    return new;
  end if;

  /*
    No UPDATE só interessa a revelação; edição de roteiro já compartilhado cai
    no `on conflict do nothing` da chave, mas sair antes evita o trabalho.

    IF aninhado, e não `tg_op = 'UPDATE' and old.visibilidade = ...`: OLD não
    está atribuído num gatilho de INSERT, e as duas metades de uma expressão SQL
    podem ser avaliadas.
  */
  if tg_op = 'UPDATE' then
    if old.visibilidade = 'compartilhado' then
      return new;
    end if;
  end if;

  perform public.conceder_pins(
    p_user        => coalesce(auth.uid(), new.criado_por),
    p_space       => new.space_id,
    p_regra       => 'roteiro_novo',
    p_chave       => 'roteiro_novo:' || new.id::text,
    p_dados       => jsonb_build_object('nome', new.nome, 'data_inicio', new.data_inicio),
    p_entidade    => 'roteiro',
    p_entidade_id => new.id,
    p_rota        => '/viagens/' || new.id
  );

  return new;
end;
$$;

create trigger roteiro_conceder_pins
  after insert or update on public.roteiro
  for each row execute function public.conceder_pins_roteiro();

/*
  A memória fechada, e a memória fechada ENQUANTO A VIAGEM ESTÁ FRESCA.

  Sete dias porque é o prazo em que ainda se lembra da ordem das coisas — e
  porque a memória que fica para depois é justamente a que ninguém escreve. Duas
  linhas no extrato, e não um bônus embutido, pelo mesmo motivo de
  `filme_combinado`.
*/
create function public.conceder_pins_memoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_roteiro public.roteiro%rowtype;
  v_dados   jsonb;
  v_fim     date;
begin
  if new.concluida_em is null or old.concluida_em is not null then
    return new;
  end if;

  select * into v_roteiro from public.roteiro r where r.id = new.roteiro_id;
  if not found then
    return new;
  end if;

  -- O nome só entra quando o roteiro é compartilhado, pela mesma razão do
  -- gatilho acima.
  v_dados := jsonb_build_object('nota', new.nota);
  if v_roteiro.visibilidade = 'compartilhado' then
    v_dados := v_dados || jsonb_build_object('nome', v_roteiro.nome);
  end if;

  perform public.conceder_pins(
    p_user        => coalesce(auth.uid(), new.criada_por),
    p_space       => v_roteiro.space_id,
    p_regra       => 'memoria_pronta',
    p_chave       => 'memoria_pronta:' || new.id::text,
    p_dados       => v_dados,
    p_entidade    => 'memoria',
    p_entidade_id => new.id,
    p_rota        => '/viagens/' || v_roteiro.id || '/memoria'
  );

  v_fim := coalesce(v_roteiro.data_fim, v_roteiro.data_inicio);

  if v_fim is not null
     and (new.concluida_em at time zone 'America/Sao_Paulo')::date <= v_fim + 7
  then
    perform public.conceder_pins(
      p_user        => coalesce(auth.uid(), new.criada_por),
      p_space       => v_roteiro.space_id,
      p_regra       => 'memoria_fresca',
      p_chave       => 'memoria_fresca:' || new.id::text,
      p_dados       => v_dados,
      p_entidade    => 'memoria',
      p_entidade_id => new.id,
      p_rota        => '/viagens/' || v_roteiro.id || '/memoria'
    );
  end if;

  return new;
end;
$$;

create trigger memoria_conceder_pins
  after update on public.memoria
  for each row execute function public.conceder_pins_memoria();

-- ----------------------------------------------------------------------------
-- Objetivos
--
-- O que existe hoje é o ciclo do Interesse: a ideia que amadureceu e virou
-- alguma coisa. A regra `objetivo_cumprido` está cadastrada e desligada,
-- esperando a tabela `objetivo` nascer.
-- ----------------------------------------------------------------------------

create function public.conceder_pins_interesse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado <> 'convertido' or old.estado = 'convertido' then
    return new;
  end if;

  perform public.conceder_pins(
    p_user        => coalesce(auth.uid(), new.criado_por),
    p_space       => new.space_id,
    p_regra       => 'interesse_convertido',
    p_chave       => 'interesse_convertido:' || new.id::text,
    p_dados       => jsonb_build_object(
                       'titulo',  new.titulo,
                       'destino', coalesce(new.convertido_tipo, new.destino)
                     ),
    p_entidade    => 'interesse',
    p_entidade_id => new.id,
    p_rota        => '/objetivos/interesses/' || new.id
  );

  return new;
end;
$$;

create trigger interesse_conceder_pins
  after update on public.interesse
  for each row execute function public.conceder_pins_interesse();

-- ----------------------------------------------------------------------------

revoke all on function public.conceder_pins_rating()       from public, anon, authenticated;
revoke all on function public.conceder_pins_compra()       from public, anon, authenticated;
revoke all on function public.conceder_pins_acerto_mes()   from public, anon, authenticated;
revoke all on function public.conceder_pins_foto()         from public, anon, authenticated;
revoke all on function public.conceder_pins_foto_curtida() from public, anon, authenticated;
revoke all on function public.conceder_pins_roteiro()      from public, anon, authenticated;
revoke all on function public.conceder_pins_memoria()      from public, anon, authenticated;
revoke all on function public.conceder_pins_interesse()    from public, anon, authenticated;
