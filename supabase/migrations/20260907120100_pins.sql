-- ============================================================================
-- APPingos — Pins: o motor.
--
-- Pin é a moeda do app. Registrar um gasto, marcar um filme, curtir uma foto,
-- fechar o mês no azul — tudo isso rende Pins, e o outro membro do espaço fica
-- sabendo.
--
-- Cinco decisões sustentam o motor:
--
--   1. PIN É LANÇAMENTO, NUNCA SALDO. Uma linha por conquista, com quanto, por
--      qual regra e sobre qual entidade. O saldo é `sum(pontos)`. Um total
--      guardado em `profile` criaria a pergunta que nenhum app de pontos
--      responde depois: "por que eu tenho 340?". Com o extrato, a resposta é a
--      própria tela.
--   2. OS PINS NASCEM NO BANCO, em triggers, não no client — a mesma decisão do
--      motor de notificações, pelo mesmo motivo: vale para escrita vinda da
--      tela, de RPC ou de SQL na mão, e nenhum módulo novo pode esquecer de
--      pontuar.
--   3. TODA CONCESSÃO TEM CHAVE IDEMPOTENTE. `unique (user_id, chave)`. Sem
--      isso, salvar o mesmo filme duas vezes rende duas vezes, e o primeiro
--      relato de bug da feature seria "os pins estão inflacionando sozinhos".
--   4. PIN NUNCA É PROPORCIONAL AO VALOR GASTO. É o princípio que impede o
--      módulo de Orçamentos de virar incentivo perverso: premia-se o registro e
--      a disciplina, jamais o tamanho da compra.
--   5. DADO FICA NA TABELA, CONDIÇÃO FICA NO CÓDIGO. `pin_regra` e
--      `pin_hotspot` guardam números ajustáveis e a quais regras cada hotspot se
--      aplica; QUANDO um hotspot está ativo é lógica de função. Condição em
--      `jsonb` de configuração é o caminho curto para um interpretador caseiro
--      dentro do Postgres.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- O dia de Brasília
--
-- Sequência, teto diário e "no calor da hora" são todos perguntas sobre o DIA
-- em que a pessoa está — e o banco pensa em UTC. Às 21h de Brasília já é o dia
-- seguinte em UTC, o que faria uma sequência quebrar toda noite.
--
-- Devolve o INSTANTE em que o dia começa, e não uma data, de propósito: assim a
-- comparação vira `created_at >= X and created_at < Y`, que usa o índice —
-- enquanto `(created_at at time zone ...)::date = X` obrigaria a varrer tudo.
--
-- STABLE, e não IMMUTABLE: o banco de fusos pode mudar. É o que impede alguém
-- de tentar indexar por esta função e ficar com um índice mentiroso.
-- ----------------------------------------------------------------------------

create function public.inicio_do_dia_brt(p_dia date)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (p_dia::timestamp) at time zone 'America/Sao_Paulo';
$$;

-- ----------------------------------------------------------------------------
-- As regras: quanto vale cada coisa
-- ----------------------------------------------------------------------------

/*
  `teto_dia` nulo é "sem teto", e é o caso de tudo que só acontece uma vez
  (fechar o mês, concluir uma viagem). Onde ele existe, existe contra o farm:
  quem lança 30 compras num domingo de reconciliação está sendo organizado, não
  jogando — mas a economia não pode depender disso.

  `lazer` e `noturna` dizem a QUAIS regras os hotspots de fim de semana e de
  corujão se aplicam. São colunas, e não uma lista dentro da função, porque é
  exatamente o tipo de coisa que muda quando um módulo novo entra: acrescentar
  uma regra de lazer não deveria pedir a reescrita de `pins_hotspots()`.

  `ativa` existe para a regra poder NASCER desligada — ver `objetivo_cumprido`
  no fim do seed.
*/
create table public.pin_regra (
  chave      text primary key check (trim(chave) <> ''),
  rotulo     text not null check (trim(rotulo) <> ''),
  descricao  text not null check (trim(descricao) <> ''),
  -- O slug do módulo em `app/modules.ts`. É por ele que o extrato agrupa e que
  -- a notificação escolhe o ícone.
  modulo     text not null check (modulo in ('orcamentos', 'filmes', 'fotos',
                                             'musicas', 'viagens', 'objetivos')),
  base       int not null check (base > 0),
  teto_dia   int check (teto_dia is null or teto_dia > 0),
  lazer      boolean not null default false,
  noturna    boolean not null default false,
  ativa      boolean not null default true,
  ordem      int not null default 0
);

/*
  `por_dia` distingue o hotspot que cresce (sequência, modo viagem) do que é um
  degrau só (fim de semana). No primeiro, `fator` é o incremento por dia e o
  crescimento para em `teto`; no segundo os dois são iguais e `teto` só existe
  para a coluna não precisar de NULL.
*/
create table public.pin_hotspot (
  chave      text primary key check (trim(chave) <> ''),
  rotulo     text not null check (trim(rotulo) <> ''),
  descricao  text not null check (trim(descricao) <> ''),
  fator      numeric(4,2) not null check (fator > 0),
  por_dia    boolean not null default false,
  teto       numeric(4,2) not null check (teto > 0),
  ativo      boolean not null default true,
  ordem      int not null default 0,

  constraint pin_hotspot_teto_coerente check (teto >= fator)
);

-- ----------------------------------------------------------------------------
-- O livro-razão
-- ----------------------------------------------------------------------------

/*
  `dados` é SNAPSHOT do que a linha do extrato mostra, não só ids — mesmo motivo
  do `dados` de `notificacao`: o filme pode sair da lista e o extrato tem que
  continuar legível.

  `base` e `multiplicador` ficam gravados ao lado de `pontos` porque o extrato
  mostra a CONTA ("3 × 1,50 = 5"), e recalculá-la na leitura daria um número
  diferente amanhã — os hotspots de hoje não são os de amanhã.

  `hotspots` guarda quais bônus entraram, para a linha conseguir dizer POR QUE
  rendeu mais. Sem isso o multiplicador é um número mágico.

  `space_id` nulo = conquista da conta, fora de espaço. Nenhuma regra de hoje é
  assim, mas o cascade do espaço excluído distingue os dois casos, e é melhor a
  coluna já nascer sabendo disso — a mesma escolha de `notificacao.space_id`.
*/
create table public.pin (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  space_id      uuid references public.space (id) on delete cascade,
  regra         text not null references public.pin_regra (chave),
  base          int not null check (base > 0),
  multiplicador numeric(4,2) not null default 1 check (multiplicador >= 1),
  pontos        int not null check (pontos > 0),
  hotspots      text[] not null default '{}',
  dados         jsonb not null default '{}'::jsonb,
  entidade      text,
  entidade_id   uuid,
  chave         text not null check (trim(chave) <> ''),
  created_at    timestamptz not null default now()
);

-- A garantia da decisão 3. É índice, e não um `if not exists` dentro da função,
-- porque só o índice protege contra duas transações simultâneas.
create unique index pin_chave_idx on public.pin (user_id, chave);

-- O extrato da pessoa, o extrato do espaço, e a busca do teto diário.
create index pin_extrato_idx on public.pin (user_id, created_at desc);
create index pin_espaco_idx  on public.pin (space_id, created_at desc);
create index pin_teto_idx    on public.pin (user_id, regra, created_at desc);

/*
  O saldo, derivado — nunca armazenado (decisão 1).

  `security_invoker` faz a RLS de `pin` valer para quem consulta, como na view
  `parcela_mensal`. Sem isso a view seria um buraco por onde se leria o extrato
  de qualquer espaço.
*/
create view public.pin_saldo
with (security_invoker = on)
as
select
  p.space_id,
  p.user_id,
  sum(p.pontos)::int as pontos,
  count(*)::int      as conquistas,
  max(p.created_at)  as ultimo
from public.pin p
group by p.space_id, p.user_id;

-- ----------------------------------------------------------------------------
-- RLS
--
-- Em `pin` não há policy de INSERT, UPDATE nem DELETE: quem grava é
-- `conceder_pins()` rodando como owner — exatamente como em `notificacao`.
-- Assim ninguém fabrica Pin pela API, que numa feature de pontos é a única
-- forma de fraude que importa.
--
-- As duas tabelas de configuração são de leitura pública para quem tem sessão:
-- a tela "o que rende Pins" lê delas, e regra escondida não muda comportamento.
-- ----------------------------------------------------------------------------

alter table public.pin         enable row level security;
alter table public.pin_regra   enable row level security;
alter table public.pin_hotspot enable row level security;

-- O jogo é compartilhado: no espaço de casal, um vê o extrato do outro. É a
-- razão de a feature existir — ver o esforço do outro sem precisar perguntar.
create policy pin_select on public.pin
  for select to authenticated
  using (user_id = auth.uid() or public.is_space_member(space_id));

create policy pin_regra_select on public.pin_regra
  for select to authenticated
  using (true);

create policy pin_hotspot_select on public.pin_hotspot
  for select to authenticated
  using (true);

-- ----------------------------------------------------------------------------
-- Os hotspots
--
-- Devolve o MULTIPLICADOR final e a lista de quais bônus entraram. Uma função
-- só, chamada por `conceder_pins()`, para a resposta ser a mesma esteja o Pin
-- vindo de que gatilho for.
--
-- Tudo é avaliado no RELÓGIO DO SERVIDOR, no momento da concessão — nunca na
-- data do fato. Marcar hoje um filme visto na semana passada ganha a base, não o
-- tempero; senão a forma ótima de jogar seria acumular registros para lançar
-- todos num sábado à noite.
-- ----------------------------------------------------------------------------

create function public.pins_hotspots(
  p_user   uuid,
  p_space  uuid,
  p_regra  text,
  p_agora  timestamptz,
  p_extra  text[] default '{}'
)
returns table (multiplicador numeric, hotspots text[])
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  /*
    O teto de tudo somado. Com os números de hoje o máximo possível é 1,90×, ou
    seja: ele não morde. Existe para o dia em que o sexto hotspot for
    acrescentado sem ninguém refazer a conta de quanto o pior caso passou a
    valer — que é como economia de pontos costuma quebrar.
  */
  c_teto_global constant numeric := 2.5;

  v_regra    public.pin_regra%rowtype;
  v_hotspot  public.pin_hotspot%rowtype;
  v_local    timestamp;
  v_hoje     date;
  v_hora     int;
  v_lista    text[] := '{}';
  v_bonus    numeric := 0;
  v_dias     int;
  v_dia      date;
  v_max      int;
  v_chave    text;
  v_inicio   date;
begin
  select * into v_regra from public.pin_regra r where r.chave = p_regra;
  if not found then
    return query select 1::numeric, '{}'::text[];
    return;
  end if;

  v_local := p_agora at time zone 'America/Sao_Paulo';
  v_hoje  := v_local::date;
  v_hora  := extract(hour from v_local);

  -- Sequência ------------------------------------------------------------
  /*
    Dias consecutivos com pelo menos um Pin. Conta a partir de HOJE quando o dia
    já tem Pin, e a partir de ONTEM quando não tem: no primeiro Pin do dia, o
    dia corrente ainda está vazio, e começar por ele zeraria a sequência de quem
    está justamente mantendo-a.

    O laço para no teto (3 iterações com os números de hoje), e o limite sai da
    própria configuração — se o teto subir, a contagem acompanha sem ninguém
    lembrar de mexer aqui.
  */
  select * into v_hotspot from public.pin_hotspot h where h.chave = 'sequencia' and h.ativo;
  if found then
    v_max := ceil(v_hotspot.teto / v_hotspot.fator);
    v_dia := v_hoje;

    if not exists (
      select 1 from public.pin p
      where p.user_id = p_user
        and p.created_at >= public.inicio_do_dia_brt(v_dia)
        and p.created_at <  public.inicio_do_dia_brt(v_dia + 1)
    ) then
      v_dia := v_dia - 1;
    end if;

    v_dias := 0;
    while v_dias < v_max loop
      exit when not exists (
        select 1 from public.pin p
        where p.user_id = p_user
          and p.created_at >= public.inicio_do_dia_brt(v_dia)
          and p.created_at <  public.inicio_do_dia_brt(v_dia + 1)
      );
      v_dias := v_dias + 1;
      v_dia  := v_dia - 1;
    end loop;

    if v_dias > 0 then
      v_bonus := v_bonus + least(v_hotspot.fator * v_dias, v_hotspot.teto);
      v_lista := v_lista || 'sequencia';
    end if;
  end if;

  -- Fim de semana --------------------------------------------------------
  -- Só no que é lazer: um gasto lançado no sábado não é mais divertido que o
  -- de terça. É este ramo que faz a foto mandada no sábado — e a foto CURTIDA
  -- no sábado — valer mais, cada uma para quem fez o gesto.
  if v_regra.lazer then
    select * into v_hotspot from public.pin_hotspot h where h.chave = 'fim_de_semana' and h.ativo;
    if found and extract(isodow from v_local) in (6, 7) then
      v_bonus := v_bonus + least(v_hotspot.fator, v_hotspot.teto);
      v_lista := v_lista || 'fim_de_semana';
    end if;
  end if;

  -- Modo viagem ----------------------------------------------------------
  /*
    Enquanto uma viagem do espaço acontece, TUDO rende mais — a foto, a curtida,
    o filme da noite no hotel, o gasto lançado na estrada.

    Só roteiro COMPARTILHADO conta, pela mesma verificação de
    `avisar_viagens_proximas()`: um "modo viagem" aparecendo no extrato de quem
    não sabe da surpresa seria o jeito mais bobo de estragá-la.

    `min(data_inicio)` entre as viagens em curso: com duas sobrepostas, vale a
    que começou primeiro — é a que a pessoa está vivendo há mais tempo.
  */
  if p_space is not null then
    select * into v_hotspot from public.pin_hotspot h where h.chave = 'modo_viagem' and h.ativo;
    if found then
      select min(r.data_inicio) into v_inicio
      from public.roteiro r
      where r.space_id = p_space
        and r.visibilidade = 'compartilhado'
        and r.data_inicio is not null
        and r.data_inicio <= v_hoje
        and coalesce(r.data_fim, r.data_inicio) >= v_hoje;

      if v_inicio is not null then
        -- O primeiro dia da viagem já vale um passo: quem viajou hoje está em
        -- modo viagem hoje, não a partir de amanhã.
        v_dias  := (v_hoje - v_inicio) + 1;
        v_bonus := v_bonus + least(v_hotspot.fator * v_dias, v_hotspot.teto);
        v_lista := v_lista || 'modo_viagem';
      end if;
    end if;
  end if;

  -- Corujão --------------------------------------------------------------
  if v_regra.noturna then
    select * into v_hotspot from public.pin_hotspot h where h.chave = 'corujao' and h.ativo;
    if found and (v_hora >= 22 or v_hora < 2) then
      v_bonus := v_bonus + least(v_hotspot.fator, v_hotspot.teto);
      v_lista := v_lista || 'corujao';
    end if;
  end if;

  -- Os de contexto -------------------------------------------------------
  /*
    Hotspots que só quem disparou o gatilho sabe avaliar — hoje só
    `calor_da_hora`, que depende da `data_compra` da linha que acabou de entrar.
    Chegam pelo nome, e o FATOR continua vindo da tabela: quem chama diz que o
    bônus vale, nunca quanto ele vale.
  */
  if p_extra is not null then
    foreach v_chave in array p_extra loop
      if not (v_lista @> array[v_chave]) then
        select * into v_hotspot from public.pin_hotspot h where h.chave = v_chave and h.ativo;
        if found then
          v_bonus := v_bonus + least(v_hotspot.fator, v_hotspot.teto);
          v_lista := v_lista || v_chave;
        end if;
      end if;
    end loop;
  end if;

  return query select least(1 + v_bonus, c_teto_global), v_lista;
end;
$$;

-- ----------------------------------------------------------------------------
-- A porta única: conceder_pins()
-- ----------------------------------------------------------------------------

/*
  Ordem das coisas, e o porquê de cada uma:

    1. A regra desligada sai fora antes de qualquer conta — é o que faz
       `objetivo_cumprido` existir sem render nada.
    2. O teto diário é conferido ANTES do insert, porque um Pin de zero ponto
       não deveria existir só para ser filtrado depois.
    3. A notificação sai DEPOIS do insert e SÓ SE A LINHA ENTROU. É o detalhe
       que impede a caixa de encher com o mesmo ganho a cada `update` bobo na
       linha de origem — o `on conflict do nothing` vira silêncio, não aviso.

  A notificação NÃO leva `entidade_id`, de propósito: o agrupamento de
  `notificar()` casa por entidade, e com ela cada filme de uma maratona viraria
  uma linha própria. Sem ela, os ganhos de meia hora viram um aviso só — "Ana
  ganhou 60 Pins" — e o toque leva ao extrato, que é onde a conta inteira está.
*/
create function public.conceder_pins(
  p_user           uuid,
  p_space          uuid,
  p_regra          text,
  p_chave          text,
  p_dados          jsonb   default '{}'::jsonb,
  p_entidade       text    default null,
  p_entidade_id    uuid    default null,
  p_rota           text    default null,
  p_base_extra     int     default 0,
  p_hotspots_extra text[]  default '{}'
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_regra   public.pin_regra%rowtype;
  v_agora   timestamptz := now();
  v_mult    numeric;
  v_lista   text[];
  v_base    int;
  v_pontos  int;
  v_id      uuid;
begin
  if p_user is null or p_regra is null or p_chave is null then
    return 0;
  end if;

  select * into v_regra from public.pin_regra r where r.chave = p_regra and r.ativa;
  if not found then
    return 0;
  end if;

  if v_regra.teto_dia is not null and (
    select count(*) from public.pin p
    where p.user_id = p_user
      and p.regra = p_regra
      and p.created_at >= public.inicio_do_dia_brt((v_agora at time zone 'America/Sao_Paulo')::date)
  ) >= v_regra.teto_dia then
    return 0;
  end if;

  select h.multiplicador, h.hotspots
    into v_mult, v_lista
  from public.pins_hotspots(p_user, p_space, p_regra, v_agora, p_hotspots_extra) h;

  v_base   := greatest(v_regra.base + coalesce(p_base_extra, 0), 1);
  -- `greatest(..., 1)` fecha a porta do Pin de zero ponto, que o CHECK da
  -- tabela recusaria — e um arredondamento para baixo não deveria virar erro.
  v_pontos := greatest(round(v_base * v_mult)::int, 1);

  insert into public.pin (
    user_id, space_id, regra, base, multiplicador, pontos,
    hotspots, dados, entidade, entidade_id, chave
  )
  values (
    p_user, p_space, p_regra, v_base, v_mult, v_pontos,
    v_lista, coalesce(p_dados, '{}'::jsonb), p_entidade, p_entidade_id, p_chave
  )
  on conflict (user_id, chave) do nothing
  returning id into v_id;

  if v_id is null then
    return 0;
  end if;

  if p_space is not null then
    perform public.notificar(
      p_space  => p_space,
      p_tipo   => 'pins_ganhos',
      p_ator   => p_user,
      p_dados  => coalesce(p_dados, '{}'::jsonb) || jsonb_build_object(
                    'pontos', v_pontos,
                    'regra',  v_regra.chave,
                    'rotulo', v_regra.rotulo,
                    'modulo', v_regra.modulo
                  ),
      p_rota   => coalesce(p_rota, '/pins'),
      p_janela => interval '30 minutes',
      p_somar  => array['pontos']
    );
  end if;

  return v_pontos;
end;
$$;

/*
  A irmã para conquista COLETIVA: fechar o mês no azul, a foto que os dois
  curtiram, a viagem que terminou. São fatos do espaço, não de quem clicou no
  botão.

  Cada membro recebe a sua própria concessão, e cada concessão notifica os
  OUTROS — então no espaço de casal cada um acaba com exatamente um aviso, sobre
  o ganho do outro. A alternativa (um aviso coletivo "vocês ganharam") pediria um
  segundo caminho dentro de `notificar()` para um caso que o motor já resolve.
*/
create function public.conceder_pins_todos(
  p_space       uuid,
  p_regra       text,
  p_chave       text,
  p_dados       jsonb  default '{}'::jsonb,
  p_entidade    text   default null,
  p_entidade_id uuid   default null,
  p_rota        text   default null,
  p_base_extra  int    default 0
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membro uuid;
  v_total  int := 0;
begin
  if p_space is null then
    return 0;
  end if;

  for v_membro in
    select m.user_id from public.membership m where m.space_id = p_space
  loop
    v_total := v_total + public.conceder_pins(
      p_user        => v_membro,
      p_space       => p_space,
      p_regra       => p_regra,
      p_chave       => p_chave,
      p_dados       => p_dados,
      p_entidade    => p_entidade,
      p_entidade_id => p_entidade_id,
      p_rota        => p_rota,
      p_base_extra  => p_base_extra
    );
  end loop;

  return v_total;
end;
$$;

-- Ninguém concede Pin pela API — quem chama são os gatilhos, como owner.
revoke all on function public.pins_hotspots(uuid, uuid, text, timestamptz, text[])
  from public, anon, authenticated;
revoke all on function public.conceder_pins(uuid, uuid, text, text, jsonb, text, uuid, text, int, text[])
  from public, anon, authenticated;
revoke all on function public.conceder_pins_todos(uuid, text, text, jsonb, text, uuid, text, int)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- A economia
--
-- Vive em migration, como todo o resto: a regra de ouro do repo (nunca editar
-- pelo Table Editor) vale aqui mais do que em qualquer outro lugar, porque um
-- `update` na mão em `base` é indistinguível de fraude quando alguém for
-- conferir o extrato seis meses depois.
-- ----------------------------------------------------------------------------

insert into public.pin_regra (chave, rotulo, descricao, modulo, base, teto_dia, lazer, noturna, ativa, ordem)
values
  ('filme_visto',          'Filme ou série visto',  'Marcar um título como visto.',                          'filmes',     10,    5, true,  true,  true,  10),
  ('filme_combinado',      'Assistiu no combinado', 'Marcar com um dia ou mais de antecedência e ver na data.', 'filmes',  25, null, true,  true,  true,  20),
  ('avaliacao_enviada',    'Avaliação enviada',     'Nota e resenha de um título que você viu.',              'filmes',      5,    5, true,  false, true,  30),
  ('gasto_novo',           'Gasto lançado',         'Registrar uma compra no orçamento.',                     'orcamentos',  3,    5, false, false, true,  40),
  ('mes_fechado',          'Mês acertado',          'Fechar o acerto do mês com o espaço.',                   'orcamentos', 30, null, false, false, true,  50),
  ('mes_segurou',          'Segurou o mês',         'Fechar o mês gastando o mesmo ou menos que o anterior.', 'orcamentos', 40, null, false, false, true,  60),
  ('foto_nova',            'Foto enviada',          'Mandar uma foto ou um vídeo para o espaço.',             'fotos',       3,   10, true,  false, true,  70),
  ('foto_curtida',         'Foto curtida',          'Curtir o que a outra pessoa mandou.',                    'fotos',       2,   10, true,  false, true,  80),
  ('foto_aprovada',        'Foto liberada',         'Todo mundo do espaço curtiu — pode postar.',             'fotos',       5, null, false, false, true,  90),
  ('roteiro_novo',         'Roteiro criado',        'Montar um roteiro de viagem.',                           'viagens',    15,    3, false, false, true, 100),
  ('viagem_concluida',     'Viagem concluída',      'A viagem aconteceu e terminou.',                         'viagens',    50, null, false, false, true, 110),
  ('memoria_pronta',       'Memória fechada',       'Escrever a memória final da viagem.',                    'viagens',    80, null, false, false, true, 120),
  ('memoria_fresca',       'Memória fresca',        'Fechar a memória em até 7 dias do fim da viagem.',       'viagens',    40, null, false, false, true, 130),
  ('interesse_convertido', 'Interesse realizado',   'Um interesse virou compra, objetivo ou viagem.',         'objetivos',  40,    3, false, false, true, 140),
  /*
    Nasce DESLIGADA porque não existe onde se apoiar: "Objetivos" hoje é só a
    aba de Interesses, e meta com prazo não tem tabela. Está cadastrada para o
    dia em que `objetivo` nascer — ligar vira um update de uma linha, e o motor
    já sabe o que fazer.
  */
  ('objetivo_cumprido',    'Objetivo cumprido',     'Bater uma meta com prazo.',                              'objetivos',  60, null, false, false, false, 150);

insert into public.pin_hotspot (chave, rotulo, descricao, fator, por_dia, teto, ordem)
values
  ('sequencia',     'Sequência',        'Dias seguidos registrando alguma coisa no APPingos.', 0.05, true,  0.15, 10),
  ('fim_de_semana', 'Fim de semana',    'Sábado e domingo, no que é lazer.',                   0.20, false, 0.20, 20),
  ('modo_viagem',   'Modo viagem',      'Enquanto uma viagem do espaço está acontecendo.',     0.10, true,  0.15, 30),
  ('calor_da_hora', 'No calor da hora', 'Gasto lançado no mesmo dia da compra.',               0.25, false, 0.25, 40),
  ('corujao',       'Corujão',          'Filme marcado como visto entre 22h e 2h.',            0.15, false, 0.15, 50);
