# Pendências — Open Finance com a Pluggy (Frente B)

> Registro de 12/11/2026, quando a frente parou a pedido do usuário. Branch
> `claude/open-finance-pluggy-93911e`. Plano: [notion-plano-open-finance.md](./notion-plano-open-finance.md).

## Onde parou

B0 a B5 estão commitadas, e a branch da Frente A já foi integrada (merge `79dc2ba`, feito antes do
pedido de pausa). Nada foi aplicado no Supabase remoto e nenhuma Edge Function foi publicada. Não
houve push. Migration no remoto e deploy de função ficam para o usuário.

## Ajustes de escopo pedidos e ainda não implementados

### 1. Cartões compartilhados por escolha de cada pessoa (B1/B4)

Cada pessoa conectada recebe as próprias contas e cartões, **privados por padrão**. Compartilhar
é decisão dela, cartão por cartão: na tela "Contas conectadas" ela marca **um ou mais** cartões como
"do casal / do espaço compartilhado" e escolhe o espaço (só espaços de que é membro). Desmarcar volta
a ser privado e não mexe nas compras que já entraram. As compras de um cartão marcado entram no
espaço escolhido com `rateioIgual` (50/50), editáveis depois.

O que já existe e atende: o default de `conta_bancaria.destino` é `perguntar` (nunca `casal`); a
designação é por conta, então vários cartões podem ser marcados; o gatilho
`validar_conta_bancaria` só aceita espaço de casal de que a pessoa é membro; mudar o destino não
mexe nas compras já lançadas; a entrada automática só vale para compras posteriores à designação
(`designada_em`).

O que falta: deixar o opt-in explícito na tela. Hoje é um `<select>` com "Perguntar a cada
compra / Pessoal / Do casal · <espaço>". A ideia é rotular os dois primeiros como privados e trocar
o terceiro por um "Compartilhar este cartão" com a escolha do espaço, com a frase de que desmarcar
não mexe no que já entrou. Rever também os textos da caixa de entrada que falam do "cartão do casal".

### 2. Nova onda — guia da integração com a Pluggy

Uma seção no app que apresenta a integração como disponível e guia a pessoa até o fim.

- **O que é e por que usar:** lançar vira classificar; o extrato é só seu, e você escolhe o que
  compartilhar.
- **Guia do membro (todo mundo):** criar a conta no MeuPluggy e conectar os bancos lá (o
  consentimento é dado no app de cada banco); integrar ao APPingos pelo botão "Conectar" (Pluggy
  Connect com o conector MeuPluggy); o que esperar (sincronização diária, o dado chega no dia
  seguinte); como escolher os cartões compartilhados.
- **Estados da tela:** sem conexão (apresentação + guia), conectado (atalho para Contas
  conectadas), consentimento perto de vencer.
- **Setup do administrador:** conta em dashboard.pluggy.ai, Application com o conector MeuPluggy,
  `NUXT_PLUGGY_CLIENT_ID`/`NUXT_PLUGGY_CLIENT_SECRET` no `.env` e no Vercel, os secrets da Edge
  Function (`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_WEBHOOK_SECRET`), os segredos do Vault
  do cron e o aviso de que o trial de ~15 dias é o único momento de ligar contas ao MeuPluggy. Vai
  num doc em `docs/` (a seção 8 do README já tem o esqueleto) e, se fizer sentido, num bloco do
  guia visível só para o dono do espaço.
- **Antes de escrever os passos:** conferir a documentação atual (v2.docs.pluggy.ai,
  github.com/pluggyai/meu-pluggy e as Referências do plano). Não foi lida ainda: a pausa chegou
  antes. O que não der para confirmar fica marcado como não verificado, sem inventar telas ou nomes
  de botões. Só leitura: nenhuma conta, login ou aceite de termos.

## Outras pendências conhecidas

- **Nada foi verificado contra a Pluggy real.** Sinal do valor, fuso, agrupamento de parcelas,
  faturas (`billId`) e o formato do `paymentData` saíram da documentação; revalidar com a amostra
  real do trial (fase 2 do plano).
- **Telas não abertas no navegador:** Contas, Caixa de entrada, chave Pix e "Pagar com Pix" só
  passaram por typecheck e testes de lógica. Abrir depois que as migrations existirem num banco.
- **Tipos do banco escritos à mão** em `app/types/database.generated.ts`, no formato do gerador:
  regerar com `npm run db:types` depois do `db push`.
- **Desfazer salário ou aporte vindo do extrato** não devolve a transação para a caixa de entrada:
  pede um gatilho nas tabelas da Frente A (`renda_recebida`, `meta_aporte`). Ver a nota
  `frente-b-integrou-contrato.md` na pasta de notas das sessões.
- **A conciliação do Pix do acerto** só roda quando alguém abre a caixa de entrada.
- **`test/imports.test.ts`** estoura o tempo padrão do vitest com a máquina carregada; passa
  isolado. Já existia antes desta frente.
