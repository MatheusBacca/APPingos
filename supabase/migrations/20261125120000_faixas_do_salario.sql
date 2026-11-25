-- ============================================================================
-- Faixas da barra "A pagar do salário" (painel de Orçamentos, espaço pessoal)
-- ============================================================================
--
-- A barra compara as faturas abertas dos cartões com o salário do mês e muda de
-- cor em duas faixas: âmbar a partir de `faixa_atencao` e vermelho a partir de
-- `faixa_alerta`, as duas como fração do salário (0,70 = 70%). Antes eram fixas
-- no código (70% e 100%); agora cada pessoa ajusta as suas em Espaços › Seu
-- salário.
--
-- Moram em `renda`, e não em `profile`: a policy `profile_select` deixa quem
-- divide um espaço ler o perfil inteiro, e `renda` só é lida pelo dono (ou por
-- quem ele abriu o salário). Mudar as faixas não grava `renda_historico`: o
-- gatilho `guardar_renda_anterior` só olha valor e recebimento.
-- ============================================================================

alter table public.renda
  add column faixa_atencao numeric(4,2) not null default 0.70,
  add column faixa_alerta  numeric(4,2) not null default 1.00,
  add constraint renda_faixas_validas check (
    faixa_atencao > 0
    and faixa_atencao < faixa_alerta
    and faixa_alerta <= 3
  );

comment on column public.renda.faixa_atencao is
  'Fração do salário a partir da qual as faturas abertas acendem o âmbar no painel (0,70 = 70%).';
comment on column public.renda.faixa_alerta is
  'Fração do salário a partir da qual as faturas abertas acendem o vermelho no painel (1,00 = 100%).';
