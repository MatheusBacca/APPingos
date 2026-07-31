-- ============================================================================
-- FK membership.user_id -> profile.id
--
-- Sem ela, `membership` e `profile` só se relacionam indiretamente (ambas
-- apontam para auth.users), e o PostgREST não consegue inferir o embed:
--   membership?select=user_id,profile:profile(nome)
-- devolve 400 "Could not find a relationship between 'membership' and 'profile'".
--
-- Na prática isso deixava a lista de membros sem nome ("Alguém") na tela de
-- avaliações e na de Espaços.
--
-- A FK é sempre satisfazível: handle_new_user() insere o profile antes da
-- membership, na mesma transação.
-- ============================================================================

alter table public.membership
  add constraint membership_user_id_profile_fkey
  foreign key (user_id) references public.profile (id) on delete cascade;

-- Mesmo motivo, para conseguir rotular "quem deu qual nota" direto do rating
-- sem depender de cruzar com membership no client.
alter table public.rating
  add constraint rating_user_id_profile_fkey
  foreign key (user_id) references public.profile (id) on delete cascade;
