# APPingos

O nosso app: orçamento, filmes/séries, livros, músicas, viagens, objetivos e treinos — de
casal e pessoal. Nuxt 4 + Supabase, instalável como PWA no Android e no iOS.

Arquitetura e roadmap completos em [`docs/plano-fundacao.md`](./docs/plano-fundacao.md)
(cópia do plano de implementação da fundação).

## Stack

- **Front:** Nuxt 4 (Vue 3), Tailwind v4, shadcn-vue, TanStack Query, Pinia
- **Dados/Auth:** Supabase (Postgres + Auth + RLS), via `@nuxtjs/supabase`
- **PWA:** `@vite-pwa/nuxt`

## Setup

### 1. Instalar dependências

```bash
npm install
```

### 2. Desenvolvimento local com Docker

O Postgres/Auth/Studio rodam localmente via Docker — é aqui que se testa uma migration nova
ou uma policy de RLS **antes** dela chegar perto do banco de verdade (o da nuvem, onde estão
os dados reais do casal).

Pré-requisito: [Docker Desktop](https://www.docker.com/products/docker-desktop/) aberto e rodando.

```bash
npx supabase init      # só na primeira vez — gera supabase/config.toml
npx supabase start     # sobe Postgres + Auth + Studio local (primeira vez baixa as imagens)
npx supabase db reset  # aplica todas as migrations do zero contra o Postgres local
```

O `db reset` imprime a URL do Studio local (normalmente `http://localhost:54323`) — dá para
testar RLS por lá simulando dois usuários antes de qualquer coisa ir para a nuvem.

> **Nota:** a stack completa (~10 containers) pede uns 2 GB de RAM livre além do que o
> Windows e os apps abertos já usam. Se `supabase start` crashar com erro de memória ou o
> Docker Desktop cair sozinho ao iniciar (`getting eth0 link: Link not found` é o sintoma),
> feche apps pesados (o Chrome costuma ser o maior vilão) e tente `wsl --shutdown` antes de
> reabrir o Docker Desktop. Sem isso, dá para validar uma migration direto na nuvem com
> `supabase db push` — só peça mais atenção ao revisar o SQL antes, já que não há um ambiente
> descartável no meio do caminho.

Fluxo do dia a dia ao mexer no schema:

1. `npx supabase migration new nome_da_mudanca` → escreve o SQL
2. `npx supabase db reset` → valida local
3. Só então `npx supabase db push` (ver passo 3) → aplica na nuvem

`npx supabase stop` derruba a stack local quando não estiver mexendo em schema.

### 3. Conectar ao Supabase na nuvem

1. Crie um projeto em [supabase.com](https://supabase.com/dashboard)
2. Em **Project Settings → API**, copie a **Project URL** e a **anon public key**
3. Copie `.env.example` para `.env` e preencha `SUPABASE_URL` / `SUPABASE_KEY`
4. Linke o projeto e suba as migrations que já foram validadas localmente:

   ```bash
   npx supabase login
   npx supabase link --project-ref SEU-PROJECT-REF
   npx supabase db push
   ```

5. **Obrigatório após qualquer mudança de schema** — regenerar os tipos:

   ```bash
   npm run db:types
   ```

   Gera `app/types/database.generated.ts` a partir do schema real (não editar à mão).
   `app/types/database.types.ts` só reexporta esse arquivo e acrescenta o que o gerador não
   infere — como as uniões literais de `papel` e `tipo`, que no banco são CHECK e não enum.

**Regra de ouro:** nunca alterar uma tabela direto pelo Table Editor da nuvem — sempre por
migration versionada. Editar direto no dashboard cria deriva entre o banco real e o git.

### Verificação antes de subir

`nuxt build` passa mesmo com variável inexistente em template (o Vue avalia como `undefined`)
e com query errada contra o banco. Rode as três verificações de uma vez:

```bash
npm run verificar
```

Que é `npm run imports && npm run typecheck && npm test`:

| comando | o que pega |
| --- | --- |
| `npm run imports` | arquivo do app contando com auto-import de `composables/`, `stores/` ou `utils/` |
| `npm run typecheck` | tipos, incluindo os gerados do schema do Supabase |
| `npm test` | a lógica pura dos módulos e os componentes que dá para montar fora do Nuxt |

**Sobre o `imports`:** composable e store do projeto se importa à mão neste repositório. O
registro de auto-import dessas pastas é remontado pelo dev server toda vez que um arquivo
entra ou sai delas, e um transform do Vite que caia no meio dessa reconstrução é cacheado
*sem* os imports injetados — o arquivo passa a estourar `X is not defined` só em runtime, sem
erro de build nem de tipo, e derruba o app inteiro se for carregado no boot. Aconteceu em
05/08/2026 com o painel de resumos. `node scripts/verificar-imports.mjs --corrigir` insere o
que faltar. Presets do Vue e do Nuxt (`computed`, `ref`, `useHead`) e os composables do
`@nuxtjs/supabase` seguem automáticos: vêm de pacotes que não mudam durante a sessão.

E, para o que nenhuma das três pega (schema, RLS, embeds do PostgREST), exercite o fluxo no
navegador contra o banco de verdade — foi assim que os três bugs de 31/07 apareceram.

### 4. Chave do TMDB (módulo Filmes/Séries)

1. Em [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api), copie o
   **"API Read Access Token"** (v4) — **não** a "API Key" (v3). O app autentica por Bearer.
2. Preencha `NUXT_TMDB_API_KEY` no `.env` — fica só no servidor, nunca chega ao browser

### 5. Chaves do Google Maps (módulo Viagens)

São **duas chaves do mesmo projeto**, e a separação é o ponto: uma delas é inerentemente
pública (vai no `src` de um iframe) e a outra nunca pode sair do servidor. Uma chave só
serviria às duas coisas — e seria pública com permissão de gastar cota paga.

No [console do Google Cloud](https://console.cloud.google.com/):

1. Crie um projeto e **ative o faturamento**. O uso previsto cabe na cota gratuita
   (Autocomplete: 10.000/mês; Embed: ilimitado) — o faturamento existe porque o Google exige.
2. Habilite **Places API (New)** e **Maps Embed API**.
3. Em **APIs e serviços → Credenciais**, crie duas chaves de API:

   | Chave | Restrição de aplicativo | Restrição de API |
   | --- | --- | --- |
   | servidor | **nenhuma** — chamada de servidor não manda referrer | só **Places API (New)** |
   | navegador | **referenciadores HTTP**: `http://localhost:3000/*` e `https://SEU-APP.vercel.app/*` | só **Maps Embed API** |

4. Em **Cotas**, limite `AutocompletePlacesRequest per day` a ~300. É rede de segurança, não
   necessidade: 300/dia × 30 mantém o mês inteiro dentro do gratuito mesmo no pior caso.
5. Preencha `NUXT_GOOGLE_PLACES_API_KEY` e `NUXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` no `.env`.

**Não esquecer no deploy:** o domínio do Vercel precisa entrar na lista de referrers da chave
do navegador. Sem isso o mapa dá 403 em produção e só em produção — `localhost` continua
funcionando, então o erro não aparece em nenhum teste local.

### 6. Notificações por e-mail (Gmail + Edge Function)

O app avisa em dois canais: a caixa dentro do app (sempre) e o e-mail (opt-in por pessoa, em
Notificações › Preferências). O e-mail é o canal que funciona igual no Android e no iPhone
— sem service worker, sem permissão do sistema, sem app instalado — e é por isso que ele veio
antes do push.

O caminho é: gatilho no Postgres → `notificacao` → fila → `pg_net` acorda a Edge Function
`enviar-emails` → SMTP do Gmail.

**Sem os passos abaixo o app funciona normalmente.** O canal se declara indisponível: a tela de
preferências explica em vez de oferecer, e `definir_email_notificacoes` recusa ligar no
servidor. Ninguém se inscreve, então nada é enfileirado — e no dia da configuração não há
backlog para disparar quarenta e-mails de uma vez. Quem decide isso é `status_do_email()`, que
exige as duas camadas de pé: os segredos do Vault (o banco alcança a função) e o registro em
`notificacao_email_saude`, que a própria função atualiza a cada acordada.

**Por que Gmail e não um provedor de envio.** A primeira versão usava Resend, que é melhor —
mas o plano gratuito só entrega para terceiros com um domínio verificado, e sem domínio o
e-mail chega só na caixa de quem é dono da conta. Num app de casal, isso é a metade que
importa ficando de fora. O Gmail com senha de app custa zero, dispensa domínio, e quem
entrega é o próprio Google — então a mensagem cai na caixa de entrada. O limite (~500/dia)
é ordens de grandeza acima do que duas pessoas geram. Se um dia houver domínio, trocar de
volta é mexer só em `supabase/functions/enviar-emails/index.ts` e em dois segredos: o
provedor está confinado ali, e nem o motor nem as telas sabem quem entrega.

1. **Senha de app do Gmail.** Vale usar uma conta só para isso (ex.
   `appingos.avisos@gmail.com`) — assim a credencial não é a da sua conta pessoal e dá para
   revogá-la sem afetar mais nada.

   Em [myaccount.google.com/security](https://myaccount.google.com/security), ligue a
   **verificação em duas etapas** (sem ela o item abaixo nem aparece). Depois, em
   [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), crie uma
   senha de app com o nome que quiser. O Google mostra **16 letras em 4 blocos**, uma única
   vez — copie na hora. Ela é digitada sem os espaços.

   Essa senha dá acesso de envio à conta: ela vive só nos Secrets do Supabase, nunca no
   `.env` do app e nunca num commit.

2. Publique a função:

   ```bash
   npx supabase functions deploy enviar-emails
   ```

3. Em **Project Settings → Edge Functions → Secrets**, defina:

   | Segredo | Exemplo |
   | --- | --- |
   | `GMAIL_USUARIO` | `appingos.avisos@gmail.com` — a conta que envia |
   | `GMAIL_SENHA_DE_APP` | as 16 letras, sem espaços |
   | `APP_URL` | `https://appingos.vercel.app` — a raiz dos links do e-mail |
   | `NOME_REMETENTE` | opcional; o nome exibido, padrão `APPingos` |

   Não há segredo para o endereço do remetente: o Gmail reescreve o `From` para a conta
   autenticada de qualquer jeito, e um campo configurável só criaria a pegadinha de definir
   um endereço e receber outro.

4. No **SQL Editor**, guarde no Vault o endereço da função e a chave que o banco usa para
   chamá-la (as duas estão em Project Settings → API — use a `service_role` legada, a que
   começa com `eyJ`). Isto roda **uma vez**, e fica fora das migrations de propósito:
   migration é texto versionado no git.

   ```sql
   select vault.create_secret(
     'https://SEU-PROJETO.supabase.co/functions/v1/enviar-emails',
     'notificacao_email_url'
   );
   select vault.create_secret('SUA-SERVICE-ROLE-KEY', 'notificacao_email_token');
   ```

5. Teste ponta a ponta: ligue o e-mail em `/notificacoes/preferencias`, lance um gasto pela
   OUTRA conta e confira a caixa de entrada. Se não chegar, a resposta está numa consulta:

   ```sql
   select estado, tentativas, erro, destinatario
   from notificacao_email_fila order by criado_em desc limit 10;
   ```

   `pendente` parado por mais de 5 minutos = o banco não conseguiu acordar a função, então o
   problema está nos dois segredos do Vault. `erro` com "535" ou "Username and Password not
   accepted" = senha de app errada ou copiada com os espaços — e note que, nesse caso, a fila
   NÃO gasta as tentativas: a função aborta o lote inteiro e tenta tudo de novo no próximo
   ciclo, para um segredo errado não condenar avisos que ainda vão sair.

### 7. Extensão do Chrome (módulo Interesses)

Captura o produto da página aberta — nome, preço, preço no Pix, parcelamento, imagem, link — e
registra como interesse em Objetivos › Interesses. **Sem os passos abaixo o app funciona
normalmente**; a extensão é um atalho para o que a tela já faz à mão.

Não é um executável: extensão do Chrome é uma pasta com `manifest.json` + HTML/JS. O mesmo
pacote roda igual no Windows, Mac, Linux e ChromeOS, e só em desktop (o Chrome no Android não
tem extensões).

```bash
npm run extensao
```

Gera `extensao/lib/config.gerado.js` a partir do `.env` (as mesmas `SUPABASE_URL`/`SUPABASE_KEY`
do app) e o `.zip` em `extensao/dist/`. Depois, no Chrome: `chrome://extensions` → **Modo do
desenvolvedor** → **Carregar sem compactação** → apontar para a pasta **`extensao/`**.

O login é com o mesmo e-mail e senha do app — a extensão não reaproveita a sessão do navegador
(ela vive em cookies do domínio do Vercel), então ela faz o próprio, contra o mesmo projeto. A
anon key vai dentro do pacote, como já vai no bundle do app: o que autoriza é o JWT de quem
entrou, e o que protege os dados é a RLS.

**Na segunda máquina não precisa disso.** Todo push na `main` que mude `extensao/` com `version`
nova publica o `.zip` em [Releases](https://github.com/MatheusBacca/APPingos/releases) — basta
baixar e carregar sem compactação. Para isso, cadastre `SUPABASE_URL` e `SUPABASE_KEY` em
**Settings → Secrets and variables → Actions** (os mesmos valores do `.env`); sem eles o workflow
falha em vez de publicar um pacote que não conecta.

Detalhes de uso, das quatro fontes que a raspagem tenta e de como publicar na Web Store:
[`extensao/README.md`](./extensao/README.md).

### 8. Rodar

```bash
npm run dev
```

Para testar no celular pela rede local:

```bash
npm run dev -- --host
```

## Publicar uma versão

O app é versionado em `MAIOR.MENOR.CORRECAO` e mostrado como `vX.XXX.X` (o menor com três
dígitos, para a coluna de versões da timeline não dançar a cada release). Publicar é **um
comando**:

> **Duas versões independentes no repositório, e é de propósito.** Esta é a do APP
> (`package.json` + `app/changelog.ts`). A extensão do Chrome tem a sua, em
> `extensao/manifest.json`, e é ela que dispara o workflow de Releases (seção 7) — `npm run
> release` não a toca, e subir a extensão não anuncia versão nova do app. Elas mudam por motivos
> diferentes e em ritmos diferentes.

```bash
npm run release 1.1.0 "Título curto" "Uma ou duas frases sobre o que chegou."
```

Ele escreve as três pontas de uma vez, a partir do texto digitado uma vez:

| onde | o que |
| --- | --- |
| `package.json` | a versão do pacote |
| `app/changelog.ts` | a entrada nova no topo de `LANCAMENTOS` — é o que a tela `/novidades` desenha |
| `supabase/migrations/<carimbo>_versao_1_1_0.sql` | `select public.anunciar_versao(...)` — a notificação para todo mundo |

Depois, na ordem:

```bash
npm run verificar
git add -A && git commit
npx supabase db push
git push
```

**A tag sai sozinha.** O workflow `.github/workflows/versao.yml` cria `vX.Y.Z` anotada assim que
a `version` do `package.json` muda na `main` — não há passo manual, do mesmo jeito que a
extensão se autotagueia em `extensao-vX.Y.Z`. A tag carrega o título e a descrição do release,
então `git show v1.1.0` responde "o que mudou nesta versão?" sem abrir o changelog. Bumpar sem
querer não duplica nada: se a tag já existe, o job é pulado com um aviso no resumo.

**É o `db push` que cria a notificação** — uma linha por usuário, com o título e a descrição
gravados como snapshot. Reaplicar a mesma migration não gera aviso repetido (índice único por
`user_id` + versão). O `git push` é o que faz o Vercel publicar o build que aquele texto
descreve, então mantenha os dois no mesmo release: anunciar antes de publicar é prometer o que
o app ainda não tem.

Quem não quiser o aviso desliga "Novidades do app" em Notificações › Preferências — é a sexta
categoria, com os dois canais (app e e-mail) independentes, como as outras cinco.

**Dois avisos diferentes, e os dois existem de propósito:** o toast "nova versão disponível" é
do service worker e fala do *build daquele navegador* ("recarregue"); a notificação do sino
fala do *produto* ("chegou o gráfico de barras"), é igual para as duas pessoas, tem estado de
lida e espera na caixa. O porquê inteiro está no cabeçalho de
`supabase/migrations/20260813024604_notificacoes_versao.sql`.

O changelog **não** é tabela no banco, de propósito: ele descreve o que *este build* faz, então
poder editá-lo sem deploy não seria vantagem, e sim incoerência. `test/changelog.test.ts` trava
o que ninguém revisa duas vezes — ordem, duplicidade, e o `package.json` alinhado com o topo do
registro.

## Trabalhando de mais de um computador

O código sincroniza pelo GitHub — [github.com/MatheusBacca/APPingos](https://github.com/MatheusBacca/APPingos)
(privado). Em cada máquina nova:

```bash
git clone https://github.com/MatheusBacca/APPingos.git
cd APPingos
npm install
```

O `.env` **nunca** é commitado (está no `.gitignore`) — recrie-o em cada máquina a partir do
`.env.example` com as mesmas credenciais do Supabase e do TMDB.

Fluxo normal: `git pull` ao começar a trabalhar, `git push` ao terminar. Se mexer em schema,
rode `db reset` local antes de commitar (seção acima) para não subir uma migration quebrada.

## Deploy (Vercel)

O deploy é automático a cada push na branch `main`, uma vez conectado o repositório no
[dashboard do Vercel](https://vercel.com/dashboard) (Add New → Project → importar o repo do
GitHub). O preset Nuxt é autodetectado — nada a mudar em `nuxt.config.ts`.

Variáveis de ambiente a configurar no Vercel (Settings → Environment Variables, em
**Production** e **Preview**): `SUPABASE_URL`, `SUPABASE_KEY`, `NUXT_TMDB_API_KEY`,
`NUXT_GOOGLE_PLACES_API_KEY`, `NUXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` — os mesmos valores do
`.env` local.

**Não esquecer**, os dois pela mesma razão — funcionam em `localhost` e quebram só em produção:

- No dashboard do Supabase, em **Authentication → URL Configuration**, adicionar o domínio do
  Vercel em Site URL / Redirect URLs. Sem isso o login não volta.
- No Google Cloud, adicionar o domínio do Vercel aos referrers da chave do Embed (seção 5).
  Sem isso o mapa das Viagens dá 403.

## Ícones do PWA

Gerados a partir de `assets/icone-origem.svg` via [sharp](https://sharp.pixelplumbing.com/):

```bash
npm run icones
```

## Estrutura

```
app/
  components/       # componentes de UI, incluindo components/ui (shadcn-vue)
  composables/       # useEspacos, useSpaceQuery, useCatalogo, useAuth...
  layouts/            # default (shell autenticado) e auth (login/cadastro)
  pages/              # rotas — filmes/, espacos.vue, login.vue...
  stores/             # Pinia — espaço ativo
  modules.ts          # registro único dos módulos do app (navegação)
  changelog.ts        # registro único das versões — a timeline de /novidades
  types/              # tipos do banco e do domínio
server/
  api/tmdb/           # proxy do TMDB — a chave nunca vai ao client
supabase/
  migrations/         # schema versionado — fonte da verdade do banco
  functions/
    enviar-emails/    # Edge Function que drena a fila e envia pelo SMTP do Gmail
    _shared/          # código lido pelo Deno E pelo app (o texto das notificações)
extensao/             # extensão do Chrome — JS puro, sem build (ver seção 7)
  lib/raspagem.js     # raspar(): uma função autocontida, injetada na aba ativa
  lib/api.js          # Auth + PostgREST sobre fetch, com renovação de token
.github/workflows/
  extensao.yml        # publica o .zip da extensão em Releases quando a version muda
  versao.yml          # cria a tag vX.Y.Z do app quando o package.json muda
```

## Arquitetura de dados

Todo dado de domínio pertence a um **espaço** (`space`), pessoal ou de casal — nunca
diretamente a um usuário. `membership` liga usuários a espaços, e a Row Level Security do
Postgres barra o acesso entre espaços que não se compartilham. Ver
`supabase/migrations/20260730120000_foundation.sql` para o schema comentado.

O catálogo de mídias (filmes, séries, e futuramente livros/músicas) segue três tabelas
genéricas: `media_item` (catálogo global), `entry` (item dentro de um espaço) e `rating`
(avaliação por usuário — é daqui que sai "eu dei 8, ela deu 5"). Ver
`supabase/migrations/20260730130000_catalogo.sql`.
