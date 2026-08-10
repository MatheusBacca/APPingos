# APPingos — Arquitetura e decisões

> Documento estável. Atualizar só quando uma decisão de arquitetura mudar de verdade — o
> dia a dia de progresso vai no changelog, não aqui.

## O que é

Um "life OS" de casal: orçamento, filmes/séries, livros, músicas, viagens, objetivos e
treinos, num único app web responsivo, instalável como PWA no Android e no iOS.

## A ideia central: 7 módulos, 3 motores

Os sete módulos pedidos não são sete apps — eles colapsam em três primitivas de dados.
Construir essas três bem faz com que cada módulo novo vire uma "skin" barata em cima de um
motor já pronto, em vez de um sistema do zero.

1. **Espaço compartilhado** — todo dado pertence a um `space` (pessoal ou de casal), nunca
   diretamente a um usuário. "Meu orçamento" e "o nosso orçamento" são o mesmo código rodando
   em espaços diferentes.
2. **Item de catálogo com avaliação por usuário** — filmes, séries, livros e músicas são a
   mesma forma: um item global + uma nota por pessoa. É daí que sai "eu dei 8, ela deu 5" sem
   nenhum código especial.
3. **Série temporal com meta** — orçamento, treinos e objetivos são todos "registro ao longo
   do tempo + meta". Progresso, streak e gráfico saem de um componente só.

Essa leitura é o porquê de a primeira fase do projeto ter sido só fundação (espaços + RLS)
antes de qualquer tela "de verdade": sem `space_id` desde a primeira migration, todo módulo
escrito antes precisaria ser reescrito depois.

## Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Framework | Nuxt 4 (Vue 3 + Vite) | Vue já é familiar; Nuxt dá rotas por arquivo, SSR opcional e PWA de graça |
| UI | Tailwind v4 + shadcn-vue | Componentes copiados pro repo — dono do código, sem dependência de pacote de UI fechado |
| Dados/Auth | Supabase (Postgres + Auth + RLS) | Postgres puro por baixo (nada de vendor lock-in de verdade); Auth, RLS e Storage prontos evitam meses escrevendo backend de CRUD |
| Estado servidor | TanStack Query | Cache, refetch e invalidação sem reinventar |
| Estado local | Pinia | Só o essencial: qual é o espaço ativo |
| PWA | `@vite-pwa/nuxt` | Manifest + service worker + instalação no celular |
| Deploy | Vercel (Hobby, gratuito) | Preset Nuxt autodetectado, deploy automático a cada push |

**Por que Supabase e não um backend próprio (FastAPI, etc.):** num app de casal, o backend é
~90% CRUD + auth + "avisar o outro quando eu mudo algo". Supabase entrega os três com RLS e
realtime nativos. Se um dia surgir lógica pesada (importar OFX bancário, cruzar dados
externos), dá para somar uma Edge Function ou um serviço à parte — o Postgres continua o
mesmo, então essa porta fica aberta sem reescrever nada.

## O schema, em duas migrations

### `20260730120000_foundation.sql` — espaços

```
profile(id → auth.users, nome, apelido, avatar_url)
space(id, tipo: pessoal|casal, nome)
membership(space_id, user_id, papel: dono|membro)
space_invite(id, space_id, codigo, expira_em, usado_em)
```

O detalhe que importa: uma *policy* de RLS em `membership` que consultasse a própria
`membership` geraria recursão infinita no Postgres. A solução é uma função
`SECURITY DEFINER STABLE` (`is_space_member`) que roda como dono da tabela e ignora RLS só
na consulta interna, rompendo o ciclo. Toda tabela de domínio usa essa função na sua policy.

Um trigger em `auth.users` cria automaticamente o perfil e um espaço pessoal a cada cadastro.
Convite de casal é por código curto de 6 caracteres (sem SMTP): quem convida gera via RPC,
quem entra resgata via outra RPC — nenhuma das duas passa pela policy normal, porque quem
resgata ainda não é membro.

### `20260730130000_catalogo.sql` — motor de catálogo

```
media_item(id, tipo, fonte, fonte_id, titulo, capa_url, metadados)  -- GLOBAL, sem space_id
entry(id, space_id, media_item_id, added_by)                        -- "está na nossa lista"
rating(id, entry_id, user_id, status, nota, resenha)                 -- POR USUÁRIO
collection(id, space_id, nome)                                       -- genérica sobre entry
```

Três decisões que sustentam o motor:

- `media_item` é **global** — se os dois adicionarem o mesmo filme, é a mesma linha, não
  duplica o catálogo.
- `rating` é **por usuário**, não por espaço — a nota de cada um convive na mesma tela.
- `collection` é genérica sobre `entry`, não sobre filme — quando livros e músicas entrarem, a
  mesma tabela de listas serve para todos.

Uma RPC (`adicionar_item`) faz o upsert do item global + a criação do `entry` numa
transação só, e já marca "quero ver" para quem adicionou.

## Módulo Filmes/Séries (primeiro módulo vertical)

Busca via TMDB, atrás de uma rota de servidor (`server/api/tmdb/*`) — a chave da API nunca
chega ao navegador. Três telas: busca com grid de pôsteres, lista agrupada por status
(quero/vendo/visto/abandonei), detalhe com nota em estrelas e resenha lado a lado dos dois
usuários. Referência visual: Letterboxd.

## Padrão de módulos

Um único arquivo (`app/modules.ts`) registra todos os módulos — slug, rótulo, ícone, rota,
se está ativo, se aparece na barra inferior do mobile. A sidebar (desktop), a bottom bar
(mobile) e o dashboard leem todos do mesmo lugar; nenhum tem lista própria. Ativar um módulo
novo é uma linha nesse arquivo mais a página correspondente.

## PWA e mobile

Instalável em Android e iOS via manifest + service worker. Nota importante sobre iOS: o push
web só funciona se o app estiver instalado na tela de início, e mesmo assim tem mais
restrições que no Android. Se notificação confiável virar requisito, o caminho é empacotar
com **Capacitor** depois — por isso o app evita qualquer API exclusiva de navegador no núcleo,
deixando essa porta aberta.

## Projetos de referência (para inspiração visual)

- **[Ryot](https://github.com/IgnisDa/ryot)** — tracker self-hosted de filmes/séries/livros/
  jogos/treinos. Referência para o conceito de *Collections* genéricas e para como um motor
  só se veste de mídias diferentes.
- **[Maybe Finance](https://github.com/maybe-finance/maybe)** — ex-produto comercial
  ($249/ano) hoje open source; referência de UI para o módulo de Orçamento (arquivado, mas o
  design e o schema continuam valendo).
- **[LifeForge](https://github.com/Lifeforge-app/lifeforge)** — life OS self-hosted com
  design modular ("ligue só os módulos que usa"), o padrão que inspirou `app/modules.ts`.
- **Letterboxd** (referência de UI, não open source) — padrão-ouro de catálogo de filmes.
- **Splitwise** (referência de UI) — tela de "quem deve quanto a quem", para o futuro módulo
  de dividir contas.

## Fora de escopo por enquanto

Orçamento, livros, músicas, viagens, objetivos, treinos, o sistema de "Pingos" (gamificação) e
integrações externas (Spotify, Open Library, Pluggy) ficam para as próximas fases. Os motores
já construídos é que tornam essas fases baratas.
