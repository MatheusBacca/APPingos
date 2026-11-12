-- ============================================================================
-- APPingos — O guardado de uma meta nunca fica negativo, nem apagando aporte.
--
-- `registrar_aporte` já recusa o resgate maior que o guardado. Faltava o outro
-- caminho: apagar um aporte. Guardar 500, resgatar 500 e depois apagar o "guardar"
-- deixaria a meta com −500 — um número que não é reserva de nada, e que a
-- projeção do mês leria como dinheiro que voltou sem nunca ter saído.
--
-- AFTER DELETE, por linha, olhando a soma que sobrou. Quando a própria META está
-- sendo apagada, o cascade apaga os aportes um a um e a soma passa por valores
-- negativos no meio do caminho; a meta já não existe nesse momento (o cascade
-- roda depois da linha-mãe sair), e é isso que o primeiro `if` reconhece.
-- ============================================================================

create function public.validar_saldo_da_meta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.meta m where m.id = old.meta_id) then
    return old;
  end if;

  if (select coalesce(sum(a.valor), 0) from public.meta_aporte a where a.meta_id = old.meta_id) < 0 then
    raise exception 'apagar este aporte deixaria a meta com saldo negativo — apague antes o resgate';
  end if;

  return old;
end;
$$;

create trigger meta_aporte_saldo
  after delete on public.meta_aporte
  for each row execute function public.validar_saldo_da_meta();

revoke all on function public.validar_saldo_da_meta() from public, anon, authenticated;
