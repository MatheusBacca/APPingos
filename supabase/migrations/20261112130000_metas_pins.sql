-- ============================================================================
-- APPingos — Pins: liga `objetivo_cumprido` agora que a meta existe.
--
-- A regra nasceu cadastrada e desligada em 20260908025100_pins.sql ("Bater uma
-- meta com prazo", 60 Pins), esperando a tabela. Ligar é o `update` que aquele
-- arquivo prometeu, mais o gatilho que diz quando ela vale.
--
-- O levantamento pediu para ligar "de propósito, com teto, para não premiar
-- aportar e resgatar" (docs/notion-plano-planejamento-financeiro.md, item 10 da
-- lista da Pluggy). As travas, todas no gatilho e na regra:
--
--   1. Só meta COM PRAZO, cumprida até o prazo. É o que a regra diz ("bater uma
--      meta com prazo"), e uma meta sem prazo não tem o que bater.
--   2. O guardado precisa alcançar o alvo no momento da conquista. Marcar como
--      cumprida à mão sem o dinheiro não rende nada.
--   3. Uma vez por meta (a chave é o id) e, no máximo, uma conquista por pessoa
--      por dia (`teto_dia = 1`). Criar uma meta de R$ 1 para amanhã e aportar R$ 1
--      continua possível — mas rende 60 Pins por dia, não por clique.
--
-- A conquista é do ESPAÇO: na meta do casal os dois guardaram, então cada membro
-- recebe (`conceder_pins_todos`, a mesma régua de "mês no azul"). Na meta pessoal
-- o espaço tem um membro só, e o efeito é o de uma concessão individual.
-- ============================================================================

update public.pin_regra
set ativa = true,
    teto_dia = 1
where chave = 'objetivo_cumprido';

/*
  AFTER UPDATE e AFTER INSERT: a meta vira cumprida por dois caminhos — o aporte
  que alcança o alvo (`registrar_aporte` faz um UPDATE) e, em tese, uma meta que já
  nasce cumprida. O ramo por `tg_op` segue o padrão dos gatilhos de Pins: num
  INSERT o registro OLD não está atribuído.

  `cumprida_em` vem do gatilho BEFORE `carimbar_meta_cumprida`, então aqui ele já
  está preenchido. A comparação com o prazo é no fuso do app — uma meta cumprida
  às 23h do último dia, no Brasil, já é dia seguinte em UTC.
*/
create function public.conceder_pins_meta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_virou_cumprida boolean;
  v_guardado       numeric;
begin
  if tg_op = 'INSERT' then
    v_virou_cumprida := new.estado = 'cumprida';
  else
    v_virou_cumprida := new.estado = 'cumprida' and old.estado is distinct from 'cumprida';
  end if;

  if not v_virou_cumprida or new.prazo is null then
    return new;
  end if;

  if (new.cumprida_em at time zone 'America/Sao_Paulo')::date > new.prazo then
    return new;
  end if;

  select coalesce(sum(a.valor), 0) into v_guardado
  from public.meta_aporte a
  where a.meta_id = new.id;

  if v_guardado < new.valor_alvo then
    return new;
  end if;

  perform public.conceder_pins_todos(
    p_space       => new.space_id,
    p_regra       => 'objetivo_cumprido',
    p_chave       => 'objetivo_cumprido:' || new.id::text,
    p_dados       => jsonb_build_object('titulo', new.titulo),
    p_entidade    => 'meta',
    p_entidade_id => new.id,
    p_rota        => '/objetivos'
  );

  return new;
end;
$$;

create trigger meta_conceder_pins
  after insert or update on public.meta
  for each row execute function public.conceder_pins_meta();

revoke all on function public.conceder_pins_meta() from public, anon, authenticated;
