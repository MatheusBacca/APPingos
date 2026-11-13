# Pluggy — setup do administrador

> O que quem administra o APPingos faz **uma vez** para ligar o Open Finance. O guia de quem só
> vai conectar o próprio banco está no app, em Orçamentos › Open Finance (`GuiaPluggy.vue`). O
> porquê das decisões está em [notion-plano-open-finance.md](./notion-plano-open-finance.md).
>
> Escrito em 13/11/2026 a partir da documentação pública. A Pluggy muda telas e regras com
> frequência: **releia as fontes no dia de começar.** Cada passo diz de onde veio; o que não deu
> para confirmar está marcado **(não verificado)**.

## Antes de tudo: o relógio do trial

Criar a conta de desenvolvedor em `dashboard.pluggy.ai` inicia um **trial de 15 dias** (README do
MeuPluggy). **Só dá para ligar contas do MeuPluggy à Application enquanto o trial dura.** Depois
dele as ligações feitas continuam funcionando, mas a lista de conexões fica travada e um banco
novo não entra (Actual Budget; o README do MeuPluggy só diz que dá para continuar puxando os dados
depois do trial).

Então, antes de criar a conta:

1. Cada pessoa cria a conta no MeuPluggy e conecta **todos** os bancos que quer usar (passos 1 e 2
   abaixo). Isso não depende do trial.
2. Combinem um dia em que todo mundo possa fazer a ligação com o APPingos (passo 6).
3. Só então crie a conta no dashboard.

Se renovar o consentimento depois do trial esbarra na lista travada é **(não verificado)**:
testar com um banco antes de depender disso.

## 1. MeuPluggy — cada pessoa

Fonte: [README do MeuPluggy](https://github.com/pluggyai/meu-pluggy).

- Criar a conta em [meu.pluggy.ai](https://meu.pluggy.ai). É gratuito.
- Conectar cada banco: escolher a instituição e seguir a autorização dela. A maioria é pelo Open
  Finance oficial, com o consentimento dado no app do banco.
- O MeuPluggy atualiza os dados **uma vez por dia** (README; a documentação de Item da Pluggy
  confirma 24 horas para conexões do MeuPluggy).

A Pluggy avisa no FAQ que uma conta do MeuPluggy com bancos de titulares diferentes "está em
revisão por compliance": por isso **cada pessoa usa a própria conta**, e o APPingos trata a
conexão como de uma pessoa só.

## 2. A conta de desenvolvedor e a Application

Fontes: README do MeuPluggy; [Actual Budget](https://actualbudget.org/docs/advanced/bank-sync/pluggyai).

1. Criar a conta em [dashboard.pluggy.ai](https://dashboard.pluggy.ai). O trial começa aqui.
2. Personalizar a Application para que o **conector MeuPluggy** apareça na lista de conectores.
3. Criar a **Application de desenvolvimento**, que dá o `client_id` e o `client_secret`.

Os nomes exatos dos menus do dashboard são **(não verificado)**: o README e o Actual Budget
descrevem o caminho, mas a interface pode ter mudado.

## 3. As chaves no app (Nuxt)

`.env` local e, no Vercel, em **Production** e **Preview**:

```
NUXT_PLUGGY_CLIENT_ID=<client_id>
NUXT_PLUGGY_CLIENT_SECRET=<client_secret>
```

Elas ficam só no servidor (`server/utils/pluggy.ts`): ao navegador chega apenas o connect token,
que vale 30 minutos (documentação de autenticação da Pluggy). A tela Orçamentos › Contas lê
`/api/pluggy/status` e, sem as duas, explica em vez de oferecer o botão.

## 4. A Edge Function de sincronização

```bash
npx supabase functions deploy sincronizar-pluggy
```

Em **Project Settings › Edge Functions › Secrets**:

| Segredo | Valor |
| --- | --- |
| `PLUGGY_CLIENT_ID` | o mesmo `client_id` |
| `PLUGGY_CLIENT_SECRET` | o mesmo `client_secret` |
| `PLUGGY_WEBHOOK_SECRET` | opcional; só se for usar o webhook (passo 7) |

A função tem `verify_jwt = false` no `config.toml` e confere quem a chama: o banco (Bearer da
`service_role`) ou a Pluggy (header secreto).

## 5. As migrations e o cron

As migrations do Open Finance estão em `supabase/migrations/` (lista e ordem no relatório da
branch e em [pendencias-open-finance.md](./pendencias-open-finance.md)). Aplicar como as outras:
`npx supabase db reset` local, conferir a RLS com dois usuários e só depois `npx supabase db push`.
Em seguida, `npm run db:types` — os tipos desta branch foram escritos à mão.

O `pg_cron` chama a função todo dia às 7h de Brasília. Ele precisa de dois segredos no Vault,
criados **uma vez** no SQL Editor (a chave é a `service_role` legada, a que começa com `eyJ`):

```sql
select vault.create_secret(
  'https://SEU-PROJETO.supabase.co/functions/v1/sincronizar-pluggy',
  'pluggy_sincronizar_url'
);
select vault.create_secret('SUA-SERVICE-ROLE-KEY', 'pluggy_sincronizar_token');
```

Sem eles a tarefa roda e não faz nada. O horário ideal é depois da atualização diária do
MeuPluggy, que só se descobre com dado real: trocar com `cron.alter_job`.

## 6. Ligar as contas ao APPingos (dentro do trial)

Dois caminhos.

**Pelo app.** Cada pessoa, em Orçamentos › Contas, usa "Conectar banco": o app gera um connect
token com o id dela (`clientUserId`) e abre o widget da Pluggy (`pluggy-connect-sdk`). Ela escolhe o
MeuPluggy e autoriza, **uma vez por banco** (o README pede uma autorização por banco, não por
conta). Que o MeuPluggy aparece e autoriza dentro do widget de uma Application de desenvolvimento
é **(não verificado)**: o README descreve a ligação pelo app Demo do dashboard.

**Pelo Demo do dashboard.** O caminho que o README e o Actual Budget documentam: no dashboard,
abrir a Application, ir para o Demo, fazer a autorização do MeuPluggy (uma vez por banco) e copiar
o id do item (o Actual Budget cita "Ir para Demo" e "Copiar Item ID"). Cada pessoa cola o próprio
id em Orçamentos › Contas › "Já tenho o id da conexão". O item criado assim não tem `clientUserId`,
e o APPingos aceita: quem cadastra primeiro fica com ele (o `item_id` é único).

## 7. Webhook (opcional)

Um webhook da Pluggy para `transactions/created`, `transactions/deleted` e `item/updated`,
apontando para a URL da função, com o header `x-appingos-webhook: <PLUGGY_WEBHOOK_SECRET>`. Sem
ele, o cron diário basta — o MeuPluggy só atualiza uma vez por dia de qualquer jeito. Que a Pluggy
aceita header customizado na criação do webhook é **(não verificado)**.

## 8. Conferir no navegador

1. `npm run dev` com o `.env` preenchido e as migrations aplicadas.
2. Orçamentos › Open Finance: o bloco "Para quem administra o app" deve dizer "Pluggy configurada".
3. Orçamentos › Contas: conectar (ou colar o id), ver as contas aparecerem e marcar um cartão em
   "Compartilhar com".
4. Disparar a sincronização na mão (no SQL Editor, `select public.acordar_sincronizacao_pluggy();`)
   e conferir `transacao_bancaria` no Studio.
5. Orçamentos › Caixa de entrada: classificar uma compra de cada tipo; logar com a outra conta e
   confirmar que ela vê a compra compartilhada e **não** vê o extrato.

## Pontos da documentação ainda não confirmados

- O nome do campo de validade do consentimento no Item. O app lê `consentExpiresAt`; a página de
  Item da Pluggy remete a uma página de consentimentos que não foi lida.
- O sinal do valor no cartão e na conta, o formato de `paymentData` e se as faturas (`billId`)
  vêm pelo MeuPluggy. Tudo isso saiu da documentação; confirmar com a primeira amostra real.

## Fontes

- [MeuPluggy — README](https://github.com/pluggyai/meu-pluggy)
- [Pluggy — autenticação (apiKey e connect token)](https://v2.docs.pluggy.ai/en/docs/authentication)
- [Pluggy — Item](https://v2.docs.pluggy.ai/en/docs/connections/item)
- [Pluggy — FAQ](https://v2.docs.pluggy.ai/en/docs/get-started/faq)
- [Pluggy — Open Finance: considerações e FAQ](https://v2.docs.pluggy.ai/en/docs/open-finance/considerations-faq)
- [Actual Budget — sincronização com a Pluggy](https://actualbudget.org/docs/advanced/bank-sync/pluggyai)
