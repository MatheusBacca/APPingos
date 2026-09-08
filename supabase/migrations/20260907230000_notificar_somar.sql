-- ============================================================================
-- APPingos — Notificações: campos que SOMAM no agrupamento.
--
-- O motor agrupa fazendo `dados || v_dados`: o evento novo sobrescreve o antigo
-- e `vezes` incrementa. Isso está certo para tudo o que existe hoje — "3
-- alterações em Mercado" quer mesmo a descrição mais recente, não a soma de
-- nada.
--
-- Pins quebra essa premissa. Dois ganhos de 10 dentro da janela virariam
-- "2 vezes, 10 pins", e o número que a pessoa lê seria o do ÚLTIMO ganho, não o
-- do que ela acumulou. `vezes` não resolve: 2 × 10 e 10 + 25 são a mesma
-- contagem e valores diferentes.
--
-- Daí `p_somar`: a lista de campos numéricos que ACUMULAM em vez de
-- sobrescrever. É um parâmetro, e não um comportamento fixo para o tipo
-- `pins_ganhos`, porque o motor não deve conhecer os tipos — ele não conhece
-- nenhum outro. Quem sabe o que soma é quem chama.
--
-- Precisa de DROP porque `create or replace` com uma assinatura diferente
-- criaria uma SEGUNDA função (a identidade é nome + tipos dos argumentos), e o
-- app passaria a ter duas `notificar()` — a velha ainda sendo chamada pelos
-- gatilhos que usam 8 argumentos. Corpo de plpgsql não conta como dependência,
-- então o drop passa e os gatilhos existentes resolvem o nome de novo na
-- próxima execução.
-- ============================================================================

drop function public.notificar(uuid, text, uuid, jsonb, text, uuid, text, interval);

create function public.notificar(
  p_space        uuid,
  p_tipo         text,
  p_ator         uuid,
  p_dados        jsonb default '{}'::jsonb,
  p_entidade     text     default null,
  p_entidade_id  uuid     default null,
  p_rota         text     default null,
  p_janela       interval default null,
  p_somar        text[]   default null
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dados     jsonb;
  v_destino   uuid;
  v_existente uuid;
  v_anterior  jsonb;
  v_soma      jsonb;
  v_campo     text;
  v_total     int := 0;
begin
  if p_ator is null then
    raise exception 'notificar(%): ator nulo — sem ele o aviso iria para quem causou o evento', p_tipo;
  end if;

  -- Quem agiu e onde entram sempre, para o texto não depender de join na leitura.
  v_dados := coalesce(p_dados, '{}'::jsonb) || jsonb_build_object(
    'ator_nome',  public.nome_para_notificacao(p_ator),
    'space_nome', (select s.nome from public.space s where s.id = p_space)
  );

  for v_destino in
    select m.user_id
    from public.membership m
    where m.space_id = p_space
      and m.user_id <> p_ator
  loop
    if exists (
      select 1 from public.notificacao_preferencia p
      where p.user_id = v_destino and p.tipo = p_tipo and not p.ativo
    ) then
      continue;
    end if;

    v_existente := null;
    v_anterior  := null;

    if p_janela is not null then
      select n.id, n.dados into v_existente, v_anterior
      from public.notificacao n
      where n.user_id = v_destino
        and n.tipo = p_tipo
        and n.entidade_id is not distinct from p_entidade_id
        /*
          O ATOR entra na chave do agrupamento.

          Até aqui ele não precisava: todo tipo agrupa por entidade, e duas
          pessoas mexendo na MESMA compra em dez minutos geram avisos para
          destinatários diferentes — que nunca se encontram, porque a linha já
          nasce recortada por pessoa.

          `pins_ganhos` quebra isso: ele agrupa com `entidade_id` NULO, de
          propósito, para uma maratona de série virar uma linha só. Sem o ator
          aqui, num espaço de três a notificação "A ganhou 30 Pins" absorveria o
          ganho de B e apareceria como "A ganhou 40 Pins" — o nome de um com os
          pontos dos dois.

          Vale para todos os tipos porque a regra é geral: aviso de duas pessoas
          diferentes não é o mesmo aviso, e juntá-los sob um nome só é sempre
          mentira. Para os tipos de hoje é inócuo, pelo motivo do primeiro
          parágrafo.
        */
        and n.ator_id is not distinct from p_ator
        and n.lida_em is null
        and n.created_at > now() - p_janela
      order by n.created_at desc
      limit 1;
    end if;

    if v_existente is not null then
      /*
        A soma é montada ANTES do update porque ela precisa do valor antigo e do
        novo ao mesmo tempo, e `dados || v_dados` dentro do próprio update já
        teria descartado o antigo quando chegasse a vez de somar.

        Campo ausente ou não-numérico vale zero: um `dados` de versão anterior do
        app, sem o campo, não pode fazer o agrupamento estourar.
      */
      v_soma := '{}'::jsonb;

      if p_somar is not null then
        foreach v_campo in array p_somar loop
          v_soma := v_soma || jsonb_build_object(
            v_campo,
            coalesce((coalesce(v_anterior, '{}'::jsonb) ->> v_campo)::numeric, 0)
              + coalesce((v_dados ->> v_campo)::numeric, 0)
          );
        end loop;
      end if;

      -- O `created_at` sobe junto: a notificação agrupada é sobre a mexida mais
      -- recente, e continuar no fundo da lista com a data da primeira faria a
      -- caixa mentir sobre quando aquilo aconteceu.
      update public.notificacao
         set dados = dados || v_dados
                     || jsonb_build_object('vezes', coalesce((dados ->> 'vezes')::int, 1) + 1)
                     || v_soma,
             created_at = now()
       where id = v_existente;
    else
      insert into public.notificacao (
        user_id, space_id, tipo, dados, ator_id, entidade, entidade_id, rota
      )
      values (
        v_destino, p_space, p_tipo, v_dados, p_ator, p_entidade, p_entidade_id, p_rota
      );
    end if;

    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;

-- Mesmo fechamento da original: quem chama são os gatilhos, rodando como owner.
revoke all on function public.notificar(uuid, text, uuid, jsonb, text, uuid, text, interval, text[])
  from public, anon, authenticated;
