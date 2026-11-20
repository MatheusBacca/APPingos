-- ============================================================================
-- APPingos — o CPF da pessoa e quem é quem nos Pix do extrato.
--
-- O extrato do Open Finance traz o CPF da outra ponta de cada Pix/TED
-- (`transacao_bancaria.contraparte_documento`, 11 dígitos, sem máscara). Com o
-- CPF de cada pessoa do app, a transação "Transferência recebida — Daiane
-- Babicz" vira "Pinga Fogo transferiu para Bixo Pingo".
--
-- 1. `documento_pessoal`: o CPF, numa tabela SÓ da dona. Não é coluna de
--    `profile` pelo mesmo motivo do salário (`renda`): a policy `profile_select`
--    deixa quem divide um espaço ler a linha inteira.
-- 2. `contrapartes_reconhecidas()`: a única ponte entre o extrato de uma pessoa e
--    o CPF da outra. Devolve, para as transações de QUEM CHAMA, qual membro dos
--    seus espaços é a contraparte — sem nunca devolver o CPF de ninguém. Quem
--    chama já tem o documento no próprio extrato; a função só diz de quem é.
-- 3. `profile.chave_pix_instituicao`: em qual banco a chave Pix cai ("CPF no
--    Nubank"). O Open Finance não informa as chaves Pix de ninguém (elas ficam
--    no DICT do Banco Central), então é a pessoa quem diz.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. O CPF
-- ----------------------------------------------------------------------------

create table public.documento_pessoal (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  cpf            text not null unique check (cpf ~ '^\d{11}$'),
  atualizado_em  timestamptz not null default now()
);

comment on table public.documento_pessoal is
  'O CPF de cada pessoa. Só a dona lê e escreve; o reconhecimento das contrapartes passa por contrapartes_reconhecidas(), que não devolve o número.';

alter table public.documento_pessoal enable row level security;

create policy documento_pessoal_dono on public.documento_pessoal
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.documento_pessoal from anon, authenticated;
grant select, insert, update, delete on public.documento_pessoal to authenticated;
grant all on public.documento_pessoal to service_role;

-- ----------------------------------------------------------------------------
-- 2. Quem é a contraparte
-- ----------------------------------------------------------------------------

/*
  Para cada CPF que aparece como contraparte no extrato de quem chama, o membro
  de um espaço em comum que tem aquele CPF. Quem chama nunca aparece (a
  transferência entre contas próprias já é `transferencia_propria`).

  SECURITY DEFINER porque lê `documento_pessoal` de outras pessoas; por isso
  devolve só o documento que JÁ ESTÁ no extrato de quem chama e o `user_id` do
  membro — nunca um CPF que quem chama não tenha.
*/
create function public.contrapartes_reconhecidas()
returns table (documento text, user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with meus as (
    select distinct regexp_replace(t.contraparte_documento, '\D', '', 'g') as documento
    from public.transacao_bancaria t
    where t.user_id = auth.uid()
      and t.contraparte_documento is not null
  ),
  vizinhos as (
    select distinct outro.user_id
    from public.membership eu
    join public.membership outro on outro.space_id = eu.space_id and outro.user_id <> eu.user_id
    where eu.user_id = auth.uid()
  )
  select m.documento, d.user_id
  from meus m
  join public.documento_pessoal d on d.cpf = m.documento
  join vizinhos v on v.user_id = d.user_id;
$$;

revoke all on function public.contrapartes_reconhecidas() from public, anon;
grant execute on function public.contrapartes_reconhecidas() to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Em qual banco a chave Pix cai
-- ----------------------------------------------------------------------------

alter table public.profile
  add column chave_pix_instituicao text
    check (chave_pix_instituicao is null or chave_pix_instituicao ~ '^[a-z0-9]{2,20}$');

comment on column public.profile.chave_pix_instituicao is
  'O banco em que a chave Pix cai (código de _shared/instituicoes.ts). Informado pela pessoa: o Open Finance não traz chaves Pix.';
