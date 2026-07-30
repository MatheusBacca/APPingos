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

**Próximos passos sugeridos:** pegar a chave do TMDB e configurá-la no Vercel; ajustar
Authentication → URL Configuration no Supabase para incluir o domínio do Vercel; módulo de
Orçamento (segundo motor: série temporal com meta).
