-- ============================================================================
-- APPingos — o papel `robo`: um membro do espaço que não enxerga nada dele.
--
-- ## Por que existe
--
-- A rechecagem diária de preço precisa abrir a URL de cada produto num navegador
-- de verdade (o HTML cru não traz preço Pix nem parcelamento), e isso roda fora do
-- app. Para ler os produtos ela precisa de um JWT, e um JWT precisa de uma conta.
--
-- Três formas de dar essa conta, e por que esta:
--
--   - **`service_role` no CI** — uma chave que ignora a RLS do projeto inteiro,
--     guardada no CI de um repositório PÚBLICO. Descartada.
--   - **a conta pessoal de alguém** — se a credencial vazar, vaza a pessoa
--     inteira: orçamentos, viagens, e a lista de presentes que era surpresa.
--   - **uma conta de robô, membro do espaço mas cega para ele.** Esta.
--
-- ## O que faz a terceira caber em uma linha
--
-- Toda policy do app passa por `is_space_member()`. Excluir `robo` ali tira o
-- acesso do robô por todos os caminhos normais, em todos os módulos — inclusive
-- nos que ainda não existem. Não há uma segunda lista a manter em dia.
--
-- E o robô continua sendo uma linha em `membership`, então ele **aparece na lista
-- de membros em Espaços e some de lá quando o dono o remove**. A revogação é
-- visível e usa a tela que já existe; isso é metade do valor de haver um papel
-- para isto, em vez de uma credencial escondida num arquivo de configuração.
--
-- ## O que o robô pode fazer
--
-- Só o que RPCs `SECURITY DEFINER` estreitas derem a ele. Esta migration cria
-- apenas `espacos_do_robo()`, que não devolve dado de domínio nenhum e serve para
-- o robô conferir que a credencial funciona e qual é o seu alcance.
--
-- As RPCs de preço (ler URLs para rechecar, gravar o que leu) entram junto com a
-- feature, depois da medição — construir o caminho de escrita antes de saber se as
-- lojas deixam ler seria construir no ar.
--
-- ## Como convidar um robô
--
-- Pelo fluxo que já existe, em dois passos e sem tela nova:
--
--   1. a conta do robô resgata um convite normal do espaço (entra como `membro`)
--   2. o dono muda o cargo dela para `robo` em Espaços
--
-- Um convite direto para `robo` exigiria um segundo tipo de convite, e o ganho
-- seria um clique.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- O papel
-- ----------------------------------------------------------------------------

alter table public.membership
  drop constraint membership_papel_check;

alter table public.membership
  add constraint membership_papel_check
  check (papel in ('dono', 'admin', 'membro', 'robo'));

-- ----------------------------------------------------------------------------
-- Os helpers de autorização
--
-- `is_space_owner` e `is_space_admin` já excluem o robô por construção: exigem
-- `papel = 'dono'` e `papel in ('dono','admin')`. Só os dois abaixo precisam mudar.
-- ----------------------------------------------------------------------------

/*
  A linha que carrega esta migration inteira.

  Com `papel <> 'robo'`, um robô deixa de passar em toda policy de `select`,
  `insert`, `update` e `delete` do app — categoria, compra, roteiro, parada,
  interesse, entry, rating, e o que vier depois. Ele nem enxerga a própria linha de
  membership, e é por isso que `espacos_do_robo()` existe mais abaixo.
*/
create or replace function public.is_space_member(p_space uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.membership m
    where m.space_id = p_space
      and m.user_id = auth.uid()
      and m.papel <> 'robo'
  );
$$;

/*
  Perfis: o robô não lê os dos outros, mas os outros leem o dele.

  A exclusão vai só do lado `meu` de propósito. Barrar também o lado `dele` faria o
  robô sumir do nome na lista de membros de Espaços — ele apareceria como "Alguém",
  e a revogação visível, que é o ponto do papel, ficaria pela metade.
*/
create or replace function public.shares_space_with(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.membership meu
    join public.membership dele on dele.space_id = meu.space_id
    where meu.user_id = auth.uid()
      and meu.papel <> 'robo'
      and dele.user_id = p_user
  );
$$;

-- ----------------------------------------------------------------------------
-- Promover e rebaixar
-- ----------------------------------------------------------------------------

/*
  `definir_papel` passa a aceitar 'robo'. As guardas continuam as mesmas: só o
  dono muda cargos, ninguém muda o próprio, e a linha do dono não é tocada.

  Rebaixar um robô de volta a `membro` funciona pelo mesmo caminho — útil se a
  conta um dia virar de gente, e é o que evita um estado sem volta.
*/
create or replace function public.definir_papel(p_space uuid, p_user uuid, p_papel text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_space_owner(p_space) then
    raise exception 'só o dono pode mudar cargos neste espaço';
  end if;

  if p_papel not in ('admin', 'membro', 'robo') then
    raise exception 'cargo inválido: %', p_papel;
  end if;

  if p_user = auth.uid() then
    raise exception 'o dono não pode mudar o próprio cargo';
  end if;

  update public.membership
  set papel = p_papel
  where space_id = p_space
    and user_id = p_user
    and papel <> 'dono';

  if not found then
    raise exception 'esta pessoa não é membro do espaço';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Os avisos param de ir para o robô
--
-- As duas funções abaixo distribuem avisos varrendo `membership`, e nenhuma delas
-- olhava o papel. Sem esta mudança o robô acumularia notificações que ninguém
-- jamais lê — o tipo de lixo silencioso que só aparece meses depois.
--
-- Os corpos são os originais com uma linha a mais cada; foram extraídos das
-- migrations de origem em vez de recopiados, para não introduzir deriva.
-- ----------------------------------------------------------------------------

create or replace function public.notificar(
  p_space        uuid,
  p_tipo         text,
  p_ator         uuid,
  p_dados        jsonb default '{}'::jsonb,
  p_entidade     text     default null,
  p_entidade_id  uuid     default null,
  p_rota         text     default null,
  p_janela       interval default null
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
      -- Robô não tem caixa para ler; um aviso para ele é linha morta.
      and m.papel <> 'robo'
  loop
    if exists (
      select 1 from public.notificacao_preferencia p
      where p.user_id = v_destino and p.tipo = p_tipo and not p.ativo
    ) then
      continue;
    end if;

    v_existente := null;

    if p_janela is not null then
      select n.id into v_existente
      from public.notificacao n
      where n.user_id = v_destino
        and n.tipo = p_tipo
        and n.entidade_id is not distinct from p_entidade_id
        and n.lida_em is null
        and n.created_at > now() - p_janela
      order by n.created_at desc
      limit 1;
    end if;

    if v_existente is not null then
      -- O `created_at` sobe junto: a notificação agrupada é sobre a mexida mais
      -- recente, e continuar no fundo da lista com a data da primeira faria a
      -- caixa mentir sobre quando aquilo aconteceu.
      update public.notificacao
         set dados = dados || v_dados
                     || jsonb_build_object('vezes', coalesce((dados ->> 'vezes')::int, 1) + 1),
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
create or replace function public.deletar_espaco(p_space uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text;
  v_tipo text;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  if not public.is_space_owner(p_space) then
    raise exception 'só o dono pode excluir este espaço';
  end if;

  select s.nome, s.tipo into v_nome, v_tipo
  from public.space s
  where s.id = p_space;

  if not found then
    raise exception 'espaço não encontrado';
  end if;

  -- O pessoal é criado pelo trigger de novo usuário e é a âncora de quem não
  -- está em nenhum espaço de casal. Sem ele o app fica sem chão.
  if v_tipo = 'pessoal' then
    raise exception 'o espaço pessoal não pode ser excluído';
  end if;

  insert into public.space_deletion_notice (user_id, space_nome, deletado_por_nome)
  select m.user_id, v_nome, coalesce(dono.nome, 'o dono')
  from public.membership m
  left join public.profile dono on dono.id = auth.uid()
  where m.space_id = p_space
    and m.user_id <> auth.uid()
    -- Mesmo motivo do notificar(): robô não lê aviso.
    and m.papel <> 'robo';

  delete from public.space where id = p_space;
end;
$$;
-- ----------------------------------------------------------------------------
-- O que o robô pode ler
-- ----------------------------------------------------------------------------

/*
  Os espaços onde quem chama é robô.

  Existe porque `is_space_member` agora barra o robô até na própria linha de
  `membership`: sem esta função ele não teria como sequer descobrir a que espaços
  pertence. É `SECURITY DEFINER` por isso.

  Devolve id e nada mais — nenhum dado de domínio. Serve para o robô conferir que
  a credencial funciona e qual é o alcance dela, e é a base sobre a qual as RPCs de
  preço vão recortar o que buscam.
*/
create function public.espacos_do_robo()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select m.space_id
  from public.membership m
  where m.user_id = auth.uid()
    and m.papel = 'robo'
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

grant execute on function public.espacos_do_robo() to authenticated;
