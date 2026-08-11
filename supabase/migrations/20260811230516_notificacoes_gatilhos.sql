-- ============================================================================
-- APPingos — Notificações: os gatilhos, um por módulo.
--
-- Todos chamam `notificar()` e nenhum decide nada por conta própria: quem não
-- recebe (o ator), quem desligou e o que agrupa são regras do motor. O que vive
-- aqui é só o que é do módulo — QUANDO o evento conta como notícia e O QUE vai
-- no snapshot.
--
-- Duas regras valem para o arquivo inteiro:
--
--   1. `coalesce(auth.uid(), <o autor da linha>)`. `auth.uid()` é nulo fora do
--      PostgREST, e `notificar()` recusa ator nulo — de propósito, porque ator
--      nulo notificaria também quem agiu. Cada gatilho é obrigado a saber de
--      quem foi a ação a partir da própria linha.
--   2. Nada aqui grava o nome de um roteiro SECRETO. É a mesma verificação de
--      Viagens: com a anon key da outra conta, `select * from notificacao` não
--      pode devolver texto nenhum sobre a surpresa.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Orçamentos
-- ----------------------------------------------------------------------------

/*
  Editar é ambíguo. Corrigir um acento em "Mercado" não merece um aviso no
  celular de ninguém, então a comparação é campo a campo e só nos quatro que
  mudam o FATO da compra: descrição, valor, parcelas e quem pagou. Categoria e
  competência ficam de fora por enquanto — são arrumação, não novidade.

  `dados` leva a descrição e o valor porque a notificação precisa continuar
  legível depois que a compra for apagada: o snapshot é a linha, não um ponteiro
  para ela.
*/
create function public.notificar_compra()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mudou boolean;
begin
  if tg_op = 'INSERT' then
    perform public.notificar(
      p_space       => new.space_id,
      p_tipo        => 'gasto_novo',
      p_ator        => coalesce(auth.uid(), new.registrado_por),
      p_dados       => jsonb_build_object(
                         'descricao', new.descricao,
                         'valor',     new.valor_total,
                         'parcelas',  new.parcelas
                       ),
      p_entidade    => 'compra',
      p_entidade_id => new.id,
      p_rota        => '/orcamentos'
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_mudou :=
         new.descricao   is distinct from old.descricao
      or new.valor_total is distinct from old.valor_total
      or new.parcelas    is distinct from old.parcelas
      or new.pago_por    is distinct from old.pago_por;

    if not v_mudou then
      return new;
    end if;

    perform public.notificar(
      p_space       => new.space_id,
      p_tipo        => 'gasto_editado',
      p_ator        => coalesce(auth.uid(), new.registrado_por),
      p_dados       => jsonb_build_object(
                         'descricao', new.descricao,
                         'valor',     new.valor_total,
                         'valor_antigo', old.valor_total
                       ),
      p_entidade    => 'compra',
      p_entidade_id => new.id,
      p_rota        => '/orcamentos',
      p_janela      => interval '10 minutes'
    );
    return new;
  end if;

  /*
    DELETE também chega aqui quando o ESPAÇO é excluído: o cascade apaga as
    compras junto. Notificar nesse caso seria avisar sobre um espaço que já não
    existe — e a linha de `notificacao` cairia no cascade logo em seguida, ou
    estouraria a FK. O espaço já foi apagado quando o cascade alcança a compra,
    então a existência dele é o teste.
  */
  if not exists (select 1 from public.space s where s.id = old.space_id) then
    return old;
  end if;

  perform public.notificar(
    p_space       => old.space_id,
    p_tipo        => 'gasto_removido',
    p_ator        => coalesce(auth.uid(), old.registrado_por),
    p_dados       => jsonb_build_object(
                       'descricao', old.descricao,
                       'valor',     old.valor_total
                     ),
    p_entidade    => 'compra',
    p_entidade_id => old.id,
    p_rota        => '/orcamentos'
  );

  return old;
end;
$$;

create trigger compra_notificar
  after insert or update or delete on public.compra
  for each row execute function public.notificar_compra();

/*
  "Orçamento fechado em X" — o pedido original. O total do mês não existe pronto
  em coluna nenhuma: hoje quem soma é o client, em `useResumoOrcamentos`. Aqui a
  soma sai da view `parcela_mensal`, porque uma notificação com "o mês fechou"
  e sem o número não responde a pergunta que ela levanta.

  A view é `security_invoker = on` e, dentro de uma SECURITY DEFINER, roda sem a
  RLS do usuário — ou seja, enxerga o espaço inteiro. É o comportamento desejado
  (o total é do espaço, não a parte de quem marcou), e o mesmo cuidado de
  `segredos_do_espaco()`: quem autoriza é o gatilho estar preso à linha que
  acabou de ser gravada naquele espaço.
*/
create function public.notificar_acerto_mes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric;
begin
  select coalesce(sum(pm.valor), 0) into v_total
  from public.parcela_mensal pm
  where pm.space_id = new.space_id
    and pm.competencia = new.competencia;

  perform public.notificar(
    p_space       => new.space_id,
    p_tipo        => 'mes_fechado',
    p_ator        => coalesce(auth.uid(), new.pago_por),
    p_dados       => jsonb_build_object(
                       'competencia', to_char(new.competencia, 'YYYY-MM-DD'),
                       'total',       v_total
                     ),
    p_entidade    => 'acerto_mes',
    p_entidade_id => null,
    p_rota        => '/orcamentos'
  );

  return new;
end;
$$;

create trigger acerto_mes_notificar
  after insert on public.acerto_mes
  for each row execute function public.notificar_acerto_mes();

-- ----------------------------------------------------------------------------
-- Viagens
-- ----------------------------------------------------------------------------

/*
  Este é o gatilho perigoso do repo, e a ordem das checagens é a defesa: o nome
  do roteiro só entra em `dados` depois que `visibilidade = 'compartilhado'` foi
  confirmado. Um roteiro secreto não gera linha nenhuma — nem sem nome, nem "há
  novidade em Viagens". O alerta de que existe uma surpresa já é dado por
  `segredos_do_espaco()`, sem texto, e continua sendo o único caminho.

  Três eventos, um gatilho:
    - nasce compartilhado          -> roteiro_novo
    - deixa de ser segredo         -> roteiro_liberado (é a revelação, não uma edição)
    - qualquer outra mexida        -> roteiro_editado, agrupado em 10 min

  Não há gatilho em `parada` de propósito. `salvar_paradas` reescreve a lista
  inteira (delete + insert), o que renderia uma dúzia de disparos por salvada —
  "12 alterações em Litoral" para quem só arrastou uma parada. Ela termina com
  um `update roteiro set updated_at = now()`, e é esse toque que vira o aviso:
  uma salvada, uma notificação.
*/
create function public.notificar_roteiro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.visibilidade <> 'compartilhado' then
      return new;
    end if;

    perform public.notificar(
      p_space       => new.space_id,
      p_tipo        => 'roteiro_novo',
      p_ator        => coalesce(auth.uid(), new.criado_por),
      p_dados       => jsonb_build_object(
                         'nome',        new.nome,
                         'data_inicio', new.data_inicio
                       ),
      p_entidade    => 'roteiro',
      p_entidade_id => new.id,
      p_rota        => '/viagens/' || new.id
    );
    return new;
  end if;

  if new.visibilidade <> 'compartilhado' then
    return new;
  end if;

  if old.visibilidade = 'segredo' then
    perform public.notificar(
      p_space       => new.space_id,
      p_tipo        => 'roteiro_liberado',
      p_ator        => coalesce(auth.uid(), new.criado_por),
      p_dados       => jsonb_build_object(
                         'nome',        new.nome,
                         'data_inicio', new.data_inicio
                       ),
      p_entidade    => 'roteiro',
      p_entidade_id => new.id,
      p_rota        => '/viagens/' || new.id
    );
    return new;
  end if;

  perform public.notificar(
    p_space       => new.space_id,
    p_tipo        => 'roteiro_editado',
    p_ator        => coalesce(auth.uid(), new.criado_por),
    p_dados       => jsonb_build_object('nome', new.nome),
    p_entidade    => 'roteiro',
    p_entidade_id => new.id,
    p_rota        => '/viagens/' || new.id,
    p_janela      => interval '10 minutes'
  );

  return new;
end;
$$;

create trigger roteiro_notificar
  after insert or update on public.roteiro
  for each row execute function public.notificar_roteiro();

-- ----------------------------------------------------------------------------
-- Filmes e séries
-- ----------------------------------------------------------------------------

/*
  Entrar na lista é notícia; a nota que a pessoa deu, não. A capa vai no snapshot
  porque é ela que faz o aviso ser reconhecido antes de ser lido — na caixa e,
  principalmente, no e-mail.
*/
create function public.notificar_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media public.media_item;
begin
  select * into v_media from public.media_item mi where mi.id = new.media_item_id;

  perform public.notificar(
    p_space       => new.space_id,
    p_tipo        => 'interesse_novo',
    p_ator        => coalesce(auth.uid(), new.added_by),
    p_dados       => jsonb_build_object(
                       'titulo',   v_media.titulo,
                       'capa_url', v_media.capa_url,
                       'tipo_midia', v_media.tipo
                     ),
    p_entidade    => 'entry',
    p_entidade_id => new.id,
    p_rota        => '/filmes/' || new.id
  );

  return new;
end;
$$;

create trigger entry_notificar
  after insert on public.entry
  for each row execute function public.notificar_entry();

/*
  "Fulano marcou que você assistiu X" — o único evento dirigido a uma pessoa só,
  daí `notificar_pessoa()`.

  O `when` do gatilho é o que separa isto de tudo mais: só interessa a escrita na
  avaliação de OUTRA pessoa, que a RLS de `rating` nem permite — ela só acontece
  por `marcar_assistiram_comigo`, que é SECURITY DEFINER. Com ator nulo (pg_cron,
  SQL na mão) não há a quem atribuir, e o gatilho se cala em vez de inventar.

  Sem o `when`, `adicionar_item` — que cria `entry` e `rating` na mesma
  transação — dispararia `interesse_novo` e `marcado_assistiu` juntos, para o
  mesmo filme, no mesmo segundo.
*/
create function public.notificar_assistiu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space  uuid;
  v_titulo text;
begin
  select e.space_id, mi.titulo into v_space, v_titulo
  from public.entry e
  join public.media_item mi on mi.id = e.media_item_id
  where e.id = new.entry_id;

  perform public.notificar_pessoa(
    p_user        => new.user_id,
    p_space       => v_space,
    p_tipo        => 'marcado_assistiu',
    p_ator        => auth.uid(),
    p_dados       => jsonb_build_object(
                       'titulo',   v_titulo,
                       'visto_em', new.visto_em
                     ),
    p_entidade    => 'entry',
    p_entidade_id => new.entry_id,
    p_rota        => '/filmes/' || new.entry_id
  );

  return new;
end;
$$;

/*
  Dois gatilhos e não um: uma cláusula WHEN de INSERT não pode citar OLD, então
  "virou visto agora" (que é uma comparação com o estado anterior) só existe no
  de UPDATE. No de INSERT, nascer 'visto' já é a transição.
*/
create trigger rating_notificar_assistiu_insert
  after insert on public.rating
  for each row
  when (
    auth.uid() is not null
    and new.user_id <> auth.uid()
    and new.status = 'visto'
  )
  execute function public.notificar_assistiu();

create trigger rating_notificar_assistiu_update
  after update on public.rating
  for each row
  when (
    auth.uid() is not null
    and new.user_id <> auth.uid()
    and new.status = 'visto'
    and old.status is distinct from 'visto'
  )
  execute function public.notificar_assistiu();

-- ----------------------------------------------------------------------------
-- Grants
--
-- Funções de gatilho não são chamáveis pela API. Elas rodam como owner e
-- gravam em nome de qualquer pessoa — expor uma delas seria expor o motor.
-- ----------------------------------------------------------------------------

revoke all on function public.notificar_compra()     from public, anon, authenticated;
revoke all on function public.notificar_acerto_mes() from public, anon, authenticated;
revoke all on function public.notificar_roteiro()    from public, anon, authenticated;
revoke all on function public.notificar_entry()      from public, anon, authenticated;
revoke all on function public.notificar_assistiu()   from public, anon, authenticated;
