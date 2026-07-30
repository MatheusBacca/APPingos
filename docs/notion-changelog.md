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

## 2026-07-30 — Infraestrutura: Docker local, GitHub, Vercel

**Contexto:** fechar o ciclo operacional para trabalhar também do computador de casa, publicar
o app de graça, e ter um jeito confiável de operar o Supabase no dia a dia.

**Feito:**
- Descoberto que o Docker Desktop já estava instalado, só parado — sem instalação necessária
- `supabase init` + `supabase start` + `supabase db reset`: as duas migrations validadas pela
  primeira vez contra um Postgres real
- Primeiro commit do projeto e push para
  [github.com/MatheusBacca/APPingos](https://github.com/MatheusBacca/APPingos) (privado)
- README atualizado com o fluxo Docker → local → cloud, e a seção de trabalhar de mais de um
  computador
- Deploy configurado no Vercel (Hobby, gratuito), com variáveis de ambiente e URL de redirect
  do Supabase ajustada para o domínio de produção
- Estes dois documentos criados para colar no Notion

**Decisões:**
- GitHub privado na conta pessoal (não a da WeON)
- Docker/Supabase local para validar migrations e RLS antes de qualquer `db push` na nuvem —
  a nuvem continua sendo o banco real do casal
- Regra fixada: nunca editar schema direto pelo Table Editor da nuvem — sempre por migration
  versionada, testada local primeiro

**Próximos passos sugeridos:** módulo de Orçamento (segundo motor: série temporal com meta).
