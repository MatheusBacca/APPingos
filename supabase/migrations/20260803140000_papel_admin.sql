-- ============================================================================
-- APPingos — Papel "admin" no espaço.
--
-- Antes existiam só dois níveis: dono e todo o resto. "Admin" entra no meio —
-- pode agir em nome do espaço em coisas do dia a dia, mas não pode excluir o
-- espaço nem mexer em quem manda. Quem entra por convite continua 'membro'.
--
-- Dono é admin por definição: `is_space_admin` cobre os dois, para nenhuma
-- policy precisar escrever "dono ou admin" à mão e esquecer um caso.
-- ============================================================================

alter table public.membership drop constraint membership_papel_check;

alter table public.membership
  add constraint membership_papel_check check (papel in ('dono', 'admin', 'membro'));

create function public.is_space_admin(p_space uuid)
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
      and m.papel in ('dono', 'admin')
  );
$$;

-- ----------------------------------------------------------------------------
-- Promover e rebaixar — só o dono
-- ----------------------------------------------------------------------------

/*
  Transferência de posse fica de fora de propósito: 'dono' não é um valor
  aceito aqui, e a linha do dono não pode ser alterada. Um espaço com dois
  donos, ou com nenhum, é um estado que ninguém quer descobrir depois.
*/
create function public.definir_papel(p_space uuid, p_user uuid, p_papel text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_space_owner(p_space) then
    raise exception 'só o dono pode mudar cargos neste espaço';
  end if;

  if p_papel not in ('admin', 'membro') then
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
-- "Assistiram comigo"
-- ----------------------------------------------------------------------------

/*
  Um admin marca quem viu o filme junto com ele, herdando a MESMA data que ele
  registrou. Precisa de SECURITY DEFINER porque escreve na avaliação de outra
  pessoa — a RLS de `rating` só deixa cada um escrever na própria linha, e é
  bom que continue assim para todo o resto do app.

  Nota e resenha não são tocadas: a data é um fato compartilhado ("estávamos
  juntos"), a opinião não é. O gatilho de avaliação enviada segue valendo.
*/
create function public.marcar_assistiram_comigo(p_entry uuid, p_usuarios uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space  uuid;
  v_data   date;
  v_afetados int := 0;
begin
  select e.space_id into v_space from public.entry e where e.id = p_entry;

  if v_space is null then
    raise exception 'item não encontrado';
  end if;

  if not public.is_space_admin(v_space) then
    raise exception 'só dono ou admin pode marcar quem assistiu junto';
  end if;

  select r.visto_em into v_data
  from public.rating r
  where r.entry_id = p_entry and r.user_id = auth.uid();

  if v_data is null then
    raise exception 'marque a sua data de assistido antes de dizer quem viu junto';
  end if;

  insert into public.rating (entry_id, user_id, status, visto_em)
  select p_entry, m.user_id, 'visto', v_data
  from public.membership m
  where m.space_id = v_space
    and m.user_id = any (p_usuarios)
    and m.user_id <> auth.uid()
  on conflict (entry_id, user_id) do update
    set status   = 'visto',
        visto_em = excluded.visto_em;

  get diagnostics v_afetados = row_count;
  return v_afetados;
end;
$$;

grant execute on function public.is_space_admin(uuid)                    to authenticated;
grant execute on function public.definir_papel(uuid, uuid, text)         to authenticated;
grant execute on function public.marcar_assistiram_comigo(uuid, uuid[])  to authenticated;
