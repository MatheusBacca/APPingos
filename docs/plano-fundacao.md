# APPingos — Fundação + Módulo de Filmes/Séries

## Context

Não existe código ainda. Este é um projeto pessoal greenfield: um "life OS" de casal, usável no
navegador e instalável como app no Android e no iOS, reunindo orçamento, catálogo de mídias
(filmes/séries/livros/músicas), viagens, objetivos e treinos.

A leitura de arquitetura que orienta o plano: **os 7 módulos pedidos não são 7 apps**. Eles
colapsam em três primitivas — espaço compartilhado (pessoal vs. casal), item de catálogo com
avaliação por usuário, e série temporal com meta. Construir essas três bem significa que os
módulos seguintes viram "skins" baratas em cima de motores já prontos.

Destas, **o espaço compartilhado é a única cara de consertar depois**: se `space_id` e RLS não
existirem desde a primeira migration, todo módulo escrito até lá precisa ser reescrito. Por isso a
Fase 1 é fundação, e só a Fase 2 entrega valor visível.

Decisões já tomadas pelo usuário: Supabase Cloud desde já, Tailwind + shadcn-vue, e
Filmes/Séries (via TMDB) como primeiro módulo vertical.

## Stack

| Camada | Escolha |
|---|---|
| Framework | Nuxt 4 (Vue 3 + Vite) |
| UI | Tailwind + `shadcn-nuxt` / shadcn-vue |
| Dados/Auth | Supabase Cloud (Postgres + Auth + RLS + Realtime) via `@nuxtjs/supabase` |
| Estado servidor | TanStack Query (`@tanstack/vue-query`) |
| Estado local | Pinia |
| PWA | `@vite-pwa/nuxt` |
| Migrations | Supabase CLI (`supabase/migrations/*.sql`, versionadas no git) |

Local: `C:\projects\appingos` — repo git novo.

## Pré-requisitos do usuário

Preciso destes três antes de rodar a Fase 1 inteira (o scaffold e o schema eu escrevo sem eles):

1. Projeto criado em [supabase.com](https://supabase.com) → **Project URL** e **anon key**
2. **Database password** do projeto (só para o `supabase link` / `db push`)
3. Chave de API do [TMDB](https://www.themoviedb.org/settings/api) — grátis, só para a Fase 2

Tudo vai em `.env` (git-ignored), com um `.env.example` versionado.

---

## Fase 1 — Fundação

### 1.1 Scaffold

- `npx nuxi@latest init appingos` em `C:\projects\appingos`
- Módulos: `@nuxtjs/supabase`, `@nuxtjs/tailwindcss`, `shadcn-nuxt`, `@vite-pwa/nuxt`, `@pinia/nuxt`
- `@tanstack/vue-query` via plugin (`plugins/vue-query.ts`)
- `ssr: false` inicialmente (SPA + PWA) — decisão reversível; SSR entra depois se quisermos
  compartilhamento com preview
- `.env.example`, `.gitignore`, `README.md` com passos de setup

### 1.2 Schema e RLS — o coração da fase

Migration `supabase/migrations/0001_foundation.sql`:

```
profile(id uuid pk → auth.users, nome, avatar_url, created_at)
space(id, tipo check('pessoal','casal'), nome, created_at)
membership(space_id, user_id, papel check('dono','membro'), pk(space_id,user_id))
space_invite(id, space_id, codigo unique, criado_por, expira_em)
```

**Armadilha conhecida a evitar:** uma policy em `membership` que consulta `membership` gera
recursão infinita no Postgres. O padrão correto é uma função `SECURITY DEFINER STABLE` que
ignora RLS na consulta interna:

```sql
create function public.is_space_member(p_space uuid) returns boolean
  language sql security definer stable set search_path = public as $$
    select exists (
      select 1 from public.membership m
      where m.space_id = p_space and m.user_id = auth.uid()
    );
  $$;
```

Regras:
- `membership`: SELECT próprio via `user_id = auth.uid()` **direto** (sem função — evita o ciclo)
- Toda tabela de domínio: `using (public.is_space_member(space_id))`
- Índice em `membership(user_id)` e em todo `space_id` referenciado por policy
- Trigger `on auth.users insert` → cria `profile` + um `space` pessoal + a `membership` de dono

Convite do casal: usuário A gera um código em `space_invite`; usuário B resgata via RPC
`SECURITY DEFINER` que valida o código e insere a `membership`. Sem e-mail, sem SMTP.

### 1.3 Auth e sessão

- Páginas `/login` e `/cadastro` — e-mail/senha (magic link como segunda opção)
- Middleware global de rota protegida (o `@nuxtjs/supabase` já traz `redirectOptions`)
- Store Pinia `useSpaceStore`: espaço ativo persistido em `localStorage`, com seletor no header
- Composable `useSpaceQuery` que injeta o `space_id` ativo nas queries — assim nenhum componente
  de módulo precisa saber que multi-tenancy existe

### 1.4 Shell responsivo

- Layout `default`: **bottom tab bar no mobile**, sidebar no desktop (mesmo componente, breakpoint)
- Registro de módulos em um único arquivo (`app/modules.ts`: slug, rótulo, ícone, rota, habilitado) —
  padrão emprestado do LifeForge. Adicionar módulo = uma entrada nesse array
- Tema claro/escuro, safe-area do iOS, `pt-BR` como idioma
- Páginas placeholder para os 7 módulos, para o esqueleto ser navegável desde o dia 1

### 1.5 PWA

- Manifest (nome, ícones 192/512/maskable, `display: standalone`, `theme_color`)
- Service worker com precache do shell
- Meta tags iOS (`apple-mobile-web-app-capable`, `apple-touch-icon`)
- **Nota honesta:** no iOS o push web só funciona se o app for instalado na tela de início. Se
  notificação confiável virar requisito, o caminho é empacotar com Capacitor depois — por isso
  evitamos qualquer API exclusiva de browser no core.

---

## Fase 2 — Filmes/Séries (motor de catálogo)

Migration `0002_catalog.sql`:

```
media_item(id, tipo, fonte, fonte_id, titulo, ano, capa_url, metadados jsonb,
           unique(fonte, fonte_id))          -- catálogo GLOBAL, sem space_id
entry(id, space_id, media_item_id, added_by, created_at, unique(space_id, media_item_id))
rating(id, entry_id, user_id, status check('quero','vendo','visto','abandonei'),
       nota int check(0..10), resenha, visto_em, unique(entry_id, user_id))
collection(id, space_id, nome, icone)
collection_item(collection_id, entry_id)
```

Três pontos que valem a atenção:

- `media_item` é **global e sem `space_id`** (RLS = leitura para qualquer autenticado). Se você e
  ela adicionarem o mesmo filme, é a mesma linha — não duplica catálogo.
- `rating` é **por usuário**, não por espaço. É isso que dá de graça o "eu dei 8, ela deu 5", que é
  a parte divertida do app de casal.
- `collection` é genérica sobre `entry`, não sobre filme. Quando entrarem livros e músicas, a
  mesma tabela serve — igual ao que o Ryot faz.

TMDB fica atrás de rotas de servidor Nuxt (`server/api/tmdb/search.get.ts`,
`server/api/tmdb/[tipo]/[id].get.ts`) para a chave **não** ir para o client.

Telas: busca com poster grid, detalhe do item com avaliação lado a lado dos dois, lista
"Para assistir" e lista "Vistos". Referência visual: Letterboxd.

---

## Verificação

Sem testes automatizados nesta fase — o que importa é validar o isolamento de dados e o
funcionamento no celular de verdade:

1. `npm run dev` → `http://localhost:3000` sobe sem erro de console
2. **Teste de RLS (o crítico):** criar dois usuários no Supabase Studio. Com o token do usuário B,
   consultar as tabelas do espaço do usuário A — deve retornar vazio, não erro de permissão.
   Depois aceitar o convite e reconsultar: agora os dados aparecem. Faço isso via SQL Editor com
   `set request.jwt.claims`.
3. **Recursão:** um `select` em `membership` deve retornar em milissegundos, não estourar
   `infinite recursion detected in policy`.
4. **Mobile real:** `npm run dev -- --host`, abrir no celular pela rede local, instalar na tela de
   início, verificar bottom bar, safe area e funcionamento offline do shell.
5. **Lighthouse** → aba PWA: instalável, sem erro de manifest.
6. Fase 2: buscar "Interestelar", adicionar, avaliar com os dois usuários, confirmar que as duas
   notas coexistem na mesma tela.

## Fora de escopo por enquanto

Orçamento, livros, músicas, viagens, objetivos, treinos, Pingos e integrações (Spotify, Pluggy,
Google Books) ficam para as fases seguintes. Os motores construídos aqui é que os tornam baratos.
