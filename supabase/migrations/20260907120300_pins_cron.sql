-- ============================================================================
-- APPingos — Pins: a viagem que terminou.
--
-- É o único Pin que não nasce de alguém mexendo numa linha: ninguém "conclui"
-- uma viagem no app, a data é que passa. Mesmo desenho de
-- `avisar_viagens_concluidas()`, e as mesmas três lições dele:
--
--   1. `= current_date - 1`, e NÃO `< current_date`. Um `<` faria a primeira
--      execução após o deploy conceder de uma vez os Pins de todas as viagens
--      passadas do histórico — centenas de Pins e uma enxurrada de notificações
--      sobre passeios de meses atrás. A janela estrita é o que impede isso, e é
--      o motivo de esta linha ser uma igualdade e não um filtro "razoável".
--   2. Roteiro SECRETO não entra. O nome vai no `dados`, e o Pin é lido pelos
--      dois membros.
--   3. `cron.schedule` roda em UTC. 12h UTC = 9h de Brasília — o mesmo horário
--      dos outros avisos diários, já convertido.
--
-- A idempotência aqui não depende do cron: a chave `viagem_concluida:<roteiro>`
-- é única por pessoa, então rodar duas vezes no mesmo dia, ou disparar na mão
-- para testar, é inócuo.
-- ============================================================================

create function public.conceder_pins_viagens_concluidas()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_roteiro record;
  v_total   int := 0;
begin
  for v_roteiro in
    select r.id, r.space_id, r.nome, r.data_inicio, r.data_fim
    from public.roteiro r
    where r.visibilidade = 'compartilhado'
      and coalesce(r.data_fim, r.data_inicio) = current_date - 1
  loop
    v_total := v_total + public.conceder_pins_todos(
      p_space       => v_roteiro.space_id,
      p_regra       => 'viagem_concluida',
      p_chave       => 'viagem_concluida:' || v_roteiro.id::text,
      p_dados       => jsonb_build_object(
                         'nome',     v_roteiro.nome,
                         'data_fim', coalesce(v_roteiro.data_fim, v_roteiro.data_inicio)
                       ),
      p_entidade    => 'roteiro',
      p_entidade_id => v_roteiro.id,
      p_rota        => '/viagens/' || v_roteiro.id
    );
  end loop;

  return v_total;
end;
$$;

revoke all on function public.conceder_pins_viagens_concluidas()
  from public, anon, authenticated;

-- 9h de Brasília, todo dia — junto do aviso "contem como foi".
select cron.schedule(
  'appingos-pins-viagens-concluidas',
  '0 12 * * *',
  $$select public.conceder_pins_viagens_concluidas()$$
);
