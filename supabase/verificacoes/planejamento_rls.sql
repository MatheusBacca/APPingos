-- ============================================================================
-- Verificação das policies do Planejamento financeiro, com três pessoas.
--
-- Não é migration e não roda sozinho: é o roteiro de "dois usuários no Studio"
-- que o README pede para toda policy nova, escrito para rodar de uma vez contra o
-- banco LOCAL. Tudo acontece numa transação que termina em ROLLBACK — nada fica.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/verificacoes/planejamento_rls.sql
--
-- Termina com "planejamento_rls: tudo certo". Qualquer falha para no ponto, com a
-- mensagem "FALHOU: ...".
--
-- Ana e Bia dividem o espaço "Nós". Caio é de fora — divide espaço com ninguém.
-- A invariante central, checada de vários lados:
--
--   A renda de uma pessoa nunca é legível por outra sem um compartilhamento
--   explícito para um espaço em comum.
-- ============================================================================

begin;

-- ---- Ajudantes --------------------------------------------------------------

create function pg_temp.como(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.esperar(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FALHOU: %', p_msg;
  end if;
end;
$$;

-- Executa o SQL e exige que ele seja RECUSADO (por RLS, CHECK ou gatilho).
create function pg_temp.recusa(p_sql text, p_msg text) returns void language plpgsql as $$
declare
  v_linhas int;
begin
  begin
    execute p_sql;
    get diagnostics v_linhas = row_count;
  exception when others then
    return;
  end;
  -- Um UPDATE/DELETE barrado pela RLS não erra: só não atinge linha nenhuma.
  if v_linhas = 0 and p_sql ~* '^\s*(update|delete)' then
    return;
  end if;
  raise exception 'FALHOU: deveria ter recusado — %', p_msg;
end;
$$;

grant execute on function pg_temp.como(uuid), pg_temp.esperar(boolean, text), pg_temp.recusa(text, text)
  to authenticated;

-- ---- Cenário (como postgres, sem RLS) ----------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@teste.local',  '{"nome":"Ana"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bia@teste.local',  '{"nome":"Bia"}'),
  ('00000000-0000-0000-0000-00000000000c', 'caio@teste.local', '{"nome":"Caio"}');

insert into public.space (id, tipo, nome) values
  ('00000000-0000-0000-0000-0000000000c1', 'casal', 'Nós');

insert into public.membership (space_id, user_id, papel) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'dono'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000b', 'membro');

create temp table ids on commit drop as
select
  '00000000-0000-0000-0000-00000000000a'::uuid as ana,
  '00000000-0000-0000-0000-00000000000b'::uuid as bia,
  '00000000-0000-0000-0000-00000000000c'::uuid as caio,
  '00000000-0000-0000-0000-0000000000c1'::uuid as nos,
  (select m.space_id from public.membership m join public.space s on s.id = m.space_id
    where m.user_id = '00000000-0000-0000-0000-00000000000a' and s.tipo = 'pessoal') as pessoal_ana,
  (select m.space_id from public.membership m join public.space s on s.id = m.space_id
    where m.user_id = '00000000-0000-0000-0000-00000000000b' and s.tipo = 'pessoal') as pessoal_bia;

grant select on ids to authenticated;

set local role authenticated;

-- ============================================================================
-- 1. Salário privado por padrão
-- ============================================================================

select pg_temp.como((select ana from ids));
insert into public.renda (user_id, valor_liquido, recebimento_tipo, recebimento_dia)
values ((select ana from ids), 5000, 'dia_util', 5);

select pg_temp.esperar((select count(*) = 1 from public.renda), 'Ana lê o próprio salário');

select pg_temp.recusa(
  $$insert into public.renda (user_id, valor_liquido, recebimento_tipo, recebimento_dia)
    values ('00000000-0000-0000-0000-00000000000b', 1, 'dia_fixo', 5)$$,
  'Ana grava salário em nome da Bia');

select pg_temp.recusa(
  $$insert into public.renda (user_id, valor_liquido, recebimento_tipo, recebimento_dia)
    values ('00000000-0000-0000-0000-00000000000a', 1, 'dia_util', 30)$$,
  '30º dia útil não existe');

select pg_temp.como((select bia from ids));
select pg_temp.esperar((select count(*) = 0 from public.renda), 'Bia NÃO lê o salário da Ana sem compartilhamento');
select pg_temp.recusa($$update public.renda set valor_liquido = 1 where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  'Bia altera o salário da Ana');

select pg_temp.como((select caio from ids));
select pg_temp.esperar((select count(*) = 0 from public.renda), 'Caio NÃO lê o salário da Ana');

-- ============================================================================
-- 2. Contribuição: o casal vê o valor, nunca o percentual sem compartilhamento
-- ============================================================================

select pg_temp.como((select ana from ids));
insert into public.contribuicao (space_id, user_id, modo, valor)
values ((select nos from ids), (select ana from ids), 'percentual', 30);

select pg_temp.recusa(
  $$insert into public.contribuicao (space_id, user_id, modo, valor)
    select pessoal_ana, ana, 'valor', 100 from ids$$,
  'contribuição no espaço pessoal');

select pg_temp.recusa(
  $$insert into public.contribuicao (space_id, user_id, modo, valor)
    select nos, ana, 'percentual', 130 from ids$$,
  'percentual acima de 100 (já existe a linha, mas o CHECK vem antes)');

select pg_temp.esperar(
  (select valor_efetivo = 1500 and percentual = 30
     from public.contribuicoes_do_espaco((select nos from ids)) where user_id = (select ana from ids)),
  'Ana vê o próprio valor efetivo e o percentual');

select pg_temp.como((select bia from ids));
select pg_temp.esperar((select count(*) = 0 from public.contribuicao),
  'Bia NÃO lê a linha crua da contribuição da Ana');

select pg_temp.esperar(
  (select valor_efetivo = 1500 and percentual is null
     from public.contribuicoes_do_espaco((select nos from ids)) where user_id = (select ana from ids)),
  'Bia vê R$ 1.500 da Ana, sem o percentual');

insert into public.contribuicao (space_id, user_id, modo, valor)
values ((select nos from ids), (select bia from ids), 'valor', 1200);

select pg_temp.esperar(
  (select sum(valor_efetivo) = 2700 from public.contribuicoes_do_espaco((select nos from ids))),
  'valor central = 1.500 + 1.200');

select pg_temp.esperar(
  (select percentual is null from public.contribuicoes_do_espaco((select nos from ids))
    where user_id = (select bia from ids)),
  'Bia sem salário cadastrado: percentual derivado é nulo');

select pg_temp.como((select caio from ids));
select pg_temp.recusa($$select * from public.contribuicoes_do_espaco('00000000-0000-0000-0000-0000000000c1')$$,
  'Caio lê as contribuições de um espaço de que não é membro');

-- ============================================================================
-- 3. Compartilhar abre o salário só para quem divide AQUELE espaço
-- ============================================================================

select pg_temp.como((select bia from ids));
select pg_temp.recusa(
  $$insert into public.renda_compartilhamento (user_id, space_id)
    select ana, nos from ids$$,
  'Bia compartilha o salário da Ana');

select pg_temp.recusa(
  $$insert into public.renda_compartilhamento (user_id, space_id)
    select bia, pessoal_ana from ids$$,
  'Bia compartilha com um espaço de que não é membro');

select pg_temp.como((select ana from ids));
insert into public.renda_compartilhamento (user_id, space_id) values ((select ana from ids), (select nos from ids));

select pg_temp.como((select bia from ids));
select pg_temp.esperar((select count(*) = 1 from public.renda where user_id = (select ana from ids)),
  'Bia lê o salário da Ana depois do compartilhamento');
select pg_temp.esperar(
  (select percentual = 30 from public.contribuicoes_do_espaco((select nos from ids))
    where user_id = (select ana from ids)),
  'com o salário aberto, Bia vê o percentual da Ana');
select pg_temp.esperar((select count(*) = 1 from public.renda_compartilhamento),
  'Bia vê que o salário da Ana está aberto no Nós');
select pg_temp.recusa($$delete from public.renda_compartilhamento where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  'Bia desfaz o compartilhamento da Ana');

select pg_temp.como((select caio from ids));
select pg_temp.esperar((select count(*) = 0 from public.renda), 'Caio continua sem ler o salário da Ana');
select pg_temp.esperar((select count(*) = 0 from public.renda_compartilhamento), 'Caio não vê compartilhamentos');

-- ============================================================================
-- 4. Salário recebido: mesma visibilidade
-- ============================================================================

select pg_temp.como((select bia from ids));
insert into public.renda (user_id, valor_liquido, recebimento_tipo, recebimento_dia)
values ((select bia from ids), 4000, 'dia_fixo', 10);
insert into public.renda_recebida (user_id, competencia, valor, recebido_em)
values ((select bia from ids), '2026-11-01', 4000, '2026-11-10');

select pg_temp.recusa(
  $$insert into public.renda_recebida (user_id, competencia, valor) values ('00000000-0000-0000-0000-00000000000a', '2026-11-01', 1)$$,
  'Bia marca o salário da Ana como recebido');

select pg_temp.como((select ana from ids));
select pg_temp.esperar((select count(*) = 0 from public.renda_recebida where user_id = (select bia from ids)),
  'Ana NÃO vê o salário recebido da Bia (Bia não compartilhou)');
select pg_temp.esperar((select count(*) = 0 from public.renda where user_id = (select bia from ids)),
  'Ana NÃO vê o salário da Bia');

-- Bia abre o salário no Nós e depois SAI do espaço: tudo volta a fechar.
select pg_temp.como((select bia from ids));
insert into public.renda_compartilhamento (user_id, space_id) values ((select bia from ids), (select nos from ids));

select pg_temp.como((select ana from ids));
select pg_temp.esperar((select count(*) = 1 from public.renda_recebida where user_id = (select bia from ids)),
  'Ana vê o salário recebido da Bia depois do compartilhamento');

select pg_temp.como((select bia from ids));
delete from public.membership where space_id = (select nos from ids) and user_id = (select bia from ids);

select pg_temp.como((select ana from ids));
select pg_temp.esperar((select count(*) = 0 from public.renda where user_id = (select bia from ids)),
  'Bia saiu do Nós: Ana deixa de ler o salário dela');
select pg_temp.esperar(
  (select count(*) = 0 from public.contribuicoes_do_espaco((select nos from ids)) where user_id = (select bia from ids)),
  'Bia saiu do Nós: a contribuição dela sai do valor central');

reset role;
select pg_temp.esperar(
  (select count(*) = 0 from public.renda_compartilhamento where user_id = (select bia from ids)),
  'o gatilho de saída apagou o compartilhamento da Bia');
select pg_temp.esperar(
  (select count(*) = 0 from public.contribuicao where user_id = (select bia from ids)),
  'o gatilho de saída apagou a contribuição da Bia');

-- Bia volta ao Nós (como postgres, que é o que um convite faz por dentro).
insert into public.membership (space_id, user_id, papel)
values ((select nos from ids), (select bia from ids), 'membro');
set local role authenticated;

select pg_temp.como((select ana from ids));
select pg_temp.esperar((select count(*) = 0 from public.renda where user_id = (select bia from ids)),
  'Bia voltou: o salário dela NÃO reabre sozinho');

-- ============================================================================
-- 5. Metas: a pessoal some para o outro; aportes, resgates e o estado
-- ============================================================================

select pg_temp.como((select ana from ids));
select public.criar_meta((select pessoal_ana from ids), 'Presente da Bia', 300);

select pg_temp.como((select bia from ids));
select pg_temp.esperar((select count(*) = 0 from public.meta), 'Bia NÃO vê a meta pessoal da Ana');

select pg_temp.como((select ana from ids));
create temp table meta_casal on commit drop as
select public.criar_meta((select nos from ids), 'Viagem', 1000, '2027-06-30') as id;
grant select on meta_casal to authenticated;

select pg_temp.como((select bia from ids));
select pg_temp.esperar((select count(*) = 1 from public.meta), 'Bia vê a meta do casal');
select public.registrar_aporte((select id from meta_casal), 400);

select pg_temp.recusa(
  $$insert into public.meta_aporte (meta_id, user_id, valor)
    select m.id, ids.ana, 50 from meta_casal m, ids$$,
  'Bia aporta em nome da Ana');

select pg_temp.recusa($$select public.registrar_aporte((select id from meta_casal), -500)$$,
  'resgatar mais do que o guardado');

select pg_temp.como((select caio from ids));
select pg_temp.recusa($$select public.registrar_aporte((select id from meta_casal), 10)$$,
  'Caio aporta numa meta de outro espaço');
select pg_temp.esperar((select count(*) = 0 from public.meta_aporte), 'Caio não vê os aportes');

select pg_temp.como((select ana from ids));
select public.registrar_aporte((select id from meta_casal), 600);
select pg_temp.esperar(
  (select estado = 'cumprida' and cumprida_em is not null from public.meta where id = (select id from meta_casal)),
  'o aporte que alcança o alvo cumpre a meta');

-- Pins `objetivo_cumprido` (20261112160000_metas_pins.sql): a meta do casal com prazo
-- rende para os dois membros; uma meta sem prazo não rende nada.
reset role;
select pg_temp.esperar(
  (select count(*) = 2 from public.pin
    where regra = 'objetivo_cumprido' and entidade_id = (select id from meta_casal)),
  'meta do casal cumprida no prazo: Pins para os dois');
set local role authenticated;

create temp table meta_sem_prazo on commit drop as
select public.criar_meta((select pessoal_ana from ids), 'Fundo de reserva', 50) as id;
grant select on meta_sem_prazo to authenticated;
select public.registrar_aporte((select id from meta_sem_prazo), 50);

reset role;
select pg_temp.esperar(
  (select estado = 'cumprida' from public.meta where id = (select id from meta_sem_prazo)),
  'a meta sem prazo também se cumpre');
select pg_temp.esperar(
  (select count(*) = 0 from public.pin where regra = 'objetivo_cumprido' and entidade_id = (select id from meta_sem_prazo)),
  'meta sem prazo não rende Pins');
set local role authenticated;
select pg_temp.como((select ana from ids));

select pg_temp.recusa($$select public.registrar_aporte((select id from meta_casal), 10)$$,
  'guardar numa meta cumprida');
select public.registrar_aporte((select id from meta_casal), -1000);
select pg_temp.esperar(
  (select estado = 'cumprida' from public.meta where id = (select id from meta_casal)),
  'resgatar depois de cumprir não reabre a meta');
select pg_temp.esperar(
  (select sum(valor) = 0 from public.meta_aporte where meta_id = (select id from meta_casal)),
  'progresso é a soma dos aportes');

-- 20261112160100: apagar o aporte de 600 deixaria −600 guardado (sobrou o resgate).
select pg_temp.recusa(
  $$delete from public.meta_aporte where meta_id = (select id from meta_casal) and valor = 600$$,
  'apagar aporte que deixa o guardado negativo');

-- Mas apagar a meta inteira leva os aportes juntos, sem esbarrar na trava.
select pg_temp.como((select ana from ids));
delete from public.meta where id = (select id from meta_casal);
reset role;
select pg_temp.esperar(
  (select count(*) = 0 from public.meta_aporte where meta_id = (select id from meta_casal)),
  'apagar a meta apaga os aportes');
set local role authenticated;

-- Interesse que vira meta: a conversão sai na mesma transação.
create temp table interesse_casal on commit drop as
select public.registrar_interesse((select nos from ids), 'Sofá novo') as id;
grant select on interesse_casal to authenticated;

select public.criar_meta((select nos from ids), 'Sofá novo', 2400, null, (select id from interesse_casal));
select pg_temp.esperar(
  (select i.estado = 'convertido' and i.convertido_tipo = 'objetivo' and i.convertido_ref_id = m.id
     from public.interesse i join public.meta m on m.interesse_id = i.id
    where i.id = (select id from interesse_casal)),
  'criar_meta marca o interesse como convertido em objetivo');

-- ============================================================================
-- 6. Mover compra entre gavetas
-- ============================================================================

select pg_temp.como((select ana from ids));
create temp table compra_pessoal on commit drop as
select public.registrar_compra(
  (select pessoal_ana from ids), 'Tênis', 300, '2026-11-05', '2026-11-01', 1,
  (select ana from ids), jsonb_build_array(jsonb_build_object('user_id', (select ana from ids), 'peso', 1))
) as id;
grant select on compra_pessoal to authenticated;

create temp table compra_movida on commit drop as
select public.mover_compra(
  (select id from compra_pessoal), (select nos from ids),
  jsonb_build_array(
    jsonb_build_object('user_id', (select ana from ids), 'peso', 50, 'informado_como', 'percentual'),
    jsonb_build_object('user_id', (select bia from ids), 'peso', 50, 'informado_como', 'percentual'))
) as id;
grant select on compra_movida to authenticated;

select pg_temp.esperar((select count(*) = 0 from public.compra where id = (select id from compra_pessoal)),
  'a compra original sumiu da gaveta pessoal');
select pg_temp.esperar(
  (select c.space_id = (select nos from ids) and c.pago_por = (select ana from ids)
     from public.compra c where c.id = (select id from compra_movida)),
  'a compra nova está no Nós, paga pela Ana');

select pg_temp.como((select bia from ids));
select pg_temp.esperar(
  (select count(*) = 2 from public.compra_participante where compra_id = (select id from compra_movida)),
  'Bia vê a compra movida com o rateio 50/50');

-- Bia é membro (não admin) e não lançou a compra: mover para o pessoal dela é recusado
-- INTEIRO — a cópia no destino não pode sobrar.
select pg_temp.recusa(
  $$select public.mover_compra(
      (select id from compra_movida), (select pessoal_bia from ids),
      jsonb_build_array(jsonb_build_object('user_id', (select bia from ids), 'peso', 1)))$$,
  'Bia move uma compra que não lançou');
select pg_temp.esperar(
  (select count(*) = 0 from public.compra c where c.space_id = (select pessoal_bia from ids)),
  'a recusa não deixou cópia no pessoal da Bia');

select pg_temp.como((select caio from ids));
select pg_temp.recusa(
  $$select public.mover_compra((select id from compra_movida), (select pessoal_bia from ids), '[]'::jsonb)$$,
  'Caio move compra de um espaço alheio');

-- ============================================================================
-- 7. Meta pessoal compartilhada (20261112160200_meta_compartilhamento.sql)
--
-- Ana empresta a meta pessoal ao Nós. Bia acompanha, só lendo; Caio não vê nada.
-- ============================================================================

select pg_temp.como((select ana from ids));
create temp table meta_bike on commit drop as
select public.criar_meta((select pessoal_ana from ids), 'Bicicleta', 1000, '2027-12-31') as id;
grant select on meta_bike to authenticated;
select public.registrar_aporte((select id from meta_bike), 200);

select pg_temp.como((select bia from ids));
select pg_temp.esperar((select count(*) = 0 from public.meta where id = (select id from meta_bike)),
  'Bia não vê a meta pessoal da Ana antes do compartilhamento');
select pg_temp.recusa($$select public.compartilhar_meta((select id from meta_bike), (select nos from ids))$$,
  'Bia compartilha a meta da Ana');

select pg_temp.como((select ana from ids));
select pg_temp.recusa($$select public.compartilhar_meta((select id from meta_bike), (select pessoal_bia from ids))$$,
  'Ana compartilha com um espaço de que não participa');
create temp table meta_do_nos on commit drop as
select public.criar_meta((select nos from ids), 'Geladeira', 3000) as id;
grant select on meta_do_nos to authenticated;
select pg_temp.recusa($$select public.compartilhar_meta((select id from meta_do_nos), (select pessoal_ana from ids))$$,
  'compartilhar uma meta do casal');

select public.compartilhar_meta((select id from meta_bike), (select nos from ids));

select pg_temp.como((select bia from ids));
select pg_temp.esperar((select count(*) = 1 from public.meta where id = (select id from meta_bike)),
  'Bia vê a meta compartilhada');
select pg_temp.esperar((select count(*) = 1 from public.meta_aporte where meta_id = (select id from meta_bike)),
  'Bia vê os aportes da meta compartilhada');
select pg_temp.esperar((select count(*) = 1 from public.meta_compartilhamento where meta_id = (select id from meta_bike)),
  'Bia vê onde a meta está compartilhada');

-- Só lê.
select pg_temp.recusa($$update public.meta set titulo = 'Moto' where id = (select id from meta_bike)$$,
  'Bia edita a meta compartilhada');
select pg_temp.recusa($$update public.meta set estado = 'abandonada' where id = (select id from meta_bike)$$,
  'Bia abandona a meta compartilhada');
select pg_temp.recusa($$select public.registrar_aporte((select id from meta_bike), 50)$$,
  'Bia aporta na meta compartilhada');
select pg_temp.recusa(
  $$insert into public.meta_aporte (meta_id, user_id, valor) select m.id, ids.bia, 50 from meta_bike m, ids$$,
  'Bia insere aporte direto na meta compartilhada');
select pg_temp.recusa($$delete from public.meta_aporte where meta_id = (select id from meta_bike)$$,
  'Bia apaga aporte da meta compartilhada');
select pg_temp.recusa($$delete from public.meta where id = (select id from meta_bike)$$,
  'Bia apaga a meta compartilhada');
select pg_temp.recusa($$select public.descompartilhar_meta((select id from meta_bike), (select nos from ids))$$,
  'Bia descompartilha a meta da Ana');

-- A projeção do casal soma aportes de metas DO casal: a compartilhada não entra.
select pg_temp.esperar(
  (select count(*) = 0 from public.meta_aporte a join public.meta m on m.id = a.meta_id
    where m.space_id = (select nos from ids) and a.meta_id = (select id from meta_bike)),
  'o aporte da meta compartilhada fica fora da projeção do casal');

select pg_temp.recusa(
  $$insert into public.meta_comemoracao (meta_id, user_id) select m.id, ids.bia from meta_bike m, ids$$,
  'comemorar meta que ainda não foi cumprida');

select pg_temp.como((select caio from ids));
select pg_temp.esperar((select count(*) = 0 from public.meta where id = (select id from meta_bike)),
  'Caio não vê a meta compartilhada com um espaço alheio');
select pg_temp.esperar((select count(*) = 0 from public.meta_aporte where meta_id = (select id from meta_bike)),
  'Caio não vê os aportes');

-- Ana cumpre: o Nós é avisado, e só quem não é a Ana.
select pg_temp.como((select ana from ids));
select public.registrar_aporte((select id from meta_bike), 800);

reset role;
select pg_temp.esperar(
  (select count(*) = 1 from public.notificacao
    where tipo = 'meta_cumprida' and entidade_id = (select id from meta_bike) and user_id = (select bia from ids)),
  'Bia recebe o aviso de meta cumprida');
select pg_temp.esperar(
  (select count(*) = 0 from public.notificacao
    where tipo = 'meta_cumprida' and entidade_id = (select id from meta_bike) and user_id <> (select bia from ids)),
  'ninguém além da Bia recebe o aviso (nem a Ana, nem o Caio)');
set local role authenticated;

select pg_temp.como((select bia from ids));
insert into public.meta_comemoracao (meta_id, user_id) values ((select id from meta_bike), (select bia from ids));

select pg_temp.como((select caio from ids));
select pg_temp.recusa(
  $$insert into public.meta_comemoracao (meta_id, user_id) select m.id, ids.caio from meta_bike m, ids$$,
  'Caio comemora meta que não vê');

reset role;
select pg_temp.esperar(
  (select count(*) = 1 from public.notificacao
    where tipo = 'meta_comemorada' and entidade_id = (select id from meta_bike) and user_id = (select ana from ids)),
  'Ana recebe o aviso de que a Bia comemorou');
set local role authenticated;

-- Descompartilhar fecha de novo; sair do espaço também, e voltar não reabre.
select pg_temp.como((select ana from ids));
select public.descompartilhar_meta((select id from meta_bike), (select nos from ids));
select pg_temp.como((select bia from ids));
select pg_temp.esperar((select count(*) = 0 from public.meta where id = (select id from meta_bike)),
  'descompartilhada, a Bia deixa de ver');
select pg_temp.esperar((select count(*) = 0 from public.meta_comemoracao where meta_id = (select id from meta_bike)),
  'descompartilhada, a comemoração some junto da leitura');

select pg_temp.como((select ana from ids));
select public.compartilhar_meta((select id from meta_bike), (select nos from ids));
delete from public.membership where space_id = (select nos from ids) and user_id = (select ana from ids);

reset role;
select pg_temp.esperar(
  (select count(*) = 0 from public.meta_compartilhamento where meta_id = (select id from meta_bike)),
  'Ana saiu do Nós: o compartilhamento foi apagado');

select 'planejamento_rls: tudo certo' as resultado;

rollback;
