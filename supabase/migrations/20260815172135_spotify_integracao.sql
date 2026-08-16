-- ============================================================================
-- Spotify — conexão da conta e snapshot das playlists
--
-- Fase 2 de docs/notion-plano-spotify.md. A fase 1 (catálogo) não precisou de
-- schema nenhum: `media_item` já aceitava `tipo='musica'` e `fonte='spotify'`.
-- Esta precisa, porque agora existe algo que é DE UMA PESSOA e não de um
-- espaço — a conta conectada — e é a primeira vez que o app guarda isso.
--
-- A decisão que organiza o arquivo inteiro: conectar o Spotify é por PESSOA,
-- não por espaço. Cada um tem a própria conta, e um espaço de casal pode ter
-- zero, um ou dois membros conectados. É a mesma conclusão do plano da agenda
-- do Google (docs/notion-plano-agenda-google-calendar.md).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A conta conectada
-- ----------------------------------------------------------------------------

create table public.integracao_spotify (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  spotify_user_id text,
  -- Espaço-separados, como o Spotify devolve. Guardado para a tela saber o que
  -- já foi autorizado: quando a fase 3 pedir `user-read-currently-playing`,
  -- quem conectou antes precisa reconectar, e é isto que denuncia.
  escopos         text not null default '',

  /*
    O refresh token, cifrado pelo servidor.

    O plano dizia "o refresh token nunca deve ser lido pelo client", e listava
    duas formas: uma tabela sem policy de select, ou o Vault. As duas esbarram
    no mesmo muro — quem precisa LER o token é a rota de servidor do Nuxt, e
    ela fala com o banco usando o JWT da própria pessoa (é assim que a RLS
    continua valendo). Uma tabela que a pessoa não pode ler, a rota também não
    lê; uma função SECURITY DEFINER que devolve o token ao chamador é uma
    policy de select com outro nome.

    A saída sem `service_role` é esta: a linha é legível pelo dono, mas o que
    está nela é AES-256-GCM cifrado com uma chave que só o servidor tem
    (`NUXT_SPOTIFY_TOKEN_SECRET`). O client pode buscar a própria linha e não
    tira nada dela. Isso mantém a RLS em vigor e nenhuma chave que a ignora
    dentro do app — a regra que este projeto já tinha escolhido em
    `docs/notion-changelog.md` ("autenticar como usuário, e não com
    service_role, mantém a RLS valendo").

    Vale lembrar que o refresh token sozinho não abre nada: o Spotify exige
    client id + secret junto para trocá-lo, e esses só existem no servidor.
  */
  refresh_cifrado text not null,

  conectado_em    timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- O snapshot das playlists
-- ----------------------------------------------------------------------------

/*
  Snapshot, e não espelho ao vivo.

  Playlist muda devagar e o rate limit do Spotify é uma janela curta: buscar na
  API a cada abertura de tela gastaria a cota para mostrar o mesmo de sempre.
  `sincronizado_em` é o que permite a tela dizer "atualizado há 2 horas" e
  decidir sozinha quando vale buscar de novo.
*/
create table public.playlist_spotify (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  spotify_id      text not null,
  nome            text not null,
  descricao       text,
  capa_url        text,
  total_faixas    int  not null default 0,
  publica         boolean not null default false,
  colaborativa    boolean not null default false,
  url_spotify     text,
  sincronizado_em timestamptz not null default now(),

  /*
    As faixas são sincronizadas à parte, quando alguém ABRE a playlist.

    Puxar as faixas de todas as playlists a cada sincronização multiplicaria as
    chamadas à API pelo número de playlists (e por página de 100 faixas) para
    encher uma tela que mostra só nomes. `null` aqui quer dizer "a lista desta
    playlist ainda não foi buscada", que é diferente de "esta playlist está
    vazia" — e é a diferença que a tela precisa para não mentir.
  */
  faixas_sincronizadas_em timestamptz,

  unique (user_id, spotify_id)
);

/*
  As faixas, na ordem do disco.

  `posicao` faz parte da chave porque playlist é uma lista ordenada — e é
  justamente a coluna que falta em `collection_item` e que bloqueia, por
  enquanto, a playlist nativa do APPingos (ver "fora de escopo" no plano).

  A faixa NÃO vira `media_item` aqui. Importar 300 faixas para o catálogo
  porque alguém abriu uma playlist encheria o motor de itens que ninguém
  avaliou; o caminho para o catálogo é o botão "adicionar", um de cada vez.
*/
create table public.playlist_faixa (
  playlist_id      uuid not null references public.playlist_spotify (id) on delete cascade,
  posicao          int  not null,
  spotify_track_id text not null,
  titulo           text not null,
  artistas         text not null default '',
  album            text,
  duracao_ms       int,
  url_spotify      text,
  primary key (playlist_id, posicao)
);

create index playlist_spotify_user_idx on public.playlist_spotify (user_id, nome);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.integracao_spotify enable row level security;
alter table public.playlist_spotify   enable row level security;
alter table public.playlist_faixa     enable row level security;

/*
  A integração é só sua — nem o par lê esta linha.

  Ela contém o token cifrado, e não há motivo para ele trafegar para outra
  pessoa. "Fulano conectou o Spotify?" é uma pergunta que a tela responde pela
  existência de playlists dele, não por esta tabela.
*/
create policy integracao_spotify_all on public.integracao_spotify
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

/*
  A playlist é de uma PESSOA, mas quem enxerga é quem divide um espaço com ela.

  Esta é a primeira tabela do app cuja visibilidade parte da pessoa e não do
  espaço — todas as outras usam `is_space_member(space_id)`. Aqui não há
  `space_id` para usar: a playlist não pertence a um espaço, ela pertence a uma
  conta do Spotify. `shares_space_with` (da fundação, já usada pela policy de
  `profile`) é o equivalente correto.

  Consequência a ter em mente: quem divide QUALQUER espaço com você vê as suas
  playlists, não só quem divide o espaço ativo. É o mesmo alcance que o nome e
  o avatar já têm em `profile`, e o mesmo que a tela usa para nomear pessoas.
*/
create policy playlist_spotify_select on public.playlist_spotify
  for select to authenticated
  using (user_id = auth.uid() or public.shares_space_with(user_id));

-- Escrever, só na sua: a sincronização é sempre da própria conta.
create policy playlist_spotify_escrita on public.playlist_spotify
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Mesma lógica de `can_access_entry`: a faixa herda quem pode ver a playlist,
-- para a policy não repetir a regra e as duas não terem como divergir.
create function public.can_access_playlist(p_playlist uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.playlist_spotify p
    where p.id = p_playlist
      and (p.user_id = auth.uid() or public.shares_space_with(p.user_id))
  );
$$;

create function public.playlist_e_minha(p_playlist uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.playlist_spotify p
    where p.id = p_playlist and p.user_id = auth.uid()
  );
$$;

create policy playlist_faixa_select on public.playlist_faixa
  for select to authenticated
  using (public.can_access_playlist(playlist_id));

create policy playlist_faixa_escrita on public.playlist_faixa
  for all to authenticated
  using (public.playlist_e_minha(playlist_id))
  with check (public.playlist_e_minha(playlist_id));
