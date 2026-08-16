-- ============================================================================
-- escuta_agora — o que cada pessoa está ouvindo
--
-- Fase 3 de docs/notion-plano-spotify.md, com uma diferença em relação ao que
-- o plano previa. O plano oferecia duas opções: cada um pergunta o próprio
-- now-playing (só funciona com o app aberto NO aparelho dele), ou um cron no
-- servidor pergunta por todo mundo o tempo todo (caro e sempre ligado).
--
-- O desenho escolhido é um terceiro: QUEM ESTÁ OLHANDO pergunta por todos.
-- Enquanto alguém tem o APPingos aberto, o app dele pede ao servidor o
-- now-playing de cada membro do espaço que autorizou — usando o refresh token
-- de cada um, que já mora no banco. Ninguém olhando, nenhuma chamada.
--
-- Isso resolve o furo da opção do plano: dá para ver o que a outra pessoa está
-- ouvindo no carro, com o app dela fechado, sem nada rodando 24h.
-- ============================================================================

/*
  Transmitir o que se ouve é uma permissão à parte de conectar a conta.

  Conectar serve para as playlists. Dizer o que está tocando agora é outra
  coisa, e por isso nasce DESLIGADO — quem conectou antes desta migration não
  passa a transmitir por causa de um deploy.
*/
alter table public.integracao_spotify
  add column mostrar_escuta boolean not null default false;

/*
  UMA linha por pessoa, sempre sobrescrita — nunca `insert` de histórico.

  Guardar cada faixa tocada viraria um log minuto a minuto do comportamento de
  alguém dentro de um app de casal. Ninguém pediu isso, e no dia em que pedirem
  ("as mais tocadas do mês") o Spotify tem um endpoint de top items para
  responder, sem o app virar vigilância.
*/
create table public.escuta_agora (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  tocando          boolean not null default false,
  spotify_track_id text,
  titulo           text,
  artistas         text,
  album            text,
  capa_url         text,
  url_spotify      text,
  progresso_ms     int,
  duracao_ms       int,
  atualizado_em    timestamptz not null default now()
);

alter table public.escuta_agora enable row level security;

/*
  Quem vê: você, e quem divide espaço com você SE você deixou.

  A checagem do interruptor mora na policy, e não só na tela. Proteger isso no
  front seria proteger privacidade com CSS: bastaria uma consulta direta à API
  do Supabase, com a mesma anon key que já vai no bundle, para ler assim mesmo.
*/
create policy escuta_agora_select on public.escuta_agora
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      public.shares_space_with(user_id)
      and exists (
        select 1 from public.integracao_spotify i
        where i.user_id = public.escuta_agora.user_id and i.mostrar_escuta
      )
    )
  );

-- Escrita só pela RPC abaixo: quem grava é sempre alguém perguntando POR
-- OUTRA pessoa, e essa regra não cabe num `with check`.
-- (sem policy de insert/update/delete para `authenticated`)

-- ----------------------------------------------------------------------------
-- As duas funções que o servidor usa para perguntar por outra pessoa
-- ----------------------------------------------------------------------------

/*
  O refresh token (cifrado) de quem autorizou transmitir.

  Devolve o texto CIFRADO, que sem a chave do servidor não abre nada — a mesma
  garantia que já vale para a própria linha da pessoa (ver a migration
  20260815172135). O que esta função concede, então, não é o token: é o direito
  de PEDIR ao servidor que ele pergunte por aquela pessoa.

  Duas condições, as duas necessárias: dividir um espaço com ela, e ela ter
  ligado `mostrar_escuta`.
*/
create function public.token_de_escuta(p_user uuid)
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select i.refresh_cifrado
  from public.integracao_spotify i
  where i.user_id = p_user
    and i.mostrar_escuta
    and (p_user = auth.uid() or public.shares_space_with(p_user));
$$;

/*
  Grava o que a pessoa está ouvindo.

  `security definer` porque quem chama é quem está OLHANDO, não o dono da
  linha. As mesmas duas condições de `token_de_escuta` valem aqui — sem elas,
  qualquer pessoa autenticada poderia escrever "está ouvindo X" na linha de
  qualquer outra.
*/
create function public.registrar_escuta(p_user uuid, p_dados jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.integracao_spotify i
    where i.user_id = p_user
      and i.mostrar_escuta
      and (p_user = auth.uid() or public.shares_space_with(p_user))
  ) then
    raise exception 'sem permissão para registrar a escuta desta pessoa';
  end if;

  insert into public.escuta_agora (
    user_id, tocando, spotify_track_id, titulo, artistas, album,
    capa_url, url_spotify, progresso_ms, duracao_ms, atualizado_em
  )
  values (
    p_user,
    coalesce((p_dados ->> 'tocando')::boolean, false),
    p_dados ->> 'spotify_track_id',
    p_dados ->> 'titulo',
    p_dados ->> 'artistas',
    p_dados ->> 'album',
    p_dados ->> 'capa_url',
    p_dados ->> 'url_spotify',
    nullif(p_dados ->> 'progresso_ms', '')::int,
    nullif(p_dados ->> 'duracao_ms', '')::int,
    now()
  )
  on conflict (user_id) do update
    set tocando          = excluded.tocando,
        spotify_track_id = excluded.spotify_track_id,
        titulo           = excluded.titulo,
        artistas         = excluded.artistas,
        album            = excluded.album,
        capa_url         = excluded.capa_url,
        url_spotify      = excluded.url_spotify,
        progresso_ms     = excluded.progresso_ms,
        duracao_ms       = excluded.duracao_ms,
        atualizado_em    = now();
end;
$$;

/*
  Desligar o interruptor apaga o que já foi transmitido.

  Sem isto, "parar de mostrar" deixaria na tela do par a última faixa para
  sempre — e a pessoa acharia que tinha parado de transmitir.
*/
create function public.limpar_escuta_ao_desligar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.mostrar_escuta and not new.mostrar_escuta then
    delete from public.escuta_agora where user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger integracao_spotify_limpar_escuta
  after update of mostrar_escuta on public.integracao_spotify
  for each row
  execute function public.limpar_escuta_ao_desligar();

grant execute on function public.token_de_escuta(uuid) to authenticated;
grant execute on function public.registrar_escuta(uuid, jsonb) to authenticated;
revoke all on function public.limpar_escuta_ao_desligar() from public, anon, authenticated;
