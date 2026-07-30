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

### 2. Configurar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com/dashboard)
2. Em **Project Settings → API**, copie a **Project URL** e a **anon public key**
3. Copie `.env.example` para `.env` e preencha `SUPABASE_URL` / `SUPABASE_KEY`
4. Rode as migrations (precisa da [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)):

   ```bash
   npx supabase login
   npx supabase link --project-ref SEU-PROJECT-REF
   npx supabase db push
   ```

5. (Opcional, mas recomendado após qualquer mudança de schema) regenerar os tipos:

   ```bash
   npm run db:types
   ```

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
