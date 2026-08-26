-- ============================================================================
-- APPingos — Notificações da memória da viagem.
--
-- Dois tipos novos, e o motor não muda: ele só ganha clientes. Um vem do
-- calendário (a viagem acabou ontem) e outro de uma ação (alguém fechou o
-- documento), então um é cron e o outro é gatilho — a mesma divisão que já
-- separa `viagem_perto` de `roteiro_editado`.
--
-- `cron.schedule` RODA EM UTC, como diz o cabeçalho de
-- 20260811230612_notificacoes_cron.sql. O horário abaixo já está convertido.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Idempotência
-- ----------------------------------------------------------------------------

/*
  Índice próprio, sem tocar no `notificacao_lembrete_unico_idx` existente: um
  índice parcial não se estende sem recriar, e recriar o de lá para caber mais um
  tipo mexeria na garantia de dois lembretes que já estão no ar.

  `chave` é só o `roteiro_id` — o convite para registrar a memória é UM por
  viagem, não um por dia. Diferente de `viagem_perto`, cuja chave é
  `<roteiro>:<dias>` porque o aviso de 7 dias e o de 1 dia são eventos distintos
  sobre o mesmo roteiro.
*/
create unique index notificacao_memoria_unica_idx
  on public.notificacao (user_id, tipo, (dados ->> 'chave'))
  where tipo = 'viagem_terminou';

-- ----------------------------------------------------------------------------
-- A viagem que acabou
-- ----------------------------------------------------------------------------

/*
  "Contem como foi" — o convite que abre o módulo de memória.

  Três pontos precisam sair certos, e os três já custaram caro no cron irmão:

  1. `= current_date - 1`, e NÃO `< current_date`. Um `<` faria a primeira
     execução após o deploy notificar de uma vez todas as viagens passadas do
     histórico — dezenas de e-mails sobre passeios de meses atrás. A janela
     estrita é o que impede a enxurrada retroativa, e é o motivo de esta linha
     não ser um filtro "razoável" e sim uma igualdade.

  2. SEM `notificar()`, pela mesma razão documentada no cron existente: aqui não
     há ator — ninguém causou a data de ontem chegar —, e o motor recusa ator
     nulo de propósito. Todo mundo do espaço recebe, INCLUSIVE quem criou o
     roteiro: "a viagem acabou" aconteceu para os dois.

  3. Roteiro SECRETO não entra. É a verificação de sempre do módulo: o `nome` vai
     no `dados`, e um roteiro que ainda não foi revelado não pode ter o nome
     gravado numa linha que o outro membro lê.

  E o `not exists` na memória: quem já começou a escrever não precisa de convite.
  Ele também é o que faz uma reexecução na mão ser inócua para as viagens já
  atendidas, além do índice acima.
*/
create function public.avisar_viagens_concluidas()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total int;
begin
  insert into public.notificacao (user_id, space_id, tipo, dados, entidade, entidade_id, rota)
  select
    m.user_id,
    r.space_id,
    'viagem_terminou',
    jsonb_build_object(
      'chave',    r.id::text,
      'nome',     r.nome,
      'data_fim', coalesce(r.data_fim, r.data_inicio)
    ),
    'roteiro',
    r.id,
    '/viagens/' || r.id || '/memoria'
  from public.roteiro r
  join public.membership m on m.space_id = r.space_id
  where r.visibilidade = 'compartilhado'
    and coalesce(r.data_fim, r.data_inicio) = current_date - 1
    and not exists (
      select 1 from public.memoria mem where mem.roteiro_id = r.id
    )
    and not exists (
      select 1 from public.notificacao_preferencia p
      where p.user_id = m.user_id and p.tipo = 'viagem_terminou' and not p.ativo
    )
  on conflict do nothing;

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

-- 9h de Brasília, todo dia — o mesmo horário do aviso de viagem próxima.
select cron.schedule(
  'appingos-viagens-concluidas',
  '0 12 * * *',
  $$select public.avisar_viagens_concluidas()$$
);

-- ----------------------------------------------------------------------------
-- A memória fechada
-- ----------------------------------------------------------------------------

/*
  Aqui HÁ ator: alguém apertou "Concluir". Então passa por `notificar()` como
  todo gatilho normal, e quem fechou não recebe aviso da própria ação.

  O gatilho é `after update of concluida_em`, com a transição nula → preenchida
  na cláusula WHEN. Reabrir e fechar de novo avisa outra vez, e é o
  comportamento certo: a segunda vez que o documento fica pronto é uma novidade
  para quem não estava olhando.

  O roteiro secreto se protege sozinho — `pode_ver_roteiro` já impediria a outra
  pessoa de chegar até aqui —, mas a checagem é explícita pelo mesmo motivo de
  `notificar_roteiro()`: esta é a linha que separa uma surpresa guardada de uma
  surpresa estragada, e ela não deveria depender de quem lê a migration lembrar
  que a RLS existe.
*/
create function public.notificar_memoria_pronta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_roteiro public.roteiro;
begin
  select * into v_roteiro from public.roteiro r where r.id = new.roteiro_id;

  if v_roteiro.id is null or v_roteiro.visibilidade <> 'compartilhado' then
    return new;
  end if;

  perform public.notificar(
    p_space       => v_roteiro.space_id,
    p_tipo        => 'memoria_pronta',
    p_ator        => coalesce(auth.uid(), new.criada_por),
    p_dados       => jsonb_build_object(
                       'nome', v_roteiro.nome,
                       'nota', new.nota
                     ),
    p_entidade    => 'roteiro',
    p_entidade_id => v_roteiro.id,
    p_rota        => '/viagens/' || v_roteiro.id || '/memoria'
  );

  return new;
end;
$$;

create trigger memoria_notificar_pronta
  after update of concluida_em on public.memoria
  for each row
  when (old.concluida_em is null and new.concluida_em is not null)
  execute function public.notificar_memoria_pronta();

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

revoke all on function public.avisar_viagens_concluidas() from public, anon, authenticated;
revoke all on function public.notificar_memoria_pronta()  from public, anon, authenticated;
