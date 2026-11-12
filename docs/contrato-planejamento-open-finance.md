# Contrato — Planejamento financeiro ↔ Open Finance (Pluggy)

> Escrito em 12/11/2026, a partir das decisões em
> [notion-plano-planejamento-financeiro.md](./notion-plano-planejamento-financeiro.md#decisões-tomadas-12112026).
> Duas frentes trabalham em paralelo, em branches separadas:
>
> - **Frente A — Planejamento** (branch `planejamento-financeiro`): dona de tudo o que está em
>   "O que a Frente A entrega".
> - **Frente B — Pluggy** (branch `open-finance-pluggy`): segue o
>   [plano de Open Finance](./notion-plano-open-finance.md) e **consome** o que a Frente A entrega.
>
> **Status do contrato: RASCUNHO.** A Frente A pode ajustar nomes e assinaturas ao implementar;
> quando a migration do contrato estiver commitada, ela troca este status para **ESTÁVEL** no
> mesmo commit (mensagem começando por `Contrato:`). A partir daí, mudança de assinatura é
> combinada com a Frente B, não feita de surpresa.

## Regras de convivência

- **Cada tabela tem uma frente dona.** Só a dona cria e altera a migration dela.
- **Ninguém aplica migration no Supabase remoto (`db push`)** sem o pedido explícito do usuário.
- `app/types/database.generated.ts` é o ponto de conflito certo entre as duas branches. Ao
  integrar, regerar (ou mesclar à mão) em vez de escolher um lado.
- Timestamps de migration: a Frente B usa timestamps **posteriores** aos da Frente A ao criar
  qualquer migration que referencie tabela da Frente A.
- As FKs que cruzam as frentes (`transacao_id` nas tabelas da Frente A) nascem **sem FK** na
  Frente A e ganham a constraint numa migration da Frente B, depois que `transacao_bancaria`
  existir.

## O que a Frente A entrega (e a Frente B consome)

### 1. Salário — `renda`

Uma linha por pessoa. Não é coluna de `profile` (a policy `profile_select` deixaria o outro ler).

```
renda(
  user_id            uuid pk → auth.users,
  valor_liquido      numeric(12,2) > 0,
  recebimento_tipo   text check in ('dia_fixo', 'dia_util'),
  recebimento_dia    int  -- dia_fixo: 1..31 (mês curto = último dia); dia_util: 1..23
  updated_at         timestamptz
)
```

RLS: o dono lê e escreve. Os outros leem **só** se houver linha em `renda_compartilhamento` para um
espaço de que são membros.

### 2. Compartilhar o salário por espaço — `renda_compartilhamento`

```
renda_compartilhamento(user_id, space_id, created_at)   pk (user_id, space_id)
```

Só o dono insere e apaga; só em espaço de que ele é membro (trigger, como `validar_compra`).

### 3. Salário recebido no mês — `renda_recebida`

O fato "o salário de novembro caiu". Marcado à mão pela Frente A; a Frente B marca sozinha quando
reconhece o crédito no extrato.

```
renda_recebida(
  user_id         uuid,
  competencia     date (dia 1),
  valor           numeric(12,2),
  recebido_em     date,
  origem          text check in ('manual', 'pluggy'),
  transacao_id    uuid null,      -- FK adicionada pela Frente B
  pk (user_id, competencia)
)
```

Mesma visibilidade de `renda`.

### 4. Quando o salário deve cair — função pura

```ts
// app/lib/datas.ts (ou app/lib/salario.ts)
dataPrevistaDoSalario(competencia: string, tipo: 'dia_fixo' | 'dia_util', dia: number): string
```

Dia útil = segunda a sexta, menos feriados nacionais (fixos e os móveis derivados da Páscoa).
A Frente B usa a data prevista para a janela de conciliação do crédito do salário.

### 5. Contribuição ao casal e valor central — `contribuicao`

```
contribuicao(
  space_id   uuid,
  user_id    uuid,
  modo       text check in ('valor', 'percentual'),
  valor      numeric(12,2),   -- reais ou percentual (0..100), conforme o modo
  updated_at timestamptz,
  pk (space_id, user_id)
)

rpc contribuicoes_do_espaco(p_space uuid)
  → table(user_id, modo, valor_efetivo numeric, percentual numeric null)
```

`valor_efetivo` em reais (o percentual aplicado sobre `renda`, calculado em `SECURITY DEFINER`).
`percentual` vem `null` quando o salário daquela pessoa não está compartilhado no espaço — senão
o salário seria dedutível. **Valor central = soma de `valor_efetivo`.**

### 6. Metas — `meta` e `meta_aporte`

```
meta(
  id, space_id, criado_por, titulo,
  valor_alvo numeric(12,2) > 0, prazo date null,
  interesse_id uuid null,        -- veio de um interesse (preenche interesse.convertido_*)
  estado text check in ('ativa', 'pausada', 'cumprida', 'abandonada'),
  cumprida_em, created_at, updated_at
)

meta_aporte(
  id, meta_id, user_id,
  valor numeric(12,2) <> 0,      -- negativo = resgate
  data date, competencia date (dia 1),
  origem text check in ('manual', 'pluggy'),
  transacao_id uuid null,        -- FK adicionada pela Frente B
  created_at
)

rpc registrar_aporte(p_meta uuid, p_valor numeric, p_data date,
                     p_origem text default 'manual', p_transacao uuid default null) → uuid
```

Aporte é **reserva no app**: não é compra, não entra em `SaldoDoMes`, `acerto_mes` nem no gasto
por categoria. Progresso = soma dos aportes, nunca armazenado.

### 7. Mover compra entre gavetas — RPC

```
rpc mover_compra(p_compra uuid, p_space_destino uuid, p_participantes jsonb) → uuid
```

Apaga e recria (o trigger de participante recusa trocar `space_id` com rateio de outro espaço).
Devolve o id **novo** — quem guarda vínculo com a compra (a Frente B, em
`transacao_bancaria.compra_id`) precisa atualizar para ele.

### 8. Rateio igual e mês acertado — funções puras

```ts
// app/types/orcamento.ts
rateioIgual(membrosIds: string[]): Participante[]           // o 50/50 do cartão do casal
competenciasAcertadas(compra, acertos): string[]            // meses já acertados que a compra toca
```

`rateioIgual` sai do `dividirIgualmente()` do `CompraDialogo`. `competenciasAcertadas` alimenta o
aviso "isso muda o saldo de um mês já acertado" — no diálogo (Frente A) e na importação com recuo
de parcelas (Frente B).

## O que é só da Frente B

Não depende da Frente A e pode começar no primeiro dia:

- Regras puras da importação (parcelas, deduplicação, contagem dupla, fuso, sinal) — fase 1 do
  plano de Open Finance.
- `conexao_bancaria`, `conta_bancaria` (com a designação do cartão: `destino` em
  `'casal' | 'pessoal' | 'perguntar'` e o `space_id` de destino), `transacao_bancaria`.
- `server/utils/pluggy.ts`, rota do connect token, tela "Contas conectadas".
- Edge Function `sincronizar-pluggy` e o cron (sem deploy).
- Chave Pix no perfil, BR Code + QR, conciliação do acerto.

Depende do contrato **ESTÁVEL**:

- Caixa de entrada com os destinos **Receita → salário recebido** (`renda_recebida`) e **Aporte em
  meta** (`registrar_aporte`).
- Entrada automática das compras do **cartão do casal** com `rateioIgual` via `registrar_compra`.
- Reclassificar com `mover_compra`.
- Aviso de mês acertado na importação (`competenciasAcertadas`).
- As FKs `renda_recebida.transacao_id` e `meta_aporte.transacao_id`.
