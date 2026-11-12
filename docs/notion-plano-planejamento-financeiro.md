# Levantamento — Planejamento financeiro do casal (e o terreno para o Open Finance)

> Levantamento de necessidades, feito em 12/11/2026 contra o código da v1.8.0. Ainda não é o
> plano de implementação: é o inventário do que existe, do que falta e das decisões que precisam
> ser tomadas antes de fatiar. Complementa o [plano de Open Finance com a
> Pluggy](./notion-plano-open-finance.md), que já está detalhado e **não é repetido aqui** — este
> documento olha para o que Orçamentos precisa ganhar para que as duas coisas se encaixem.

## O pedido

1. **Conhecer a renda do casal** — o salário de cada um.
2. **Divisão salarial pessoal e conjunta** — quanto da renda de cada um vai para o caixa do
   casal, quanto fica para o pessoal e quanto vai para metas.
3. **Metas de compra** — juntar dinheiro para algo, com valor-alvo, prazo e progresso.
4. **Preparar Orçamentos para receber o Open Finance** — o plano da Pluggy assume coisas que o
   módulo ainda não tem.

As quatro partes falam do mesmo dado. Construídas separadamente, viram três modelos de "dinheiro
que entra" e dois de "meta". A proposta deste levantamento é uma só: **planejamento primeiro, à
mão; a Pluggy depois, alimentando as mesmas tabelas.** O app continua inteiro sem a integração —
que é, também, o principal risco listado no plano de Open Finance.

## O que já existe e ajuda

| O quê | Onde | Por que importa aqui |
| --- | --- | --- |
| Compra parcelada como uma linha, expandida por mês | view `parcela_mensal` (`20260804180000_orcamento_compras.sql`) | Os compromissos futuros (parcelas que ainda vão cair) já são calculáveis — é metade da projeção do mês |
| `pago_por` separado do rateio por peso | `compra_participante.peso` | Rateio proporcional à renda cabe no modelo como está: é só outro peso |
| Gastos pessoais = compra no espaço pessoal | `docs/notion-plano-gastos-pessoais.md` | A privacidade estrutural (não por filtro) é o modelo certo para o salário |
| Duas gavetas na mesma tela | `useEspacoQuery` / `useEspacoMutation` (`app/composables/useSpaceQuery.ts`) | O planejamento precisa ler o pessoal e o casal ao mesmo tempo — a primitiva já existe |
| "Meu bolso" vs. "gasto do espaço" | `meuBolso()`, `saldoDoMes()` (`app/types/orcamento.ts`) | O planejamento compara renda com o "meu bolso", não com o gasto do espaço |
| Acerto do mês | tabela `acerto_mes` | Fato humano "esse mês foi pago" — a conciliação Pix do plano Pluggy marca ele |
| Interesses com agrupamento favorito e preço total | `interesse`, `interesse_agrupamento`, `interesse_produto` | O valor-alvo de uma meta de compra **já está calculado** no favorito |
| Colunas de conversão sem uso | `interesse.convertido_em/tipo/ref_id` | Converter interesse em meta não pede migration em `interesse` |
| Aba "Metas" reservada | `app/components/ObjetivosAbas.vue` (`EM_BREVE = ['Metas']`) e o `redirect` de `app/pages/objetivos/index.vue` | O lugar da meta na navegação já foi decidido |
| Regra de Pins desligada | `objetivo_cumprido` (60 Pins, `ativa = false`) em `20260908025100_pins.sql` | Ligar quando a tabela de metas nascer é um `update` |
| Abas de função em Orçamentos | `app/components/OrcamentosAbas.vue` (só "Chico Moedas") | Uma aba "Planejamento" é uma entrada em `ABAS` + a página |
| Motor de notificações, `pg_cron`, Edge Function com `service_role` | `enviar-emails`, migrations `notificacoes_*` | Avisos de meta, teto e fatura; sincronização da Pluggy |

## O que falta — as lacunas

Cada linha diz quem precisa dela: **P** = planejamento financeiro, **M** = metas, **OF** = Open
Finance. As que servem às três são a fundação e vêm primeiro.

| # | Lacuna | Hoje | P | M | OF |
| --- | --- | --- | :-: | :-: | :-: |
| 1 | **Receita (dinheiro que entra)** | Só existe `compra`, com `valor_total > 0`. Não há onde registrar salário, freela, reembolso | ● | ● | ● |
| 2 | **Renda recorrente** (o salário como compromisso mensal, não um lançamento por mês) | Não existe | ● | ● | ● |
| 3 | **Rateio padrão do espaço** | O plano Pluggy cita "o rateio padrão do espaço", mas ele não existe: o `CompraDialogo` sempre abre com `dividirIgualmente()` | ● | | ● |
| 4 | **Contas fixas / compra recorrente** (aluguel, assinatura, condomínio) | Não existe — cada mês é relançado à mão | ● | | ● |
| 5 | **Teto por categoria** (orçamento propriamente dito) | O módulo registra gastos, mas não tem limite | ● | | ● |
| 6 | **Meta com valor-alvo, prazo e aportes** | Não existe tabela; a aba Metas é um rótulo desabilitado | | ● | ● |
| 7 | **Divisão salarial** (quanto de cada renda vai para o casal / pessoal / metas) | Não existe | ● | ● | |
| 8 | **Projeção do mês** (renda − compromissos − aportes = sobra) | Só o gasto realizado; as parcelas futuras existem mas ninguém soma com renda | ● | ● | ● |
| 9 | **Competência fechada** | `atualizar_compra` admite no comentário: editar a competência muda um mês já acertado. A importação com recuo de parcelas (*k − 1* meses) vai fazer isso em massa | ● | | ● |
| 10 | **Mover compra entre pessoal e compartilhado** | Fora de escopo no plano de gastos pessoais; a caixa de entrada vai precisar ("classifiquei errado") | | | ● |
| 11 | **Chave Pix no perfil** | `profile` tem `nome`, `avatar_url`, `apelido` | | | ● |
| 12 | **Cartão como entidade** (dia de fechamento e vencimento) | A competência é palpite manual (`competenciaTocada` no diálogo) | ● | | ● |

## Decisões que precisam ser tomadas antes de fatiar

Estas mudam o modelo de dados — não dá para começar sem elas. Para cada uma, a recomendação e o
porquê.

### D1. Quem vê o salário de quem?

O plano de gastos pessoais e o da Pluggy chegaram à mesma regra: **o que é de uma pessoa mora no
espaço pessoal, e a privacidade é estrutural.** O salário é o dado mais sensível que o app vai
guardar.

**Recomendação:** a renda mora no **espaço pessoal**. No espaço do casal aparece só o que cada um
**declara como contribuição** ("ponho R$ 3.000 no caixa do casal"). Mostrar o salário inteiro ao
outro é opt-in de quem mostra, explícito, por pessoa.

**A pegadinha:** rateio *proporcional à renda* (D2) revela a razão entre os salários, mesmo sem
mostrar os números — 60/40 diz que um ganha 1,5× o outro. Se o casal escolher o proporcional,
essa transparência é consequência e precisa estar dita na tela, não descoberta.

### D2. Como o casal divide o que é conjunto?

Três modelos, e o app deveria suportar a escolha por espaço (é a lacuna 3):

| Modelo | Como funciona | O que o app guarda |
| --- | --- | --- |
| **Igual** | 50/50 em tudo | Nada novo — é o default de hoje |
| **Proporcional à renda** | Cada um paga na proporção do que ganha | Peso de cada um = renda declarada (ou contribuição) |
| **Caixa conjunto (envelope)** | Cada um põe um valor fixo num "caixa do casal"; os gastos conjuntos saem dele | Contribuição mensal de cada um; o saldo é caixa − gastos |

**Recomendação:** começar por **rateio padrão configurável** (igual / proporcional / pesos fixos)
— é o que o `CompraDialogo` e a caixa de entrada da Pluggy consomem, e cabe no modelo de peso que
já existe. O **caixa conjunto** é a "divisão salarial conjunta" do pedido e vem logo depois, porque
muda o significado do `SaldoDoMes` (deixa de ser "quem deve a quem" e passa a ser "quanto sobrou
no caixa"). Decidir se os dois convivem ou se o espaço escolhe um.

### D3. Onde mora o quê na navegação?

**Recomendação:**

- **Orçamentos → aba "Planejamento"** (nova, ao lado de Chico Moedas): renda, divisão salarial,
  tetos por categoria, contas fixas e a projeção do mês. É a pergunta "como vai ser o mês".
- **Objetivos → aba "Metas"** (já reservada): metas com valor-alvo, prazo e aportes. É a pergunta
  "para onde estamos indo". Interesses vira a porta de entrada natural ("transformar em meta").
- **Orçamentos → aba "Caixa de entrada"** quando a Pluggy chegar (fase 5 do plano dela).

### D4. Meta é do casal, de um, ou os dois?

Uma viagem é do casal; um notebook é de um; o presente surpresa é de um e **não pode** aparecer
para o outro. **Recomendação:** a meta mora num espaço (`space_id`), como tudo no app — a meta
pessoal no pessoal, a do casal no do casal. Os **aportes** registram quem aportou, para a tela
mostrar "Ana R$ 800 · Matheus R$ 1.200". Reaproveitar o compartilhamento de Interesses para meta
pessoal visível no casal fica para depois.

### D5. O aporte numa meta é dinheiro "gasto"?

Não é compra (não entra no `SaldoDoMes` nem no gasto por categoria), mas sai da sobra do mês. Se
for tratado como compra, o gráfico de categorias ganha uma fatia "Metas" que distorce o gasto; se
for ignorado, a projeção mostra uma sobra que não existe. **Recomendação:** tipo próprio
(`meta_aporte`), que a projeção do mês subtrai e o resto do módulo ignora.

### D6. Renda variável (freela, 13º, bônus, PLR)

**Recomendação:** separar **renda recorrente** (salário, prevista todo mês, gera a projeção) de
**receita avulsa** (lançada quando entra). A projeção usa só a recorrente; o realizado usa as
duas. Salário líquido, não bruto — é o que entra na conta e o que a Pluggy vai ler.

### D7. Teto por categoria: por espaço ou por pessoa?

As categorias já são por espaço (`categoria.space_id`). **Recomendação:** teto também por espaço —
o teto do casal vale para os gastos do casal; quem quiser teto para o próprio iFood põe no espaço
pessoal. Mesma regra, zero exceção.

### D8. Competência fechada: travar ou avisar?

Com o planejamento, mudar um mês passado muda uma projeção já cumprida; com a Pluggy, isso
acontece em lote. **Recomendação:** não travar no banco (casal corrige o passado, e o `acerto_mes`
já é "decisão humana, não proibição"), mas **avisar** na tela quando uma compra nova ou editada
cair num mês com `acerto_mes` — "isso muda o saldo de julho, que já foi acertado".

## Rascunho do modelo de dados

Nomes e colunas finais saem das migrations. Segue as convenções do projeto: domínio guarda
`space_id`, não `user_id` como dono; texto com `CHECK` em vez de enum; competência sempre no dia 1;
`security_invoker = on` em view; RPC para escrita em mais de uma tabela.

**Renda e receitas**

```
renda_recorrente(                 -- o salário: mora no espaço PESSOAL
  id, space_id, user_id, descricao,
  valor, dia_recebimento,
  vigente_desde, vigente_ate,     -- aumento = fecha uma linha e abre outra (histórico)
  created_at
)

receita(                          -- o que entrou de fato
  id, space_id, recebido_por, descricao, valor,
  data, competencia,
  renda_id null,                  -- quando é a realização de uma renda recorrente
  origem ('manual' | 'pluggy'),
  categoria_id null,
  created_at
)

view renda_mensal                 -- expande renda_recorrente por competência,
                                  -- no mesmo espírito de parcela_mensal
```

**Divisão e rateio**

```
orcamento_config(                 -- uma linha por espaço
  space_id pk,
  rateio_padrao ('igual' | 'proporcional' | 'pesos'),
  pesos jsonb null                -- [{user_id, peso}] quando 'pesos'
)

contribuicao(                     -- a "divisão salarial conjunta": mora no espaço do CASAL
  id, space_id, user_id,
  modo ('valor' | 'percentual_da_renda'),
  valor,
  vigente_desde, vigente_ate
)
```

`percentual_da_renda` exige ler a renda do espaço pessoal de outra pessoa — **que a RLS proíbe, de
propósito**. Ou a contribuição é sempre em valor (a pessoa faz a conta), ou uma RPC `SECURITY
DEFINER` calcula e devolve só o valor resultante. Decidir junto com D1.

**Planejamento**

```
categoria_teto(id, space_id, categoria_id, valor, vigente_desde, vigente_ate)

conta_fixa(                       -- compromisso que se repete: gera compra todo mês
  id, space_id, descricao, valor, dia_vencimento,
  categoria_id, pago_por, participantes jsonb,
  vigente_desde, vigente_ate
)
```

`conta_fixa` gera a `compra` de cada mês (cron ou "lançar as fixas do mês" com um toque), e não uma
view: a compra precisa existir de verdade para ser editada, conciliada com o banco e entrar no
acerto. A regra de detecção de recorrência do plano Pluggy (3+ ocorrências, 30 ± 5 dias, ±10%)
depois **sugere** linhas para esta tabela.

**Metas**

```
meta(
  id, space_id, criado_por, titulo,
  valor_alvo, prazo null,
  interesse_id null,              -- veio de um interesse (usa interesse.convertido_*)
  estado ('ativa' | 'pausada' | 'cumprida' | 'abandonada'),
  cumprida_em null, created_at, updated_at
)

meta_aporte(
  id, meta_id, user_id, valor,    -- negativo = resgate
  data, competencia,
  origem ('manual' | 'pluggy'),
  created_at
)
```

O progresso é `sum(meta_aporte.valor)`, derivado, nunca armazenado — mesma régua do `SaldoDoMes`.
O aporte sugerido por mês é `(alvo − acumulado) / meses até o prazo`, função pura testável.
Quando a meta veio de um interesse, o `valor_alvo` nasce do total do agrupamento favorito (que já
é `null` se algum item estiver sem preço — a meta herda essa honestidade e pede o valor à mão).

**O cálculo central — a projeção do mês** (função pura em `app/types/`, testada no vitest):

```
renda prevista (renda_mensal)
− minha parte das parcelas que caem no mês (parcela_mensal × rateio)
− minha parte das contas fixas
− meus gastos pessoais
− meus aportes em metas
= sobra prevista
```

Por pessoa, não por casal: "sobra do casal" só existe no modelo de caixa conjunto (D2).

## O que Orçamentos precisa ganhar para a Pluggy

O plano de Open Finance é bom e está detalhado; estas são as **melhorias no módulo atual** que ele
pressupõe ou que o deixam muito mais simples. Várias coincidem com as lacunas do planejamento — é o
motivo de fazer os dois juntos.

1. **Receita como conceito** (lacuna 1). Transações `CREDIT` hoje não têm destino: a caixa de
   entrada só sabe virar compra. Com `receita`, ganha a opção **"Receita"** — e o salário que cai
   na conta realiza a `renda_recorrente` do mês sozinho.
2. **Rateio padrão do espaço** (lacuna 3). A opção "Compartilhada" da caixa de entrada promete
   "o rateio padrão do espaço (editável)"; sem `orcamento_config`, isso é sempre 50/50.
3. **Mover compra entre gavetas** (lacuna 10). RPC que apaga e recria (o trigger de participante
   recusa trocar `space_id` com rateio de outro espaço). Sem ela, classificar errado na caixa de
   entrada é apagar e reclassificar à mão — e a transação perde o vínculo.
4. **Aviso de competência acertada** (lacuna 9 / D8). O recuo de *k − 1* meses das parcelas
   importadas cai em meses já acertados.
5. **Contas fixas** (lacuna 4). A detecção de recorrência da Pluggy precisa de um lugar para
   salvar o que detectou; sem a tabela, vira só um relatório.
6. **Aportes de meta com origem `pluggy`**. Transferência para investimento/caixinha é hoje uma
   das transações que o plano manda **ignorar** (pegadinha 3, contagem dupla). Com metas, ela
   ganha um destino a mais na caixa de entrada: "Aporte em meta".
7. **Cartão com fechamento** (lacuna 12). Útil já para o lançamento manual (a competência deixa de
   ser palpite) e é onde o `billId` da Pluggy encaixa quando a fatura vier.
8. **Chave Pix no perfil** (lacuna 11) — fase 6 do plano Pluggy, mas é uma coluna e uma policy;
   pode entrar cedo.
9. **Selo "importada"** na lista. O plano deixa a compra sem nada do extrato (o vínculo mora em
   `transacao_bancaria`, que a outra pessoa não lê). Então o selo só aparece para quem importou,
   via join na própria transação — decidir se isso basta ou se a compra ganha um `origem` neutro
   (sem dado bancário) visível para os dois.
10. **Pins.** Importar 200 transações num domingo rende `gasto_novo` com teto diário — já previsto.
    Faltam as regras novas: aporte em meta, meta cumprida (`objetivo_cumprido`, já cadastrada),
    mês dentro do teto. Ligar de propósito, com teto, para não premiar "aportar e resgatar".
11. **Notificações.** Tipos novos: meta atingida, teto da categoria perto de estourar, salário não
    caiu no dia previsto (com Pluggy), fatura perto do vencimento. Cada um com interruptor em
    `TIPOS_DA_CATEGORIA`.

## Como as features conversam

```
                  ┌──────────── manual (sempre funciona) ────────────┐
                  │                                                  │
 renda_recorrente ─► receita ◄─── Pluggy CREDIT (salário)            │
                       │                                             │
 conta_fixa ─────► compra ◄────── Pluggy DEBIT/cartão (caixa de entrada)
 parcela_mensal ◄──┘   │                                             │
                       ▼                                             │
              projeção do mês ──► sobra ──► meta_aporte ◄── Pluggy transferência p/ investimento
                       ▲                        │
 categoria_teto ───────┘                        ▼
                                              meta ◄── interesse (favorito → valor_alvo)
```

A seta da Pluggy sempre chega numa tabela que **já existe e já funciona à mão**. A integração
troca "digitar" por "classificar", nunca cria um caminho que só ela alimenta.

## Invariantes

Cada uma é uma forma de errar em silêncio, e vale um teste:

1. A renda de uma pessoa não é legível por ninguém além dela, salvo opt-in explícito — nem por
   quem divide o espaço do casal.
2. Receita e aporte nunca entram em `SaldoDoMes`, `acerto_mes`, total do mês ou gasto por
   categoria. Esses números continuam respondendo "quanto gastamos e quem deve a quem".
3. O progresso de uma meta é sempre a soma dos aportes; nenhum campo `acumulado` armazenado.
4. Com o rateio padrão = "igual", o `CompraDialogo` se comporta exatamente como hoje.
5. A projeção do mês de uma pessoa nunca usa a renda da outra.
6. Uma meta pessoal (presente) nunca aparece no espaço do casal sem ação do dono.
7. Tudo o que a Pluggy alimenta também pode ser lançado à mão — e o app funciona inteiro com a
   integração desligada.

## Proposta de ondas

Ordem pensada por dependência. O tamanho é relativo (P / M / G), só para comparar.

| Onda | Entrega | Lacunas | Depende de | Tam. |
| --- | --- | --- | --- | :-: |
| **0. Regras puras da Pluggy** | Fase 1 do plano de Open Finance: parcelas, deduplicação, contagem dupla, fuso, sinal — tudo no vitest, sem conta na Pluggy | — | nada | M |
| **1. Fundação do dinheiro que entra** | `renda_recorrente`, `receita`, view `renda_mensal`; tela simples de renda no espaço pessoal | 1, 2 | D1, D6 | M |
| **2. Rateio padrão do espaço** | `orcamento_config`; `CompraDialogo` abre com o padrão; configuração do espaço | 3 | D2 | P |
| **3. Aba Planejamento** | Projeção do mês por pessoa (renda − compromissos − pessoais − aportes); contas fixas; tetos por categoria com a barra de uso | 4, 5, 8 | 1, 2, D3, D7 | G |
| **4. Metas** | `meta` + `meta_aporte`; aba Metas em Objetivos (sai o `EM_BREVE` e o `redirect`); "Transformar interesse em meta"; Pins `objetivo_cumprido` ligada; notificação de meta atingida | 6 | D4, D5 | G |
| **5. Divisão salarial conjunta** | `contribuicao`; modo caixa conjunto no espaço do casal | 7 | 1, 3, D2 | M |
| **6. Ajustes de Orçamentos para a Pluggy** | Mover compra entre gavetas, aviso de competência acertada, chave Pix no perfil, cartão com fechamento | 9, 10, 11, 12 | D8 | M |
| **7. Pluggy — conexão e ingestão** | Fases 2–4 do plano de Open Finance (**o relógio do trial começa aqui**) | — | 0 | G |
| **8. Caixa de entrada** | Fase 5 do plano, já com os destinos Receita e Aporte em meta | — | 1, 4, 6, 7 | G |
| **9. Acertar com Pix e recorrências** | Fases 6 e 8 do plano; detecção de recorrência sugerindo `conta_fixa` | — | 3, 8 | M |

As ondas 0, 1 e 2 não dependem umas das outras e podem andar em paralelo. A 7 deve começar só
quando a 8 estiver perto: o trial de 15 dias para ligar contas ao MeuPluggy é o recurso mais
escasso do projeto, e não deve ser queimado com a caixa de entrada ainda por fazer.

As ondas 1–5 entregam o pedido de planejamento sem nenhuma integração; 6–9 trazem o Open Finance
já com lugar para cada tipo de transação.

## Decisões tomadas (12/11/2026)

Estas substituem as recomendações de D1–D8 onde divergem. O contrato técnico que sai delas está
em [contrato-planejamento-open-finance.md](./contrato-planejamento-open-finance.md), e ele
**substitui o "Rascunho do modelo de dados"** acima.

1. **Salário é um campo do perfil** — valor líquido mensal + regra de recebimento: **dia fixo**
   (ex.: dia 05) **ou até o N-ésimo dia útil** (o comum: 5º dia útil). Uma renda por pessoa, não
   uma lista. Aparece na tela de perfil, mas **não é coluna de `profile`**: a policy
   `profile_select` deixa quem divide espaço ler a linha inteira, e o salário vazaria. Fica numa
   tabela própria, com RLS do dono.
2. **Privado até o dono liberar, espaço por espaço.** O app funciona inteiro nos dois cenários —
   salário compartilhado ou não. Sem compartilhar, o outro vê só a contribuição (item 4), nunca o
   salário nem o percentual que permitiria deduzi-lo.
3. **O gasto conjunto continua definido por % em cada compra**, como hoje. Não há rateio padrão
   por espaço nem caixa conjunto real. Com a Pluggy, um cartão pode ser marcado como **cartão do
   casal**: as compras dele **entram no espaço do casal com 50% para cada um**, editáveis depois.
   Isso relaxa, só para cartões marcados, a invariante 4 do plano de Open Finance ("nada entra no
   espaço do casal sem um toque humano") — marcar o cartão é o toque.
4. **Divisão salarial = contribuição planejada.** Cada um diz quanto do salário pretende dispor às
   contas do casal, **em % ou em valor**. A soma das contribuições é o **valor central** do casal,
   que entra no planejamento do espaço do casal; o que sobra do salário entra no planejamento
   pessoal. A contribuição em valor é visível ao casal; em %, o percentual só aparece se o salário
   estiver compartilhado naquele espaço.
5. **Aporte em meta é reserva no app.** Não aponta para uma conta real; com a Pluggy, uma
   transferência para caixinha ou investimento pode **sugerir** um aporte.

Assumidas sem pergunta (podem ser revistas):

6. Meta mora num espaço, como tudo no app: pessoal no pessoal, do casal no do casal (D4).
   **Ajuste do usuário (12/11/2026) — PENDENTE, não implementado:** o dono pode **compartilhar
   uma meta pessoal** com um ou mais espaços de que é membro, para os outros acompanharem e
   comemorarem. A meta continua morando no pessoal. O desenho combinado:
   - Tabela `meta_compartilhamento(meta_id, space_id, compartilhado_por, created_at)` e RPCs
     `compartilhar_meta` / `descompartilhar_meta`, no molde de `interesse_compartilhamento`,
     `pode_ver_interesse`, `compartilhar_interesse` e `descompartilhar_interesse`. Numa migration
     nova (posterior a `20261112130100`), sem tocar nas do contrato.
   - Quem vê pelo compartilhamento **só lê**: título, alvo, prazo, progresso e aportes. Não edita
     nem aporta (a policy de update e a de insert em `meta_aporte` continuam exigindo ser membro
     do espaço da meta).
   - Na aba Metas do espaço conjunto, a meta compartilhada aparece com um selo de quem ela é.
   - **Comemorar:** ao ser cumprida, os membros dos espaços com que ela está compartilhada recebem
     uma notificação pelo motor (`notificar()` por espaço de compartilhamento, tipo novo com
     interruptor em `TIPOS_DA_CATEGORIA`). Se couber, uma reação simples de comemoração.
   - O aporte de uma meta pessoal compartilhada **não** entra na projeção do casal — só na do dono.
     Já é o comportamento de hoje: `useAportesDoMes` filtra por `meta.space_id`.
   - Sair do espaço apaga o compartilhamento (gatilho em `membership`, como o do salário).
7. Mês já acertado: **avisa**, não bloqueia nem pede confirmação (D8).
8. 13º, férias e PLR ficam fora da projeção no v1.
9. A aba Planejamento funciona também no espaço pessoal de quem não está em casal.
10. Teto por categoria e contas fixas ficam **para depois** da primeira rodada — não foram pedidos
    e não bloqueiam nada.

## Riscos

- **Dado de renda no Supabase.** É mais sensível que o gasto. A RLS por espaço pessoal é a defesa;
  testar com dois usuários no Studio local antes do `db push`, como o README pede para toda policy.
- **Escopo.** Planejamento, metas e Open Finance juntos são o maior bloco que o app já recebeu.
  Fatiar por onda e entregar cada uma usável sozinha é o que impede o "tudo pela metade".
- **Proporcional revela salário** (D1/D2). Precisa estar dito na tela.
- **O `SaldoDoMes` muda de significado no caixa conjunto.** Se os dois modelos convivem, a tela
  precisa deixar claro qual pergunta está respondendo — o mesmo cuidado que "meu bolso" vs. "gasto
  do espaço" exigiu.
- **Os riscos do plano de Open Finance continuam valendo** — MeuPluggy sem garantia de serviço,
  trial com lista travada, heurística de parcelas.

## Fora de escopo por enquanto

- Investimentos (rentabilidade, carteira, IR). Meta com aporte, sim; gestão de investimento, não.
- Imposto de renda e renda bruta.
- Orçamento base zero / envelope por categoria com transferência entre envelopes.
- Ver o extrato ou o saldo bancário do outro (mesma regra do plano de Open Finance).
- Planejamento de longo prazo (aposentadoria, simulações de anos).

## Referências no código

- `supabase/migrations/20260804180000_orcamento_compras.sql` — compra, rateio por peso, `parcela_mensal`
- `supabase/migrations/20260805120000_atualizar_compra.sql` — a nota sobre competência fechada
- `supabase/migrations/20260805130000_acerto_mes.sql` — o acerto como fato humano
- `supabase/migrations/20260812150000_objetivos_interesses.sql` e
  `20260813120000_interesse_agrupamento_compartilhado.sql` — interesse, favorito, conversão
- `supabase/migrations/20260908025100_pins.sql` — regra `objetivo_cumprido` desligada
- `app/types/orcamento.ts` — `saldoDoMes`, `meuBolso`, `gastoPorCategoria`
- `app/composables/useSpaceQuery.ts` — consulta com espaço explícito
- `app/components/CompraDialogo.vue` — `dividirIgualmente()`, o default de hoje
- `app/components/OrcamentosAbas.vue`, `app/components/ObjetivosAbas.vue` — onde as abas novas entram
- `docs/notion-plano-open-finance.md` — o plano da Pluggy
- `docs/notion-plano-gastos-pessoais.md` — a decisão de privacidade estrutural
- `docs/notion-plano-interesses.md` — agrupamento e favorito
