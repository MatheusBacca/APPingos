-- ============================================================================
-- APPingos — tira o enchimento do Nubank de tarifa e crédito contratado.
--
-- A primeira sincronização real (20/11/2026) mostrou que o Nubank manda
-- `feeType: "OTHER"` e `otherCreditsType: "OTHER"`, com informação adicional
-- "NA", em TODA compra. A importação gravou isso como tipo de tarifa; a versão
-- corrigida (`tipoInformado` em _shared/importacao-bancaria.ts) passa a mandar
-- null, mas a ingestão mantém o valor antigo quando o novo é null. Daí limpar.
-- ============================================================================

update public.transacao_bancaria set tarifa_tipo = null where tarifa_tipo = 'OTHER';
update public.transacao_bancaria set credito_tipo = null where credito_tipo = 'OTHER';
