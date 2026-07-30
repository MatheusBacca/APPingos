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

5. (Recomendado após qualquer mudança de schema) regenerar os tipos:

   ```bash
   npm run db:types
   ```

**Regra de ouro:** nunca alterar uma tabela direto pelo Table Editor da nuvem — sempre por
migration versionada. Editar direto no dashboard cria deriva entre o banco real e o git.

### 3. Chave do TMDB (módulo Filmes/Séries)

1. Crie uma chave em [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
2. Preencha `NUXT_TMDB_API_KEY` no `.env` — fica só no servidor, nunca chega ao browser

### 4. Rodar

```bash
npm run dev
```

Para testar no celular pela rede local:

```bash
npm run dev -- --host
```

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
**Production** e **Preview**): `SUPABASE_URL`, `SUPABASE_KEY`, `NUXT_TMDB_API_KEY` — os
mesmos valores do `.env` local.

**Não esquecer:** no dashboard do Supabase, em **Authentication → URL Configuration**,
adicionar o domínio do Vercel em Site URL / Redirect URLs. Sem isso o login funciona em
`localhost` mas quebra em produção.

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
  types/              # tipos do banco e do domínio
server/
  api/tmdb/           # proxy do TMDB — a chave nunca vai ao client
supabase/
  migrations/         # schema versionado — fonte da verdade do banco
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
