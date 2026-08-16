-- ============================================================================
-- atualizar_media_item — recarregar os dados de um item do catálogo
--
-- Nasce do botão "recarregar" do módulo de Músicas. O caminho óbvio seria
-- chamar `adicionar_item` de novo (ela já faz upsert do item global e é
-- idempotente), mas ela tem um efeito colateral que estraga a ideia: no fim,
-- ela insere `rating (entry, auth.uid(), 'quero')`. Recarregar uma música que
-- a OUTRA pessoa adicionou marcaria você como interessado nela, em silêncio.
--
-- Daí uma função separada, que mexe só no item global e não toca em `entry`
-- nem em `rating`.
-- ============================================================================

create function public.atualizar_media_item(p_media uuid, p_dados jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  /*
    A autorização é a mesma de ler: só atualiza quem tem este item em algum
    espaço de que participa.

    `media_item` é GLOBAL — a mesma linha serve a todos os espaços. Sem esta
    checagem, qualquer pessoa autenticada poderia reescrever o título e a capa
    de um item que aparece na tela de outra família. Com ela, o alcance da
    escrita é o mesmo do interesse já demonstrado.
  */
  if not exists (
    select 1
    from public.entry e
    where e.media_item_id = p_media
      and public.is_space_member(e.space_id)
  ) then
    raise exception 'este item não está em nenhum espaço seu';
  end if;

  -- Só o que o Spotify pode ter mudado. `fonte`/`fonte_id`/`tipo` ficam de
  -- fora de propósito: mudá-los faria a linha deixar de ser o mesmo item.
  -- `coalesce` para um campo que voltou vazio não apagar o que já havia.
  update public.media_item
  set titulo    = coalesce(nullif(trim(p_dados ->> 'titulo'), ''), titulo),
      ano       = coalesce(nullif(p_dados ->> 'ano', '')::int, ano),
      capa_url  = coalesce(p_dados ->> 'capa_url', capa_url),
      metadados = metadados || coalesce(p_dados -> 'metadados', '{}'::jsonb)
  where id = p_media;
end;
$$;

grant execute on function public.atualizar_media_item(uuid, jsonb) to authenticated;
