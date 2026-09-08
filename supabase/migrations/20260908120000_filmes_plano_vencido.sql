-- ============================================================================
-- APPingos — O plano que venceu volta para "Disponível".
--
-- "Queremos ver na sexta" é uma promessa com data. Quando a sexta passa e
-- ninguém move o filme para "Assistindo" ou "Assistidos", o app fica com um
-- plano morto ocupando o grupo mais nobre da agenda — e, pior, com um convite
-- pendente propondo uma data que já ficou para trás. Depois de alguns meses,
-- "Queremos ver" vira o cemitério das sextas que não aconteceram.
--
-- Dois dias depois da data marcada, então, o plano é desfeito: `planejado_para`
-- volta a ser nulo e o item reaparece em "Disponível" — COM TODO MUNDO que o
-- tinha marcado, porque `status` continua 'quero' e é ele que carrega o
-- interesse. Ninguém perde a vontade de ver o filme; perde-se só a data.
--
-- Três decisões, e cada uma tem um jeito conhecido de dar errado:
--
--   1. `= current_date - 2`, e NÃO `<= current_date - 2`. É a lição de
--      `conceder_pins_viagens_concluidas()` e de `avisar_viagens_concluidas()`:
--      um `<=` faria a primeira execução após o deploy desfazer de uma vez todos
--      os planos vencidos do histórico e despejar uma enxurrada de avisos sobre
--      sextas de meses atrás. A janela estrita é o que impede isso.
--   2. SÓ `status = 'quero'`. É exatamente o que `planejar_filme()` grava, então
--      é o único estado em que um `planejado_para` significa "plano em pé". Quem
--      abandonou o filme com uma data marcada não é ressuscitado como "quero
--      ver" por um job noturno.
--   3. O CONVITE PENDENTE MORRE JUNTO. Um convite sobrevivente proporia uma data
--      no passado, e aceitá-lo regravaria essa data como plano — o app
--      remarcaria sozinho uma sexta que já passou.
--
-- Só filmes e séries. `rating` é a mesma tabela de Livros e Músicas, e nem toda
-- mídia usa `planejado_para` com este significado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Idempotência do aviso
-- ----------------------------------------------------------------------------

/*
  Mesmo desenho de `notificacao_lembrete_unico_idx`: rodar a tarefa duas vezes
  tem que ser inócuo, e a garantia é o índice, não um `if not exists` dentro da
  função — que não protegeria contra duas execuções simultâneas nem contra
  alguém disparando na mão para testar.

  A chave é `<entry>:<data marcada>`: o mesmo filme pode ser remarcado e vencer
  de novo, e isso é um evento novo, não o mesmo.
*/
create unique index notificacao_plano_expirado_unico_idx
  on public.notificacao (user_id, tipo, (dados ->> 'chave'))
  where tipo = 'plano_expirado';

-- ----------------------------------------------------------------------------
-- A tarefa
-- ----------------------------------------------------------------------------

/*
  Sem `notificar()`: aqui não há ator — ninguém causou este evento, foi o
  calendário — e o motor recusa ator nulo justamente para que uma ausência
  dessas seja deliberada e visível, como é aqui, e não um esquecimento num
  gatilho. Mesmo caminho de `avisar_viagens_proximas()`.

  E o aviso vai só para QUEM TINHA O PLANO, não para o espaço inteiro. É o
  oposto da viagem que se aproxima, e por um motivo: a data da viagem chega para
  os dois, mas um filme marcado por uma pessoa só é um plano dela. Avisar quem
  nunca tocou naquele item seria contar uma notícia sobre uma promessa que ela
  não fez.
*/
create function public.devolver_planos_vencidos()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_data  date := current_date - 2;
  v_total int  := 0;
  v_linha record;
begin
  for v_linha in
    update public.rating r
       set planejado_para = null
      from public.entry e
      join public.media_item mi on mi.id = e.media_item_id
     where r.entry_id = e.id
       and mi.tipo in ('filme', 'serie')
       and r.planejado_para = v_data
       and r.status = 'quero'
       and r.visto_em is null
    returning r.entry_id, r.user_id, e.space_id, mi.titulo, mi.tipo
  loop
    -- Ver a decisão 3 no cabeçalho: convite pendente com data vencida é um
    -- convite que remarcaria o passado se alguém o aceitasse.
    delete from public.convite_filme
     where entry_id = v_linha.entry_id
       and respondido_em is null;

    if not exists (
      select 1 from public.notificacao_preferencia p
      where p.user_id = v_linha.user_id
        and p.tipo = 'plano_expirado'
        and not p.ativo
    ) then
      insert into public.notificacao (
        user_id, space_id, tipo, dados, entidade, entidade_id, rota
      )
      values (
        v_linha.user_id,
        v_linha.space_id,
        'plano_expirado',
        jsonb_build_object(
          'chave',          v_linha.entry_id::text || ':' || to_char(v_data, 'YYYY-MM-DD'),
          'titulo',         v_linha.titulo,
          'tipo_midia',     v_linha.tipo,
          'planejado_para', v_data,
          'space_nome',     (select s.nome from public.space s where s.id = v_linha.space_id)
        ),
        'entry',
        v_linha.entry_id,
        '/filmes/' || v_linha.entry_id::text
      )
      on conflict do nothing;
    end if;

    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;

revoke all on function public.devolver_planos_vencidos() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- O agendamento
--
-- `cron.schedule` RODA EM UTC. 12h UTC = 9h de Brasília — o mesmo horário dos
-- outros avisos diários, já convertido. Está escrito aqui porque é o erro
-- clássico deste tipo de código, e o repositório já o documentou duas vezes.
-- ----------------------------------------------------------------------------

select cron.schedule(
  'appingos-planos-vencidos',
  '0 12 * * *',
  $$select public.devolver_planos_vencidos()$$
);
