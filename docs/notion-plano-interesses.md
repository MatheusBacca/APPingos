# Plano — Interesses (submódulo de Objetivos)

> **Implementado** em 12/08/2026. Este documento foi reescrito para descrever o que existe;
> a versão anterior planejava Interesses como módulo top-level dependente do componente de
> [Notas](./notion-plano-notas.md), que ainda não existe. O que mudou e por quê está em
> "Como isso mudou", no fim.
>
> A metade que captura produtos da web é a [extensão do
> Chrome](./notion-plano-extensao-chrome.md).

## Por que

Toda ideia começa vaga: "queria trocar o sofá", "acho que ela ia gostar deste fone", "e se a
gente fosse pro Chile em setembro". Os módulos existentes esperam a ideia já madura — um
orçamento espera um gasto que já aconteceu, uma viagem espera roteiro. Não havia lugar para o
antes disso.

E há uma segunda razão, mais concreta: **produto visto na internet some**. Fica numa aba aberta,
num print, num link mandado para si mesmo no WhatsApp. Quando chega a hora de decidir, ninguém
lembra se o sofá era R$ 2.399 ou R$ 2.899, nem em qual das três lojas era mais barato.

## O que um Interesse é

- Um **título** ("Trocar o sofá")
- Um **destino**: para qual módulo isso aponta — compra, objetivo, viagem, projeto, orçamento
- Um **estado**: rascunho → amadurecendo → convertido → arquivado
- **Para quem** (opcional): presente para alguém; texto livre, porque a pessoa presenteada quase
  nunca tem conta aqui ("minha mãe")
- Uma **observação** curta: o por quê
- E **vários produtos candidatos**

"Arquivado" é destino de primeira classe, não fracasso escondido: a maioria das ideias não vira
nada, e tudo bem.

### Vários produtos, e é aí que está o valor

Um interesse tem N produtos, não um. "Trocar o sofá" com três sofás de três lojas é o caso
normal — é comparar preço dentro da mesma vontade. Um produto por interesse obrigaria a criar
três interesses para a mesma coisa, e aí nenhum dos três seria "a vontade".

Cada produto guarda nome, link, loja, imagem, **preço, preço no Pix, parcelas e valor da
parcela** — os quatro números separados, e não a string que a loja exibia. É o que permite
calcular o total do parcelado (`12x de R$ 219,90` soa como R$ 2.399 e são R$ 2.638,80) e dizer
quanto o candidato escolhido custa a mais que o mais barato.

Um deles é o **escolhido**: é ele que representa o interesse, e dele que sairá o valor quando o
interesse virar objetivo ou compra. O primeiro produto entra escolhido automaticamente — com um
candidato só, ele *é* o valor. O escolhido manda mesmo sendo o mais caro, porque é decisão
humana: o sofá certo pode ser o caro.

## Modelo de dados

`supabase/migrations/20260812150000_objetivos_interesses.sql`

```
interesse(
  id, space_id, criado_por,
  titulo, destino, estado, para_quem, observacao,
  convertido_em, convertido_tipo, convertido_ref_id,
  created_at, updated_at
)

interesse_produto(
  id, interesse_id,
  nome, url, loja, imagem_url,
  preco, preco_pix, parcelas, valor_parcela,
  escolhido, origem, capturado_em, created_at
)
```

Decisões dentro disso:

- **Os preços são nullable.** A raspagem acerta o nome quase sempre e o preço menos. `not null`
  transformaria "não achei o preço" em "não dá para salvar" — e o link com o nome já vale sozinho.
- **`destino` e `estado` são texto com CHECK, não enum.** Mesmo padrão de `papel` e `tipo`:
  acrescentar um valor é alterar a constraint, não migrar um tipo. As uniões TypeScript espelham
  os CHECKs à mão em `app/types/interesse.ts`.
- **Um escolhido por interesse, por índice único parcial** (`where escolhido`). A regra é entre
  linhas irmãs, que CHECK não alcança. Trocar o escolhido é a RPC `escolher_produto`, porque são
  duas escritas e o índice recusa a ordem inversa.
- **As colunas `convertido_*` já existem, sem uso.** Ligar a conversão depois não pede migration
  nova nem backfill.
- **`observacao` é texto na tabela, não `nota_id`.** Ver "Como isso mudou".

RLS: `is_space_member(space_id)` para ler e escrever; insert exige `criado_por = auth.uid()`
(espelha `compra`); apagar é do autor ou do admin, mas **editar é de qualquer membro** —
amadurecer e arquivar a ideia do outro é o uso normal de uma lista de casal. `interesse_produto`
herda a permissão do pai, como `compra_participante` e `parada`.

RPCs (todas `SECURITY INVOKER`, porque as policies já expressam a regra):
`registrar_interesse`, `adicionar_produto`, `escolher_produto`.

## Onde mora

`/objetivos/interesses`, como aba do módulo de Objetivos.

Objetivos era um stub `ativo: false`. Agora está ativo, com uma aba real (Interesses) e "Metas"
visível e desabilitada ao lado. Mostrar a segunda aba desligada, em vez de omiti-la, diz a
verdade — "Interesses primeiro, metas depois" — e deixa visível o lugar da segunda função.

`/objetivos` redireciona para `/objetivos/interesses`: sem isso, clicar em Objetivos na sidebar
cairia numa página vazia com uma aba ao lado, e o módulo pareceria quebrado justamente por ter
ganhado conteúdo. O redirect sai no dia em que Metas nascer.

Objetivos fica **fora da bottom bar** mesmo ativo: a grade tem 5 células e os três slots são de
Orçamentos, Filmes e Viagens. O módulo entrou por uma aba, não pelo que dá nome a ele.

## Telas

- **Lista** (`app/pages/objetivos/interesses/index.vue`): agrupada por destino, filtrável por
  estado. O padrão são os **abertos** (rascunho + amadurecendo) — uma lista de vontades cresce
  para sempre, e mostrar o histórico por padrão a tornaria menos útil a cada mês.
- **Detalhe** (`[id].vue`): a ideia em cima, os candidatos embaixo, ordenados com o escolhido
  primeiro e depois do mais barato ao mais caro. Diz quanto o mais barato economizaria.
- **Painel**: `useResumoInteresses` registra duas linhas — quantos em aberto e quanto somam.
  Conta **um produto por interesse**; somar os três sofás candidatos diria que a gente quer três
  sofás.

## Como isso mudou

Duas diferenças em relação ao plano original, e as duas por causa da extensão do Chrome.

**Módulo top-level → submódulo de Objetivos.** Um interesse é um pré-objetivo: quando amadurece,
vira uma meta com prazo, e o produto escolhido carrega o valor que essa meta precisa. A hierarquia
diz isso. Como módulo separado, a relação seria só uma coluna.

**`nota_id` → `observacao text`.** O plano original punha o texto numa tabela `nota` compartilhada,
e por isso ficava bloqueado esperando o módulo de Notas. Interesses tinha razão para nascer antes
— a extensão só precisa de campos de produto —, então o texto virou uma coluna. Quando Notas
existir, `observacao` migra para lá; é uma coluna de texto curta, não um editor a reescrever.

O que **não** mudou: `titulo`/`destino`/`estado`, o CHECK em vez de enum, a RLS por
`is_space_member`, e a conversão entrando por último.

## O que falta

1. **Conversão em objetivo** — depende de Metas existir, que é a outra aba do módulo
2. **Conversão em compra** — `registrar_compra` exige rateio e `competencia_inicial`, que
   ninguém sabe no momento da captura; é um diálogo, não um botão
3. **Reconferir preço depois** ("avise se baixar") — quer cron e histórico de preço; módulo à parte
4. **Notificar o par de um interesse novo** — o motor existe (`notificar()` + o texto em
   `supabase/functions/_shared/notificacoes.ts`); é um `tipo` novo mais um gatilho
5. **Baixar a imagem para o Storage** — hoje guarda a URL da loja; se apodrecer, é um card sem
   foto, não um dado perdido

## Fora de escopo

- Votação/priorização entre os dois ("qual atacamos primeiro") — tentador, mas é outro módulo
- Compartilhar um interesse fora do espaço
- Prazo no interesse — prazo é característica de objetivo; se a ideia já tem prazo, ela amadureceu
