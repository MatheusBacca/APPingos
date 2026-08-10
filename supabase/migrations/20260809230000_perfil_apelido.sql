-- ============================================================================
-- APPingos — Apelido no perfil.
--
-- `nome` é como a pessoa se cadastrou; `apelido` é como ela quer ser chamada
-- dentro do app. São coisas diferentes, e por isso viram duas colunas: deixar
-- o cadastro ser reescrito faria "Bebê" virar o nome oficial em todo lugar,
-- inclusive nos espaços onde a pessoa é só mais um membro. O apelido é uma
-- camada de exibição por cima do nome, e some deixando o campo vazio.
--
-- Não é único de propósito: apelido não é @handle, é como o outro te chama.
-- Dois "Bebê" no mesmo espaço é escolha do casal, não erro de integridade.
-- ============================================================================

alter table public.profile
  add column apelido text;

/*
  A normalização vive no banco, não no formulário: `profile_update` deixa cada
  um escrever na própria linha direto pelo PostgREST, então qualquer cliente
  (hoje o app, amanhã um script) pode mandar "  " ou "". Um trigger é o único
  ponto por onde todos passam — e é ele que decide que "sem apelido" é NULL,
  nunca string vazia. Sem isso, `apelido ?? nome` devolveria '' e a tela
  mostraria uma pessoa sem nome.
*/
create function public.normalizar_apelido()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.apelido := nullif(btrim(new.apelido), '');
  return new;
end;
$$;

create trigger profile_apelido_normalizado
  before insert or update on public.profile
  for each row execute function public.normalizar_apelido();

-- Roda depois do trigger, então já vê o valor aparado. O piso de 2 barra o
-- apelido de uma letra só, que na pilha de membros seria indistinguível da
-- inicial de qualquer outra pessoa.
alter table public.profile
  add constraint profile_apelido_check
  check (apelido is null or char_length(apelido) between 2 and 24);

revoke all on function public.normalizar_apelido() from public, anon, authenticated;
