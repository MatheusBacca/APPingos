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

---

## 2026-08-11 (continuação) — A feature sai sem esperar as chaves do e-mail

**Contexto:** a senha de app do Gmail não pôde ser criada agora (a conta do trabalho tem o
recurso bloqueado por política, e a conta nova ainda estava assentando). A caixa in-app não
depende disso e já está pronta. Entre segurar valor pronto e mostrar um interruptor que não
entrega, nenhuma das duas serve — então o canal passou a saber dizer que está fora do ar.

**Feito:** tabela `notificacao_email_saude` (uma linha, mantida pela própria Edge Function a
cada acordada), função `status_do_email()`, guarda no `definir_email_notificacoes`, e a tela de
preferências explicando em vez de oferecer. `avisoDoCanalDeEmail` em `_shared/notificacoes.ts`
decide a frase, com 7 testes.

**Decisão: disponível exige DUAS camadas.** Os segredos do Vault (o banco alcança a função) e o
registro de saúde (a função tem o que precisa). Olhar só o Vault seria fácil e errado: dá para
cadastrar URL e token hoje e a senha do Gmail semana que vem, e nesse intervalo a tela estaria
oferecendo um canal morto. A janela de 20 minutos para o `verificado_em` é quatro vezes o
intervalo do cron — tolera uma execução perdida sem declarar o canal morto por um soluço.

**Decisão: a recusa vive no servidor.** Botão desabilitado não é regra — a RPC é pública para
quem está logado. Sem a recusa, ligar o e-mail com o canal fora do ar encheria a fila de avisos
que sairiam TODOS de uma vez no minuto da configuração. Quarenta e-mails às sete da manhã é
pior do que não ter avisado.

**Decisão: desligar é sempre permitido**, inclusive com o canal fora do ar — e o botão continua
na tela para quem já está ligado. A primeira versão escondia o botão inteiro quando
indisponível, o que prendia numa inscrição que nem estava entregando quem tivesse se inscrito
antes. Foi pego testando contra o banco real, não em teste de unidade: existia uma linha ativa
de verdade, criada na tela antes de a guarda existir.

**Correção pontual no banco:** essa única inscrição ativa foi desligada. Ela foi feita quando a
tela ainda prometia entrega, e deixá-la ligada só acumularia fila. Perda zero — nenhum e-mail
sairia mesmo —, e religar é um clique quando o canal subir.

**Verificado:** `npm run verificar` limpo (139 testes, 7 novos). No banco real, com
`request.jwt.claims` simulando uma sessão: `status_do_email()` devolve indisponível com o
motivo certo, ligar é recusado com exceção, e desligar passa. Edge Function na versão 4,
gravando a saúde.

---

## 2026-08-12 — Interesses (em Objetivos) + extensão do Chrome

**Contexto:** produto visto na internet some — fica numa aba que vai ser fechada, num print que
ninguém acha. Quando chega a hora de decidir, não se lembra se o sofá era R$ 2.399 ou R$ 2.899,
nem em qual das três lojas era mais barato. E o caminho manual (abrir o app, criar, copiar nome,
copiar link, digitar três preços) tem passos demais para o impulso de dez segundos que é "achei
um". Se registrar custa mais que fechar a aba, a aba ganha.

**Feito:**
- Schema `interesse` + `interesse_produto` com RLS, três RPCs (`registrar_interesse`,
  `adicionar_produto`, `escolher_produto`) e as colunas de conversão já criadas sem uso
- Módulo Objetivos saiu de stub para `ativo: true`, com a aba Interesses e "Metas" visível e
  desabilitada ao lado; `/objetivos` redireciona para `/objetivos/interesses`
- Lista agrupada por destino, detalhe com os candidatos comparados, diálogos de criar/editar e de
  adicionar produto à mão, e duas linhas no painel de resumos
- Extensão do Chrome (MV3, `extensao/`): login com o mesmo e-mail e senha do app, seletor de
  espaço, raspagem da página e envio — JS puro, sem bundler e sem dependência
- `npm run extensao` gera o config do `.env` e o `.zip`; `npm run icones` passou a emitir também
  os quatro tamanhos de ícone da extensão

**Decisão: submódulo de Objetivos, não módulo próprio.** Um interesse é um pré-objetivo — quando
amadurece vira meta com prazo, e o produto escolhido carrega o valor que essa meta precisa. A
hierarquia diz isso; como módulo separado a relação seria só uma coluna. O custo é que Objetivos
ficou ativo antes de ter Metas, resolvido mostrando a segunda aba desabilitada em vez de omiti-la
(dizer "Interesses primeiro, metas depois" é mais honesto que esconder) e com um redirect na raiz,
para clicar em Objetivos não cair em tela vazia.

**Decisão: N produtos por interesse.** "Trocar o sofá" com três sofás de três lojas é o caso
normal, não a borda — é comparar preço dentro da mesma vontade. Um produto por interesse
obrigaria a criar três interesses para a mesma coisa, e aí nenhum dos três seria "a vontade". Um
deles é o `escolhido` (índice único parcial), e é dele que sai o valor do interesse; o resumo
conta um produto por interesse, porque somar os três candidatos diria que queremos três sofás.

**Decisão: preços nullable.** A raspagem acerta o nome quase sempre e o preço menos. `not null`
transformaria "não achei o preço" em "não dá para salvar", e o link com o nome já vale sozinho.

**Decisão: `observacao text` em vez do `nota_id` que o plano original previa.** O plano de
Interesses estava bloqueado esperando o módulo de Notas, e a extensão não precisava dele. Quando
Notas existir, é uma coluna de texto curta a migrar.

**Decisão: REST cru na extensão, sem supabase-js.** Assim a pasta É o pacote: sem bundler, sem
`package.json` aninhado, sem build antes de "Carregar sem compactação". O custo são ~40 linhas de
renovação de token à mão — e é por serem à mão que elas ganharam teste com `fetch` dublado.

**Decisão: `activeTab` + `scripting`, nunca `content_scripts`.** Nada roda em página nenhuma
antes do clique no ícone, e a instalação não pede "ler e alterar seus dados em todos os sites".
Isso é o que força `raspar()` a ser uma função autocontida (`executeScript({ func })` serializa e
injeta o texto), e o efeito colateral é ótimo: a mesma função roda no Vitest contra o happy-dom,
sem mock do Chrome. O preço é `dinheiroBr` duplicada em dois arquivos, com os testes apontando
para os mesmos casos.

**Decisão: a raspagem é rascunho, não verdade.** Cascata de quatro níveis (JSON-LD → Open Graph →
microdata → heurística de texto, que é o único lugar onde existem preço Pix e parcelamento), e o
popup mostra tudo editável antes de gravar. Quando a heurística errar, o custo é corrigir um
campo, não um registro torto que alguém descobre semanas depois. Sem adaptadores por loja: seletor
CSS por hostname quebra a cada redesign.

**Bug que o teste pegou:** a detecção de "à vista" usava `\b`, que em JavaScript é ASCII — `à`
conta como caractere não-de-palavra, então `\bà` nunca casa. Toda loja que escreve "à vista" em
vez de "Pix" passava batida, em silêncio, com o campo só ficando vazio. Estava nas duas cópias da
função. Corrigido com lookaround `\p{L}` e a flag `u`.

**Verificado:** `npm run verificar` limpo (237 testes, 92 novos) e `nuxt build` passando. A
migration foi aplicada num Postgres 16 descartável junto com as outras 20 e exercitada com dois
usuários: isolamento entre espaços, recusa de insert em nome de outra pessoa, o índice único
barrando dois escolhidos, os casts tolerando campo vazio, e cascade nos produtos. O empacotador
foi testado nos três caminhos (sem `.env`, com URL fora do padrão, e válido) e nas duas
implementações de zip, com o conteúdo extraído conferido contra a origem.

**Aplicado na nuvem, na mesma sessão.** A migration foi para o projeto de verdade
(`bmphsxdfryinvtvttmlr`, Postgres 17) e os tipos foram conferidos contra o schema real. Três
coisas que valem registro:

- **O `database.generated.ts` editado à mão estava certo.** Regerado a partir da nuvem, saiu
  byte a byte idêntico ao que havia sido escrito à mão — as duas tabelas e as três funções, nas
  mesmas posições alfabéticas. O arquivo não precisou de uma linha de mudança. (O gerador do
  Supabase CLI exige Docker, indisponível aqui; a geração saiu pelo MCP, que fala com a API da
  plataforma.)
- **A versão no histórico teve de ser corrigida.** Aplicar por fora do CLI registrou a migration
  com a versão da hora da aplicação (`20260812175645`), e não com a do nome do arquivo
  (`20260812150000`). Deixar assim faria o próximo `supabase db push` não achar o arquivo local no
  histórico e tentar reaplicar tudo, quebrando em "relation already exists". O arquivo é a fonte
  da verdade, então quem se ajustou foi a escrituração — um UPDATE em
  `supabase_migrations.schema_migrations`.
- **As RPCs foram exercitadas no PG17 de verdade**, com `request.jwt.claims` simulando uma sessão
  e tudo dentro de um `rollback`: trim no título e na observação, primeiro produto entrando
  escolhido, a troca de escolhido contra o índice único parcial, campo vazio virando null em vez
  de estourar o cast, e o update passando pela policy. Zero linhas sobraram.
- **O advisor de segurança não acusou nada novo.** Os WARN do projeto são todos anteriores (pg_net
  no schema `public`, os helpers `SECURITY DEFINER` da fundação, proteção de senha vazada
  desligada). As três RPCs novas são `SECURITY INVOKER`, então não entram nessa lista.

**Pendências:** conversão de interesse em objetivo (depende de Metas) e em compra (precisa de um
diálogo para rateio e competência); notificar o par de um interesse novo; publicar na Web Store
quando cansar do modo desenvolvedor.

---

## 2026-08-12 — Release automática da extensão

**Contexto:** instalar a extensão pedia clonar o repositório e rodar `npm run extensao`. Razoável
na máquina de quem desenvolve, atrito desnecessário na segunda — onde a pessoa só quer o `.zip`.

**Feito:** `.github/workflows/extensao.yml`, o primeiro workflow do repositório. Push na `main` que
toque em `extensao/` → roda os testes → empacota → confere o pacote → cria a Release
`extensao-v<versão>` com o zip anexado.

**Decisão: a `version` do manifest é o gatilho.** Publica só se ainda não houver Release para
aquela versão. O manifest já era a fonte da verdade (a Chrome Web Store exige incrementá-la para
aceitar um upload), então não há um segundo lugar a lembrar. Esquecer de bumpar não quebra nada: o
job de publicar é *pulado* com aviso no resumo, em vez de criar release duplicada ou falhar em
vermelho — CI vermelha por motivo esperado é CI que se aprende a ignorar.

**Decisão: as credenciais vão embutidas no zip.** Ele funciona ao instalar, que é o motivo de a
Release existir; um zip sem config obrigaria a clonar o repo de qualquer forma. Exposição nova é
zero: a anon key já vai no bundle do app em produção, é pública por desenho, e o repositório é
privado. Vêm de secrets do Actions, e faltando os secrets o empacotador falha em vez de publicar um
pacote que não conecta.

**Decisão: dois jobs, não um com `if` em cada passo.** Assim o "pulei, a versão já saiu" aparece
como job skipped na interface, e não escondido num passo verde no meio de outros.

**Conferência do pacote antes de publicar.** O empacotador pode terminar em verde com um pacote
incompleto — um `CONTEUDO` desatualizado depois de mover um arquivo. Aí o Chrome só reclamaria na
instalação, tarde. O workflow exige os doze arquivos por nome (`grep -qx` sobre `unzip -Z1`, casando
linha inteira: sobre a saída de `unzip -l` daria para casar um sufixo por acidente) e confere que a
versão dentro do zip é a da tag.

**Dois consertos no empacotador, achados ao escrever isso:**

- `APP_URL` usava `??`, e uma variável **não definida** no GitHub Actions chega como string vazia,
  não como `undefined` — o `??` deixava o vazio passar e o link "Abrir no APPingos" apontaria para
  lugar nenhum. Virou `?.trim() ||`. O mesmo valia para um `APP_URL=` solto no `.env`.
- `createWriteStream` e `createHash` estavam importados e nunca usados.

**Verificado:** o YAML foi parseado e cada `run` extraído e **executado** como o runner faria —
leitura da versão do manifest, empacotamento só com variáveis de ambiente (sem `.env`, como no CI),
`APP_URL` vazia caindo no padrão, secrets ausentes falhando com a mensagem certa, e o heredoc das
notas saindo completo. As duas guardas foram testadas pelo lado negativo, que é o que importa: zip
sem `config.gerado.js` → erro apontando o arquivo; tag divergente da versão interna → erro apontando
as duas. A lógica de pular versão já publicada foi exercitada nos dois ramos com o `gh` dublado.
`npm run verificar` limpo (237 testes).

**Pendência que depende de você:** cadastrar `SUPABASE_URL` e `SUPABASE_KEY` em Settings → Secrets
and variables → Actions. E o workflow só passa a existir quando esta branch chegar à `main`.

---

## 2026-08-12 — Três bugs da extensão 0.1.0, e a Release vira ScrAPPingos

**Contexto:** a 0.1.0 foi instalada e usada, e dois bugs apareceram na cara de quem usou. O
terceiro caiu junto porque tinha a mesma causa.

**Bug 1 e 3 — `hidden` que não escondia.** A tela de "Interesse registrado" ficava desenhada por
cima da de login, permanentemente. Era cascata, em duas variantes:

- `#tela-pronto { display: flex }` é seletor de ID (1,0,0) e vencia o `.tela[hidden]
  { display: none }` (0,2,0) por **especificidade**.
- `#grupo-novo` usa `.pilha { display: flex }`, e o `[hidden]` que valia para ele vinha da folha
  do **navegador**. Declaração de autor vence a do agente de usuário independente de
  especificidade — então os campos de título e destino não sumiam ao escolher "adicionar a um
  interesse existente". Este ninguém tinha reportado; apareceu investigando o primeiro.

A correção é uma regra só: `[hidden] { display: none !important }`, global. `!important` aqui não é
atalho para não pensar na cascata — é o que devolve ao atributo o poder que ele deveria ter, e o que
impede o próximo `display` numa classe de layout de reabrir o mesmo bug em silêncio.

**Bug 2 — o espaço do casal listado duas vezes** no seletor. A policy `membership_select` usa
`is_space_member(space_id)`, e não `user_id = auth.uid()`, de propósito: é o que faz cada um
enxergar a linha do par na tela de Espaços. Consequência: um espaço de casal volta uma vez por
membro, e a extensão não filtrava.

O agravante é que **o app já resolvia isso, e com um comentário explicando** — veja
`app/composables/useEspacos.ts:25`. Foi código novo escrito ao lado da resposta sem reusá-la.
Corrigido com `user_id=eq.<id>`, que resolve por construção e não por remendo: a chave primária de
`membership` é `(space_id, user_id)`, então com o usuário fixado cada espaço só pode aparecer uma
vez. Um `dedupe` esconderia o motivo. A ordenação também passou a ser a mesma do app (pessoal
primeiro, casal por nome), para quem usa os dois não reaprender onde as coisas estão.

**Decisão: o teste do `hidden` verifica comportamento, não texto de CSS.** A primeira versão
afirmava que a regra existia no arquivo — e uma regra pode estar escrita e ainda perder para outra,
que é exatamente o bug. Agora o popup é montado no DOM do happy-dom com o CSS embutido, e o teste
lê `getComputedStyle`. Inclui um caso que **reconstrói a folha com o bug** e exige que a suíte
falhe do jeito que o usuário viu (`['login', 'pronto']` visíveis juntas) — sem isso não haveria
como saber se os outros passam por mérito ou por acaso.

**Tropeço no caminho:** a primeira versão do teste de CSS casou o `[hidden]` que está **dentro do
comentário** que explica o bug. Mesma armadilha que o teste do `service_role` já tinha resolvido
com `semComentarios()`; passou a usar o mesmo helper.

**Nome:** a Release passou a se chamar **ScrAPPingos** (era "Extensão do Chrome"). A tag continua
`extensao-v*` e o `name` do manifest continua "APPingos" — o que o Chrome mostra na barra não
mudou.

**Verificado:** `npm run verificar` limpo (248 testes, 11 novos). O comportamento das telas foi
conferido num DOM de verdade, antes e depois, reproduzindo o sintoma da tela do usuário. A causa do
bug 2 foi confirmada por consulta ao banco real: seis pessoas com mais linhas de membership do que
espaços, "Matheus Bacca" entre elas com 3 linhas para 2 espaços.

---

## 2026-08-12 — Rechecagem diária de preço: medir antes de construir

**Contexto:** o pedido é um cron diário que reabra a URL de cada produto salvo e atualize os
preços, sem atualizar quando não conseguir ler. Antes de construir o pipeline, foi montada a
**medição** — porque a taxa de acerto muda o desenho, e ela não se adivinha.

**A armadilha que definiu onde isso roda.** Raspar no servidor não é raspar no navegador. A
`raspar()` da extensão funciona porque roda numa aba com o JS da loja já executado; um `fetch` de
Edge Function recebe o HTML cru. JSON-LD e Open Graph costumam estar lá, mas **preço Pix e
parcelamento quase nunca** — são montados no cliente, e são exatamente os números que decidem uma
compra no Brasil. Um cron por Edge Function atualizaria mal justamente o que mais importa, e ainda
tomaria 403 das lojas grandes por vir de IP de datacenter.

**Decisão: Chromium headless no GitHub Actions, reusando a MESMA `raspar()`.** Ela é autocontida
por exigência do `chrome.scripting.executeScript`, que serializa a função e injeta o texto — e
`page.evaluate()` do Playwright faz exatamente a mesma coisa. Então a função roda ali sem uma linha
de adaptação: um raspador só, três consumidores (extensão, testes, cron). Um segundo raspador
divergiria do primeiro no primeiro mês. Como o repositório é público, os minutos de Actions são
gratuitos. Verificado que a função serializa sem referência a nada de fora dela (10.504 chars,
zero forasteiros).

**Decisão: o Playwright fica fora do `package.json`.** Ele serve só a este workflow, e entraria no
`npm ci` de todo mundo — inclusive do workflow que publica a extensão — sem servir a nada lá. A
versão está fixada no YAML.

**Decisão: o relatório não imprime URL nem nome de produto.** O repositório é público, e o log do
Actions com ele — um relatório detalhado publicaria a lista de desejos do casal num lugar que
qualquer um lê. Sai hostname, contagens e o que foi lido ou não; a variação de preço sai em
percentual, não em reais.

**Decisão: uma conta de robô, não a senha pessoal.** Os produtos estão atrás da RLS, então ler
exige JWT de usuário. Autenticar como usuário (e não com `service_role`) mantém a RLS valendo, e
uma credencial criada só para isto se revoga sem afetar mais nada — o que importa num repositório
público.

**O que a medição responde, por loja:** a página veio ou foi bloqueada; leu nome, preço, Pix,
parcelado; de qual nível da cascata veio. Hoje há 4 produtos salvos, em `amazon.com.br` e
`kabum.com.br` — e a Amazon é das mais agressivas em bloqueio, então a medição tem chance real de
dizer "não vale a pena para esta loja".

**Verificado:** YAML parseado, sintaxe do script conferida, `raspar()` importada fora do contexto
da extensão e conferida como serializável, e confirmado que estes arquivos não casam com os `paths`
do workflow da extensão (não disparam release por acidente). A medição em si **não rodou ainda** —
depende dos secrets `APPINGOS_EMAIL` e `APPINGOS_SENHA`, e o sandbox desta sessão não alcança
lojas, então ela só roda no Actions.

**Nada do pipeline de escrita foi construído.** Schema de histórico (`interesse_produto_preco`,
`verificado_em`, `falhas_seguidas`), o cron e o aviso de queda entram depois da medição, com o
desenho ajustado ao que ela mostrar.

---

## 2026-08-12 — O papel `robo`: um membro que não enxerga nada

**Contexto:** a rechecagem de preço roda fora do app e precisa de um JWT para ler os produtos, e
um JWT precisa de uma conta. A pergunta era se dava para usar a conta de quem criou o interesse.

**Não dá, e é assim que tem que ser.** `interesse.criado_por` guarda um UUID, que identifica mas
não autentica — não existe caminho de "id do usuário" para "token válido". A exceção técnica
(forjar um JWT com a `service_role`) é justamente o que se quer evitar: seria pôr no CI de um
repositório público uma chave que ignora a RLS do projeto inteiro.

**Distinção que estava embutida na pergunta e precisava sair:** "o bot roda sem bloqueios" mistura
dois muros diferentes. O muro do nosso banco (a RLS recusando ler) o bot resolve por completo. O
muro da loja (Amazon devolvendo 403 para IP de datacenter) ele não toca — a loja olha de onde a
requisição vem, e nada feito dentro do Supabase muda isso. Só a medição dirá o tamanho do segundo.

**Decisão: um papel `robo` em `membership`, e não uma credencial escondida.** Assim o bot é uma
linha na tabela: aparece na lista de membros em Espaços e some de lá quando o dono o remove. A
revogação é visível e usa a tela que já existe.

**Decisão: uma linha em `is_space_member()` faz o isolamento inteiro.** Toda policy do app passa
por esse helper, então `and m.papel <> 'robo'` tira o robô de todos os módulos de uma vez —
inclusive dos que ainda não existem. Não há uma segunda lista a manter em dia. `is_space_owner` e
`is_space_admin` já o excluíam por construção, exigindo papéis específicos.

Em `shares_space_with` a exclusão vai **só do lado de quem pergunta**: barrar também o outro lado
faria o robô aparecer como "Alguém" na lista de membros, e a revogação visível — que é metade do
motivo do papel existir — ficaria pela metade.

**Decisão: convidar pelo fluxo que já existe.** A conta do robô resgata um convite normal (entra
como `membro`) e o dono muda o cargo para `robo` em Espaços. Um convite direto para `robo` pediria
um segundo tipo de convite para economizar um clique.

**Os corpos de `notificar()` e `deletar_espaco()` foram extraídos das migrations de origem e
patchados programaticamente**, não recopiados: são 82 e 42 linhas, e transcrição à mão deriva. O
diff foi conferido linha a linha antes de entrar.

**Dois erros que o Postgres descartável pegou:**

- O patch do `deletar_espaco` inseriu a condição **depois do ponto e vírgula**, deixando um `and`
  órfão — erro de sintaxe na cara. Reescrito para entrar antes do `;`.
- A primeira rodada do teste "o robô não recebe aviso" **não provava nada**: as notificações
  contadas tinham sido criadas na etapa anterior, quando ele ainda era `membro` comum. Refeito com
  o robô já rebaixado antes de qualquer evento — aí sim só a Bia foi avisada.

**Verificado** num Postgres 16 com as 22 migrations e três usuários (dona, membro e robô):

| | como `membro` | como `robo` |
| --- | --- | --- |
| interesses / produtos / roteiros / compras / categorias | vê todos | **0 em todos** |
| "para quem" do presente | vê | não vê |
| gravar interesse | grava | recusado pela RLS |
| perfis alcançáveis | todos | só o próprio |
| aparece na lista de membros para os humanos | sim | **sim** |
| recebe aviso de gasto novo | sim | **não** |
| recebe aviso de exclusão do espaço | sim | **não** |

`espacos_do_robo()` foi criada porque o isolamento é tão completo que o robô não enxerga nem a
própria linha de `membership` — sem ela não teria como descobrir a que espaços pertence. Devolve id
e nada mais.

**No app:** `Papel` ganhou `'robo'` (a união é espelhada à mão do CHECK), o `Record<Papel, string>`
forçou o rótulo, e o seletor de cargo em Espaços passou a oferecê-lo. Teste novo garante que
`ehAdmin('robo')` é falso — se alguém um dia acrescentar `robo` ali "para o bot conseguir fazer X",
o robô ganharia poderes de admin em todas as telas de uma vez, e em silêncio.

**Não aplicado na nuvem**, de propósito: a migration está pronta e validada, mas o cron que a
justifica depende da medição. Aplicá-la hoje seria inócuo (ninguém tem papel `robo`), e ainda assim
ela redefine `is_space_member`, que sustenta todas as policies — não é mudança para entrar sem
motivo.

**Fora desta migration, de propósito:** as RPCs de preço (ler URLs para rechecar, gravar o que
leu) e o schema de histórico. Elas entram com a feature, quando a medição disser que ela vale.

---

## 2026-08-13 — "Atualizar preços": o botão em vez do cron

**Contexto:** a pergunta era se dava para a rotina usar a conta de quem criou o interesse, para
não precisar de bot nem de conta no CI. Não dá — `criado_por` guarda um UUID, que identifica mas
não autentica, e não existe caminho de id para token. A alternativa proposta foi um botão que o
usuário logado aperta.

**E o botão é melhor que o cron, não um plano B.** Ele resolve o muro que o cron ia perder: a
requisição sai do navegador de quem usa, com IP residencial, Chrome de verdade e os cookies que a
pessoa já tem — o tráfego que a loja não tem motivo para barrar. Some-se zero credencial em
qualquer lugar, e feedback imediato de quais falharam.

**Correção de onde ele pode ficar:** não na tela do app. Uma página web não lê o HTML de outro
domínio — o CORS barra —, e via servidor voltaríamos ao HTML cru sem preço Pix e ao IP de
datacenter. O lugar que funciona é a extensão, que já tem a sessão, o IP e a `raspar()`.

**Decisão: a permissão ampla é opcional, pedida no clique.** Rodar `raspar()` numa aba que a
pessoa não abriu exige permissão de host, e `activeTab` só cobre a aba de onde o ícone foi
acionado. `optional_host_permissions` + `chrome.permissions.request()` no clique preserva o que foi
protegido desde o início: quem só captura produtos nunca concede nada, e a instalação segue sem o
"ler e alterar seus dados em todos os sites". Um teste novo trava isso — se o padrão migrar para
`host_permissions`, a suíte quebra.

**Decisão: "não sobrescrever" vale POR CAMPO.** Um campo que voltou `null` significa "não achei",
não "a loja tirou" — então reler uma página onde o parcelamento não carregou não pode apagar o
parcelamento salvo. O custo consciente: um desconto de Pix que a loja de fato removeu fica
registrado, porque some da página igual a um campo que falhou. Distinguir os dois exigiria confiar
na raspagem mais do que ela merece, e errar nessa direção apagaria dado bom.

**Decisão: o histórico começa na captura, por trigger.** Sem isso a linha mais antiga seria a
primeira rechecagem, e o preço de quando a pessoa decidiu salvar sumiria na primeira mudança.
Trigger, e não insert dentro de `adicionar_produto`, para valer também para produto criado à mão.

**Decisão: gravar produto a produto, não tudo no fim.** O popup é quem executa, e ele fecha se a
pessoa clicar fora. Gravando na hora, uma rodada interrompida deixa metade do trabalho FEITO em vez
de perdido — e como a lista vem ordenada por `verificado_em.asc.nullsfirst`, a rodada seguinte
ataca o mais desatualizado em vez de repetir os mesmos dois.

**Verificado** num Postgres 16 com todas as migrations: a captura semeia o histórico; rechecagem sem
preço não mexe em valor e conta a falha; preço igual não duplica linha e zera o contador; queda
grava histórico e devolve antes/depois; **ler só o preço cheio não apagou o Pix nem o
parcelamento**; produto de outro espaço é recusado pela RLS; apagar o produto leva o histórico.
`npm run verificar` limpo (262 testes, 9 novos).

**Um erro no caminho:** a primeira rodada do teste falhou inteira por falta de
`grant usage on schema auth` no harness — bug do teste, não da migration.

**Um teste sobre-especificado corrigido:** `extensao-popup` travava a lista exata de ids de erro, e
quebrou ao ganhar uma tela nova sem apontar defeito nenhum. Passou a afirmar o que importa — todo
destino de `mostrarErro` existe no HTML.

**Pendências que dependem de decisão:** a migration do papel `robo` (commit anterior) segue no
repositório **sem ter sido aplicada** — e uma migration não aplicada não está parada, está na fila:
o próximo `db push` a aplica junto. Se o caminho do bot não voltar, ela deveria sair. O mesmo vale
para o workflow de medição, que existia para decidir se o cron em CI era viável — pergunta que o
botão tornou sem efeito.

---

## 2026-08-13 — Removido o que não vai ser usado

**Contexto:** com a rechecagem virando um botão no navegador de quem usa, duas coisas construídas
para o caminho do cron em CI deixaram de ter função. Ficaram fora.

**O que saiu:**

- `supabase/migrations/20260812230000_membership_robo.sql` — o papel `robo` e as mudanças em
  `is_space_member`, `shares_space_with`, `definir_papel`, `notificar` e `deletar_espaco`
- `.github/workflows/medir-precos.yml` e `scripts/medir-precos.mjs` — a medição existia para
  decidir se raspar de um IP de datacenter era viável, pergunta que o botão tornou sem efeito
- No app: `'robo'` saiu da união `Papel`, do `PAPEL_ROTULO` e do seletor de cargo em Espaços

**Por que a migration do robô não podia simplesmente ficar parada.** Uma migration não aplicada
não está em espera — está **na fila**: o próximo `db push` a aplicaria junto com a de preço. E ela
redefine `is_space_member`, que sustenta todas as policies do app. Um papel que ninguém usa
mudando a função de autorização central é exatamente o tipo de coisa que ninguém lembra de olhar
quando algo der errado meses depois. O git guarda o trabalho se o caminho do bot voltar.

**O que ficou do episódio, e é bom que tenha ficado:** o teste de `ehAdmin`. Ele nasceu para
garantir que o robô nunca virasse admin, mas o que ele protege é geral — um papel que escorregue
para dentro daquela função ganha poderes de admin em todas as telas de uma vez, e em silêncio.
Perdeu a menção ao robô e continua valendo.

**Verificado:** as 21 migrations restantes aplicam em sequência num Postgres 16 limpo, o CHECK de
`papel` voltou aos três valores originais, e nem `is_space_member` nem `notificar` mencionam
`robo` — ou seja, as funções voltaram exatamente ao que eram. A feature de preço segue de pé no
mesmo banco (tabela de histórico, RPC e as duas colunas novas). `npm run verificar` limpo.

**Correção de um número na entrada anterior:** ela dizia "as 23 migrations", e eram 22 na ocasião.
Trocado por "todas as migrations", que não envelhece.

**Aplicado na nuvem em seguida.** A migration de preço e o backfill foram para o projeto de
verdade, e o histórico das versões foi corrigido para casar com o nome dos arquivos (aplicar por
fora do CLI registra a versão pela hora da aplicação, e aí o próximo `db push` tentaria reaplicar).

**Um buraco que a verificação pós-aplicação revelou:** o trigger que semeia o histórico só dispara
em `INSERT`, então os 4 produtos capturados ANTES da migration ficaram sem a primeira linha — e na
primeira rechecagem que mudasse algo, o preço de quando cada um foi salvo se perderia. Daí a
migration de backfill, separada em vez de embutida na anterior: aquela já estava aplicada, e
reescrever migration aplicada é o começo da deriva entre o git e o banco. Ela usa `capturado_em`
como `visto_em`, e não `now()` — a observação aconteceu quando a extensão leu a página. Idempotente
por `not exists`, então num banco novo é no-op e o `db reset` dá o mesmo resultado.

Conferido depois de aplicar: 4 produtos, 4 com preço, 4 linhas de histórico, zero pendentes. E a
nulabilidade de todas as colunas novas bate com os tipos que foram escritos à mão em
`database.generated.ts`.

---

## 2026-08-13 — Interesse como conjunto, compartilhado, e a extensão 0.3.0

**Contexto:** seis pedidos que, juntos, mudam o que um interesse É. Antes ele era uma vontade com
uma lista de produtos candidatos; agora é uma vontade com **saídas possíveis**, cada uma podendo
exigir mais de um produto — e ele pode circular entre espaços com alguém assumindo a compra.

**A decisão que organiza tudo: agrupamento.**

"Monitor novo" não é um monitor. É um monitor **mais** um braço de mesa, e a alternativa é um
monitor menor mais uma base simples. Comparado produto a produto, o "mais barato" desse interesse
seria o suporte de R$ 150 — resposta correta para a pergunta errada. Então a comparação passou a ser
entre agrupamentos:

```
Interesse "Monitor novo"
  ├── Agrupamento (favorito)   Monitor 27" 1.800 + braço 300  = 2.100
  └── Agrupamento              Monitor 24" 1.200 + base   150 = 1.350
```

**A regra que sustenta essa comparação:** `somaDoAgrupamento` devolve `null` enquanto **qualquer**
item estiver sem preço. Uma soma parcial não é um preço menor, é um preço incompleto — devolver
1.800 para "monitor 1.800 + braço sem preço" faria a tela anunciar "economize R$ 750" a favor do
agrupamento pior documentado. O parcial aparece na tela com a ressalva ao lado ("R$ 1.800 até agora
— 1 item sem preço"), o que informa sem entrar na conta.

**Compartilhar não move.** O interesse continua morando em `interesse.space_id`; cada linha de
`interesse_compartilhamento` o torna visível também num espaço. É o que permite guardar um presente
no espaço pessoal e ainda mostrá-lo no espaço do casal para a outra pessoa dizer "eu dou". Só o dono
compartilha, e a policy é quem barra — a RPC só traduz para uma mensagem legível.

**Quem assumiu aparece para todos, inclusive para o dono.** Foi uma escolha, e o contrário era
defensável (surpresa). Mas o app é de gente que coordena: esconder do dono que o presente já tem
dono deixaria os dois comprando a mesma coisa.

**"É meu" atravessa espaços, mas só no pessoal.** `interesseNaVista` tem três caminhos: mora aqui,
foi compartilhado aqui, ou **é meu e este é o meu espaço pessoal** (criado por mim, ou assumido por
mim). Sem o terceiro, o espaço pessoal seria o único lugar do app que esconde o que a própria pessoa
está tocando — e ela teria de trocar de espaço para lembrar do presente que prometeu. O caminho vale
só no pessoal: dentro do casal, a lista de desejos de cada um segue invisível até ser compartilhada,
que é o ponto de existir espaço pessoal.

**A url do produto é somente-leitura na edição.** O card virou clicável (corrigir o que a raspagem
leu errado é frequente), mas o link fica travado com a explicação ao lado. É por ele que a
rechecagem reabre a página: trocá-lo à mão faria a próxima leitura ler OUTRO produto e sobrescrever
preço e histórico deste com os de outra coisa — sem erro visível, e sem como descobrir depois que o
gráfico virou dois produtos misturados.

**"Para quem" tem duas formas e só uma vale por vez:** um membro do espaço (`para_quem_user_id`) ou
texto livre (`para_quem`, para quem não tem conta aqui). O nome do membro **não** é copiado para o
texto: a pessoa trocaria de apelido e o interesse ficaria apontando para um nome que não existe mais.

**Cache num lugar só, e este é o único módulo assim.** Todo o resto usa `useSpaceQuery`, com uma
query por espaço. Aqui a MESMA linha é vista de até três lugares, então um cache por espaço
guardaria três cópias — e compartilhar de dentro de um espaço deixaria os outros dois desatualizados
por até um minuto (o `staleTime` global), com sintoma silencioso: compartilha, troca de espaço, não
encontra nada. Uma chave `['interesses']` com tudo o que a RLS alcança, e o recorte por
`interessesDaVista`, que é puro e testado.

**Extensão 0.3.0:**

- Escolha de quais produtos reler, com caixinhas agrupadas por interesse
- "Só os favoritos de cada interesse" — um atalho de **marcação**, não um filtro de exibição: ele
  marca os favoritos e desmarca o resto, e as caixinhas seguem editáveis. Um filtro esconderia
  produtos e faria "reler 3 de 15" parecer bug. A preferência fica guardada, e marcar à mão a
  desliga (o atalho descreve uma marcação; aceso sobre outra seleção seria mentira na tela)
- Interesse sem favorito nenhum não entra quando "só os favoritos" está ligado — a pessoa pediu os
  favoritos, e ali não há um
- "Para quem" virou lista de membros do espaço, com "Outra pessoa…" abrindo o texto livre
- `lib/selecao.js` novo, puro e testado: a regra da marcação em função pura é regra que se prova.
  `popup.js` não é importável em teste (puxaria `config.gerado.js`, que o build escreve)

**Dois testes que existem por causa da forma dos bugs anteriores:**

1. `#recheck-escolha` e `#grupo-para-quem-livre` somem ao receber `hidden`. É a mesma armadilha do
   `#grupo-novo` na 0.1.0: elemento com classe de layout declarando `display: flex`, escondido por
   atributo. Os dois testes rodam a cascata de verdade no happy-dom.
2. Todo módulo de `lib/` que a extensão carrega em cadeia é conferido pelo workflow. A lista de
   verificação do `.zip` é escrita à mão e envelhece calada — `lib/recheck.js` já estava de fora
   desde a 0.2.0. O dia em que a cópia falhar, o pacote sai sem o arquivo, é publicado como release,
   e o sintoma é a extensão quebrando num import sem nada vermelho no CI.

**Verificado:** `npm run verificar` limpo, 312 testes. O `.zip` 0.3.0 empacota com os seis módulos
de `lib/`.

**A migration `20260813120000` continua sem aplicar, e por um motivo que não é preguiça:** ela
remove `interesse_produto.escolhido`, coluna que o app **publicado** ainda lê. Aplicá-la antes do
deploy quebra a tela de Interesses de quem estiver com o app aberto; fazer o deploy antes quebra o
app novo contra o schema velho. Não há janela zero — há a escolha de qual lado quebra por dois
minutos. A ordem é: aplicar a migration, e em seguida o push que dispara o deploy. O que falha nesse
intervalo é a lista de Interesses do app antigo (um 400 do PostgREST por causa da coluna); o resto do
app não toca nessas tabelas.
