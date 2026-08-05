-- ============================================================================
-- APPingos — O acerto do mês: Pendente | Pago.
--
-- Até aqui, o mês tinha só a situação que o calendário dá de graça (aberto,
-- fechado, futuro) — passagem do tempo, não decisão de ninguém. O que faltava
-- era o fato humano: "esse saldo já foi pago". Sem ele, o painel de resumos não
-- tem como saber quando parar de cobrar a competência que fechou, e a pergunta
-- "a gente já acertou julho?" continua sendo respondida no WhatsApp.
--
-- Três decisões:
--
--   1. A PRESENÇA DA LINHA é o "pago". Não há coluna booleana, e por isso não
--      existe o estado inconsistente "linha existe mas pago = false". Pendente é
--      simplesmente a ausência — que é como todo mês nasce.
--   2. Qualquer membro marca e qualquer membro desmarca. O acerto é dos dois:
--      quem paga costuma ser quem deve, mas quem recebe é quem confirma. Exigir
--      admin transformaria uma confirmação corriqueira num pedido de permissão.
--   3. Nada aqui impede marcar um mês que ainda não fechou. Casal que acerta as
--      contas no meio do mês existe, e o banco não é o lugar de proibir isso —
--      a tela é que decide onde oferecer o botão.
-- ============================================================================

create table public.acerto_mes (
  space_id     uuid not null references public.space (id) on delete cascade,
  -- Mesma âncora de `compra.competencia_inicial`: sempre o dia 1º.
  competencia  date not null check (extract(day from competencia) = 1),
  pago_em      timestamptz not null default now(),
  pago_por     uuid not null references auth.users (id) on delete cascade,
  primary key (space_id, competencia)
);

-- A chave primária (space_id, competencia) já é o índice das duas consultas que
-- existem: "os acertos deste espaço" e "este mês está pago?".

-- ----------------------------------------------------------------------------
-- Integridade que o CHECK não alcança
-- ----------------------------------------------------------------------------

/*
  A policy de insert já força `pago_por = auth.uid()`, e a de select exige ser
  membro — mas as duas coisas juntas ainda deixariam passar uma linha gravada
  por quem saiu do espaço depois. O trigger é a garantia que sobrevive a isso:
  quem marca precisa ser membro do espaço no momento da escrita.
*/
create function public.validar_acerto_mes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.membership m
    where m.space_id = new.space_id and m.user_id = new.pago_por
  ) then
    raise exception 'quem marcou o acerto não é membro deste espaço';
  end if;

  return new;
end;
$$;

create trigger acerto_mes_validar
  before insert or update on public.acerto_mes
  for each row execute function public.validar_acerto_mes();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.acerto_mes enable row level security;

create policy acerto_mes_select on public.acerto_mes
  for select to authenticated
  using (public.is_space_member(space_id));

create policy acerto_mes_insert on public.acerto_mes
  for insert to authenticated
  with check (public.is_space_member(space_id) and pago_por = auth.uid());

/*
  Sem policy de UPDATE de propósito: marcar é inserir, desmarcar é apagar. Um
  update só poderia reescrever quem marcou e quando — reescrever a autoria de um
  fato já registrado, que é exatamente o que não se quer poder fazer.
*/
create policy acerto_mes_delete on public.acerto_mes
  for delete to authenticated
  using (public.is_space_member(space_id));

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

revoke all on function public.validar_acerto_mes() from public, anon, authenticated;
