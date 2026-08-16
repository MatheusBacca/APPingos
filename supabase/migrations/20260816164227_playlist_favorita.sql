-- ============================================================================
-- playlist_favorita — o que vira "Nossas músicas"
--
-- Trazer uma playlist para o espaço e destacá-la são duas coisas diferentes, e
-- a tela agora separa as duas: "Listar as minhas" põe a playlist à vista de
-- todos do espaço, e "Favoritar" a promove para o topo, em "Nossas músicas".
--
-- Tabela à parte, e não uma coluna `favorita` em `playlist_spotify`, por dois
-- motivos que se somam:
--
--   1. Dá para favoritar a playlist do OUTRO. Uma coluna na linha dele exigiria
--      que eu escrevesse na linha dele, e a policy de `playlist_spotify` só
--      deixa o dono escrever — corretamente, porque é ela que a sincronização
--      reescreve.
--   2. Favoritar é por ESPAÇO. A mesma playlist pode ser destaque no espaço de
--      casal e não ser no pessoal; uma coluna só teria uma resposta para as
--      duas perguntas.
-- ============================================================================

create table public.playlist_favorita (
  playlist_id uuid not null references public.playlist_spotify (id) on delete cascade,
  space_id    uuid not null references public.space (id) on delete cascade,
  marcada_por uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (playlist_id, space_id)
);

create index playlist_favorita_space_idx on public.playlist_favorita (space_id);

alter table public.playlist_favorita enable row level security;

/*
  Ver: quem é do espaço.

  Não exige poder ver a playlist: o `join` da tela já parte de
  `playlist_spotify`, cuja policy resolve isso. Duplicar a checagem aqui só
  criaria duas regras para manter iguais.
*/
create policy playlist_favorita_select on public.playlist_favorita
  for select to authenticated
  using (public.is_space_member(space_id));

/*
  Marcar: quem é do espaço E consegue ver a playlist.

  A segunda metade importa. Sem ela, alguém poderia favoritar no seu espaço uma
  playlist que ninguém dali enxerga — e o card apareceria em "Nossas músicas"
  como uma linha vazia, sem nome nem capa, porque o join não acharia nada.
*/
create policy playlist_favorita_insert on public.playlist_favorita
  for insert to authenticated
  with check (
    public.is_space_member(space_id)
    and public.can_access_playlist(playlist_id)
    and marcada_por = auth.uid()
  );

-- Desfavoritar: qualquer um do espaço, inclusive quem não marcou. É um destaque
-- compartilhado; exigir que só quem marcou possa tirar deixaria o espaço preso
-- à escolha de quem não está mais por perto.
create policy playlist_favorita_delete on public.playlist_favorita
  for delete to authenticated
  using (public.is_space_member(space_id));
