-- ============================================================================
-- APPingos — Pins: "está rendendo mais agora?"
--
-- O extrato conta o multiplicador DEPOIS: cada linha guarda `base` e
-- `multiplicador` do instante em que o Pin caiu, e é por isso que ela continua
-- verdadeira amanhã. O que faltava era a pergunta ao contrário — a que se faz
-- ANTES de agir, na tela inicial: vale a pena registrar isso agora?
--
-- POR QUE NO BANCO, E NÃO UMA CONTA NO CLIENT. A tentação óbvia era somar no
-- TypeScript: sábado é sábado, a sequência sai de `usePins()`, a viagem em curso
-- sai de `useRoteiros()`. Seria a segunda fonte de verdade da economia — a
-- mesma que `useRegrasDePins()` recusou ser — e ela divergiria no primeiro
-- ajuste de balanceamento, com a tela inicial prometendo 1,35× e o gatilho
-- concedendo 1,20×. Aqui quem responde é `pins_hotspots()`, a MESMA função que
-- concede, então as duas respostas não têm como discordar.
--
-- O NÚMERO É O MELHOR DISPONÍVEL AGORA, e isso é uma escolha. Os hotspots não
-- valem todos para tudo: `fim_de_semana` só pega regra de lazer e `corujao` só
-- regra noturna, então num sábado à noite o mesmo instante vale mais para um
-- filme do que para um gasto lançado. O selo mostra o teto — é ele que responde
-- "vale a pena agora?" — e devolve junto a LISTA de hotspots ligados, para a
-- tela poder dizer quais são em vez de exibir um número mágico.
--
-- `calor_da_hora` nunca entra: ele depende da linha que está sendo gravada (a
-- data da compra), e não do relógio. Não é ambiente, é contexto — por isso
-- `p_extra` fica vazio aqui.
-- ============================================================================

/*
  As combinações, e não as regras uma a uma.

  O multiplicador só depende de dois flags da regra (`lazer`, `noturna`), então
  regras que compartilham o mesmo par dão sempre o mesmo número. Varrer as
  combinações distintas são no máximo quatro chamadas, contra uma por regra
  ativa — e o resultado é idêntico.

  `min(chave)` é só um representante estável de cada combinação: qualquer regra
  do grupo responderia igual, e pegar a menor chave em ordem alfabética evita
  que o número dance conforme a ordem em que o Postgres devolveu as linhas.
*/
create function public.meu_multiplicador_de_pins(p_space uuid default null)
returns table (multiplicador numeric, hotspots text[])
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_combo   record;
  v_mult    numeric;
  v_lista   text[];
  v_melhor  numeric := 1;
  v_ganhou  text[]  := '{}';
begin
  -- Sem sessão não há sequência nem espaço: o neutro é 1, não um erro.
  if auth.uid() is null then
    return query select 1::numeric, '{}'::text[];
    return;
  end if;

  /*
    O espaço tem de ser seu. Sem esta guarda, `modo_viagem` viraria um oráculo:
    chamar a função com o id de um espaço alheio responderia se há uma viagem
    acontecendo lá — inclusive uma que ainda é surpresa para alguém.
  */
  if p_space is not null and not public.is_space_member(p_space) then
    raise exception 'este espaço não é seu';
  end if;

  for v_combo in
    select min(r.chave) as chave
    from public.pin_regra r
    where r.ativa
    group by r.lazer, r.noturna
  loop
    select h.multiplicador, h.hotspots
      into v_mult, v_lista
    from public.pins_hotspots(auth.uid(), p_space, v_combo.chave, now()) h;

    if v_mult > v_melhor then
      v_melhor := v_mult;
      v_ganhou := v_lista;
    end if;
  end loop;

  return query select v_melhor, v_ganhou;
end;
$$;

/*
  Esta é lida pela tela, então ela é a ÚNICA da família que `authenticated`
  executa — `pins_hotspots()` continua revogada, e é chamada aqui de dentro
  porque a função é SECURITY DEFINER. A diferença importa: `pins_hotspots`
  aceita um `p_user` qualquer, e liberá-la deixaria qualquer cliente sondar a
  sequência de outra pessoa. Esta só sabe responder sobre quem chamou.
*/
revoke all on function public.meu_multiplicador_de_pins(uuid) from public, anon;
grant execute on function public.meu_multiplicador_de_pins(uuid) to authenticated;
