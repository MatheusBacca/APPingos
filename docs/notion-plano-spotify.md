# Plano — Integração com o Spotify

> Documento de planejamento, para colar no Notion antes de implementar. Ainda não existe
> nenhum código deste módulo — este é o "por que" e o "como" antes de começar.

## Por que

`docs/notion-arquitetura.md` diz desde o primeiro dia que filmes, séries, livros e **músicas**
são a mesma forma: um item global mais uma nota por pessoa. O módulo `musicas` já está
registrado em `app/modules.ts` com `ativo: false`, esperando. O Spotify é a fonte que falta
para ligá-lo — o mesmo papel que o TMDB cumpre em Filmes.

Mas o pedido vai além do catálogo, e é bom separar as três coisas logo, porque elas têm
custos muito diferentes:

1. **Catálogo de músicas** — buscar, adicionar ao espaço, os dois avaliarem.
2. **Playlists no espaço compartilhado** — ver as playlists de cada um lado a lado.
3. **O que o outro está ouvindo agora** — presença em tempo real.

A primeira é uma skin barata em cima de um motor pronto. A terceira é a única coisa no
APPingos até hoje que não é "registrar algo" nem "consultar algo": é *presença*, e ela abre
uma camada técnica que o app ainda não usa em lugar nenhum.

## O que já existe que ajuda

- **`media_item` já prevê música do Spotify.** `tipo` aceita `'musica'` e o comentário de
  `fonte` já lista `'spotify'` (`20260730130000_catalogo.sql`). O catálogo não precisa de
  migration nenhuma para receber faixas e álbuns.
- **O motor de catálogo inteiro**: `entry`, `rating` por usuário, `collection`/`collection_item`
  genéricas sobre `entry`, e a RPC `adicionar_item`. "Eu dei 10, ela deu 4" sai de graça.
- **O padrão de rota de servidor como proxy** (`server/api/tmdb/*`, `server/utils/tmdb.ts`) já
  resolve guardar segredo de API e nunca deixá-lo chegar ao browser — inclusive o formato de
  normalizar o retorno da API externa antes de entregar ao client, para o shape do fornecedor
  não vazar para dentro do app.
- **O plano de OAuth do Google Calendar** (`docs/notion-plano-agenda-google-calendar.md`) já
  decidiu quase tudo que vale para o Spotify também: conexão é por **pessoa** e não por espaço,
  refresh token nunca lido pelo client, rotas `iniciar`/`callback`, rotina de refresh no
  servidor. Este plano herda essas decisões em vez de reabri-las.
- **RLS por espaço** com `is_space_member`, como sempre.
- **`pg_cron` + `pg_net` + Edge Function** já rodando em produção no módulo de notificações —
  agendamento não é território novo.

## O que **não** existe: Realtime

Não há uma única chamada de `.channel()` no repositório. Nem `postgres_changes`, nem
`broadcast`, nem `presence`. A arquitetura menciona o realtime do Supabase como um dos motivos
de ter escolhido ele, e o plano de Jogos chegou a desviar de propósito para não precisar dele.

Isso importa para a estimativa: a fase 3 deste plano não é "mais uma tela", é a estreia de uma
camada — habilitar publicação realtime na tabela, um composable novo, e o cuidado com
reconexão e com o canal que sobrevive à troca de espaço ativo.

## Decisão central: dois tipos de credencial, não um

O Spotify tem dois modos de autenticação, e este módulo usa **os dois**, para coisas
diferentes:

- **Client Credentials** (token de aplicativo, sem usuário): busca no catálogo público, detalhe
  de faixa e de álbum. É o equivalente exato da chave do TMDB — vive no servidor, é renovado
  por lá, e nenhum usuário precisa conectar nada para o módulo de Músicas funcionar.
- **Authorization Code + PKCE** (token do usuário): playlists e now-playing. Exige que cada
  pessoa conecte a própria conta.

Colapsar os dois num só atrasaria o módulo de Músicas atrás de um fluxo de OAuth que ele não
precisa. Por isso a fase 1 entrega valor sem nenhuma conexão de conta.

## Decisão central: conectar o Spotify é por pessoa

Idêntico ao que o plano do Google Calendar já concluiu, e pelo mesmo motivo — cada um tem a
própria conta. Um espaço de casal pode ter zero, um ou dois membros conectados, e a tela tem
que ficar honesta nos três casos.

```
integracao_spotify(user_id pk, escopos, conectado_em, spotify_user_id, mostrar_escuta bool)
-- o refresh token NÃO fica aqui; ver abaixo
```

**Não reaproveitar o login do Supabase com Spotify.** O `config.toml` lista `spotify` como
provedor de auth, mas login é sobre identidade; isto é autorização de acesso a playlists e ao
player. Fluxo separado, como decidido para o Google.

O **refresh token nunca deve ser lido pelo client** — as mesmas duas opções do plano do
Google valem aqui, para decidir na implementação: tabela separada sem policy de `select` para
`authenticated` (lida só via `service_role` numa rota de servidor), ou Supabase Vault.

## Pegadinhas do Spotify a resolver antes de começar

**1. Development Mode.** Um app novo no Spotify Developer Dashboard nasce em modo de
desenvolvimento, limitado a um punhado de usuários cadastrados à mão (ordem de 25). Para duas
pessoas isso é perfeito e é onde o app deve **ficar** — pedir extension request exige métricas
de produto comercial e não faz sentido aqui. Mesma lógica do "Testing mode" do Google no plano
da agenda: é configuração de dashboard, não código. **As duas contas precisam ser cadastradas
como usuários do app antes de qualquer teste de OAuth**, senão o callback falha com um erro
que não explica isso.

**2. Endpoints de recomendação foram cortados para apps novos.** As APIs de recomendações,
audio features e artistas relacionados deixaram de ser liberadas para aplicativos criados
depois de novembro de 2024. **Não planejar nada em cima delas** — nada de "afinidade musical do
casal calculada por energia e valência". Busca, playlists e estado do player continuam
disponíveis. Vale reconferir a documentação no dia de começar, porque essa lista já mudou uma
vez.

**3. Não existe webhook de now-playing.** O Spotify não notifica ninguém quando a faixa muda.
A única forma é **polling** de `/me/player/currently-playing`. Toda a fase 3 é consequência
disso, e é a razão de ela ser a parte cara.

**4. Ler o player funciona em conta gratuita; controlar, não.** Ver o que está tocando não
exige Premium. Play/pause/pular exige. Este plano só lê — controle remoto do player fica fora
de escopo, e é bom que fique: "pausar a música do outro" é um poder que ninguém pediu.

## Fase 1 — Catálogo de músicas

`server/utils/spotify.ts` no molde de `tmdb.ts`: um `buscar()` e um `detalhar()` que devolvem
o formato já normalizado do app, mais o cuidado extra que o TMDB não pede — o token de Client
Credentials expira em ~1h e precisa ser cacheado em memória no servidor, não pedido a cada
requisição.

O que entra em `media_item`: **faixa e álbum**, com `fonte = 'spotify'` e `fonte_id` sendo o id
do Spotify. Artista **não** vira `media_item` — "avaliar um artista de 0 a 10" não é o que o
motor faz bem, e artista cabe melhor como metadado da faixa e, mais tarde, como interesse no
módulo de Objetivos.

Tela `/musicas` no molde de `/filmes`: busca, lista por status, detalhe com as duas notas lado
a lado. Ligar `ativo: true` em `app/modules.ts` e escrever o `useResumoMusicas` para o painel.

Nenhuma conexão de conta é necessária nesta fase — ela funciona no dia 1, para os dois.

## Fase 2 — Playlists no espaço

Aqui entra o OAuth por pessoa. Escopos: `playlist-read-private` e
`playlist-read-collaborative`.

**O corte importante: v1 é leitura, não escrita.** O APPingos mostra as playlists que já
existem no Spotify de cada um; ele não cria nem altera nada lá. Isso mantém os escopos
menores, elimina resolução de conflito e entrega o essencial do pedido — "ver as playlists dos
membros do espaço num lugar só".

```
playlist_spotify(
  id, user_id,              -- de quem é a playlist (dono da conexão)
  spotify_id text,
  nome, capa_url, total_faixas int, publica bool,
  sincronizado_em timestamptz
)

playlist_faixa(
  playlist_id, posicao int,
  spotify_track_id text, titulo, artistas text, album, duracao_ms int,
  primary key (playlist_id, posicao)
)
```

- É **snapshot**, não espelho ao vivo. Sincronizar é uma ação (botão "atualizar", ou automático
  se `sincronizado_em` passou de algumas horas). Bater na API do Spotify a cada abertura de
  tela estoura o rate limit por nada — playlist muda devagar.
- RLS: a playlist é de um `user_id`, mas quem enxerga é **quem divide um espaço com essa
  pessoa**. A policy é um `exists` sobre `membership` cruzando os dois lados, não um
  `is_space_member` direto — é a primeira tabela do app cuja visibilidade parte da pessoa e não
  do espaço, então vale escrever essa policy com calma e um teste dedicado.
- Faixa de playlist **não** vira `media_item` automaticamente. Só quando alguém clica "adicionar
  ao nosso catálogo" é que a `adicionar_item` roda. Importar 300 faixas para o catálogo porque
  alguém abriu uma playlist é poluir o motor com dados que ninguém avaliou.

**Playlist nativa do APPingos, com exportação para o Spotify**, é a evolução natural — e
`collection`/`collection_item` já existem para isso. Falta uma coisa concreta: `collection_item`
não tem coluna de ordem, e playlist sem ordem não é playlist. É uma migration pequena
(`posicao int`), mas ela é pré-requisito, e a exportação pede o escopo
`playlist-modify-private`. Fica para depois da v1 de leitura (ver "fora de escopo").

## Fase 3 — O que o outro está ouvindo agora

Escopo: `user-read-currently-playing` (e `user-read-playback-state` se quiser saber o
dispositivo). Como não há webhook, alguém tem que perguntar de tempos em tempos. Duas formas,
com trocas bem diferentes:

**A. Polling no client, pelo próprio dono da música.** Enquanto a pessoa está com o APPingos
aberto, o app dela consulta o próprio now-playing a cada ~20s e faz `upsert` em `escuta_agora`.
O parceiro assiste pelo Realtime. Barato, sem infra nova, e o token do usuário é usado pelo
próprio usuário. **Limitação honesta: só funciona com o app aberto.** Ela ouvindo no carro, com
o APPingos fechado, não aparece para ninguém.

**B. Polling no servidor, por `pg_cron` + Edge Function.** Roda mesmo com o app fechado — que é
justamente o caso interessante. O preço: refresh de token e chamada à API por membro conectado,
milhares de vezes por dia, e o "tempo real" fica com a granularidade do agendamento.

**Recomendação: começar por A, e só somar B se a limitação incomodar de verdade no uso.** A
tela é a mesma nas duas — a diferença é quem escreve na tabela. Vale construir a fase de forma
que trocar de A para B seja mudar a origem da escrita, não reescrever a leitura.

```
escuta_agora(
  user_id pk,               -- UMA linha por pessoa, sobrescrita
  tocando bool,
  spotify_track_id text, titulo, artistas text, album, capa_url,
  progresso_ms int, duracao_ms int,
  atualizado_em timestamptz
)
```

- **Uma linha por pessoa, sempre sobrescrita — nunca `insert` de histórico.** Guardar cada
  faixa tocada vira um log minuto a minuto do comportamento de alguém dentro de um app de
  casal. Ninguém pediu isso, e o dia em que pedirem ("as músicas mais tocadas do mês") o
  Spotify já tem um endpoint de top items para isso, sem o app virar vigilância.
- **`mostrar_escuta` em `integracao_spotify`, com padrão desligado.** Conectar a conta para ver
  playlists não pode implicar em transmitir o que se está ouvindo. São duas permissões
  diferentes e a tela tem que tratá-las assim.
- Linha considerada obsoleta depois de ~2 min sem atualização — a tela mostra "não está
  ouvindo" em vez de congelar na última faixa e mentir.
- RLS de leitura: mesma regra da playlist (quem divide espaço), **e** `mostrar_escuta = true`.
  A policy tem que checar o toggle; deixar isso só para o front seria proteger a privacidade
  com CSS.

## Tela

Módulo **Músicas** com três partes:

- **Catálogo** (fase 1): busca, lista por status, detalhe com as duas notas — o padrão de
  Filmes.
- **Playlists** (fase 2): as playlists dos membros do espaço, agrupadas por pessoa, cada uma
  abrindo a lista de faixas. Estado vazio explícito para "fulano ainda não conectou o Spotify",
  com o botão de conectar quando for você mesmo.
- **Ouvindo agora** (fase 3): uma faixa de presença no topo do módulo, e provavelmente também
  um cartão no painel — é a informação com mais "graça de casal" do módulo inteiro e ela morre
  se ficar escondida a dois cliques.

Conectar/desconectar a conta e o toggle de "mostrar o que estou ouvindo" vivem em Espaços,
junto do que já existe de conta — mesmo lugar que o plano do Google Calendar escolheu.

## Fases de implementação

1. **Spotify Dashboard**: criar o app, cadastrar as duas contas como usuários de
   desenvolvimento, registrar as redirect URIs (local e produção), guardar client id/secret no
   `.env` e no Vercel.
2. **Catálogo**: `server/utils/spotify.ts` + rotas de busca/detalhe com Client Credentials,
   tela `/musicas`, módulo ativado, resumo no painel. **Entrega valor sozinha.**
3. **Conexão**: migration de `integracao_spotify` + armazenamento seguro do refresh token,
   rotas de `iniciar`/`callback` com PKCE, refresh automático, tela de conectar em Espaços.
4. **Playlists**: schema + RLS "quem divide espaço", sincronização sob demanda, tela de
   playlists, botão de trazer uma faixa para o catálogo.
5. **Ouvindo agora**: `escuta_agora` + RLS com o toggle, publicação realtime na tabela,
   `useEscutaAgora`, polling client-side, faixa de presença no módulo e no painel.
6. **(Se fizer falta)** Polling de servidor por `pg_cron` + Edge Function, como fallback para
   quando o app está fechado.

## Fora de escopo por enquanto

- **Controlar o player do outro** (play/pause/pular) — exige Premium nos dois lados e é um
  poder que ninguém pediu.
- **Playlist nativa do APPingos exportada para o Spotify** — depende de `posicao` em
  `collection_item` e do escopo de escrita; entra depois que a leitura estiver de pé.
- **Histórico de escuta** e estatísticas do tipo "mais tocadas do mês" — se pedirem, sai do
  endpoint de top items do Spotify, não de um log próprio.
- **Recomendações e "compatibilidade musical"** — a API que faria isso não é liberada para apps
  novos.
- **Apple Music, YouTube Music, Deezer** — Spotify primeiro; os outros só se realmente fizer
  falta.
- **Letras** — API separada, licenciamento próprio.

## Referências

- [Spotify Web API — autorização](https://developer.spotify.com/documentation/web-api/concepts/authorization)
- [Authorization Code with PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)
- [Escopos disponíveis](https://developer.spotify.com/documentation/web-api/concepts/scopes)
- [Rate limits](https://developer.spotify.com/documentation/web-api/concepts/rate-limits)
- [Quota modes e development mode](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
- [Supabase Realtime — Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- `docs/notion-plano-agenda-google-calendar.md` — as decisões de OAuth por pessoa e de guarda
  do refresh token, herdadas aqui
