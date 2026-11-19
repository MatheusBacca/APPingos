# Plano — tudo o que a Pluggy já manda

> 20/11/2026. Branch `parcelado-inteiro`, sem commit. Continua
> [notion-plano-open-finance.md](./notion-plano-open-finance.md) e
> [pendencias-open-finance.md](./pendencias-open-finance.md).

## Por que

A sincronização diária lia da Pluggy bem mais do que gravava. Ficavam de fora:

- o **final do cartão** de cada compra. O cartão virtual do casal (0750) e o físico pessoal (0025)
  faturam na mesma conta Nubank, e sem o final não dá para separar um do outro;
- o **saldo** das contas;
- o **fechamento** da fatura. O `balanceCloseDate` da conta é sempre nulo no Open Finance, mas cada
  fatura fechada traz o seu `billClosingDate`;
- o **MCC**, os **juros, IOF e multa** da fatura, a **moeda** da compra internacional, a **mensagem**
  do Pix, a **multa** do boleto;
- **Investimentos** e **Empréstimos**, que nem eram consultados.

## O que a documentação da Pluggy confirma

Fonte: o OpenAPI da Pluggy (`docs.pluggy.ai/openapi/pluggy-api.json`) e as páginas de produto.

| Dado | Onde vem | Observação |
| --- | --- | --- |
| Final do cartão | `creditCardMetadata.cardNumber` | "pode ser diferente do da conta se a compra foi feita por um cartão adicional ou virtual" |
| Lista de cartões | `creditData.additionalCards[].number` | aparece antes de qualquer compra |
| Titular ou adicional | `creditData.holderType` | `MAIN` / `ADDITIONAL` |
| Fechamento da fatura | `bills[].billClosingDate` | por fatura; o `balanceCloseDate` da conta não serve |
| Encargos | `bills[].financeCharges[]` | juros, multa, juros de mora, IOF, outros |
| Pagamentos da fatura | `bills[].payments[]` | integral, parcial ou outro; débito, boleto ou Pix |
| MCC | `creditCardMetadata.payeeMCC` | campo do padrão Open Finance Brasil, **não é enriquecimento** |
| À vista / parcelada | `creditCardMetadata.paymentType` | só Open Finance, e só para o que sincronizar a partir de agora |
| Hora da compra | `creditCardMetadata.transactionDateTime` | só Open Finance |
| Fatura prevista | `creditCardMetadata.billForecastDate` | `YYYY-MM`; vem também para as compras pendentes |
| Data em que entrou na fatura | `creditCardMetadata.billPostDate` | só Open Finance |
| Moeda estrangeira | `currencyCode` + `amountInAccountCurrency` | `amount` vem na moeda da compra |
| Saldo | `account.balance`, `bankData.*` | no cartão, é o valor da fatura aberta |
| Investimentos | `GET /investments`, `/investments/{id}/transactions` | movimentos `BUY`, `SELL`, `TAX`, `INTEREST`… |
| Empréstimos | `GET /loans` | parcelas, CET, pagamentos |
| Situação por produto | `item.statusDetail` | `isUpdated` e avisos por produto |

### O MCC fica na conta grátis?

Fica. O **MeuPluggy** é gratuito, não precisa de due diligence e **não expira com o trial**; o
limite é de 5 conexões, para uso pessoal. O que exige o plano Pro é o **enriquecimento**: o
`merchant` inteiro e o `category` (marcado como "Enrichment Categorizer"). O `payeeMCC` faz parte
do dado regulado do Open Finance Brasil que o banco entrega na transação de cartão. Não é
enriquecimento, então não depende de plano.

Hoje a `categoria_pluggy` chega em 100% das transações da produção, mesmo sem Pro. Mesmo assim, a
onda 2 aproveita a categoria **enquanto ela vier** para semear as regras do Orçamentos
(`regra_classificacao`). Se um dia ela parar de vir, as regras ficam.

## Onda 1 — feita (sem precisar de dado real)

| Peça | Arquivo |
| --- | --- |
| Colunas novas na transação, na conta, na fatura e na conexão; `cartao_bancario`, `investimento`, `investimento_movimento`, `emprestimo`, `amostra_pluggy`; `lancar_compras_do_cartao` por cartão; ingestão com os campos novos | `supabase/migrations/20261120100000_open_finance_campos_novos.sql` |
| Tipos e chamadas novas da Pluggy | `supabase/functions/_shared/pluggy-api.ts` |
| Normalização de cada campo; compra em dólar entra pelo valor em reais | `supabase/functions/_shared/importacao-bancaria.ts` |
| Sincronização: saldo de todas as contas, cartões por final com lançamento por cartão, investimentos, empréstimos, amostras e uma releitura de 90 dias (`versao_coleta`) | `supabase/functions/sincronizar-pluggy/index.ts` |
| Fechamento pela fatura (`billClosingDate`) ou **estimado** pelas datas das compras; a fatura aberta não soma o que já está numa fechada | `app/lib/cartoes.ts`, `app/composables/useCartoes.ts` |
| Cartão na tela: bandeira e nível, "cartão bloqueado", valor da fatura segundo o banco, fechamento e encargos de cada fatura | `app/components/CartaoFatura.vue` |
| Contas: saldo de cada conta corrente e **os cartões de cada fatura**, cada um com o seu destino (como a conta, compartilhado com um espaço, pessoal ou perguntar) | `app/pages/orcamentos/open-finance/contas.vue`, `app/lib/contas-bancarias.ts` |
| Caixa de entrada: mensagem do Pix, final do cartão, hora, moeda original, multa e juros do boleto | `LinhaDaCaixa.vue`, `DetalheDaCaixa.vue` |
| Testes | `test/open-finance-campos-novos.test.ts`, `test/fechamento-e-cartoes.test.ts` + SQL local (9 verificações de cartão, 6 de parcelas) |

**O fechamento estimado já resolve hoje.** Com os dados atuais da produção, o 1683 dá dia 1 e o
0025 dá dia 2. A tela mostra "~fecha em N dias" até o `billClosingDate` chegar; aí a fonte passa a
ser a fatura.

**Designação por cartão.** `cartao_bancario.destino = 'herdar'` segue a conta. Escolher outro vale
só para as compras daquele final e só para as que entrarem depois (`designada_em`, como a conta). A
chamada da conta pula as compras de cartão com destino próprio, e a de cada cartão lança só as dele.
Sair do espaço solta o cartão. A sincronização cria os cartões; a pessoa muda só destino, espaço e
apelido.

## Primeira rodada — o estudo

Depois do deploy, a primeira sincronização relê 90 dias e grava a última resposta crua de cada
recurso em `amostra_pluggy`. As perguntas, nesta ordem:

1. O Nubank manda `cardNumber`? Em que formato? O 0750 aparece em `additionalCards`?
2. Vem `payeeMCC`? Em quantas transações?
3. Vem `billClosingDate`? Bate com o fechamento estimado?
4. `paymentType`, `transactionDateTime`, `billForecastDate` e `billPostDate` vêm?
5. Na compra internacional (Anthropic), `amount` vem em USD e `amountInAccountCurrency` em reais,
   como a documentação diz? O IOF vem numa transação separada?
6. Os `financeCharges` vêm com valor positivo? Em que fatura caem?
7. Investimentos: as caixinhas e o RDB da NuConta vêm? E com movimentos?
8. Empréstimos: algum?

Consulta de estudo (produção, só leitura):

```sql
select recurso, coletada_em, jsonb_array_length(case jsonb_typeof(dados) when 'array' then dados else '[]' end) as itens
from amostra_pluggy order by recurso;
```

## Resultado da primeira rodada (20/11/2026, produção)

| # | Pergunta | Resposta |
| --- | --- | --- |
| 1 | Final do cartão | **Vem.** Uma conta de cartão traz o físico e os virtuais na mesma fatura, cada transação com o seu final; os virtuais também vêm em `additionalCards`. `holderType` não vem. |
| 2 | MCC | **Vem** em mais de 90% das compras de cartão. |
| 3 | Fechamento | **Vem** em toda fatura (`billClosingDate`). A estimativa pelas compras errava em 2 a 3 dias; com o oficial, a fonte do ciclo é `fatura`. |
| 4 | Cobrança, hora, fatura prevista, data na fatura | **Vêm** em quase todas. |
| 5 | Compra em dólar | **Confirmado**: `amount` na moeda da compra e `amountInAccountCurrency` em reais. O IOF vem numa transação separada ("IOF de \"…\""). |
| 6 | Encargos | Nenhum nas faturas pagas integralmente. `allowsInstallments` e `payments` vêm. |
| 7 | Investimentos | **Vêm**: as caixinhas do Nubank como CDBs, com movimentos. |
| 8 | Empréstimos | Nenhum na amostra. |

E três surpresas:

- O `account.balance` do cartão **não é a fatura aberta**: é o limite tomado, parcelas futuras
  incluídas (bate com limite − disponível). A tela deixou de mostrá-lo.
- O Nubank manda `feeType`/`otherCreditsType` `"OTHER"` com `"NA"` em toda compra. Isso é
  enchimento: a importação ignora (migration `20261120120000_tarifa_sem_enchimento.sql`).
- O `boletoMetadata` vem dentro de `paymentData`. E nenhum Pix trouxe `reason`, então a mensagem
  depende do banco mandar.

## Onda 2 — depende da primeira rodada

| # | Feature | Depende de |
| --- | --- | --- |
| 2.1 | Marcar o 0750 como do SpacePingos na tela de Contas (o que já está na caixa sem final ganha o final pela releitura) | pergunta 1 |
| 2.2 | **MCC → categoria do Orçamentos**: tabela de MCC por categoria base (5411 mercado, 5812 restaurante, 5541 posto…), usada pela sugestão e pelo "Já lancei" | pergunta 2 |
| 2.3 | **Regras iniciais pela categoria da Pluggy**: categoria Pluggy → categoria do espaço, semeando `regra_classificacao` enquanto a categoria vier | pergunta 2 |
| 2.4 | **Juros, IOF e multa da fatura no acompanhamento de gastos** do mês em que a fatura foi paga, como gasto pessoal "Encargos do cartão" | pergunta 6 |
| 2.5 | **IOF ligado à compra internacional** ("IOF de \"Anthropic* Claude Sub\"") e o valor em dólar ao lado | pergunta 5 |
| 2.6 | **"Já lancei" com hora, cartão e MCC** como desempate (dois Ubers no mesmo dia), junto das regras do casamento manual × caixa (total do parcelado, janela maior para assinatura, N transações para uma compra) | perguntas 1, 2, 4 |
| 2.7 | **Pix recebido com a mensagem** na conciliação do acerto do casal ("acerto out") | — (a mensagem já aparece; a conciliação usa na 2.7) |
| 2.8 | Competência pela **fatura prevista** nas compras pendentes | pergunta 4 |
| 2.9 | "Atualizado há X h" e o aviso por produto na tela de Contas (`situacao_produtos`) | — |

## Onda 3 — Investimentos e Empréstimos

- **Aba "Investimentos"** em Orçamentos, ao lado de Open Finance: posições (caixinhas, RDB, CDB,
  fundos), saldo, rendimento, vencimento, e um total no topo.
- **Gamificação com as Metas.** A pessoa liga uma posição a uma meta (`investimento.meta_id`). Os
  movimentos viram o histórico da meta: aplicação (`BUY`) conta como aporte e resgate (`SELL`) como
  retirada. O saldo real da posição é o progresso da meta. Os pins e sequências que as metas já têm
  passam a contar os aportes automáticos.
- **Aplicação/resgate na caixa de entrada.** A transferência para a caixinha que aparece no extrato
  ("Aplicação RDB 200,00") se reconhece pelo movimento do investimento e sai da caixa como aporte.
- **Empréstimos** num cartão da mesma aba: parcelas restantes, próxima parcela e CET. A parcela
  paga entra como gasto do mês.

Depende das perguntas 7 e 8. O banco é desta onda; a tela e a gamificação, não.

## Onda 4 — Painel

Saldo consolidado das contas no painel. Cartão mostra a fatura aberta segundo o banco ao lado da
nossa soma, e um aviso quando as duas divergem.

## Release

1. Aplicar `20261119200000_parcelado_inteiro.sql` e `20261120100000_open_finance_campos_novos.sql`
   no **teste**, publicar `sincronizar-pluggy` no teste e conferir as telas com as contas fictícias.
2. Na produção, o mesmo, no release.
3. A primeira sincronização depois do deploy relê 90 dias de cada conexão (uma vez só, pela
   `versao_coleta`). O upsert por `provider_id` torna isso inócuo; o custo é uma execução mais longa.

## Riscos

- **Formato do `cardNumber`.** A normalização pega os 4 últimos dígitos de qualquer formato. Se o
  Nubank não mandar o campo, a designação por cartão não tem o que separar, e a tela não mostra a
  lista. O plano B é o casamento com a compra manual (onda 2.6).
- **Compra em dólar.** A normalização passou a usar `amountInAccountCurrency` quando a moeda não é
  real. A pergunta 5 confirma; até lá vale o que a documentação diz.
- **Estimativa do fechamento.** Erra um dia quando o banco empurra o fechamento para o dia útil.
  `totalDoCiclo` já ignora o que tem `fatura_id`, então o erro aparece só na data, não no valor.
