# Contrato — Planejamento financeiro ↔ Open Finance (Pluggy)

> Escrito em 12/11/2026, a partir das decisões em
> [notion-plano-planejamento-financeiro.md](./notion-plano-planejamento-financeiro.md#decisões-tomadas-12112026).
> Duas frentes trabalham em paralelo, em branches separadas:
>
> - **Frente A — Planejamento** (branch `claude/planejamento-financeiro-f8b7df`): dona de tudo o
>   que está em "O que a Frente A entrega".
> - **Frente B — Pluggy** (branch `open-finance-pluggy`): segue o
>   [plano de Open Finance](./notion-plano-open-finance.md) e **consome** o que a Frente A entrega.
>
> **Status do contrato: ESTÁVEL** (12/11/2026, commit `Contrato:` na branch
> `claude/planejamento-financeiro-f8b7df`). Mudança de assinatura daqui em diante é combinada com
> a Frente B, não feita de surpresa. As seções 1 a 8 abaixo descrevem o que foi implementado; o
> que mudou em relação ao rascunho está resumido em
> [Como ficou na implementação](#como-ficou-na-implementação-frente-a-12112026), no fim.

## Regras de convivência

- **Cada tabela tem uma frente dona.** Só a dona cria e altera a migration dela.
- **Ninguém aplica migration no Supabase remoto (`db push`)** sem o pedido explícito do usuário.
- `app/types/database.generated.ts` é o ponto de conflito certo entre as duas branches. Ao
  integrar, regerar (ou mesclar à mão) em vez de escolher um lado.
- Timestamps de migration: a Frente B usa timestamps **posteriores** aos da Frente A ao criar
  qualquer migration que referencie tabela da Frente A. As da Frente A no contrato são
  `20261112120000`, `20261112120100` e `20261112120200`.
- As FKs que cruzam as frentes (`transacao_id` nas tabelas da Frente A) nascem **sem FK** na
  Frente A e ganham a constraint numa migration da Frente B, depois que `transacao_bancaria`
  existir.

## O que a Frente A entrega (e a Frente B consome)

Migrations:

| Arquivo | Seções |
| --- | --- |
| `supabase/migrations/20261112120000_planejamento_renda.sql` | 1, 2, 3, 5 |
| `supabase/migrations/20261112120100_metas.sql` | 6 |
| `supabase/migrations/20261112120200_mover_compra.sql` | 7 |

Tipos TypeScript: `app/types/planejamento.ts` (renda, contribuição), `app/types/meta.ts` (metas),
`app/types/orcamento.ts` (seção 8), `app/lib/salario.ts` (seção 4).

Verificação de RLS com três usuários contra o banco local:
`supabase/verificacoes/planejamento_rls.sql` (instruções no cabeçalho).

### 1. Salário — `renda`

Uma linha por pessoa. Não é coluna de `profile` (a policy `profile_select` deixaria o outro ler).

```
renda(
  user_id            uuid pk → auth.users,
  valor_liquido      numeric(12,2) > 0,
  recebimento_tipo   text check in ('dia_fixo', 'dia_util'),
  recebimento_dia    int  -- dia_fixo: 1..31 (mês curto = último dia); dia_util: 1..23
  updated_at         timestamptz                -- gatilho tocar_updated_at
)
```

RLS: o dono lê e escreve. Os outros leem **só** se houver linha em `renda_compartilhamento` para um
espaço de que **os dois** são membros no momento da leitura (função `renda_visivel(p_user)`,
`SECURITY DEFINER`, usada pela policy).

### 2. Compartilhar o salário por espaço — `renda_compartilhamento`

```
renda_compartilhamento(user_id, space_id, created_at)   pk (user_id, space_id)
```

Só o dono insere e apaga; só em espaço de que ele é membro (policy + gatilho
`validar_renda_compartilhamento`). Sem UPDATE. Os membros do espaço **leem** as linhas daquele
espaço — é o que diz à tela se o percentual pode aparecer. Sair do espaço apaga o compartilhamento
e a contribuição da pessoa ali (gatilho `membership_limpar_planejamento`); voltar ao espaço não
reabre nada.

### 3. Salário recebido no mês — `renda_recebida`

O fato "o salário de novembro caiu". Marcado à mão pela Frente A; a Frente B marca sozinha quando
reconhece o crédito no extrato.

```
renda_recebida(
  user_id         uuid,
  competencia     date (dia 1),
  valor           numeric(12,2) > 0,       -- o que caiu de verdade
  recebido_em     date default current_date,
  origem          text check in ('manual', 'pluggy') default 'manual',
  transacao_id    uuid null,               -- FK adicionada pela Frente B
  created_at      timestamptz,
  pk (user_id, competencia)
)
```

Mesma visibilidade de `renda`. Escrita só do dono pela RLS — a sincronização da Frente B, com
`service_role`, grava direto (sem RLS) e deve preencher `user_id` com o dono da conta bancária.

### 4. Quando o salário deve cair — função pura

```ts
// app/lib/salario.ts
dataPrevistaDoSalario(competencia: string, tipo: 'dia_fixo' | 'dia_util', dia: number): string
// e, de apoio: ehDiaUtil(iso), feriadosNacionais(ano), pascoa(ano)
```

Dia útil = **dia de banco**: segunda a sexta, menos os feriados nacionais fixos (com a Consciência
Negra a partir de 2024), a Sexta-feira Santa, e os dois dias de Carnaval e Corpus Christi (ponto
facultativo na lei, mas sem expediente bancário). Sábado não conta. Regras de borda:

- `dia_util` com N maior que os dias úteis do mês → o **último dia útil** do mês, nunca o seguinte.
- `dia_fixo` num mês sem aquele dia → o último dia do mês. **Não** anda para o dia útil anterior:
  a data é a que a pessoa declarou. A janela de conciliação da Frente B deve tolerar isso.

### 5. Contribuição ao casal e valor central — `contribuicao`

```
contribuicao(
  space_id   uuid,
  user_id    uuid,
  modo       text check in ('valor', 'percentual'),
  valor      numeric(12,2) > 0,   -- reais, ou percentual (0..100], conforme o modo
  updated_at timestamptz,
  pk (space_id, user_id)
)

rpc contribuicoes_do_espaco(p_space uuid)
  → table(user_id uuid, modo text, valor_efetivo numeric null, percentual numeric null)
```

- A **linha crua só é legível pelo dono** (com `modo = 'percentual'` e o valor efetivo, o salário
  sairia por regra de três). O espaço lê pela RPC.
- Só em espaço compartilhado: o gatilho recusa contribuição no espaço pessoal.
- `valor_efetivo` em reais (o percentual aplicado sobre `renda`, calculado em `SECURITY DEFINER`,
  `round(..., 2)`). É `null` no modo percentual quando a pessoa não tem salário cadastrado.
- `percentual` vem `null` quando o salário daquela pessoa não está compartilhado **naquele
  espaço** — senão o salário seria dedutível. Para você mesmo ele sempre vem (havendo salário). No
  modo valor, com o salário aberto, é derivado (`valor / salário × 100`).
- Só membros atuais entram; quem não é membro do espaço recebe erro.
- O tipo gerado pelo Supabase declara `percentual` e `valor_efetivo` como `number` (o gerador não
  infere nulidade de RPC); trate como `number | null` — `ContribuicaoDoEspaco` em
  `app/types/planejamento.ts` já faz isso.

**Valor central = soma de `valor_efetivo`** (`valorCentral()` em `app/types/planejamento.ts`, que
ignora os nulos como o `sum` do SQL).

### 6. Metas — `meta` e `meta_aporte`

```
meta(
  id, space_id, criado_por, titulo,
  valor_alvo numeric(12,2) > 0, prazo date null,
  interesse_id uuid null → interesse (on delete set null),
  estado text check in ('ativa', 'pausada', 'cumprida', 'abandonada') default 'ativa',
  cumprida_em timestamptz null,    -- carimbado por gatilho; check: estado = 'cumprida' ⇔ não nulo
  created_at, updated_at
)

meta_aporte(
  id, meta_id, user_id,
  valor numeric(12,2) <> 0,        -- negativo = resgate
  data date default current_date,
  competencia date,                -- GERADA: o mês de `data`
  origem text check in ('manual', 'pluggy') default 'manual',
  transacao_id uuid null,          -- FK adicionada pela Frente B
  created_at
)

rpc registrar_aporte(p_meta uuid, p_valor numeric, p_data date default current_date,
                     p_origem text default 'manual', p_transacao uuid default null) → uuid

rpc criar_meta(p_space uuid, p_titulo text, p_valor_alvo numeric,
               p_prazo date default null, p_interesse uuid default null) → uuid
```

Aporte é **reserva no app**: não é compra, não entra em `SaldoDoMes`, `acerto_mes` nem no gasto
por categoria. Progresso = soma dos aportes, nunca armazenado.

`registrar_aporte`:

- **Exige JWT** — quem aporta é `auth.uid()`. A caixa de entrada chama com o usuário que
  classificou a transação; não há caminho de `service_role` para aporte.
- Trava a meta (`for update`) antes de somar.
- Recusa resgate maior que o guardado, e aporte positivo em meta `cumprida` ou `abandonada`
  (resgate continua valendo nas duas).
- O aporte que faz o guardado alcançar o alvo muda a meta de `ativa` para `cumprida`. Resgatar
  depois não reabre.

`criar_meta` com `p_interesse` marca o interesse como `convertido`, `convertido_tipo = 'objetivo'`
e `convertido_ref_id` = a meta, na mesma transação. A Frente B não precisa dela.

Compartilhar uma meta pessoal com um espaço conjunto (`meta_compartilhamento`,
`20261112160200_meta_compartilhamento.sql`) é só da Frente A e não muda nada para a Frente B: a
meta continua no espaço pessoal, `registrar_aporte` e as colunas acima ficam iguais, e quem vê
pelo compartilhamento só lê — a caixa de entrada não oferece "Aporte em meta" para quem não é
membro do espaço da meta, porque a RPC recusaria.

### 7. Mover compra entre gavetas — RPC

```
rpc mover_compra(p_compra uuid, p_space_destino uuid, p_participantes jsonb) → uuid
```

Apaga e recria numa transação (o gatilho de participante recusa trocar `space_id` com rateio de
outro espaço). Devolve o id **novo** — quem guarda vínculo com a compra (a Frente B, em
`transacao_bancaria.compra_id`) precisa atualizar para ele.

- `p_participantes` no formato de `registrar_compra`, apontando para membros do **destino**
  (`rateioIgual()` para o 50/50; `[{user_id: você, peso: 1}]` para o pessoal).
- `pago_por` é mantido se for membro do destino; senão vira quem moveu. `registrado_por` vira
  quem moveu. A categoria viaja pelo nome (o destino resolve a sua).
- Permissão: apagar na origem (autor ou admin) **e** lançar no destino. Qualquer recusa desfaz
  tudo — não sobra cópia.
- Os gatilhos rodam como num lançamento: "gasto novo" no destino, "gasto removido" na origem, e a
  regra de Pins `gasto_novo` (teto diário de 5).

### 8. Rateio igual e mês acertado — funções puras

```ts
// app/types/orcamento.ts
rateioIgual(membrosIds: string[]): Participante[]
  // percentual, primeiro absorve o resto: [a, b] → 50/50; [a, b, c] → 33,3334/33,3333/33,3333
dividirIgualmente(ids: string[], total: number): Record<string, number>
  // a conta por trás, em reais ou em %; o CompraDialogo usa a mesma
competenciasAcertadas(
  compra: { competencia_inicial: string, parcelas: number },
  acertos: ReadonlyArray<{ competencia: string }>,
): string[]                                                 // meses já acertados que a compra toca, em ordem
```

`rateioIgual` sai do `dividirIgualmente()` do `CompraDialogo` e devolve **percentual** (50/50), e não
peso 1 para cada: a compra precisa voltar ao formulário de edição fechando 100%.
`competenciasAcertadas` alimenta o aviso "isso muda o saldo de um mês já acertado" — no diálogo
(Frente A) e na importação com recuo de parcelas (Frente B). Os acertos passados são os do espaço
da compra; numa edição, quem chama une os meses de antes e de depois.

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

## Como ficou na implementação (Frente A, 12/11/2026)

O que mudou em relação ao rascunho, para a Frente B não descobrir lendo SQL:

1. **Nenhuma assinatura de RPC mudou.** `registrar_aporte` ganhou `default current_date` em
   `p_data`. Entrou uma RPC a mais, `criar_meta` (só da Frente A).
2. **`contribuicao` não é legível pelo outro membro** como tabela — só pela RPC. O rascunho não
   dizia; sem isso o percentual vazava junto com o valor efetivo.
3. **`valor_efetivo` pode ser `null`** (percentual sem salário cadastrado).
4. **Sair do espaço** apaga `renda_compartilhamento` e `contribuicao` da pessoa naquele espaço, e
   a visibilidade exige que o dono ainda seja membro.
5. **`meta_aporte.competencia` é gerada** a partir de `data` — não se grava.
6. **`registrar_aporte` cumpre a meta** quando o guardado alcança o alvo, recusa resgate acima do
   guardado e aporte em meta cumprida/abandonada, e exige JWT.
7. **Dia útil inclui Carnaval e Corpus Christi como não úteis** (calendário bancário), e as bordas
   da seção 4 foram fixadas.
8. **`rateioIgual` devolve percentual**, e `dividirIgualmente` passou a ser exportada.
9. **GRANTs explícitos** nas tabelas novas para `authenticated` — o banco local novo não expõe
   tabela sem GRANT; no remoto é redundante e inofensivo.
10. **Depois do contrato (W4, sem mudar assinatura):** `20261112160000_metas_pins.sql` liga a regra
    de Pins `objetivo_cumprido` (gatilho em `meta`) e `20261112160100_meta_aporte_saldo.sql`
    recusa apagar um aporte quando o guardado ficaria negativo. Um aporte da Pluggy apagado
    depois de um resgate esbarra nessa trava — apague o resgate antes. Depois vem
    `20261112160200_meta_compartilhamento.sql` (meta pessoal compartilhada, só leitura).
    **As duas primeiras nasceram como `20261112130000`/`130100` e foram renomeadas em 13/11**:
    a chave Pix da Frente B também ficou em `20261112130000`, e duas migrations com a mesma
    versão quebram o `db push`. Nenhuma tinha sido aplicada no remoto. As da Frente A depois do
    contrato agora vêm todas depois da última da Frente B (`20261112150000`).
11. **`app/types/database.generated.ts` foi atualizado à mão** a partir de
    `supabase gen types --local` (o `npm run db:types` lê o projeto remoto, onde as migrations não
    foram aplicadas). Ao integrar as branches, regerar.
