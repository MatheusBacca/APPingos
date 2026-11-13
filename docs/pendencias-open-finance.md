# Pendências — Open Finance com a Pluggy (Frente B)

> Atualizado em 13/11/2026. Branch `claude/open-finance-pluggy-93911e`. Plano:
> [notion-plano-open-finance.md](./notion-plano-open-finance.md). Setup:
> [pluggy-setup-administrador.md](./pluggy-setup-administrador.md).

## Onde está

B0 a B5 commitadas, a branch da Frente A integrada até `00901ba` (merge `79dc2ba`; os commits
seguintes da Frente A, como as metas compartilháveis, não entraram) e os dois ajustes de escopo de
12/11 feitos (B6, abaixo). Nada aplicado no Supabase remoto, nenhuma Edge Function publicada, sem
push. Migration no remoto e deploy de função são do usuário.

### Migrations, na ordem de aplicação

| Migration | Frente |
| --- | --- |
| `20261112100000_open_finance_conexao.sql` | B |
| `20261112110000_open_finance_transacao.sql` | B |
| `20261112110100_open_finance_cron.sql` | B |
| `20261112120000_planejamento_renda.sql` | **A** |
| `20261112120100_metas.sql` | **A** |
| `20261112120200_mover_compra.sql` | **A** |
| `20261112130000_perfil_chave_pix.sql` | B |
| `20261112140000_open_finance_caixa_de_entrada.sql` | B (referencia tabelas e RPCs da A) |
| `20261112150000_open_finance_conciliacao_acerto.sql` | B |

## Feito em 13/11 (B6)

### Cartões compartilhados por escolha de cada pessoa

O banco já atendia (default `perguntar`, designação por conta, só espaço de casal de que a pessoa
é membro, `designada_em` protegendo o que já entrou, `rateioIgual` na entrada automática). Mudou a
tela: cada cartão tem "Compartilhar com <espaço>", desmarcado por padrão; desmarcado, ele é
privado, com a escolha entre perguntar a cada compra e mandar direto para o pessoal. As regras
estão em `app/lib/contas-bancarias.ts` (`designacaoAoMarcar` e afins), com testes.

### Guia da integração

Aba Orçamentos › Open Finance (`GuiaPluggy.vue`): apresentação, guia do membro (MeuPluggy,
consentimento no banco, ligar ao APPingos, escolher os cartões), o que esperar, e os estados sem
conexão / não configurada / conectado / renovar. O bloco do administrador só aparece para o dono
de um espaço de casal (ou para quem usa o app sozinho). O setup completo está em
`docs/pluggy-setup-administrador.md`, com fonte em cada passo.

## Ainda pendente

- **Nada verificado contra a Pluggy real.** Sinal do valor, fuso, agrupamento de parcelas,
  faturas (`billId`), `paymentData` e o nome do campo de validade do consentimento
  (`consentExpiresAt`) saíram da documentação. Revalidar com a primeira amostra real.
- **Não confirmado na documentação:** que o MeuPluggy aparece e autoriza dentro do widget de uma
  Application de desenvolvimento (o README descreve a ligação pelo app Demo; o caminho de colar o id
  cobre isso); que o webhook aceita header customizado; se renovar o consentimento depois do trial
  esbarra na lista travada.
- **Telas não abertas no navegador:** Contas, Caixa de entrada, Open Finance, chave Pix e "Pagar
  com Pix" só passaram por typecheck e testes de lógica.
- **Tipos do banco escritos à mão** em `app/types/database.generated.ts`: regerar com
  `npm run db:types` depois do `db push`.
- **Desfazer salário ou aporte vindo do extrato** não devolve a transação para a caixa: pede um
  gatilho nas tabelas da Frente A (`renda_recebida`, `meta_aporte`).
- **A conciliação do Pix do acerto** só roda quando alguém abre a caixa de entrada.
- **`test/imports.test.ts`** estoura o tempo padrão do vitest com a máquina carregada; passa
  isolado. Já existia antes desta frente.
