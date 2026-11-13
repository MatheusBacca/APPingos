-- ============================================================================
-- APPingos — Chave Pix no perfil.
--
-- Fase 6 de docs/notion-plano-open-finance.md ("Acertar com Pix"): o botão de
-- acertar o mês gera o Pix copia e cola com a chave de quem RECEBE. Para isso a
-- chave precisa ser legível por quem paga — e só por ele.
--
-- POR QUE EM `profile`, e não numa tabela própria como a renda da Frente A. A
-- régua que o plano pede é "legível só por quem divide espaço com a pessoa", e
-- é exatamente a de `profile_select` (o próprio, ou `shares_space_with`). A renda
-- foi para fora do perfil porque NÃO pode ter esse alcance; a chave Pix precisa
-- dele. Ela já é, por natureza, um dado que se entrega a quem vai pagar.
--
-- O formato é conferido no app (`app/lib/pix.ts`: dígitos do CPF/CNPJ, E.164 do
-- celular…). Aqui fica o mínimo que nenhum cliente pode furar.
-- ============================================================================

alter table public.profile
  add column chave_pix       text,
  add column chave_pix_tipo  text
    check (chave_pix_tipo in ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria'));

/*
  As duas juntas ou nenhuma: uma chave sem tipo não se valida, e um tipo sem
  chave é lixo de um formulário que salvou pela metade. 77 é o maior tamanho de
  chave do DICT (e-mail); acima disso o BR Code nem cabe.
*/
alter table public.profile
  add constraint profile_chave_pix_check
  check (
    (chave_pix is null and chave_pix_tipo is null)
    or (chave_pix_tipo is not null and char_length(btrim(chave_pix)) between 1 and 77)
  );
