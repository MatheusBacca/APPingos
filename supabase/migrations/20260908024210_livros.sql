-- ============================================================================
-- livros — o que falta no motor de catálogo para a estante funcionar
--
-- O grosso do módulo NÃO está aqui: `media_item.tipo` já aceita 'livro' desde a
-- fundação, e `rating` já guarda status, nota e resenha por pessoa. Livro entra
-- como terceiro tipo do mesmo motor, não como tabela nova.
--
-- Só duas coisas não tinham onde morar.
-- ============================================================================

/*
  A página em que a pessoa está.

  Em `rating`, e não em `media_item`, porque é de QUEM LÊ e não do livro: no
  espaço de casal os dois leem o mesmo exemplar em ritmos diferentes, e uma
  coluna no item teria uma resposta só para duas perguntas.

  Nula é o estado normal — significa "não anotei", que é diferente de "página
  zero". Só faz sentido enquanto o status é 'vendo'; a tela não a mostra nos
  outros, mas o banco não força isso: largar um livro na página 80 e voltar
  meses depois é justamente o caso em que o número guardado vale.
*/
alter table public.rating add column pagina_atual integer;

alter table public.rating add constraint rating_pagina_atual_check
  check (pagina_atual is null or pagina_atual >= 0);

/*
  A meta de leitura — "12 livros em 2026".

  POR PESSOA E POR ANO, e dentro de um espaço. As três coisas juntas são a
  chave: a meta é individual (cada um tem o seu ritmo), o ano é o recorte que
  dá sentido ao progresso, e o espaço existe porque a mesma pessoa pode ter uma
  meta de casal e outra pessoal sem que uma conte para a outra.

  Tabela e não coluna em `profile` pelo ano: uma coluna guardaria uma meta só, e
  em janeiro a de 2026 apagaria a de 2025 junto com o histórico dela.
*/
create table public.meta_leitura (
  user_id       uuid not null references auth.users (id) on delete cascade,
  space_id      uuid not null references public.space (id) on delete cascade,
  ano           smallint not null check (ano between 2000 and 2200),
  alvo          smallint not null check (alvo > 0 and alvo <= 999),
  created_at    timestamptz not null default now(),
  primary key (user_id, space_id, ano)
);

create index meta_leitura_space_ano_idx on public.meta_leitura (space_id, ano);

alter table public.meta_leitura enable row level security;

/*
  Ver: quem é do espaço vê a meta dos dois.

  É o ponto do módulo ser compartilhado — a barra de progresso de quem lê com
  você é metade da graça. Esconder a meta do outro faria a tela virar duas telas
  pessoais lado a lado.
*/
create policy meta_leitura_select on public.meta_leitura
  for select to authenticated
  using (public.is_space_member(space_id));

/* Escrever: só a sua própria meta, e só em espaço do qual você participa. */
create policy meta_leitura_insert on public.meta_leitura
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_space_member(space_id));

create policy meta_leitura_update on public.meta_leitura
  for update to authenticated
  using (user_id = auth.uid() and public.is_space_member(space_id))
  with check (user_id = auth.uid() and public.is_space_member(space_id));

create policy meta_leitura_delete on public.meta_leitura
  for delete to authenticated
  using (user_id = auth.uid());
