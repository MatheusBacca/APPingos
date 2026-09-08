-- ============================================================================
-- APPingos — Pins: conserta o acréscimo de hotspot na lista.
--
-- `v_lista := v_lista || 'corujao'` está ERRADO, e de um jeito que só aparece em
-- execução. O literal não tem tipo, então o Postgres resolve `anyarray ||
-- anyarray` em vez de `anyarray || anyelement`, tenta ler 'corujao' como literal
-- de array e estoura:
--
--     malformed array literal: "corujao"
--     Array value must start with "{" or dimension information.
--
-- Como o hotspot é concedido DENTRO do gatilho, a exceção derruba o INSERT que a
-- disparou: marcar um filme como visto entre 22h e 2h passava a falhar, e o
-- mesmo valia para qualquer concessão com sequência ativa, fim de semana em
-- regra de lazer, ou viagem em curso. Ou seja: os quatro hotspots automáticos
-- quebravam a escrita que deveriam premiar.
--
-- POR QUE PASSOU NA MIGRATION E NÃO NOS TESTES. O DDL é válido — plpgsql só
-- resolve o corpo quando executa. E o único caminho exercitado antes disto foi o
-- `p_extra` (calor_da_hora), que acrescenta `v_chave`, uma VARIÁVEL text: com
-- tipo conhecido, o operador certo é escolhido e a linha funciona. O literal era
-- a única forma quebrada, e ela vive nos quatro ramos que ninguém tinha rodado.
--
-- `array_append` no lugar de `||`, nos cinco pontos, inclusive no que já
-- funcionava: a função é explícita sobre acrescentar UM elemento, e não deixa a
-- correção depender de o próximo leitor saber desta regra de resolução.
-- ============================================================================

create or replace function public.pins_hotspots(
  p_user   uuid,
  p_space  uuid,
  p_regra  text,
  p_agora  timestamptz,
  p_extra  text[] default '{}'
)
returns table (multiplicador numeric, hotspots text[])
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  c_teto_global constant numeric := 2.5;

  v_regra    public.pin_regra%rowtype;
  v_hotspot  public.pin_hotspot%rowtype;
  v_local    timestamp;
  v_hoje     date;
  v_hora     int;
  v_lista    text[] := '{}';
  v_bonus    numeric := 0;
  v_dias     int;
  v_dia      date;
  v_max      int;
  v_chave    text;
  v_inicio   date;
begin
  select * into v_regra from public.pin_regra r where r.chave = p_regra;
  if not found then
    return query select 1::numeric, '{}'::text[];
    return;
  end if;

  v_local := p_agora at time zone 'America/Sao_Paulo';
  v_hoje  := v_local::date;
  v_hora  := extract(hour from v_local);

  -- Sequência ------------------------------------------------------------
  select * into v_hotspot from public.pin_hotspot h where h.chave = 'sequencia' and h.ativo;
  if found then
    v_max := ceil(v_hotspot.teto / v_hotspot.fator);
    v_dia := v_hoje;

    if not exists (
      select 1 from public.pin p
      where p.user_id = p_user
        and p.created_at >= public.inicio_do_dia_brt(v_dia)
        and p.created_at <  public.inicio_do_dia_brt(v_dia + 1)
    ) then
      v_dia := v_dia - 1;
    end if;

    v_dias := 0;
    while v_dias < v_max loop
      exit when not exists (
        select 1 from public.pin p
        where p.user_id = p_user
          and p.created_at >= public.inicio_do_dia_brt(v_dia)
          and p.created_at <  public.inicio_do_dia_brt(v_dia + 1)
      );
      v_dias := v_dias + 1;
      v_dia  := v_dia - 1;
    end loop;

    if v_dias > 0 then
      v_bonus := v_bonus + least(v_hotspot.fator * v_dias, v_hotspot.teto);
      v_lista := array_append(v_lista, 'sequencia');
    end if;
  end if;

  -- Fim de semana --------------------------------------------------------
  if v_regra.lazer then
    select * into v_hotspot from public.pin_hotspot h where h.chave = 'fim_de_semana' and h.ativo;
    if found and extract(isodow from v_local) in (6, 7) then
      v_bonus := v_bonus + least(v_hotspot.fator, v_hotspot.teto);
      v_lista := array_append(v_lista, 'fim_de_semana');
    end if;
  end if;

  -- Modo viagem ----------------------------------------------------------
  if p_space is not null then
    select * into v_hotspot from public.pin_hotspot h where h.chave = 'modo_viagem' and h.ativo;
    if found then
      select min(r.data_inicio) into v_inicio
      from public.roteiro r
      where r.space_id = p_space
        and r.visibilidade = 'compartilhado'
        and r.data_inicio is not null
        and r.data_inicio <= v_hoje
        and coalesce(r.data_fim, r.data_inicio) >= v_hoje;

      if v_inicio is not null then
        v_dias  := (v_hoje - v_inicio) + 1;
        v_bonus := v_bonus + least(v_hotspot.fator * v_dias, v_hotspot.teto);
        v_lista := array_append(v_lista, 'modo_viagem');
      end if;
    end if;
  end if;

  -- Corujão --------------------------------------------------------------
  if v_regra.noturna then
    select * into v_hotspot from public.pin_hotspot h where h.chave = 'corujao' and h.ativo;
    if found and (v_hora >= 22 or v_hora < 2) then
      v_bonus := v_bonus + least(v_hotspot.fator, v_hotspot.teto);
      v_lista := array_append(v_lista, 'corujao');
    end if;
  end if;

  -- Os de contexto -------------------------------------------------------
  if p_extra is not null then
    foreach v_chave in array p_extra loop
      if not (v_lista @> array[v_chave]) then
        select * into v_hotspot from public.pin_hotspot h where h.chave = v_chave and h.ativo;
        if found then
          v_bonus := v_bonus + least(v_hotspot.fator, v_hotspot.teto);
          v_lista := array_append(v_lista, v_chave);
        end if;
      end if;
    end loop;
  end if;

  return query select least(1 + v_bonus, c_teto_global), v_lista;
end;
$$;

revoke all on function public.pins_hotspots(uuid, uuid, text, timestamptz, text[])
  from public, anon, authenticated;
