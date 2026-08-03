-- ============================================================================
-- APPingos — Datas na avaliação e fechamento da avaliação.
--
-- As datas ficam em `rating`, e não em `entry`, porque são registro pessoal:
-- "quando EU quero ver" / "quando EU vi". No espaço pessoal isso é só seu; no
-- de casal, cada um tem a sua data e o calendário mostra as duas com o nome de
-- quem marcou. (`visto_em` já existia aqui desde o catálogo, sem uso na tela.)
--
-- `enviado_em` marca o momento em que a pessoa clicou em "Enviar" no formulário
-- de estrelas + resenha. Depois disso a avaliação é um registro do que ela
-- achou naquele momento, e não muda mais — garantido por trigger, não só pela
-- tela, para a regra valer também para quem chamar a API direto.
-- ============================================================================

alter table public.rating
  add column planejado_para date,
  add column enviado_em     timestamptz;

-- O calendário busca por "as datas do espaço no mês X"; sem isto, é seq scan.
create index rating_planejado_idx on public.rating (planejado_para) where planejado_para is not null;
create index rating_visto_idx     on public.rating (visto_em)       where visto_em is not null;

-- ----------------------------------------------------------------------------
-- Avaliação enviada é imutável
--
-- Só nota e resenha congelam. Status e datas continuam livres de propósito: um
-- filme sai de "quero ver" para "visto" muito depois da avaliação, e a data de
-- quando você viu pode ser corrigida sem que isso mexa no que você achou dele.
-- ----------------------------------------------------------------------------

create function public.travar_avaliacao_enviada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.enviado_em is null then
    return new;
  end if;

  if new.nota is distinct from old.nota then
    raise exception 'a nota não pode mudar depois da avaliação enviada';
  end if;

  if new.resenha is distinct from old.resenha then
    raise exception 'a resenha não pode mudar depois de enviada';
  end if;

  -- Reabrir a avaliação limpando o carimbo também não vale.
  new.enviado_em := old.enviado_em;

  return new;
end;
$$;

create trigger rating_travar_enviada
  before update on public.rating
  for each row execute function public.travar_avaliacao_enviada();

revoke all on function public.travar_avaliacao_enviada() from public, anon, authenticated;
