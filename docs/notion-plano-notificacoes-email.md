# Notificações: o canal único, e o e-mail como entrega

> Complemento do plano [Notificações](https://app.notion.com/p/3b82670503c48066b7b1e75a1d7fb7e8),
> escrito **depois** de implementar. O plano descrevia a fase 1 in-app com push numa fase 2;
> aqui está o que foi construído de verdade e por que o e-mail passou na frente do push.

## O que mudou em relação ao plano

O plano deixava e-mail explicitamente fora de escopo e mirava push como fase 2. A inversão tem
um motivo só, e ele é o mesmo que o pedido original levanta: *"evitando ficar bom apenas no
Android e mais ou menos no iOS"*.

| | Push web | E-mail |
| --- | --- | --- |
| Android | ótimo | ótimo |
| iPhone | só com o app instalado na tela de início, com restrições | ótimo |
| Precisa de service worker próprio | sim (`injectManifest`) | não |
| Precisa de permissão do sistema | sim | não |
| Chega com o app desinstalado | não | sim |

Push continua no plano. Ele entra **em cima deste mesmo motor** — mais um canal lendo a mesma
tabela `notificacao`, do mesmo jeito que o e-mail lê hoje. Nada do que está aqui precisa mudar
para isso acontecer.

## O caminho de um aviso

```
alguém lança um gasto
  └─ trigger em `compra`
      └─ notificar()            regras: não avisa o ator, respeita preferência, agrupa
          ├─ linha em `notificacao`              -> o sino e /notificacoes
          └─ trigger de e-mail
              ├─ linha em `notificacao_email_fila`   (só se a pessoa optou pelo e-mail)
              └─ pg_net acorda a Edge Function
                  └─ `enviar-emails` drena a fila e chama o Resend
```

Três propriedades do desenho valem mais que os detalhes:

1. **Uma linha por destinatário.** A notificação nasce recortada por pessoa, então o
   roteiro-surpresa simplesmente não gera linha para quem não pode saber dele. Não existe
   "filtrar na leitura" — que é justamente o que a migration do alerta de spoiler recusou.
2. **A fila desacopla o envio da transação.** Quem lançou o gasto não espera o Resend, e não vê
   erro se o Resend estiver fora do ar. O que falhou fica visível em `notificacao_email_fila`,
   com o erro e o número de tentativas.
3. **Só INSERT vira e-mail.** A notificação agrupada é um UPDATE ("2 alterações" vira "3").
   Três correções no mesmo gasto rendem um e-mail, não três.

## Os tipos, e os cinco interruptores

| Categoria | Tipos |
| --- | --- |
| Orçamentos | `gasto_novo`, `mes_fechado` |
| Viagens | `roteiro_novo`, `roteiro_liberado` |
| Filmes & Séries | `interesse_novo`, `marcado_assistiu` |
| Edições e remoções | `gasto_editado`, `gasto_removido`, `roteiro_editado` |
| Lembretes | `lembrete_filmes`, `viagem_perto` |

A tabela do banco é por **tipo**; a tela é por **categoria**. Uma caixa com onze chaves é uma
caixa que ninguém configura — e o agrupamento vive em código (`_shared/notificacoes.ts`), não
numa coluna, para poder mudar sem migration.

## As duas assimetrias que importam

**A caixa nasce ligada; o e-mail nasce desligado.** Ausência de linha em
`notificacao_preferencia` significa "recebe" — é o que faz um usuário novo nascer com tudo
ligado sem trigger de seed. Já o e-mail exige uma linha ativa em `notificacao_email`. Uma linha
na caixa do próprio app é coisa de quem já entrou; um e-mail chega na caixa de entrada de
alguém, e isso se faz com consentimento explícito.

**O descadastro não pede login.** O link no rodapé de todo e-mail leva a `/descadastrar?token=…`,
fora do redirect de auth. Quem clica está na caixa de entrada, provavelmente no celular,
provavelmente sem sessão — e exigir login ali é o que faz gente marcar como spam em vez de
descadastrar. Um clique confirma (nunca no `GET`: pré-visualizador de e-mail abre links
sozinho).

## O que ficou de fora, e por quê

- **Realtime.** O `refetchOnWindowFocus` do TanStack Query já cobre o caso real de duas pessoas,
  e quem tem pressa recebe o e-mail. Realtime entra junto do push.
- **Absorver os quatro remendos** (`space_deletion_notice`, `convite_filme`, `roteiro_visto`,
  `segredos_do_espaco`). Continuam funcionando; migrá-los é um passo independente.
- **Notificação por SMS/WhatsApp.** Custo por mensagem, e o e-mail já resolve o problema de
  alcance que motivou a sessão.

## Como verificar (duas contas reais)

O motor é gatilho e RLS — teste de unidade não alcança isso. A verificação é a mesma de Viagens:

1. A lança um gasto → B recebe no sino **e** no e-mail; **A não recebe nada**.
2. A edita o mesmo gasto três vezes em dois minutos → B tem **uma** notificação dizendo
   "3 alterações", e **um** e-mail (o do primeiro).
3. A cria roteiro **secreto** → B não recebe nada, e um `select` cru em `notificacao` com a anon
   key de B não devolve texto nenhum sobre ele. A libera → B recebe.
4. B desliga "Orçamentos" nas preferências → gasto novo de A não gera linha nem e-mail.
5. B abre o link de descadastro do rodapé, confirma → para de receber e-mail, e a caixa do app
   continua funcionando.
6. `select lembrete_semanal_filmes()` duas vezes seguidas → uma notificação só.

E, quando algo não chegar, a resposta está numa consulta:

```sql
select estado, tentativas, erro, destinatario
from notificacao_email_fila order by criado_em desc limit 10;
```
