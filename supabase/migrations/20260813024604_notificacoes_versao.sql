-- ============================================================================
-- APPingos — A versão nova se anuncia.
--
-- O app passou a ser versionado, e cada release traz um título e uma descrição
-- do que chegou (`app/changelog.ts`). Falta a parte que ninguém precisa ir
-- procurar: o aviso na caixa de quem usa.
--
-- Isto NÃO substitui o toast de "nova versão disponível" do service worker (ver
-- o comentário do `pwa` em nuxt.config.ts). Os dois falam de coisas diferentes,
-- e é por isso que os dois existem:
--
--   * o toast é sobre o BUILD daquele navegador — "o que você tem aberto está
--     velho, recarregue". Nasce no client, porque só ele sabe qual service
--     worker baixou, e não faria sentido como linha no banco.
--   * isto aqui é sobre o PRODUTO — "chegou o gráfico de barras do mês". Nasce
--     no servidor, é igual para as duas pessoas, tem estado de lida, e continua
--     na caixa para quem só abrir o app no fim de semana.
--
-- COMO UM RELEASE ANUNCIA. `npm run release 1.1.0 "Título" "Descrição"` gera uma
-- migration de uma linha:
--
--     select public.anunciar_versao('1.1.0', 'Título', 'Descrição');
--
-- Ou seja: o anúncio acontece no `supabase db push` do deploy, e fica versionado
-- no git junto do código que ele descreve. Não é cron, não é gatilho de tabela,
-- não é botão de admin — é o mesmo passo que já existe para publicar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Anunciar duas vezes é o mesmo que anunciar uma
-- ----------------------------------------------------------------------------

/*
  O `db push` pode ser repetido, um `db reset` reaplica tudo, e um deploy pela
  metade pode ser retomado — em nenhum desses casos a pessoa pode receber o mesmo
  release duas vezes. Como nos lembretes do cron, a garantia é o índice (que vale
  inclusive contra duas execuções simultâneas), não um `if not exists` na função.

  A chave é a VERSÃO, e não a data: republicar a v1.1.0 é o mesmo anúncio, e um
  segundo `select anunciar_versao('1.1.0', ...)` não deve virar linha nova.
*/
create unique index notificacao_versao_unica_idx
  on public.notificacao (user_id, (dados ->> 'versao'))
  where tipo = 'app_atualizado';

-- ----------------------------------------------------------------------------
-- O anúncio
-- ----------------------------------------------------------------------------

/*
  TODO MUNDO recebe, e não os membros de um espaço: a versão nova não pertence a
  espaço nenhum. Daí `space_id` nulo — a forma que a tabela já tem de dizer
  "notificação da conta", a mesma do lembrete semanal de filmes.

  Sem `notificar()` pelo mesmo motivo do cron: aqui não existe ator. Ninguém do
  casal causou este evento, e o motor recusa ator nulo justamente para que uma
  ausência dessas seja deliberada e visível, como é aqui. O preço é repetir a
  checagem de preferência abaixo, e ele é aceitável — são cinco linhas.

  `titulo` e `descricao` vão gravados em `dados`, como todo o resto do motor
  grava snapshot: o aviso de duas versões atrás precisa continuar dizendo o que
  AQUELA versão trouxe, mesmo depois de o changelog do build ter seguido adiante.
  Quem monta a frase é `textoDaNotificacao`, em
  supabase/functions/_shared/notificacoes.ts.

  Quem se cadastrar depois NÃO recebe o anúncio retroativo: para essa pessoa nada
  "chegou" — o app já nasceu assim para ela. O histórico dela é `/novidades`.
*/
create function public.anunciar_versao(
  p_versao    text,
  p_titulo    text,
  p_descricao text
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total int;
begin
  /*
    O formato é conferido aqui porque este é o único lugar por onde a versão
    entra no banco. `formatarVersao` no client devolve string vazia para o que
    não casa, e uma notificação com título "Atualização do APPingos" sem número
    seria um erro silencioso — descoberto pela pessoa, não pelo deploy.
  */
  if p_versao is null or p_versao !~ '^\d+\.\d+\.\d+$' then
    raise exception 'anunciar_versao: versão inválida (%) — esperado MAIOR.MENOR.CORRECAO', p_versao;
  end if;

  if coalesce(btrim(p_titulo), '') = '' then
    raise exception 'anunciar_versao(%): título vazio', p_versao;
  end if;

  insert into public.notificacao (user_id, space_id, tipo, dados, rota)
  select
    u.id,
    null,
    'app_atualizado',
    jsonb_build_object(
      'versao',    p_versao,
      'titulo',    btrim(p_titulo),
      'descricao', coalesce(btrim(p_descricao), '')
    ),
    '/novidades'
  from auth.users u
  where u.deleted_at is null
    and not exists (
      select 1 from public.notificacao_preferencia p
      where p.user_id = u.id and p.tipo = 'app_atualizado' and not p.ativo
    )
  on conflict do nothing;

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

-- Não é chamável pela API: quem chama é a migration do release, com a conexão de
-- migração. Exposta a `authenticated`, ela seria um jeito de qualquer pessoa
-- logada escrever texto arbitrário na caixa de todos os usuários do app.
revoke all on function public.anunciar_versao(text, text, text) from public, anon, authenticated;
