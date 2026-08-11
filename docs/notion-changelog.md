# APPingos — Changelog

> Log cronológico, uma entrada por sessão de trabalho. Decisões de arquitetura que valem a
> pena reter vão também no `notion-arquitetura.md`; aqui é o registro do que foi feito e quando.

## 2026-07-30 — Fundação + módulo Filmes/Séries

**Feito:**
- Definida a stack: Nuxt 4 + Tailwind v4 + shadcn-vue + Supabase (Cloud) + PWA
- Escolhidos 3 projetos de referência visual: Ryot, Maybe Finance, LifeForge
- Scaffold do projeto em `C:\projects\appingos`
- Schema de fundação: `profile`, `space`, `membership`, `space_invite` com RLS (função
  `SECURITY DEFINER` para evitar recursão), trigger de novo usuário, convite por código
- Auth (login/cadastro), seletor de espaço, shell responsivo (sidebar desktop / bottom bar
  mobile), registro de módulos em `app/modules.ts`
- PWA instalável: manifest, ícones gerados por script, meta tags de iOS
- Módulo Filmes/Séries completo: proxy do TMDB, busca, lista por status, detalhe com
  avaliação por usuário (estrelas + resenha)

**Decisões:**
- Supabase Cloud desde o início (não local) para a fase de construção das telas
- Tailwind entra via `@tailwindcss/vite`, não `@nuxtjs/tailwindcss` (esse módulo é v3-only)
- `typescript@7` (o port nativo) quebra o compilador do Vue — fixado em `^5.9`

**Pendências ao fim da sessão:** sem Docker Desktop rodando, as migrations nunca tinham sido
testadas contra um Postgres real; projeto ainda sem commit e sem remoto.

---

## 2026-07-30 — Infraestrutura: Docker, GitHub, Vercel, Supabase na nuvem

**Contexto:** fechar o ciclo operacional para trabalhar também do computador de casa, publicar
o app de graça, e ter um jeito confiável de operar o Supabase no dia a dia.

**Feito:**
- Descoberto que o Docker Desktop já estava instalado, só parado — sem instalação necessária
- Primeiro commit do projeto e push para
  [github.com/MatheusBacca/APPingos](https://github.com/MatheusBacca/APPingos) (privado)
- Projeto Supabase criado na nuvem (`bmphsxdfryinvtvttmlr`, região `sa-east-1`); as duas
  migrations aplicadas via `supabase db push` e validadas com queries reais (grants/RLS
  filtrando corretamente para usuário anônimo) e dois cadastros de teste (o trigger de novo
  usuário rodou sem erro nos dois)
- Deploy no Vercel (Hobby, gratuito): projeto linkado ao GitHub (deploy automático a cada
  push), `SUPABASE_URL`/`SUPABASE_KEY` configuradas nos 3 ambientes, testado em produção
  (`https://appingos.vercel.app`) — cadastro real chegou a bater no Supabase (parou só por
  rate limit de tantos testes seguidos, o que já prova que a conexão funciona)
- README atualizado com o fluxo Docker → local → cloud e a seção de trabalhar de mais de um
  computador; estes dois documentos criados para colar no Notion

**Decisões:**
- GitHub privado na conta pessoal (não a da WeON)
- Regra fixada: nunca editar schema direto pelo Table Editor da nuvem — sempre por migration
  versionada, testada local (quando possível) antes de `db push`

**Contratempos e o que aprendemos:**
- O Docker Desktop crashava ao iniciar (`getting eth0 link: Link not found`) — sintoma de
  memória baixa (a máquina tem 7,4 GB, e ficou por minutos abaixo de 1 GB livre com o uso
  normal do dia). `wsl --shutdown` + reabrir resolveu o crash do daemon em si.
- Mesmo com o daemon no ar, a stack completa do Supabase (~10 containers) não coube na RAM
  livre — a CLI (que roda em Bun) crashava com erro de alocação de memória. **Decisão:** por
  ora, validar migrations direto na nuvem em vez de local; retomar a stack local quando houver
  mais RAM de sobra. Isso significa validar cada migration com mais cuidado antes do `db push`,
  já que não há mais um ambiente descartável no meio do caminho.
- O login do Vercel/GitHub via CLI depende de um fluxo de navegador (device code) — não dá
  para automatizar sem a etapa manual do usuário; os códigos expiram em poucos minutos.
- Vercel, ao linkar o projeto, reescreveu o `.gitignore` de um jeito que quebrava a exceção do
  `.env.example` (uma regra `.env*` posterior anulava o `!.env.example`) — corrigido reordenando
  as regras.

---

## 2026-07-31 — TMDB em produção e três bugs achados testando de verdade

**Contexto:** com o TMDB configurado, dava para exercitar o app inteiro em produção pela
primeira vez. Foi aí que os bugs apareceram — nenhum deles quebrava o build.

**Feito:**
- TMDB ligado em produção. O token que o site entrega hoje é o **Read Access Token (v4)**, que
  não funciona como `?api_key=` (v3): trocado para `Authorization: Bearer`, que também é melhor
  por manter o segredo fora da URL (logo, fora de logs e histórico de proxy)
- Fluxo completo validado em produção: cadastro → confirmação de e-mail → espaço pessoal criado
  pelo trigger → buscar "Interestelar" no TMDB → adicionar → marcar "Visto" → nota 9 →
  tudo persistido e conferido direto no banco
- `npm run typecheck` (vue-tsc) adicionado; suíte em zero erros

**Os três bugs (todos passavam pelo build):**
1. **`useSupabaseUser()` devolve as claims do JWT, não um `User`** — o UUID vem em `sub`, não em
   `id`. Ler `.id` retornava `undefined` silenciosamente: a query de espaços nunca habilitava
   (app eternamente em "Carregando…") e as avaliações do próprio usuário nunca casavam.
   Centralizado em `useUsuarioId()`, com fallback para `.id`.
2. **Faltava FK de `membership.user_id` e `rating.user_id` para `profile.id`** — as duas só
   apontavam para `auth.users`, então o PostgREST não conseguia inferir o embed e devolvia 400.
   Resultado visível: os membros apareciam como "Alguém" em vez do nome.
3. **Referência órfã a `user` no template** de `filmes/[id].vue`, sobrevivente do rename — o Vue
   avalia variável inexistente como `undefined` sem reclamar, então as estrelas de nota
   simplesmente sumiam. Foi o que motivou adicionar o typecheck.

**Aprendizado que vale reter:** `nuxt build` passando não significa app funcionando. Os três
bugs eram silenciosos em build e só apareceram exercitando o app de ponta a ponta. O typecheck
pega a classe (3); as outras duas só aparecem testando de verdade contra o banco real.

**Próximos passos sugeridos:** testar o fluxo de convite com uma segunda conta (é o que valida
o isolamento por RLS entre espaços, que ainda não foi exercitado com dois usuários de verdade);
módulo de Orçamento (segundo motor: série temporal com meta).

---

## 2026-08-03 — Papel "admin" no espaço

**Contexto:** existiam só dois níveis — dono e todo o resto. Faltava um meio-termo para quem
pode agir em nome do espaço sem poder destruí-lo.

**Feito:**
- `membership.papel` aceita `'admin'`. Quem entra por convite continua `'membro'`.
- Só o **dono** promove e rebaixa, pela página de Espaços. A RPC `definir_papel` recusa
  qualquer outro, recusa o dono mudando o próprio cargo, e **não aceita `'dono'` como valor** —
  transferência de posse fica de fora até ser pensada direito. Um espaço com dois donos, ou com
  nenhum, é um estado que ninguém quer descobrir depois.
- Primeiro poder do admin: **"Quem assistiu com você"** na tela do filme. Ele marca quem estava
  junto, e essas pessoas herdam a mesma data de assistido que a dele.

**Decisão: dono é admin por definição.** `is_space_admin` cobre os dois, para nenhuma policy
precisar escrever "dono ou admin" à mão e esquecer um caso.

**O que a RPC não faz, de propósito:** ela copia só a data. Nota e resenha continuam de cada
um — a data é um fato compartilhado ("estávamos juntos"), a opinião não é. Verificado: ao
marcar a companheira, a nota 5 e o carimbo de avaliação enviada dela continuaram intactos, só
a data mudou. Ela também exige que o admin já tenha a **própria** data preenchida: é ela que
vai ser copiada, e sem isso não há o que copiar.

A tela mostra a situação atual de cada pessoa antes de marcar ("hoje marcado em 14 de agosto"),
para o admin ver o que está prestes a sobrescrever em vez de descobrir depois.

---

## 2026-08-03 — Recorte "Assistindo"

Para série, que leva dias: um estado entre "queremos ver" e "assistidos". **Sem data** — é um
intervalo, não um dia — então ele ignora o filtro de mês do calendário, como "Disponível".

Não precisou de migration: `status` já aceitava `'vendo'` desde o catálogo, sem uso na tela.
A ordem dos recortes virou o ciclo: Queremos ver → Assistindo → Assistidos → Disponível.

**Duas armadilhas que apareceram no caminho:**
- `visto_em` preenchido vence o status na hora de decidir o recorte. Mover para "Assistindo"
  precisa limpar a data, senão o item volta para "Assistidos" na próxima leitura. Vale também
  para o seletor de status na tela do filme, que agora limpa a data ao sair de "Assistido".
- Os rótulos estavam divergindo: a tela do filme dizia "Vendo"/"Visto" e os recortes diziam
  outra coisa. `STATUS_ROTULO` passou a usar os mesmos nomes dos recortes — o mesmo estado não
  pode ter dois nomes no app.

---

## 2026-08-03 — Mover no celular, e o filtro de mês sem exceção

**Feito:**
- "Queremos ver" e "Assistidos" no painel do calendário passam a seguir o dia/mês visível
  **sem exceção**. Um assistido sem data não tem mês a que pertencer e vive em Nossa lista; a
  seção mostra "+N sem data, em Nossa lista" para não virar sumiço silencioso.
- **Menu "mover para…"** em cada cartaz, com os três destinos e o atual marcado. É o caminho
  do celular, onde arrastar não funciona.

**Por que menu e não arrastar no celular.** O arraste em si é fácil; o problema é a rolagem.
No toque, o navegador decide **no início do gesto** se o dedo rola a página ou é da aplicação,
pela CSS `touch-action`. Para capturar o arraste, o cartaz precisaria de `touch-action: none` —
e aí não dá mais para rolar a página passando o dedo sobre um pôster, numa grade que é quase
toda pôster.

As saídas seriam uma alça de arraste (alvo pequeno, e sem como testar com dedo de verdade
aqui) ou uma biblioteca como o Sortable.js — que resolve, mas quer ser dona do array, e as
nossas listas são computadas do servidor: cada movimento precisaria de lógica de reverter.
Dois toques certeiros num menu batem um long-press que erra fácil, então o menu ficou como
solução, não como remendo. O arraste continua no desktop.

---

## 2026-08-03 — Interesse, convite para assistir junto e "não lembro"

**Contexto:** a tela presumia que todo mundo do espaço queria ver tudo que fosse adicionado —
em "Disponível" apareciam as bolinhas dos dois membros em todo cartaz, sem informação nenhuma.

**A mudança de conceito:** ter uma linha em `rating` passa a significar **interesse**. Quem
nunca tocou no filme não tem linha e não está em recorte nenhum. É o que faz a bolinha voltar
a dizer alguma coisa.

Em cima disso vem o **convite para assistir junto**: quando alguém marca uma data, quem tinha
interesse e ainda não datou nada recebe um convite em tela no módulo, e responde sim ou não.
Aceitar copia a data proposta para a avaliação da pessoa; recusar mantém o interesse, só não
vai naquela data. Tabela `convite_filme`, com escrita apenas pelas RPCs `planejar_filme` e
`responder_convite` — sem policy de insert/update, ninguém fabrica nem responde convite alheio.

**Também nesta rodada:**
- **"Não lembro"** ao marcar como assistido: "assistido" passa a ser o `status`, e a data é
  opcional. Um assistido sem data escapa do filtro de mês, senão marcá-lo assim faria o
  cartaz sumir da tela.
- **Abas de volta:** Início | Nossa lista. Cada recorte da agenda virou **uma linha de cinco**
  com um "Ver todos" que leva a `/filmes/lista?recorte=…` já filtrado.
- **Ordem dos recortes:** Queremos ver → Assistidos → Disponível.
- A regra de "onde este filme está" saiu de dentro das páginas para `app/lib/recortes.ts`, e
  as duas telas passaram a ler dela — antes cada uma tinha a sua versão.

---

## 2026-08-03 — Filmes numa tela só, com arrastar entre grupos

**Contexto:** o módulo estava em três abas (Agenda, Buscar, Nossa lista), e o painel do
calendário listava os filmes sem data como texto — pouco convidativo para usar.

**Feito:**
- **Abas removidas.** `/filmes` agora é uma tela única, na ordem: busca → calendário →
  segmentação por status. `/filmes/buscar` e `/filmes/lista` deixaram de existir.
- O painel do calendário virou três grupos de **capas em grid de 5 colunas** —
  Disponível · Queremos ver · Assistidos — e o cartaz **se arrasta entre eles**.
- Soltar em "Queremos ver" ou "Assistidos" abre um diálogo de data. O padrão é a data que a
  outra pessoa já escolheu (entrar junto é o caso comum) ou hoje — e dá para trocar por
  qualquer data passada, que é o ponto da retroatividade. Se a data cair em outro mês, o
  calendário navega até lá sozinho, senão o cartaz "sumia".
- **Bolinhas de membros no rodapé do cartaz:** inicial do nome, no máximo 3 sobrepostas
  (as demais viram um "+N"), com tooltip listando quem está ali.
- Quando alguém está num grupo e você não, um **"+" aparece ao passar o mouse** no cartaz e
  te coloca junto — com a data da outra pessoa já preenchida.

**Decisão: os grupos são a união do que as duas pessoas marcaram.** Se ela quer ver e eu
ainda não, o cartaz aparece em "Queremos ver" com a bolinha dela e o "+" para eu entrar. A
alternativa — cada um ver só o próprio recorte — deixaria o espaço compartilhado sem serventia
justamente na tela que existe para combinar o que ver. "Disponível" é a exceção: só entra o
que ninguém datou, e ele ignora o mês visível, porque é estoque e não data.

**Limitação conhecida:** arrastar usa a API de drag and drop do HTML5, que **não funciona em
tela de toque**. No celular, o caminho é o "+" no cartaz ou a tela do filme. Vale trocar por
uma biblioteca de gestos se o uso no celular incomodar.

---

## 2026-07-31 — Exclusão de espaço pelo dono

**Contexto:** um espaço de casal, uma vez criado, era para sempre — não havia como excluí-lo
nem pela UI nem por RPC, e a única saída seria editar o banco à mão.

**Feito:**
- Migration `20260731130000_deletar_espaco.sql`: tabela `space_deletion_notice` + RPC
  `deletar_espaco`, que checa o dono, recusa o espaço pessoal, avisa os outros membros e só
  então apaga (o `on delete cascade` limpa membership, convites, entries e ratings)
- Zona de risco em Espaços, visível só para o dono de um espaço de casal, com confirmação por
  **digitação do nome exato** e a contagem do que será apagado
- Pop-up "O espaço foi deletado pelo dono." no layout, para o membro ver na próxima vez que
  abrir o app
- Fluxo validado de ponta a ponta com duas contas reais, incluindo o teste de convite que
  estava pendente desde 30/07 — o link de convite funciona

**Decisão: aviso registrado, não soft delete.** Com exclusão definitiva não sobra linha
nenhuma para o membro ler; a RPC grava o recado antes de apagar, numa tabela sem FK para
`space` (por isso ela sobrevive ao cascade). O caminho alternativo — marcar `deleted_at` e
manter a linha — obrigaria todo módulo futuro a lembrar de filtrar espaços fantasma, e pediria
uma rotina de faxina.

**Bug encontrado de brinde:** todo `catch` do app usava
`e instanceof Error ? e.message : 'texto genérico'`. Os erros do supabase-js **não** são
instâncias de `Error` (são objetos simples: `PostgrestError`, `AuthError`), então toda mensagem
vinda do banco caía no texto genérico. Foi assim que um "este convite já foi usado" apareceu
como "Código inválido." durante o teste, e as mensagens de guarda da RPC nova nunca chegariam
ao usuário. Centralizado em `mensagemDeErro()` (`app/lib/utils.ts`).

**Também nesta sessão:** documento de planejamento de Stories/timeline
(`notion-plano-stories-timeline.md`) — decisão de escopo registrada: publicações permanentes,
não efêmeras.

---

## 2026-08-03 — Agenda de filmes e avaliação fechada

**Feito:**
- Migration `20260731140000_agenda_avaliacao.sql`: `planejado_para` e `enviado_em` em `rating`,
  mais um trigger que congela nota e resenha depois do envio
- `/filmes` virou a **Agenda**: calendário do mês com as datas marcadas e um painel à direita
  com "Queremos ver" e "Assistidos". A busca foi para `/filmes/buscar`; três abas agora
- Card do filme refeito: botão **Voltar**, campos de data, e um formulário único de
  estrelas + resenha com um só botão "Enviar" (a resenha é opcional). Depois de enviar, a
  avaliação vira registro fixo
- Validado com as duas contas: a trava foi testada chamando a API direto, não só pela tela

**Decisão: as datas são pessoais, não do casal.** Ficam em `rating`, junto da avaliação. No
espaço de casal cada um marca a sua, e o calendário mostra as duas com o nome de quem marcou —
"ela viu no dia 14, eu vi no dia 13" é informação, não duplicidade. Foi também a deixa para
uma feature futura: deixar o usuário decidir compartilhar um registro pessoal com o espaço,
e a partir daí os outros membros interagirem com ele.

**Datas como texto, nunca como `Date`.** O banco guarda `date` (sem hora, sem fuso). Passar
`'2026-08-05'` por `new Date()` interpreta em UTC e, no nosso fuso, devolve o dia 4 — o
clássico "o filme aparece um dia antes". `app/lib/datas.ts` centraliza isso: a data é texto
`YYYY-MM-DD` do banco até a tela, e só o cálculo da grade do mês usa `Date`, sempre local.

**Dois bugs corrigidos, ambos relatados ou achados testando:**
1. **Nome de quem avaliou aparecia como "Alguém".** `espacos.vue` e `useMembros()` usavam a
   mesma chave de cache `['membros']` com formatos de retorno diferentes — quem carregasse
   primeiro entregava o objeto errado para a outra tela. Unificado em `useMembros()`.
2. **O rascunho da avaliação era apagado ao salvar uma data.** O watcher re-semeava
   nota/resenha a cada mudança de `minhaAvaliacao`, e salvar a data revalida o item: as
   estrelas voltavam ao estado do banco no meio do preenchimento. Agora o rascunho é semeado
   uma vez só.

**Também nesta sessão:** planos para o Notion de
[Notas](./notion-plano-notas.md) (o editor de documentos, com Markdown como fonte da verdade)
e [Interesses](./notion-plano-interesses.md) (registrar a ideia crua e depois convertê-la em
objetivo/viagem/orçamento).

---

## 2026-08-09 — Módulo de Viagens: roteiros com Google Maps

**Contexto:** primeiro módulo do repo com integração externa de verdade. O TMDB é um proxy de
leitura sem conta, sem cota e sem ToS que restrinja cache; o Google tem os três. Duas
convenções nascem aqui — a primeira chave exposta ao navegador e o primeiro `runtimeConfig.public`.

**Feito:**
- Migration `20260809160118_viagens.sql`: `roteiro`, `parada`, `roteiro_visto`, o helper
  `pode_ver_roteiro`, o trigger `validar_roteiro` e as RPCs `salvar_paradas`,
  `liberar_roteiro`, `marcar_roteiro_visto`
- Busca de lugares atrás de `/api/lugares/busca` (Places API New, Autocomplete), no molde do
  proxy do TMDB; duas chaves do Google no `.env`, com restrições opostas
- Telas `/viagens` e `/viagens/[id]`: grade de cards, mapa embutido, paradas ordenáveis,
  botões "abrir no Google Maps" e o fluxo de segredo → liberar
- `useResumoViagens` no painel, e o módulo virou `ativo: true` em `app/modules.ts`
- 35 testes novos (`test/viagens.test.ts`, `test/resumo-viagens.test.ts`)

**Decisão: o segredo é a única exceção à doutrina de privacidade do repo.** `useGastosPessoais`
afirma a regra da casa — privacidade é estrutural (espaço pessoal vs. do casal), nunca uma flag
na linha. Viagens quebra isso porque o roteiro-surpresa **precisa** nascer no espaço do casal:
o ponto todo é o momento da revelação dentro dele, e mover depois significaria reescrever
`space_id` e perder o histórico. A contrapartida é inegociável e está na policy de RLS, jamais
num filtro do client — com a anon key na mão, um `select` cru volta vazio. Testado com dois
usuários reais antes de qualquer tela existir.

**Três limites do Google que não batem entre si.** A lista da tela mostra tudo; o mapa embutido
aguenta 22 pontos; o link que abre o app do Maps aguenta 5 no celular e 11 no desktop
("up to three waypoints supported on mobile browsers, and a maximum of nine otherwise"). Um
roteiro de 12 paradas atravessa os três de forma diferente, e o modo de errar é silencioso: o
link ignora o que não coube, sem erro nenhum. `trechosDoMaps` quebra o roteiro em trechos
encadeados — o fim de um é o começo do seguinte —, com o tamanho escolhido em runtime pelo
`useMediaQuery`. Quando cabe num link só, é um botão só e a mecânica não aparece.

**Parada de texto livre é de primeira classe.** "Casa da vó" não está no Maps e mesmo assim
pertence ao roteiro: conta na lista, no dia e na numeração, mas não entra na rota — não há como
pedir direções até um lugar que o Google não indexa. A tela diz isso na hora de adicionar, e
não depois, quando o mapa "esqueceu" a parada.

**Avião ficou de fora do seletor de transporte.** Foi pedido, mas o Maps roteia `driving`,
`walking`, `bicycling` e `transit` e nada mais. Um roteiro aéreo não é outro modo de
transporte, é outro produto (trechos com horário, sem rota desenhável). O CHECK aceita um
quinto valor no dia em que fizer sentido.

**Dois bugs achados no navegador, não nos testes:**
1. **Botão morto com uma parada só.** `trechosDoMaps` devolvia um "trecho de um ponto" e a tela
   desenhava um "Abrir no Google Maps" que não levava a lugar nenhum — no momento mais comum do
   módulo, o primeiro lugar de um roteiro novo. Uma rota precisa de origem E destino.
2. **Bottom bar quebrada.** A grade tem 5 células (Início + três módulos + Mais) e ativar
   Viagens fez virarem 6. Objetivos saiu da barra: ainda é "em breve", e não vale um slot que um
   módulo pronto quer.

**Também nesta sessão:** histórico de migrations do banco realinhado com os nomes de arquivo do
git — três versões tinham derivado por terem sido aplicadas fora do `db push`, e um clone novo
teria tentado reaplicá-las.

**Ainda em 09/08 — três formas de abrir no Maps.** O botão único virou um recorte escolhido:
o roteiro inteiro, um dia de cada vez, ou uma seleção avulsa de paradas. Os três são a mesma
função (`aberturaNoMaps`) sobre listas diferentes — o limite de waypoints do celular continua
num lugar só, porque três caminhos até o Maps não podem virar três lugares para ele ficar
desatualizado.

O recorte por dia junta TODAS as paradas daquele dia, mesmo separadas na lista: "o que a gente
faz no sábado" é a pergunta, não "o que está entre a parada 3 e a 7". A seleção existe para
planejar sem mexer no roteiro — marcar a 1 e a 4 dá um link direto entre elas.

Um recorte de uma parada só ganhou `urlDoLugar` (Maps URLs em modo `search`): não há rota, mas
há lugar. Sem isso a tela teria que escolher entre esconder o dia — mentindo sobre o roteiro —
ou desenhar um botão de rota morto, que é o bug que já apareceu uma vez.

No modo seleção a lista deixa de ser editável, e é de propósito: a seleção é por índice, e
permitir reordenar enquanto há marcações embaralharia o que está marcado sem ninguém ver.

**Bug achado no navegador:** dois toques seguidos em caixas de seleção registravam só um. O
`defineModel` do filho devolve valor defasado quando o pai controla o ref — o segundo toque lia
o estado anterior ao primeiro e o sobrescrevia. A lista passou a emitir QUAL parada foi tocada,
e quem monta o conjunto é o pai.

**E o modo seleção virou gesto.** Antes era uma terceira pílula ao lado de "Tudo" e "Por dia" —
um modo com o mesmo peso visual dos outros dois, sendo que ele é temporário e os outros são
formas de olhar o roteiro. Agora se entra segurando a parada no toque, ou passando o mouse e
marcando a caixa que aparece: os gestos que a galeria de fotos e o e-mail já ensinaram. Enquanto
a seleção está ativa a barra inteira passa a ser sobre ela, com contagem e "Sair da seleção";
desmarcar a última fecha o modo sozinho.

O preço do gesto é que ninguém o descobre por conta própria, então a barra ganha a dica em texto
quando o roteiro tem três ou mais paradas roteáveis — abaixo disso selecionar é o mesmo que
abrir tudo. `onLongPress` do @vueuse cuida do cancelamento por rolagem (10px de folga), e o gesto
é ignorado quando começa num campo de texto, onde segurar é gesto do sistema.

## 2026-08-09 (continuação) — Atalhos do Maps na lista e alerta de spoiler

**Feito:**
- Ícone de atalho no cabeçalho de cada dia, abrindo aquele dia no Maps. O recorte "Por dia"
  saiu da barra: um ícone ao lado do "Dia 2" acerta o alvo melhor que um botão no outro canto
  da tela, que obrigava a traduzir um "Dia 2" no outro
- Atalho por parada, fora do `v-if="editavel"` — abrir um lugar no Maps não é editar, e vale
  no roteiro de outra pessoa e no meio da seleção
- Migration `20260809214557_viagens_alerta_de_spoiler.sql`: a RPC `segredos_do_espaco`
- `usePontosPorLink`, porque agora dois lugares perguntam quantas paradas cabem num link

**Decisão: desfoque de CSS não é privacidade.** O pedido era mostrar o roteiro secreto aos
outros membros, ofuscado. Se o nome chegasse ao navegador para ser coberto por um `blur-sm`, o
devtools entregaria a surpresa em dois cliques — e um card cujo trabalho é guardar segredo não
pode depender de ninguém não olhar. A policy `roteiro_select` continua exatamente como nasceu,
escondendo a linha inteira; ao lado dela nasceu um caminho deliberadamente estreito:

    roteiro_select        -> a linha inteira, só para quem criou
    segredos_do_espaco()  -> id, quem e quando, para o resto do espaço

A lista de colunas da RPC É o contrato. O que não está nela não tem como vazar, nem por engano
de `select`. As barras borradas do card não cobrem texto nenhum — não há texto a cobrir, e o
borrão é metáfora, não fechadura.

**Bug corrigido, e ele ficou mais provável com o card novo:** abrir na mão a URL de um roteiro
que não é seu mostrava o erro cru do PostgREST ("Cannot coerce the result to a single JSON
object"). `useRoteiro` passou a usar `maybeSingle` — não encontrar não é falha, é a resposta
certa. A tela diz a mesma coisa para "não existe" e para "é segredo de outra pessoa", porque
distinguir os dois já seria contar meia surpresa.

## 2026-08-09 (continuação) — Apelidos

**Feito:**
- Migration `20260809230000_perfil_apelido.sql`: coluna `apelido` em `profile`, com trigger de
  normalização e CHECK de 2 a 24 caracteres
- `usePerfil` / `useDefinirApelido` — o perfil é da pessoa, não do espaço, e por isso é a
  primeira query do app fora de `useSpaceQuery`
- `Membro` ganhou `apelido` e `exibicao`; toda tela que mostrava `membro.nome` passou a mostrar
  `membro.exibicao` (pilha de membros, saldo do mês, rateio da compra, avaliações, convites)
- Card "Seu apelido" em `/espacos`, e a saudação do início passou a usar o perfil do banco em
  vez do `user_metadata` do cadastro

**Decisão: coluna nova, não `nome` editável.** Deixar a pessoa reescrever o próprio `nome`
resolveria o pedido com zero coluna a mais — e apagaria o nome de cadastro no processo. São
fatos diferentes: `nome` é quem a pessoa é, `apelido` é como ela quer ser chamada. Guardar os
dois é o que permite a lista de membros mostrar "Bebê · Ana Paula" para quem acabou de entrar
por convite e ainda não sabe quem é quem.

**Decisão: `exibicao` pronto no `Membro`, em vez de `apelido ?? nome` em cada tela.** A regra
de precedência tem uma armadilha silenciosa — apelido `''` passa pelo `??` e mostra uma pessoa
sem nome — e havia oito telas para acertar. Uma delas erraria. `nomeDeExibicao()` decide uma
vez, o campo chega pronto, e a tela nova não tem como esquecer a regra.

**A normalização vive no banco.** `profile_update` deixa cada um escrever na própria linha
direto pelo PostgREST, então o formulário não é o único caminho até a coluna. O trigger
`profile_apelido_normalizado` é: ele transforma `'  '` em NULL antes do CHECK, e "sem apelido"
passa a ter uma representação só.

**Sem unicidade, de propósito.** Apelido não é @handle. Dois "Bebê" no mesmo espaço é escolha
do casal, não erro de integridade — e um índice único aqui só produziria um erro
incompreensível na hora de salvar.

## 2026-08-11 — Viagens: parada desativável, endereço corrigível, mapa por dia

**Feito:**
- Migration `20260811120000_viagens_parada_desativada.sql`: coluna `desativada` em `parada`
  (`not null default false`) e `salvar_paradas` reescrita para carregar o bit novo
- `paradasNaRota` passou a filtrar os dois motivos de ficar fora da rota — o Maps não conhecer o
  lugar e a parada estar desligada; mapa, links e atalhos do dia herdaram a regra de graça
- `numeracaoDoRoteiro`: a lista numera só as paradas ligadas; a desativada troca o número por um
  ícone de olho cortado
- Menu de ações por parada (`⋮`) com "Corrigir endereço", "Desativar/Reativar" e "Remover"
- `ParadaDialogo` — a busca do Maps aplicada a uma parada que já existe, devolvendo só o lugar
- `SeletorDeDia` abaixo do mapa: "Completo · Dia 1 · Dia 2 · … · Sem dia", filtrando o mapa

**Decisão: um bit na `parada`, não uma tabela de descartadas.** A parada não sai do roteiro, sai
da ROTA — continua na lista, no dia, com anotação e endereço. Mover a linha para outro lugar
faria reativar ser uma reinserção, com id e ordem novos, e o roteiro perderia a posição em que
aquela parada estava sendo considerada.

**Decisão: `BuscaDeLugar` emite um `LugarDaParada`, não uma `ParadaParaSalvar`.** A mesma busca
serve a dois pedidos — adicionar parada e corrigir o endereço de uma que já existe. Se dela
saísse uma parada completa, a correção chegaria com `dia` e `anotacao` nulos e apagaria em
silêncio o trabalho já feito. O tipo é que garante isso, não o cuidado de quem escreve o merge.

**Decisão: a desativada perde o número.** Guardar o 3 numa parada desligada daria ao roteiro
duas terceiras paradas, e quem desligou uma parada justamente para ler o roteiro sem ela
continuaria vendo a numeração antiga.

**Decisão: `aberturaNoMaps` conta desativada e fora-da-rota em separado.** Somadas, a tela diria
"1 parada fora da rota, 1 desativada" sobre a mesma parada. As frases são diferentes porque os
casos são: um é impossibilidade do Google, o outro é escolha reversível de quem montou.

**Decisão: o filtro por dia mexe no mapa, não na lista.** A lista é o roteiro — esconder metade
dela faria a numeração e o "Salvando…" falarem de algo que não está na tela. A barra fica
encostada embaixo do mapa, e some quando há um dia só (aí "Completo" e "Dia 1" desenhariam o
mesmo mapa). O recorte volta para "Completo" sozinho quando o dia escolhido deixa de existir.

**A caixa vazia do mapa passou a ter quatro frases.** Antes eram duas (falta chave / sem
parada); agora filtrar um dia sem lugares do Maps e desativar a última parada ativa também
produzem um mapa vazio — e sem a frase certa desativar uma parada parece o mapa ter quebrado.

**Contratempo: o histórico de migrations estava desencontrado em dois pontos.** O `db push`
recusou com "Remote migration versions not found in local migrations directory": o remoto tinha
`20260810020154` (sem arquivo em repo nenhum — varri todos os commits de todas as branches) e
NÃO tinha `20260809230000`, o apelido. Só que o apelido está no banco: o `db:types` gerou um
arquivo idêntico ao commitado, apelido incluído. Ou seja, o DDL foi aplicado com outro número —
cara de arquivo criado por `supabase migration new` e renomeado antes do commit, três horas
depois.

A dica que a própria CLI dá resolve metade e quebra a outra: revertendo só o `20260810020154`,
o push seguinte tentaria aplicar o apelido de novo e morreria em `column "apelido" already
exists`. Faltava `migration repair --status applied 20260809230000` primeiro. E o `db pull` que
ela sugere reescreveria os arquivos locais, que estão certos.

**Lição:** o gerador de tipos serve de sonda de schema. "O remoto tem esta coluna?" é uma
pergunta que `npm run db:types` + `git diff` responde sem Docker, sem SQL Editor e sem chute — e
foi o que permitiu marcar o apelido como aplicado com segurança, em vez de reaplicá-lo às cegas.

**Verificado no navegador, contra o banco real:** desativar "Joinville" no roteiro de 6 paradas
renumerou a lista (Pomerode virou 2), tirou a parada dos TRÊS consumidores de uma vez — a rota
completa passou de dois trechos para um link só, e o atalho do Dia 1 pulou direto para Pomerode
—, mostrou "1 desativada" em separado do "fora da rota" e sobreviveu ao reload. O diálogo de
correção mostra o endereço atual, foca a busca e troca só o lugar: uma parada de teste com dia 2
e anotação manteve as duas depois da correção. Os botões de dia marcam certo e trazem a data no
`title`. O mapa em si não pôde ser visto — falta `NUXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` no `.env`
local, e sem `NUXT_GOOGLE_PLACES_API_KEY` a busca responde 503 (com a mensagem certa).

---

## 2026-08-11 — Notificações: um canal só, e ele chega por e-mail

**Contexto:** o app não tinha canal de aviso nenhum, e cada módulo tinha inventado o seu
remendo — `space_deletion_notice`, `convite_filme`, `roteiro_visto`, `segredos_do_espaco()`.
Quatro mecanismos para a mesma pergunta: *o que aconteceu desde a última vez que eu olhei?*
O cabeçalho de `test/resumo-viagens.test.ts` já dizia isso com todas as letras — "o aviso que
substitui a notificação que não existe".

**Feito:**
- Motor no Postgres: `notificacao` (uma linha por destinatário), `notificacao_preferencia`
  (por tipo, dois canais) e `notificacao_email` (o consentimento e o token de descadastro),
  com RLS e as funções `notificar()` / `notificar_pessoa()`
- Gatilhos: `compra` (novo, editado, removido), `acerto_mes` (com o total do mês somado da
  view `parcela_mensal`), `roteiro` (novo, liberado, editado), `entry` e `rating`
- Canal de e-mail: fila `notificacao_email_fila`, disparo por `pg_net` e a Edge Function
  `enviar-emails` chamando o Resend, com link de descadastro sem login em `/descadastrar`
- `pg_cron`: domingo de filmes (22h UTC = 19h BRT), viagem a 7 e a 1 dia, dreno da fila a
  cada 5 min e faxina mensal das lidas com mais de 90 dias
- App: `notificacoes.ts` (texto, agrupamento por dia, badge, categorias), `useNotificacoes`,
  o sino na sidebar e no header mobile, `/notificacoes` e `/notificacoes/preferencias`
- "Nova versão do APPingos disponível!" — `registerType: 'prompt'` + toast persistente

**Decisão: e-mail antes de push.** O push web é bom no Android e capenga no iOS (só com o app
instalado na tela de início, e ainda assim com mais restrições). Construir push primeiro seria
fazer a feature nascer boa para metade do casal. O e-mail chega igual nos dois celulares, no
navegador e no desktop. O push continua no plano e entra em cima deste mesmo motor.

**Decisão: a caixa nasce ligada, o e-mail nasce desligado.** Assimetria deliberada. Uma linha
na caixa do próprio app é coisa de quem já entrou; mandar e-mail é sair do app e chegar na
caixa de entrada de alguém — isso se faz com consentimento explícito, não com default herdado.

**Decisão: uma fila entre a notificação e o envio.** Sem ela, o envio seria uma chamada HTTP
presa à transação de quem lançou o gasto: a menor instabilidade do Resend viraria erro na cara
de quem só estava salvando uma compra. Com ela, gravar é local e barato, o envio é retentável,
e o que falhou fica numa tabela em vez de num log que ninguém lê.

**Decisão: só INSERT enfileira e-mail.** A notificação agrupada é um UPDATE ("2 alterações"
vira "3"). Mandar um e-mail por incremento desfaria exatamente o que o agrupamento existe para
evitar — três correções no mesmo gasto rendem um e-mail, e quem abrir o app vê o texto já
atualizado.

**Decisão: o texto mora em `supabase/functions/_shared/`, fora de `app/`.** É a única coisa do
repo lida por dois runtimes: o Vite (via `app/lib/notificacoes.ts`, que só reexporta) e o Deno
da Edge Function, cujo bundler só enxerga o que está dentro de `supabase/functions/`. Duas
cópias seria o desenho óbvio e errado — a frase do e-mail e a do sino divergiriam no primeiro
ajuste. O arquivo não tem import nenhum, e é isso que o mantém legível pelos dois.

**Decisão: nenhum gatilho em `parada`.** `salvar_paradas` reescreve a lista inteira (delete +
insert), o que renderia uma dúzia de disparos por salvada — "12 alterações em Litoral" para
quem só arrastou uma parada. A RPC termina com `update roteiro set updated_at = now()`, e é
esse toque que vira o aviso: uma salvada, uma notificação.

**O segredo continua segredo.** Roteiro secreto não gera linha nenhuma — nem sem nome, nem
"há novidade em Viagens" —, e o cron de viagens próximas filtra por `visibilidade =
'compartilhado'`. Um e-mail com o nome do roteiro no assunto seria o jeito mais bobo de
estragar a surpresa.

**Sobre ator nulo, que é o modo de errar silencioso da feature:** `auth.uid()` é nulo fora do
PostgREST, e com ator nulo "todos menos o ator" vira "todos" — a pessoa recebe aviso da própria
ação. `notificar()` estoura em vez de aceitar, e cada gatilho é obrigado a dizer de quem foi a
ação (`coalesce(auth.uid(), new.registrado_por)`). Ninguém abre chamado por "recebi um aviso a
mais"; só sente que o app é barulhento.

**Verificado:** `npm run verificar` limpo (imports, typecheck, 132 testes — 23 novos). No banco
real, numa transação desfeita no fim: o fanout entregou ao outro membro e não a quem agiu, duas
chamadas dentro da janela viraram UMA linha com `vezes = 2`, e ator nulo foi recusado com
exceção. Falta o teste com duas contas reais e a caixa de entrada de verdade — depende dos
segredos do Resend, que são passo manual (README, seção 6).

**Contratempo:** a `main` local estava 3 commits atrás e o banco tinha uma migration aplicada
por outro ambiente. Alinhado antes de fechar: `git pull` e, no fim, 18 migrations locais contra
as mesmas 18 versões no histórico do remoto.

---

## 2026-08-11 (continuação) — O carteiro passa a ser o Gmail

**Contexto:** o Resend é gratuito, mas só entrega para terceiros com um domínio verificado —
sem domínio, `onboarding@resend.dev` só alcança a caixa de quem é dono da conta. Num app de
casal isso deixa de fora exatamente a metade que motivou a feature. Como o pedido era
notificar fora do app **de graça**, o provedor mudou.

**Feito:** `enviar-emails` reescrita para SMTP do Gmail com senha de app (denomailer, porta 465
com TLS implícito). Segredos: `RESEND_API_KEY`/`EMAIL_REMETENTE` saíram, entraram
`GMAIL_USUARIO`, `GMAIL_SENHA_DE_APP` e o opcional `NOME_REMETENTE`.

**O que NÃO mudou, e é o ponto:** nenhuma migration, nenhuma tela, nenhum teste. O motor, a
fila, as preferências, o descadastro e a caixa in-app não sabem quem entrega — o provedor
estava confinado a um arquivo, e foi por isso que a troca custou uma tarde e não uma refatoração.

**Decisão: não existe segredo para o endereço do remetente.** O Gmail reescreve o `From` para a
conta autenticada de qualquer jeito. Um campo configurável criaria a pegadinha de definir um
endereço e receber outro, sem erro nenhum — então o remetente é derivado de `GMAIL_USUARIO`, e
só o nome exibido é escolha.

**Decisão: falha de conexão não queima tentativa.** Senha de app errada faria as cinco
tentativas de toda a fila irem embora num defeito que trocar um segredo resolve — e aí os
avisos ficariam parados para sempre depois de arrumado, porque `tentativas < 5` já não os
alcançaria. A função reconhece erro de autenticação/conexão (535, "Username and Password not
accepted", timeout), aborta o lote sem tocar na fila e devolve 502. Erro daquela mensagem
específica continua marcando `erro` e contando tentativa.

**Uma conexão SMTP por lote, não uma por mensagem** — abrir e fechar sessão a cada e-mail é
justamente o padrão que o Gmail trata como suspeito.

**Verificado:** `npm run verificar` limpo (132 testes). Função publicada (versão 3) e testada
pelo `net.http_post` com a anon key: responde 401 do nosso código, o que prova que ela sobe e
que o `denomailer` e o módulo compartilhado resolvem. Falta o envio real, que depende da senha
de app.

**Se um dia houver domínio,** voltar para um provedor de envio é mexer em
`supabase/functions/enviar-emails/index.ts` e em dois segredos. Vale a pena: entrega melhor,
relatório de bounce, e o remetente deixa de ser uma conta pessoal do Gmail.
