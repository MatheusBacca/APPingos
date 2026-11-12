# Plano — Open Finance com a Pluggy em Orçamentos

> Documento de planejamento, para colar no Notion antes de implementar. Ainda não existe
> nenhum código desta integração. O levantamento foi feito em 04/10/2026 e 08/10/2026 contra
> a documentação v2 da Pluggy (`v2.docs.pluggy.ai`). Preço, trial e limites da Pluggy mudam
> com frequência: **reconferir tudo no dia de começar.**

## Por que

O Chico Moedas tirou a lista de gastos do WhatsApp, mas herdou o defeito dela: **depende de
alguém digitar cada compra**. Lançar é o atrito, e esquecer é o erro silencioso — o saldo do
mês fica errado sem ninguém saber, e o acerto é feito em cima de um número incompleto. Duas
informações ainda vêm da memória de quem comprou: em que fatura a compra caiu (a
`competencia_inicial`) e em quantas parcelas.

O banco já sabe tudo isso. A Pluggy é um agregador de Open Finance: com o consentimento de cada
um, lê contas, cartões, faturas e transações de praticamente todos os bancos brasileiros numa
API só. Ela está na lista de integrações desde a fundação (`docs/plano-fundacao.md`,
`docs/notion-arquitetura.md`).

O pedido tem três partes, com custos muito diferentes, e vale separar logo:

1. **Ler as transações e transformá-las em compras** — a caixa de entrada. É o núcleo, e sai
   de graça.
2. **Ler faturas, saldos e recorrências** — features novas em cima do mesmo dado.
3. **Mover dinheiro** — um membro pagar o outro pelo app. É a única parte que a Pluggy cobra
   caro, e este plano resolve sem ela (ver "Acertar com Pix").

## O que já existe que ajuda

- **O modelo de Orçamentos aguenta dado importado sem mudar de forma.** Compra parcelada é uma
  linha só, expandida pela view `parcela_mensal`; `pago_por` (quem pagou) é separado do rateio
  (quem deve); categoria é por espaço e deduplicada por `nome_norm`
  (`20260804180000_orcamento_compras.sql`).
- **Gastos pessoais já são uma compra no espaço pessoal** (`docs/notion-plano-gastos-pessoais.md`).
  A privacidade é estrutural, não um filtro — a caixa de entrada herda essa decisão.
- **`acerto_mes`** já é o fato "esse mês foi pago". Um Pix entre os dois, lido do banco, pode
  confirmá-lo sozinho.
- **Segredo de API só no servidor**: `runtimeConfig` + `server/utils/*`, como TMDB e Spotify.
- **Conexão por pessoa**, com o desenho de `integracao_spotify`
  (`20260815172135_spotify_integracao.sql`).
- **`pg_cron` + `pg_net` + Edge Function com `service_role`** já rodando em produção no módulo
  de notificações (`enviar-emails`). Agendamento e escrita sem JWT de usuário não são
  território novo.
- **O motor de notificações**, para avisar de fatura perto do vencimento.
- **Testes de domínio no vitest** (`test/orcamento.test.ts`), onde as regras de importação
  vão morar.

## Decisão central: MeuPluggy, não o plano comercial

A Pluggy tem duas portas, e só uma faz sentido para um app de duas pessoas:

| | MeuPluggy | Plano comercial |
| --- | --- | --- |
| Custo | **Gratuito** | A partir de ~R$ 2.500/mês (fonte de terceiros, não oficial) |
| Open Finance | Sim, via a conta MeuPluggy de cada um | Recurso premium, liberado pelo time de vendas |
| Sincronização | Diária, sem atualização sob demanda | Agendável (6, 8, 12, 24h…) e sob demanda |
| Categorização e recorrências | Só durante o trial | Incluídas conforme o plano |
| Pagamentos (iniciar Pix) | Não | Sim, liberado pelo time comercial |

**Como o MeuPluggy funciona:** cada um cria conta em `meu.pluggy.ai` e conecta os próprios
bancos — o consentimento do Open Finance é dado no app de cada banco. Do lado do APPingos, uma
Application no `dashboard.pluggy.ai` inclui o conector MeuPluggy e enxerga essas conexões como
*items* (um por banco de cada pessoa). O app lê; quem guarda o consentimento é o MeuPluggy.

**O relógio do trial.** Criar a conta no dashboard inicia um trial — 15 dias, segundo o README
do MeuPluggy (um site de terceiros fala em 14). **Só dá para ligar contas ao MeuPluggy enquanto
o trial está ativo.** Depois dele as conexões continuam funcionando, mas a lista fica travada:
um banco novo não entra mais. É a pegadinha que mais custa caro, e ela decide a ordem das fases
(ver "Fases de implementação").

## Decisão central: transação bancária é da pessoa, não do espaço

O extrato de alguém tem o presente para a outra pessoa, o lanche da tarde, a assinatura que é
só sua. Se as transações morassem no espaço do casal, a privacidade dependeria de todo
agregado lembrar de filtrar — o mesmo caminho que o plano de gastos pessoais recusou.

Então:

- **`transacao_bancaria` tem RLS `user_id = auth.uid()`**, sem exceção. Nem a outra pessoa do
  espaço lê.
- Uma transação só aparece para a outra pessoa quando a dona dela **a promove a compra** no
  espaço do casal — e aí o que aparece é a compra, não a transação.
- **A conexão também é por pessoa** (`conexao_bancaria`), como o Spotify. Um espaço de casal
  pode ter zero, um ou dois membros conectados, e cada um conecta só o que quiser.

## Decisão central: a sincronização mora numa Edge Function

O webhook da Pluggy chega sem o JWT de ninguém. Gravar pelo Nuxt exigiria `service_role` no
app — e o projeto escolheu de propósito "autenticar como usuário, e não com `service_role`,
mantém a RLS valendo". Na Edge Function, o `service_role` já vive (é como `enviar-emails`
escreve).

- **`sincronizar-pluggy`** (Edge Function) busca as transações novas de cada item e grava em
  `transacao_bancaria`.
- **Acionada pelo `pg_cron` uma vez por dia** — o MeuPluggy só atualiza diariamente, então
  mais que isso é desperdício. O horário certo é depois da atualização do MeuPluggy (a
  descobrir com dado real). Lembrar que `cron.schedule` roda em UTC.
- **Webhook `transactions/created` opcional**, apontando para a mesma função. Regras da Pluggy:
  responder 2xx em até 10 s (processar depois), até 3 tentativas (na hora, ~15 min, ~2 h), e
  400/401/403/404/405 encerram as tentativas. Autenticar o webhook com um header customizado
  secreto; o IP de origem da Pluggy é `52.67.145.81`.
- **No Nuxt fica só o que tem usuário logado**: a rota que gera o connect token e as leituras.

## O modelo de dados (rascunho)

Nomes e colunas finais saem da migration — isto é o desenho, não o SQL.

**`conexao_bancaria`** — um item da Pluggy (um banco de uma pessoa).
`user_id`, `item_id` (único), `banco`, `status`, `consentimento_expira_em`, `sincronizado_em`.
RLS: só o dono lê e escreve.

**`transacao_bancaria`** — o extrato bruto, normalizado na entrada.

| Coluna | De onde vem |
| --- | --- |
| `user_id`, `conexao_id`, `conta_id` | do item e da conta na Pluggy |
| `provider_id` (único por pessoa) | `providerId` — o id estável no Open Finance |
| `descricao`, `valor`, `data`, `tipo` | `description`, `amount`, `date`, `type` |
| `pendente` | `status = PENDING` |
| `parcela_numero`, `parcelas_total`, `valor_total_compra`, `data_compra`, `fatura_id` | `creditCardMetadata` |
| `contraparte_nome`, `contraparte_documento`, `metodo` | `paymentData` (Pix, TED, boleto) |
| `categoria_pluggy` | `category` — só vem durante o trial |
| `destino` | `null` = na caixa de entrada; `'compra'`; `'ignorada'` |
| `compra_id` | a compra que esta transação virou (`on delete set null`) |

O vínculo mora na transação, não na compra: várias transações (as parcelas) apontam para a
mesma compra, e a compra no espaço do casal não carrega nada do extrato de ninguém. Se a compra
for apagada, a transação volta para a caixa de entrada.

## Pegadinhas a resolver antes de começar

**1. A janela do trial.** Ver acima. Os `itemId`s também podem ser copiados do demo do
dashboard (é o que o Actual Budget documenta), então ligar as contas não depende do widget
estar pronto — só de alguém sentar e fazer, dentro dos 15 dias.

**2. Parcelado chega como N transações.** A Pluggy manda uma transação por parcela, uma em cada
fatura. Importar direto quebra a decisão nº 1 de Orçamentos (compra parcelada é uma linha).
A regra:

- a **primeira parcela vista** cria a compra com `parcelas = totalInstallments`,
  `valor_total = totalAmount` e `data_compra = purchaseDate`;
- se a primeira vista for a parcela *k* de *N* (compra anterior à conexão), a
  `competencia_inicial` recua *k − 1* meses;
- as parcelas seguintes **só se vinculam** (`compra_id`), sem criar nada.

Reconhecer que duas parcelas são da mesma compra é heurística (cartão + `purchaseDate` +
`totalAmount` + `totalInstallments` + descrição normalizada). Validar com dado real antes de
confiar.

**3. Contar duas vezes.** Pagamento de fatura no débito, transferência entre contas próprias,
aplicação e resgate, estorno. Se virarem compra, todo gasto no cartão aparece duas vezes.
Ignorar por regra — pela categoria da Pluggy enquanto ela vier, e depois por tipo, descrição e
contraparte (contraparte = a própria pessoa).

**4. Id que muda.** O `id` da transação pode mudar quando o dado do banco muda. A chave de
deduplicação é o `providerId`. `transactions/updated` e `transactions/deleted` precisam ser
tratados, e uma transação `PENDING` vira `POSTED` depois.

**5. Sinal do valor.** No cartão, positivo é gasto e negativo é pagamento ou estorno; na conta,
quem diz é `type` (`DEBIT`/`CREDIT`). Normalizar na ingestão para o resto do app não precisar
saber.

**6. Fuso horário.** `date` vem em ISO 8601 UTC. Uma compra às 22h de 31/08 em Brasília é
01/09 em UTC — e cai no mês errado. Converter para `America/Sao_Paulo` antes de truncar para
data ou competência.

**7. Competência pela fatura — se vier.** Com `billId` e o vencimento da fatura, a competência
deixa de ser "informação que só quem comprou tem" (comentário da migration de Orçamentos).
Mas a Pluggy só entrega faturas em conexão regulada. O MeuPluggy é Open Finance, então deve
vir — **confirmar com dado real**. Sem fatura, vale a regra de hoje: mês da compra, editável.

**8. Consentimento expira.** Consentimento de Open Finance tem validade (em geral até 12
meses). A tela de contas conectadas mostra o status de cada item e o
`consentimento_expira_em`, e avisa antes de vencer. A renovação é no MeuPluggy. **Não sei se
renovar depois do trial esbarra na lista travada** — testar antes de depender disso.

**9. Categoria da Pluggy é emprestada.** O campo `category` é recurso de enriquecimento: vem no
trial e vira premium depois. A sugestão de categoria não pode depender dele — tem que aprender
com as escolhas de vocês por estabelecimento. É melhor de qualquer jeito, porque as categorias
são por espaço e têm os nomes de vocês.

**10. Diário não é tempo real.** O dado chega no dia seguinte. O lançamento manual continua
existindo para quem quer ver o gasto na hora, e é conciliado com o banco depois.

## A caixa de entrada

O coração do plano: **lançar vira classificar.**

Cada pessoa vê só as próprias transações ainda não classificadas. Um toque decide o destino:

- **Compartilhada** — vira compra no espaço do casal, com `pago_por` = você e o rateio padrão
  do espaço (editável antes de salvar).
- **Pessoal** — vira compra no seu espaço pessoal. Mesma gaveta do botão "Gastos pessoais".
- **Ignorar** — some da caixa e não volta (transferência, pagamento de fatura que escapou da
  regra, etc.).
- **Já lancei** — vincula a uma compra lançada à mão. O app sugere as candidatas por valor e
  janela de data.

Promover para compra passa pelas RPCs que já existem (`registrar_compra`), então rateio,
categoria e validações valem igual a um lançamento manual.

**Lembrar a escolha por estabelecimento:** "iFood → pessoal", "Mercado X → compartilhada 50/50,
categoria Mercado". No v1 isso é **sugestão pré-preenchida**, não lançamento automático — nada
entra no espaço do casal sem um toque humano.

**Conciliação, nos dois sentidos:**

- transação sem compra → está na caixa de entrada;
- compra manual sem transação depois de alguns dias → aviso discreto de "não achei no
  extrato". Dinheiro vivo ou cartão não conectado é legítimo, então é aviso, não erro.

**Pagar uma conta em nome do outro** já é coberto: é uma compra com `pago_por` = quem pagou e o
outro como único participante do rateio. Com a importação, esse lançamento chega pelo extrato
em vez de ser digitado, e entra no acerto do mês.

## Acertar com Pix

**A pergunta:** dá para um membro pagar o outro (o saldo do mês) pelo próprio app, via Pluggy?

**O que a Pluggy oferece para mover dinheiro:**

| Produto | Serve para A pagar B? | Custo |
| --- | --- | --- |
| **Payments** (iniciação de Pix via Open Finance) | Tecnicamente sim: a conta de B vira um destinatário cadastrado, o app gera um link e A aprova no banco. Pensado para empresa cobrar cliente; a aprovação vence em 5 min | Liberado pelo time comercial. Não vem no MeuPluggy nem no trial |
| **Smart Transfers** (aprova uma vez, depois transfere sozinho) | **Não.** Todos os destinatários precisam ser do mesmo dono, e conta PF aceita um destinatário só. Serve para mover dinheiro entre contas suas | Idem |
| **Pix Automático** | **Não.** Pela regra do Banco Central, o recebedor precisa ser pessoa jurídica | Idem |

E mesmo pagando, **a Pluggy não elimina o passo que pesa**: quem paga continua aprovando cada
Pix no app do banco.

**O caminho gratuito: o próprio app gera o Pix.** O Pix copia e cola e o QR Code com valor fixo
(o BR Code estático) são um padrão aberto do Banco Central — gerar não exige provedor nem
contrato. Junto com a leitura do MeuPluggy, o ciclo fecha sem custo:

1. **"Acertar o mês"** abre o Pix pronto: chave de quem recebe, valor do `SaldoDoMes`, botão
   de copiar e o QR.
2. **Quem paga cola no app do banco e confirma** — a mesma aprovação que a Pluggy Payments
   exigiria.
3. **No dia seguinte o MeuPluggy traz o Pix** (saída de um, entrada do outro). O app confere
   por valor, janela de data e contraparte (`paymentData`) e marca o `acerto_mes` sozinho.

A única diferença para a versão paga é o tempo da confirmação: na hora, pela Payments; no dia
seguinte, pelo MeuPluggy.

**O que isso exige:**

- **Chave Pix de cada membro no perfil**, legível só por quem divide espaço com a pessoa. É
  dado pessoal — mesma régua de RLS do resto.
- **Geração do BR Code**: a lib `pix-utils` ou uma função própria de ~50 linhas (TLV + CRC16),
  com teste no vitest. Para o QR, uma lib de QR Code (hoje não há nenhuma no `package.json`).
- **A regra de conciliação** Pix ↔ saldo devido, como função pura testável.

## Features novas sobre o mesmo dado

Cada uma pode virar plano próprio; aqui fica só o que o dado do banco destrava.

1. **Faturas dos cartões** — total, vencimento e aviso antes de vencer, pelo motor de
   notificações. Depende da pegadinha 7.
2. **Assinaturas e contas fixas** — detecção própria em SQL com a mesma régua que a API de
   recorrências da Pluggy usa (3+ ocorrências, intervalo de 30 ± 5 dias, variação de até 10%),
   já que essa API é premium depois do trial. Total mensal de assinaturas e aviso de "ficou
   mais cara".
3. **Teto por categoria** — o módulo hoje registra gastos, mas não tem limite. Com o dado
   completo, o teto passa a ser confiável.
4. **Receitas e taxa de poupança** — as entradas (salário, por exemplo) também vêm do banco. É
   um conceito novo: hoje só existe `compra`.
5. **Projeção do mês** — parcelas futuras (a `parcela_mensal` já calcula) + contas fixas +
   salário = a sobra prevista.
6. **Saldos e investimentos em Objetivos** — meta de economia com progresso automático,
   cruzando com a lista de Interesses. **Opt-in por pessoa**: saldo de um não aparece para o
   outro sem escolha explícita.

## Invariantes que a implementação tem que preservar

Cada uma é uma forma de errar em silêncio, e vale um teste:

1. Nenhuma `transacao_bancaria` é legível por outra pessoa — nem por quem divide o espaço.
2. Compra parcelada importada é **uma linha só**, e a soma das parcelas na `parcela_mensal`
   bate com o `totalAmount` do banco.
3. Reimportar o mesmo período não duplica nada (idempotência por `provider_id`).
4. Nada entra no espaço do casal sem um toque humano (v1). A ingestão só enche a caixa de
   entrada.
5. Pagamento de fatura e transferência entre contas próprias nunca viram compra.
6. `client_secret` e `apiKey` nunca chegam ao browser — o connect token (30 min, escopo
   limitado) é o único que chega.
7. Nenhuma `service_role` no Nuxt.

## Fases de implementação

1. **Regras puras, com fixtures** — parcelas, deduplicação, contagem dupla, fuso e sinal, como
   funções testadas no vitest contra exemplos montados a partir da documentação. Não depende
   da Pluggy, então **não gasta o trial**.
2. **Pluggy + MeuPluggy (o relógio começa aqui)** — os dois criam conta no MeuPluggy e
   conectam os bancos; criar a conta no dashboard, a Application com o conector MeuPluggy,
   ligar as contas dos dois e anotar os `itemId`s. Guardar `NUXT_PLUGGY_CLIENT_ID` e
   `NUXT_PLUGGY_CLIENT_SECRET` no `.env`, no Vercel e nos secrets das Edge Functions. **Salvar
   uma amostra real das transações** (anonimizada) como fixture, para revalidar a fase 1.
3. **Conexão** — migration de `conexao_bancaria`, `server/utils/pluggy.ts` (`pluggy-sdk`, com
   cache do `apiKey` de 2 h), rota do connect token com `clientUserId` = id do usuário,
   `pluggy-connect-sdk` (o `react-pluggy-connect` só serve para React) e a tela "Contas
   conectadas": status, última sincronização e validade do consentimento.
4. **Ingestão** — migration de `transacao_bancaria`, Edge Function `sincronizar-pluggy`,
   `pg_cron` diário. Sem tela ainda: confere-se no Studio.
5. **Caixa de entrada + conciliação.** **É a fase que entrega o valor principal.**
6. **Acertar com Pix** — chave Pix no perfil, BR Code + QR, conciliação que marca o
   `acerto_mes`.
7. **Faturas e avisos.**
8. **Assinaturas, teto por categoria, projeção, receitas e Objetivos** — um plano para cada,
   quando chegar a vez.

Fases 1–5 tiram o "digitar cada compra"; a 6 tira o "a gente já acertou?" do WhatsApp.

## Riscos

- **O MeuPluggy é gratuito e não tem garantia de serviço.** As regras dele podem mudar — o
  trial com lista travada já é uma dessas regras. O app tem que continuar funcionando inteiro
  sem a integração: lançamento manual nunca sai.
- **Dado bancário no Supabase.** A RLS por pessoa é a defesa; um furo numa policy é vazamento
  de extrato. Testar com dois usuários no Studio local antes do `db push`, como o README já
  pede para toda policy.
- **Heurística de parcelas** pode errar com dado real — por isso a caixa de entrada sugere e a
  pessoa confirma.
- **Pins.** Promover da caixa de entrada é um `insert` em `compra`, então rende `gasto_novo`
  como um lançamento manual (o teto diário segura uma enxurrada de 200 transações num domingo).
  O bônus `calor_da_hora` (lançar no dia da compra) praticamente nunca vale para importados,
  porque o dado chega no dia seguinte — o que é coerente: ele premia quem lança na hora, à
  mão. Decidir isso de propósito, não descobrir depois.

## Fora de escopo por enquanto

- **O plano comercial da Pluggy** (Payments, Smart Transfers, Open Finance direto). O custo é
  desproporcional para dois usuários.
- **Pagar pelo app sem abrir o banco.** Exige a iniciação de pagamento paga, e mesmo ela pede a
  aprovação no banco. O Pix copia e cola resolve o mesmo problema.
- **Lançamento automático sem toque humano** — só depois que as regras por estabelecimento se
  provarem com uso real.
- **Ver o saldo ou o extrato do outro.** Se um dia entrar, é opt-in explícito de quem mostra.
- **Importar OFX à mão** — o MeuPluggy já exporta planilha, e o app não precisa de um segundo
  caminho de importação.
- **Contas PJ/MEI e pagamento de boleto pelo app.**

## Referências

- [Pluggy — visão geral da plataforma](https://v2.docs.pluggy.ai/en/docs/overview)
- [Pluggy — autenticação (apiKey e connect token)](https://v2.docs.pluggy.ai/en/docs/authentication)
- [Pluggy — Item (status, auto-sync, consentimento)](https://v2.docs.pluggy.ai/en/docs/connections/item)
- [Pluggy — Transactions](https://v2.docs.pluggy.ai/en/docs/products/transactions)
- [Pluggy — Credit Card Bills](https://v2.docs.pluggy.ai/en/docs/products/credit-card-bills)
- [Pluggy — Open Finance](https://v2.docs.pluggy.ai/en/docs/open-finance/overview)
- [Pluggy — Webhooks](https://v2.docs.pluggy.ai/en/docs/developer-tools/webhooks-ref)
- [Pluggy — Recurring Payments](https://v2.docs.pluggy.ai/en/docs/intelligence/recurring-payments)
- [Pluggy — Payments](https://v2.docs.pluggy.ai/en/docs/payments/overview)
- [Pluggy — Smart Transfers: pré-autorização](https://v2.docs.pluggy.ai/en/docs/smart-transfers/preauthorization)
- [Pluggy — Pix Automático](https://v2.docs.pluggy.ai/en/docs/payments/pix-automatico)
- [Pluggy — FAQ](https://v2.docs.pluggy.ai/en/docs/get-started/faq)
- [MeuPluggy (GitHub)](https://github.com/pluggyai/meu-pluggy)
- [Actual Budget — sincronização com a Pluggy](https://actualbudget.org/docs/advanced/bank-sync/pluggyai)
  — o passo a passo de uso pessoal mais claro que existe, e a fonte da trava pós-trial
- [Toolmage — planos da Pluggy](https://www.toolmage.com/pt/tool/pluggy/) — fonte não oficial
  do preço
- [Finsiders — regras do Pix Automático](https://finsidersbrasil.com.br/regulamentacao/bc-anuncia-regras-do-pix-automatico-servico-sera-lancado-em-outubro-de-2024/)
- SDKs no npm: `pluggy-sdk`, `pluggy-connect-sdk`, `pix-utils`
- `docs/notion-plano-gastos-pessoais.md` — a decisão de privacidade estrutural, herdada aqui
- `docs/notion-plano-spotify.md` — a conexão por pessoa, herdada aqui
