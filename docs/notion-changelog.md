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
