-- ============================================================================
-- APPingos — Viagens: o outro membro vê que existe um segredo, e nada além.
--
-- O módulo nasceu com o roteiro secreto INVISÍVEL: a policy `roteiro_select`
-- devolve linha nenhuma para quem não o criou, e com a anon key na mão um
-- `select` cru volta vazio. Isso continua exatamente igual — nada aqui afrouxa
-- aquela policy.
--
-- O que muda é que agora existe um segundo caminho, deliberadamente estreito,
-- que responde UMA pergunta: "estão preparando alguma coisa para mim?". A
-- diferença entre os dois caminhos é o que impede o spoiler:
--
--   roteiro_select        -> a linha inteira, só para quem criou
--   segredos_do_espaco()  -> id, quem e quando, para o resto do espaço
--
-- Por que uma função e não a policy relaxada com a tela borrando o nome: CSS não
-- é privacidade. Se `nome` chegasse ao navegador do outro membro, o devtools
-- entregaria a surpresa inteira em dois cliques. A lista de colunas abaixo É o
-- contrato — o que não está aqui não tem como vazar.
-- ============================================================================

/*
  SECURITY DEFINER pelo mesmo motivo dos `is_space_*`: a função precisa enxergar
  além da RLS de `roteiro` para poder contar o que ela esconde. Quem autoriza é o
  `is_space_member` no WHERE — sem ele, isto seria uma janela para os segredos de
  qualquer espaço.

  `criado_por <> auth.uid()` porque quem criou não precisa de alerta do próprio
  segredo: ele já vê o roteiro de verdade, com nome e paradas.
*/
create function public.segredos_do_espaco(p_space uuid)
returns table (
  id          uuid,
  criado_por  uuid,
  created_at  timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select r.id, r.criado_por, r.created_at
  from public.roteiro r
  where r.space_id = p_space
    and r.visibilidade = 'segredo'
    and r.criado_por <> auth.uid()
    and public.is_space_member(p_space)
  order by r.created_at desc;
$$;

grant execute on function public.segredos_do_espaco(uuid) to authenticated;
