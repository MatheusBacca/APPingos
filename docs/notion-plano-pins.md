# Plano — Pins (gamificação do APPingos)

> Documento de planejamento. O que já existe e sustenta o plano é o motor de notificações
> (`supabase/migrations/20260811230436_notificacoes_motor.sql`) e o registro de módulos
> (`app/modules.ts`).

## Por que "Pins"

O glifo da marca já é um pingo — `app/components/PingoIcone.vue`, a gota que sai do `AppLogo`.
A moeda se chama **Pin** (plural **Pins**): a marca que você deixa no app quando registra algo.
Não precisa de ícone novo — o mesmo `<path>` serve no logo, no extrato e na notificação.

O que a feature promete: transformar o registro (que hoje é dever de casa — lançar o gasto,
marcar o filme, fechar o mês) em algo com retorno visível, e fazer o casal ver o esforço um do
outro sem precisar perguntar.

## As cinco decisões que sustentam o desenho

**1. Pin é lançamento, nunca saldo.** A tabela é um livro-razão: uma linha por conquista, com
quanto, por qual regra e sobre qual entidade. O saldo é `sum(pontos)`. Guardar um total em
`profile` criaria a pergunta que nenhum app de pontos consegue responder depois: *"por que eu
tenho 340?"*. Com o extrato, a resposta é a própria tela.

**2. Os Pins nascem no banco, em trigger — como as notificações.** Mesma razão da decisão 2 do
motor de notificações: vale para escrita vinda da tela, de RPC ou de SQL na mão, e nenhum
módulo novo pode esquecer de pontuar. O client **nunca** insere em `pin`.

**3. Toda concessão tem uma chave idempotente.** `unique (user_id, chave)`, com a chave sendo
`regra:entidade_id` (`filme_visto:<rating_id>`) ou `regra:competencia`
(`mes_segurou:2026-09-01`). Sem isso, salvar o mesmo filme duas vezes rende duas vezes — e o
primeiro relato de bug da feature seria "os pins estão inflacionando sozinhos".

**4. Pin nunca é proporcional ao valor gasto.** Este é o princípio que protege o módulo de
Orçamentos de virar um incentivo perverso. Premia-se o **registro** (lançou no dia) e a
**disciplina** (fechou o mês igual ou menor que o anterior) — jamais o tamanho do gasto.

**5. Ganho de um é notícia para o outro.** A concessão chama `notificar()`, que já exclui o
ator por construção. Quem ganhou vê um toast na hora; quem divide o espaço recebe na caixa. Em
espaço `pessoal` a função simplesmente não encontra destinatário e devolve 0 — sem tratamento
especial.

## O motor

### `public.pin` — o livro-razão

| coluna | por quê |
| --- | --- |
| `user_id` | quem ganhou |
| `space_id` | onde ganhou (nulo = conquista da conta, fora de espaço) |
| `regra` | `'filme_visto'`, `'mes_segurou'`, … — a chave em `pin_regra` |
| `base` | quanto a regra vale antes dos multiplicadores |
| `multiplicador` | `numeric(4,2)` — o fator aplicado, já com teto |
| `pontos` | o resultado, arredondado. É o que soma |
| `hotspots` | `text[]` — quais bônus entraram (`{sequencia,fim_de_semana}`), para o extrato explicar |
| `dados` | `jsonb` snapshot para o texto ("Duna", "Setembro/2026") — mesmo motivo do `dados` de `notificacao` |
| `entidade` / `entidade_id` | de onde veio, para o toque levar ao lugar |
| `chave` | idempotência (ver decisão 3) |
| `created_at` | ordem do extrato |

**RLS:** `select` para membros do espaço (o jogo é compartilhado — o casal vê o extrato um do
outro) mais as linhas de `space_id` nulo do próprio usuário. **Nenhuma policy de insert, update
ou delete** — quem grava é `conceder_pins()` rodando como `security definer`, igual a
`notificacao`. Ninguém fabrica pin pela API.

### `pin_regra` e `pin_hotspot` — a economia, versionada

Duas tabelas populadas por migration, como todo o resto — a regra de ouro do repo (nunca editar
pelo Table Editor) continua valendo. Existem como tabela, e não como `CASE` dentro da função,
por dois motivos: a tela "o que rende Pins" lê daqui em vez de repetir a lista em TypeScript, e
balancear a economia vira um `update` numa migration de uma linha em vez de reescrever uma
função.

> **Dado fica na tabela; condição fica no código.** `base`, `teto_dia`, `fator` e `teto` são
> números ajustáveis, e `lazer`/`noturna` dizem a *quais* regras cada hotspot se aplica.
> *Quando* um hotspot está ativo é lógica de função, e lógica em `jsonb` de configuração é o
> caminho curto para um interpretador caseiro dentro do Postgres.

### `conceder_pins()` — a porta única

Lê `pin_regra` (sai fora se `ativa = false`), calcula o multiplicador dos hotspots, aplica os
tetos, verifica `teto_dia`, insere com `on conflict (user_id, chave) do nothing` e — **só se a
linha entrou** — chama `notificar()`. Notificar depois e só se inseriu é o detalhe que impede a
caixa de encher com o mesmo ganho a cada `update` bobo na linha de origem.

`conceder_pins_todos()` é a irmã para conquistas coletivas (fechar o mês, foto aprovada, viagem
concluída): concede a cada membro do espaço, e cada concessão notifica os outros.

## Como se ganham Pins

### Base — o que já existe hoje e passa a render

| Ação | Gancho | Base | Teto/dia |
| --- | --- | --- | --- |
| Marcar filme/série como visto | `rating.status → 'visto'` | 10 | 5 |
| Enviar a avaliação (nota + resenha) | `rating.enviado_em` | **5** | 5 |
| Registrar um gasto | `insert on compra` | 3 | 5 |
| Fechar o mês | `insert on acerto_mes` | 30 | — |
| Mandar uma foto | `insert on foto` | 3 | 10 |
| **Curtir uma foto** | `insert on foto_curtida` | 2 | 10 |
| Os dois curtiram a foto | `foto.aprovada_em` | 5 | — |
| Criar um roteiro | `insert on roteiro` | 15 | 3 |
| Concluir a viagem | cron, `data_fim` = ontem | 50 | — |
| Fechar a memória da viagem | `memoria.concluida_em` | 80 | — |
| Converter um interesse | `interesse.estado → 'convertido'` | 40 | 3 |

O teto diário do gasto é deliberado: quem lança 30 compras num domingo de reconciliação está
sendo organizado, não jogando — mas a economia não pode depender disso.

### Hotspots — os multiplicadores

Multiplicam a base, **somam entre si** e param num teto global de 2,5× (guarda para hotspots
futuros; com os números de hoje o máximo possível é 1,90×).

| Hotspot | Quando | Fator | Teto |
| --- | --- | --- | --- |
| **Sequência** | dias consecutivos com ao menos um Pin | +5% por dia | **+15%** |
| **Fim de semana** | sábado e domingo, nas regras de lazer | +20% | +20% |
| **Modo viagem** | há viagem em curso no espaço | +10% por dia | **+15%** |
| **No calor da hora** | `compra.data_compra = hoje` no lançamento | +25% | +25% |
| **Corujão** | filme marcado como visto entre 22h e 2h | +15% | +15% |

A sequência é o que faz a feature ter efeito de hábito; o resto é tempero. Os dois hotspots que
crescem por dia param em +15% — sequência satura em 3 dias, modo viagem no 2º dia de viagem.

**As regras de lazer são `filme_visto`, `avaliacao_enviada`, `foto_nova` e `foto_curtida`** — é
a coluna `lazer` em `pin_regra`. Isso é o que faz uma foto mandada no sábado, ou curtida no
sábado, valer mais para **quem mandou e para quem curtiu**, cada um no momento do seu próprio
gesto.

Os hotspots são avaliados **no momento da concessão**, contra o relógio do servidor. Ação com
data retroativa (marcar hoje um filme visto na semana passada) ganha a base, não o tempero —
senão a forma ótima de jogar seria acumular registros para lançar todos num sábado à noite.
Pelo mesmo motivo, curtir hoje uma foto da viagem do mês passado rende a base: o hotspot é
sobre **quando você agiu**, não sobre quando a foto nasceu.

> **Viagem secreta não liga o modo viagem.** Só entram roteiros `compartilhado` — a mesma
> verificação de `avisar_viagens_proximas()`. Um hotspot "modo viagem" aparecendo no extrato de
> quem não sabe da surpresa seria o jeito mais bobo de estragá-la.

### As quatro regras compostas

**1. Fechar o mês igual ou menor que o anterior.** Gancho no `insert on acerto_mes` — a ação de
fechar já existe e já notifica (`mes_fechado`). A função soma `parcela_mensal` da competência e
da anterior e compara. Uma faixa só, a melhor que couber:

| Gastou | Pins | Rótulo |
| --- | --- | --- |
| até 115% do mês anterior | 40 | "Segurou o mês" |
| até 100% | 80 | "Gastou menos" |
| até 85% | 120 | "Apertou de verdade" |

É **coletiva**: os dois membros ganham. Fechar o mês no azul não é mérito de quem clicou no
botão.

> ⚠️ **A armadilha desta regra:** o jeito mais fácil de "gastar menos" é **não lançar o gasto**.
> Duas defesas, e estão as duas no código: piso de **5 lançamentos** no mês (abaixo disso a
> regra nem é avaliada), e nada quando o mês anterior não teve movimento. Sem isso, a regra
> premiaria exatamente o comportamento que o módulo de Orçamentos existe para combater.

**2. Filme marcado com antecedência e assistido na data combinada.** +25 em cima da base de
`filme_visto`, quando `planejado_para - planejado_em >= 1 dia` e `visto_em = planejado_para`.

> **Precisa de coluna nova:** `rating.planejado_em timestamptz`, carimbada por trigger toda vez
> que `planejado_para` muda. Sem ela não dá para saber se a marcação foi feita com antecedência
> ou no mesmo dia. Ela também fecha a porta do retroativo: marcar hoje `planejado_para = ontem`
> dá antecedência negativa.

**3. Viagem.** O "+10% por dia" é o hotspot **modo viagem** — durante os dias entre
`data_inicio` e `data_fim`, tudo o que a pessoa ganha no espaço rende mais (foto mandada, foto
curtida, filme visto, gasto lançado), com teto de +15%. Mais os 50 fixos ao concluir, por cron,
seguindo `avisar_viagens_concluidas()`.

**4. Memória da viagem.** 80 ao gravar `memoria.concluida_em`, mais **+40 se fechada em até 7
dias** do `data_fim` do roteiro. A memória escrita enquanto a viagem está fresca é outra coisa —
e é justamente a que ninguém escreve se deixar para depois.

### Objetivos — a regra que ainda não tem onde se apoiar

Você pediu Pins por cumprir Objetivos, mas **Objetivos como meta com prazo não existe no
schema**. O módulo `objetivos` hoje tem só a aba de Interesses (`public.interesse`), e a própria
descrição em `app/modules.ts` admite isso: *"metas com prazo em breve"*.

A regra `objetivo_cumprido` **nasce cadastrada com `ativa = false`**, e o que rende Pins agora é
o ciclo que existe de fato — `interesse.estado → 'convertido'`. No dia em que a tabela
`objetivo` nascer, ligar a regra é um `update` de uma linha.

## As notificações

Um tipo novo: **`pins_ganhos`**, com quanto e onde.

1. **Somar no agrupamento.** Hoje `notificar()` agrupa fazendo `dados || v_dados` — o novo
   sobrescreve o velho. Para Pins isso mente: dois ganhos de 10 virariam "2 vezes, 10 pins". Um
   parâmetro `p_somar text[]` diz quais campos numéricos acumulam em vez de sobrescrever.
2. **Janela de 30 minutos**, para uma maratona de série virar uma linha — *"Ana ganhou 60
   Pins"* — e não seis.
3. **Um oitavo interruptor**, `pins`, em `TIPOS_DA_CATEGORIA` (`_shared/notificacoes.ts`), mais
   o `case 'pins_ganhos'` no renderizador — o mesmo módulo serve a tela e o e-mail.

## O que a pessoa vê

- **`/pins` — o extrato.** A lista do livro-razão, cada linha dizendo a regra, os hotspots que
  entraram e a conta (`3 × 1,50 = 5`). É esta tela que responde "por que eu tenho 340".
- **"O que rende Pins"**, lido de `pin_regra` e `pin_hotspot`, na mesma página. Regra escondida
  não muda comportamento.
- **Saldo no painel**, via `VitrinePins.vue`: saldo do espaço, os membros lado a lado e a
  sequência atual.

> **Não é um módulo da barra.** Pins atravessa todos os módulos; disputar um dos cinco slots da
> bottom bar com Orçamentos, Filmes e Viagens seria desproporcional. Página + vitrine + entrada
> no "Mais".

## Riscos

| Risco | Defesa |
| --- | --- |
| Premiar não-registro no Orçamento | Piso de 5 lançamentos no mês |
| Farm de ações baratas | `teto_dia` por regra + chave idempotente |
| Inflação por hotspots empilhados | Teto por hotspot + teto global de 2,5× |
| Notificação virar barulho | Janela de 30 min + interruptor próprio |
| Retroativo virar estratégia | Hotspot avaliado no relógio do servidor, nunca na data do fato |
| Spoiler de viagem secreta | Modo viagem só olha roteiro `compartilhado` |
| Ganho revertido (desmarcar filme) | O `delete` em `rating` leva o pin junto por FK; a notificação já enviada fica — é a única inconsistência aceita, e ela é rara e inofensiva |

**Sem backfill.** O motor nasce valendo do dia em que entra no ar. Retroagir sobre o histórico
daria a duas pessoas alguns milhares de Pins no primeiro login e mataria a graça da primeira
semana.

## Fora do v1

Níveis, medalhas e conquistas. Pins v1 é a moeda e o extrato; nível é uma camada em cima, e ela
fica mais fácil de desenhar depois de ver a economia rodando um mês.
