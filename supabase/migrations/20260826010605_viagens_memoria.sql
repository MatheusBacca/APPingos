-- ============================================================================
-- APPingos — Viagens: a memória da viagem.
--
-- O módulo terminava onde a viagem começa. O `roteiro` é um plano — paradas,
-- dias, mapa, links do Maps —, e passada a `data_fim` o card descia para
-- "Viagens passadas" sem que nada mais acontecesse com ele. Não havia onde
-- registrar o que de fato foi vivido.
--
-- Esta migration fecha o ciclo. Três decisões a sustentam:
--
--   1. UMA MEMÓRIA POR VIAGEM, escrita a quatro mãos — daí o `unique` em
--      `roteiro_id`, e não uma memória por pessoa. O documento é impresso, e
--      duas versões paralelas do mesmo fim de semana seriam dois PDFs
--      discordando sobre a mesma viagem.
--   2. NÃO EXISTE ENTIDADE "AVALIAÇÃO". A nota da viagem é um campo do próprio
--      documento (`memoria.nota`), não uma tabela ao lado. Uma nota sem o texto
--      que a explica é o tipo de dado que ninguém volta para ler.
--   3. A SEÇÃO É CRIADA SOB DEMANDA, e a data dela é OPCIONAL. A tela sugere os
--      dias entre `data_inicio` e `data_fim`, mas só vira linha o que for de
--      fato escrito — não é obrigatório escrever sobre todos os dias, e "A
--      volta" ou "No geral" são seções legítimas sem data nenhuma.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A memória
-- ----------------------------------------------------------------------------

/*
  `concluida_em` NÃO tranca a edição para sempre — existe "Reabrir". Enquanto
  nulo, a tela é editor; preenchido, é documento em modo leitura com o botão de
  baixar. É a diferença entre "estamos escrevendo" e "está pronto", e ela precisa
  ser reversível porque a lembrança que faltava aparece depois de fechar.

  `criada_por` é quem começou, e serve ao registro — não à permissão. Quem edita
  é qualquer um que enxerga o roteiro (ver as policies abaixo): o documento é dos
  dois desde a primeira linha.
*/
create table public.memoria (
  id            uuid primary key default gen_random_uuid(),
  roteiro_id    uuid not null unique references public.roteiro (id) on delete cascade,
  nota          int check (nota is null or nota between 1 and 5),
  concluida_em  timestamptz,
  criada_por    uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- As seções
-- ----------------------------------------------------------------------------

/*
  Copia deliberadamente o desenho de `public.parada` (20260809160118_viagens.sql),
  incluindo o `deferrable` da unicidade de `ordem`: reordenar é, por natureza, um
  estado intermediário inválido — trocar a seção 2 com a 3 passa por "duas na casa
  3". Adiar a checagem para o fim da transação é o que permite escrever a lista
  nova sem inventar posições temporárias negativas. Essa lição já está paga neste
  repo; não vale pagá-la de novo.

  `data` nula é seção sem data. `titulo` nulo faz o rótulo sair da data — é o caso
  comum ("Sábado, 22/08"), e digitar isso à mão em cada seção seria trabalho que a
  data já responde.

  `nova_folha` é a válvula manual da paginação. A distribuição das seções em
  folhas A4 é ESTIMADA em `app/lib/memoria.ts` (peso por caractere, altura fixa
  por foto), porque medir o DOM mediria errado antes de as imagens carregarem —
  que é exatamente quando a paginação é calculada. Quando a estimativa não
  agradar, este bit ganha da conta.
*/
create table public.memoria_secao (
  id          uuid primary key default gen_random_uuid(),
  memoria_id  uuid not null references public.memoria (id) on delete cascade,
  ordem       int not null check (ordem >= 0),
  data        date,
  titulo      text,
  texto       text,
  nova_folha  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint memoria_secao_ordem_unica unique (memoria_id, ordem) deferrable initially deferred
);

-- ----------------------------------------------------------------------------
-- Os itens: fotos e músicas
-- ----------------------------------------------------------------------------

/*
  UMA TABELA, e não duas. Foto e música são a mesma operação na tela: um item
  anexado a uma seção, com ordem. Separá-las duplicaria a ordenação, o `secao_id`
  e o cascade — e a tela teria que intercalar duas listas para desenhar uma.

  `secao_id` nulo é item solto, preso à memória e não a um dia. É o que sobra
  quando alguém anexa a playlist da viagem inteira antes de escrever qualquer
  seção.

  MÚSICA É SNAPSHOT, no mesmo espírito de `notificacao.dados` e de `escuta_agora`:
  `titulo`, `capa_url` e `url_spotify` ficam gravados aqui, e `playlist_id` é
  `on delete set null`. Tirar a playlist do módulo Músicas não pode furar um PDF
  já impresso — a memória é um documento fechado, não uma consulta ao vivo.

  O mesmo vale para a foto: `caminho` é gravado ao lado de `foto_id`. Ele é o que
  a tela assina para desenhar a imagem, e continua existindo quando a linha do
  mural some.

  O CHECK é o que impede a linha meio-preenchida — uma foto sem arquivo ou uma
  música sem título são itens que a tela desenharia como um retângulo vazio, sem
  nada que explique o que era para estar ali.
*/
create table public.memoria_item (
  id           uuid primary key default gen_random_uuid(),
  memoria_id   uuid not null references public.memoria (id) on delete cascade,
  secao_id     uuid references public.memoria_secao (id) on delete cascade,
  ordem        int not null default 0 check (ordem >= 0),
  tipo         text not null check (tipo in ('foto', 'playlist', 'musica')),

  foto_id      uuid references public.foto (id) on delete set null,
  caminho      text,

  playlist_id  uuid references public.playlist_spotify (id) on delete set null,
  spotify_id   text,
  titulo       text,
  subtitulo    text,
  capa_url     text,
  url_spotify  text,

  legenda      text,
  created_at   timestamptz not null default now(),

  constraint memoria_item_coerente check (
    (tipo = 'foto' and caminho is not null)
    or (tipo in ('playlist', 'musica') and titulo is not null)
  )
);

create index memoria_item_memoria_idx on public.memoria_item (memoria_id, ordem);
create index memoria_item_secao_idx   on public.memoria_item (secao_id);

/*
  O índice que sustenta a guarda de "apagar a foto do mural fura a memória":
  antes de remover uma foto, a tela pergunta se ela está em alguma memória e, se
  estiver, nomeia a viagem. Sem este índice a pergunta seria um seq scan em toda
  abertura do visor de fotos.
*/
create index memoria_item_foto_idx on public.memoria_item (foto_id) where foto_id is not null;

create trigger memoria_updated_at
  before update on public.memoria
  for each row execute function public.tocar_updated_at();

create trigger memoria_secao_updated_at
  before update on public.memoria_secao
  for each row execute function public.tocar_updated_at();

-- ----------------------------------------------------------------------------
-- Quem enxerga uma memória
-- ----------------------------------------------------------------------------

/*
  Espelha `pode_ver_roteiro`, e por isso não repete nenhuma regra dele: quem
  enxerga a viagem enxerga a memória dela, inclusive a exceção do roteiro
  secreto. Nenhuma coluna `space_id` desnormalizada nas três tabelas — o espaço
  já está no `roteiro`, e duplicá-lo criaria uma segunda fonte de verdade para a
  mesma pergunta, que é como as duas divergem.
*/
create function public.pode_ver_memoria(p_memoria uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.memoria m
    where m.id = p_memoria
      and public.pode_ver_roteiro(m.roteiro_id)
  );
$$;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.memoria       enable row level security;
alter table public.memoria_secao enable row level security;
alter table public.memoria_item  enable row level security;

/*
  Ver e editar são a MESMA condição, como em `parada` e pelo mesmo motivo: a
  memória de uma viagem compartilhada é dos dois, e os dois escrevem nela. O que
  o insert acrescenta é só `criada_por = auth.uid()` — a coluna registra quem
  começou, e deixar o client escrever qualquer uuid ali faria o registro mentir.

  Quatro policies e não um `for all`: o WITH CHECK de um `for all` valeria também
  no UPDATE, e aí o outro membro não conseguiria dar a nota nem fechar o
  documento — a linha continuaria com o `criada_por` de quem começou.
*/
create policy memoria_select on public.memoria
  for select to authenticated
  using (public.pode_ver_roteiro(roteiro_id));

create policy memoria_insert on public.memoria
  for insert to authenticated
  with check (public.pode_ver_roteiro(roteiro_id) and criada_por = auth.uid());

create policy memoria_update on public.memoria
  for update to authenticated
  using (public.pode_ver_roteiro(roteiro_id))
  with check (public.pode_ver_roteiro(roteiro_id));

create policy memoria_delete on public.memoria
  for delete to authenticated
  using (public.pode_ver_roteiro(roteiro_id));

create policy memoria_secao_select on public.memoria_secao
  for select to authenticated
  using (public.pode_ver_memoria(memoria_id));

create policy memoria_secao_escrita on public.memoria_secao
  for all to authenticated
  using (public.pode_ver_memoria(memoria_id))
  with check (public.pode_ver_memoria(memoria_id));

create policy memoria_item_select on public.memoria_item
  for select to authenticated
  using (public.pode_ver_memoria(memoria_id));

create policy memoria_item_escrita on public.memoria_item
  for all to authenticated
  using (public.pode_ver_memoria(memoria_id))
  with check (public.pode_ver_memoria(memoria_id));

-- ----------------------------------------------------------------------------
-- RPCs
-- ----------------------------------------------------------------------------

/*
  A lista inteira de seções numa transação só — o que sustenta o autosave.

  ATENÇÃO: isto NÃO é o `delete + insert` de `salvar_paradas`, e a diferença é
  obrigatória. `memoria_item.secao_id` é `on delete cascade`: apagar as seções
  para reinseri-las levaria junto TODAS as fotos e músicas anexadas, a cada
  salvamento automático. O sintoma seria mudo — a pessoa escreve mais uma frase e
  as fotos somem sozinhas 700 ms depois.

  Então a reconciliação é por `id`, e o id vem da tela (`crypto.randomUUID()`): o
  que sumiu da lista sai do banco, o que ficou é atualizado no lugar, o que
  chegou é inserido. `ordem` continua saindo da POSIÇÃO no array (`with
  ordinality`), nunca do que o client mandou — é o que garante uma sequência
  0..n-1 sem buraco nem empate, exatamente como nas paradas.

  O `where` do `do update` é a trava: sem ele, mandar o id de uma seção de OUTRA
  memória a mudaria de dono. Com ele, uma colisão dessas simplesmente não faz
  nada.

  `p_secoes` é jsonb no formato:
    [{"id": "uuid", "data": "2026-08-22", "titulo": "...", "texto": "...",
      "nova_folha": false}, ...]

  SECURITY INVOKER de propósito, como `salvar_paradas`: as policies acima já
  dizem quem pode escrever. A checagem explícita no topo existe só para trocar o
  "new row violates row-level security policy" por uma frase que cabe num toast.
*/
create function public.salvar_secoes(p_memoria uuid, p_secoes jsonb)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_total int;
begin
  if jsonb_typeof(p_secoes) <> 'array' then
    raise exception 'a lista de seções precisa ser um array';
  end if;

  if not public.pode_ver_memoria(p_memoria) then
    raise exception 'você não pode editar esta memória';
  end if;

  -- O que saiu da tela sai do banco, e leva os itens junto pelo cascade —
  -- apagar a seção É apagar o que estava dentro dela.
  delete from public.memoria_secao s
  where s.memoria_id = p_memoria
    and not exists (
      select 1
      from jsonb_array_elements(p_secoes) as e(item)
      where nullif(e.item ->> 'id', '')::uuid = s.id
    );

  insert into public.memoria_secao (id, memoria_id, ordem, data, titulo, texto, nova_folha)
  select
    coalesce(nullif(p.item ->> 'id', '')::uuid, gen_random_uuid()),
    p_memoria,
    (p.posicao - 1)::int,
    nullif(p.item ->> 'data', '')::date,
    nullif(trim(coalesce(p.item ->> 'titulo', '')), ''),
    nullif(trim(coalesce(p.item ->> 'texto', '')), ''),
    coalesce((p.item ->> 'nova_folha')::boolean, false)
  from jsonb_array_elements(p_secoes) with ordinality as p(item, posicao)
  on conflict (id) do update
    set ordem      = excluded.ordem,
        data       = excluded.data,
        titulo     = excluded.titulo,
        texto      = excluded.texto,
        nova_folha = excluded.nova_folha
  where public.memoria_secao.memoria_id = p_memoria;

  get diagnostics v_total = row_count;

  -- Toca a memória para que "atualizado em" reflita a escrita nas seções, e não
  -- só a nota ou o fechamento.
  update public.memoria set updated_at = now() where id = p_memoria;

  return v_total;
end;
$$;

/*
  Fechar e reabrir o documento.

  Existem como RPC — e não como `update memoria set concluida_em = ...` pelo
  PostgREST — por duas razões. A primeira é o gatilho de notificação: "alguém
  fechou a memória" precisa de um evento limpo em que se pendurar, e uma coluna
  livre para escrita deixaria o aviso depender de o client mandar exatamente a
  transição certa. A segunda é a mensagem: fechar duas vezes tem que dizer "já
  está fechada", e não devolver sucesso silencioso sobre um update que não
  alcançou linha nenhuma.

  INVOKER: a policy de update já resolve quem pode. A checagem no topo só troca a
  frase do erro.
*/
create function public.concluir_memoria(p_memoria uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.pode_ver_memoria(p_memoria) then
    raise exception 'você não pode fechar esta memória';
  end if;

  update public.memoria
     set concluida_em = now()
   where id = p_memoria
     and concluida_em is null;

  if not found then
    raise exception 'esta memória já está fechada';
  end if;
end;
$$;

create function public.reabrir_memoria(p_memoria uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.pode_ver_memoria(p_memoria) then
    raise exception 'você não pode reabrir esta memória';
  end if;

  update public.memoria
     set concluida_em = null
   where id = p_memoria
     and concluida_em is not null;

  if not found then
    raise exception 'esta memória ainda está aberta';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

grant execute on function public.pode_ver_memoria(uuid)            to authenticated;
grant execute on function public.salvar_secoes(uuid, jsonb)        to authenticated;
grant execute on function public.concluir_memoria(uuid)            to authenticated;
grant execute on function public.reabrir_memoria(uuid)             to authenticated;
