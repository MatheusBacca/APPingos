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
