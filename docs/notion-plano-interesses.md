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
- **Para quem** (opcional): um membro do espaço, ou texto livre para quem não tem conta aqui
  ("minha mãe"). Só um dos dois por vez
- Uma **observação** curta: o por quê
- **Quem assumiu** (opcional): quem disse "darei de presente para ele"
- E **várias saídas possíveis** — os agrupamentos

"Arquivado" é destino de primeira classe, não fracasso escondido: a maioria das ideias não vira
nada, e tudo bem.

### Agrupamento: a saída possível, que é onde está o valor

Um interesse tem N **agrupamentos**, e cada agrupamento tem 1..N produtos que só valem juntos.

"Trocar o sofá" com três sofás de três lojas é o caso simples: três agrupamentos de um produto
cada. O caso que exige o conceito é "monitor novo":

```
Interesse "Monitor novo"
  ├── Agrupamento (favorito)   Monitor 27" 1.800 + braço de mesa 300  = 2.100
  └── Agrupamento              Monitor 24" 1.200 + base simples  150  = 1.350
```

O monitor sem o braço não resolve. Comparado **produto a produto**, o mais barato deste interesse
seria a base de R$ 150 — resposta correta para a pergunta errada. Por isso a comparação é entre
agrupamentos, e o custo do interesse é a soma do agrupamento, não o preço de um produto.

Cada produto guarda nome, link, loja, imagem, **preço, preço no Pix, parcelas e valor da
parcela** — os quatro números separados, e não a string que a loja exibia. É o que permite
calcular o total do parcelado (`12x de R$ 219,90` soa como R$ 2.399 e são R$ 2.638,80).

Um agrupamento é o **favorito**: é ele que representa o interesse, e dele que sairá o valor quando
o interesse virar objetivo ou compra. O primeiro entra favorito automaticamente — com uma saída
só, ela *é* o valor. O favorito manda mesmo sendo o mais caro, porque é decisão humana: o sofá
certo pode ser o caro.

**A soma de um agrupamento é `null` enquanto qualquer item estiver sem preço.** Não é a soma dos
que têm: uma soma parcial não é um preço menor, é um preço incompleto — e devolvê-la faria a tela
anunciar "economize R$ 750" a favor do agrupamento pior documentado. O parcial aparece com a
ressalva ao lado ("R$ 1.800 até agora — 1 item sem preço"), o que informa sem entrar na conta.

### Compartilhar, e assumir

Um interesse mora num espaço (`space_id`) e pode ser **emprestado** a outros: cada linha de
`interesse_compartilhamento` o torna visível também num espaço, sem movê-lo. É o que permite
guardar um presente no espaço pessoal e ainda mostrá-lo no do casal para a outra pessoa dizer "eu
dou". Só o dono compartilha e descompartilha.

Quem não é dono e alcança o interesse pode **assumir** ("darei de presente para ele"), acrescentar
produtos, trocar o favorito e mover o estado — mas não mexer na intenção (título, destino, para
quem, observação). Isso é um trigger, não uma policy: RLS decide quais LINHAS, nunca quais colunas.

Quem assumiu é visível para todos, **inclusive para o dono**. Foi uma escolha, e o contrário era
defensável (surpresa). Mas o app é de gente que coordena: esconder do dono que o presente já tem
dono deixaria os dois comprando a mesma coisa.

### "É meu" atravessa espaços, mas só no pessoal

No espaço pessoal aparecem também os interesses que moram num espaço compartilhado e foram
**criados por mim** ou **assumidos por mim**. Sem essa regra, o pessoal seria o único lugar do app
que esconde o que a própria pessoa está tocando, e ela teria de trocar de espaço para lembrar do
presente que prometeu.

A regra vale só no pessoal: dentro do espaço do casal, a lista de desejos de cada um segue
invisível até que o dono a compartilhe — que é o ponto de existir espaço pessoal. A função pura é
`interesseNaVista`, em `app/types/interesse.ts`.

## Modelo de dados

`20260812150000_objetivos_interesses.sql` criou o par base;
`20260813000000_interesse_preco_historico.sql` e o backfill acrescentaram o histórico de preço;
`20260813120000_interesse_agrupamento_compartilhado.sql` trouxe agrupamento e compartilhamento.

```
interesse(
  id, space_id, criado_por,
  titulo, destino, estado, para_quem, para_quem_user_id, observacao,
  assumido_por, assumido_em,
  convertido_em, convertido_tipo, convertido_ref_id,
  created_at, updated_at
)

interesse_agrupamento(id, interesse_id, nome, escolhido, created_at)

interesse_produto(
  id, interesse_id, agrupamento_id,
  nome, url, loja, imagem_url,
  preco, preco_pix, parcelas, valor_parcela,
  origem, capturado_em, verificado_em, falhas_seguidas, created_at
)

interesse_produto_preco(id, produto_id, preco, preco_pix, parcelas, valor_parcela, visto_em)

interesse_compartilhamento(interesse_id, space_id, compartilhado_por, created_at)
```

Decisões dentro disso:

- **Os preços são nullable.** A raspagem acerta o nome quase sempre e o preço menos. `not null`
  transformaria "não achei o preço" em "não dá para salvar" — e o link com o nome já vale sozinho.
- **`destino` e `estado` são texto com CHECK, não enum.** Mesmo padrão de `papel` e `tipo`:
  acrescentar um valor é alterar a constraint, não migrar um tipo. As uniões TypeScript espelham
  os CHECKs à mão em `app/types/interesse.ts`.
- **`escolhido` vive no AGRUPAMENTO**, com índice único parcial (`where escolhido`) por interesse.
  A regra é entre linhas irmãs, que CHECK não alcança. Trocar o favorito é a RPC
  `escolher_agrupamento`, porque são duas escritas e o índice recusa a ordem inversa.
- **`interesse_produto` guarda `interesse_id` E `agrupamento_id`**, e não é redundância por
  acidente: a RLS e a consulta da extensão 0.2.0 passam pelo primeiro. Um trigger
  (`validar_produto_agrupamento`) garante que os dois caminhos levem ao mesmo interesse — sem ele
  daria para pendurar um produto num agrupamento de outro interesse, e ele apareceria em dois
  lugares com contas diferentes.
- **`para_quem` e `para_quem_user_id` coexistem**, porque as duas respostas são legítimas. O nome
  do membro não é copiado para o texto: a pessoa trocaria de apelido e o interesse ficaria
  apontando para um nome que não existe mais.
- **As colunas `convertido_*` já existem, sem uso.** Ligar a conversão depois não pede migration
  nova nem backfill.
- **`observacao` é texto na tabela, não `nota_id`.** Ver "Como isso mudou".

RLS: ler e alterar valem para quem **alcança** o interesse — membro do espaço dele, ou membro de um
espaço em que ele foi compartilhado (`pode_ver_interesse`, `SECURITY DEFINER` para romper o ciclo
com a policy de `interesse_compartilhamento`). Apagar continua do autor ou do admin da casa dele:
descompartilhar é a saída de quem não quer mais ver, não apagar a vontade de outra pessoa.

O que cada um pode MUDAR é por coluna, e quem impõe é o trigger `interesse_intencao_protegida` —
RLS decide quais linhas, nunca quais colunas. `interesse_agrupamento`, `interesse_produto` e
`interesse_produto_preco` herdam de quem alcança o interesse.

RPCs (todas `SECURITY INVOKER`, porque as policies já expressam a regra): `registrar_interesse`,
`criar_agrupamento`, `adicionar_produto_ao_agrupamento`, `escolher_agrupamento`,
`compartilhar_interesse`, `descompartilhar_interesse`, `assumir_interesse`, `liberar_interesse`,
`registrar_preco_lido`. `adicionar_produto` e `escolher_produto` seguem existindo com a MESMA
assinatura, traduzindo por dentro para agrupamento: a extensão 0.2.0 instalada as chama, e uma
extensão que quebra ao atualizar o banco deixa de capturar até alguém reinstalar.

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
  para sempre, e mostrar o histórico por padrão a tornaria menos útil a cada mês. Um interesse
  visto de fora da casa dele leva o rótulo "de \<espaço>", senão pareceria dado duplicado.
- **Detalhe** (`[id].vue`): a ideia em cima, as saídas possíveis embaixo, ordenadas com o favorito
  primeiro e depois da mais barata à mais cara. Diz quanto a mais barata economizaria. Os botões
  que o trigger de intenção recusaria não aparecem para quem não é dono — o erro não deve ser a
  forma de descobrir a regra.
- **Card de produto clicável**, abrindo a edição, porque corrigir o que a raspagem leu errado é
  frequente. A **url fica travada**: é por ela que a rechecagem reabre a página, e trocá-la à mão
  faria a próxima leitura sobrescrever preço e histórico deste produto com os de outro — sem erro
  visível, e sem como descobrir depois que o gráfico virou dois produtos misturados.
- **Painel**: `useResumoInteresses` registra duas linhas — quantos em aberto e quanto somam.
  Conta **um agrupamento por interesse**; somar os três sofás candidatos diria que a gente quer
  três sofás. Dentro do favorito, aí sim soma tudo: "monitor + braço" custa os dois.

O cache é **um só** (`['interesses']`, sem escopo de espaço), e este é o único módulo assim. A
mesma linha é vista de até três lugares, então um cache por espaço guardaria três cópias — e
compartilhar de dentro de um espaço deixaria os outros dois desatualizados por até um minuto (o
`staleTime` global), com sintoma silencioso: compartilha, troca de espaço, não encontra nada.

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
3. **Gráfico do histórico de preço** — os dados existem (`interesse_produto_preco` grava uma linha
   por observação que mudou algo); falta a tela mostrar a série
4. **Notificar o par de um interesse novo, ou de um preço que baixou** — o motor existe
   (`notificar()` + o texto em `supabase/functions/_shared/notificacoes.ts`); é um `tipo` novo mais
   um gatilho. O preço que baixa é o caso mais útil e o mais fácil: a RPC já sabe quando mudou
5. **Baixar a imagem para o Storage** — hoje guarda a URL da loja; se apodrecer, é um card sem
   foto, não um dado perdido
6. **Notificar quem criou quando alguém assume** — hoje a informação só aparece ao abrir a tela

## Fora de escopo

- Votação/priorização entre os dois ("qual atacamos primeiro") — tentador, mas é outro módulo
- Transferir a POSSE de um interesse (hoje `criado_por` é fixo; `compartilhado_por` já está
  gravado à parte justamente para o dia em que deixar de ser)
- Prazo no interesse — prazo é característica de objetivo; se a ideia já tem prazo, ela amadureceu
- Rechecagem automática por cron — precisaria de credencial de bot num servidor, e o HTML cru não
  traz preço Pix nem parcelamento. O botão da extensão resolve com o navegador de quem já está
  logado
