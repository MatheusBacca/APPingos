# Bem-vindo(a) ao APPingos 💛

Este é o nosso app: orçamento, filmes e séries, livros, músicas, viagens, objetivos e treinos —
de casal e pessoal, num lugar só. Instalável como app no Android e no iOS.

Esta página junta tudo o que você precisa para entrar no projeto: os acessos, o que cada
ferramenta faz, e como rodar na sua máquina.

---

## 1. Seus acessos

Aceite os quatro convites abaixo. Cada um é uma peça diferente do projeto.

| Ferramenta | Para que serve | Convite |
| --- | --- | --- |
| **Notion** | Onde vivem os planos, as decisões de arquitetura e o changelog. Comece por aqui. | 🔗 *(cole o link aqui)* |
| **GitHub** | O código. Repositório **privado** — sem o convite você não consegue nem ver. | 🔗 *(cole o link aqui)* |
| **Supabase** | Banco de dados, login dos usuários e as regras de acesso. | 🔗 *(cole o link aqui)* |
| **Vercel** | Onde o app fica publicado, e de onde saem os deploys automáticos. | 🔗 *(cole o link aqui)* |

> **Para quem está montando esta página:** os quatro links são gerados na hora, cada um no
> painel da sua ferramenta. O passo a passo está no final, em *Como gerar cada convite*.

**Depois de aceitar tudo, me avise** — alguns acessos precisam de um ajuste do meu lado para
ficarem completos.

---

## 2. O que é o projeto, em um minuto

A ideia central: **nenhum dado pertence a um usuário — pertence a um espaço.** Cada pessoa tem
um espaço "Pessoal", e o casal tem um espaço compartilhado. É o mesmo código rodando nos dois;
muda só o espaço ativo. É isso que faz "meus gastos" e "nossos gastos" não serem duas telas
diferentes.

Em cima disso, os módulos se repetem em cima de poucas primitivas em vez de cada um inventar
o seu schema. Está tudo explicado em **Arquitetura do APPingos** (a página de arquitetura aqui
no Notion) — vale ler antes de mexer no código.

**Stack:** Nuxt 4 (Vue 3), Tailwind v4, shadcn-vue, TanStack Query · Supabase (Postgres, Auth,
RLS) · PWA · deploy na Vercel.

---

## 3. Rodando na sua máquina

```bash
git clone https://github.com/MatheusBacca/APPingos.git
cd APPingos
npm install
```

Depois, crie um arquivo `.env` a partir do `.env.example` que está no repositório. Ele
**nunca** vai para o Git — vou te passar os valores por um canal privado (não por esta página,
nem pelo Notion).

```bash
npm run dev
```

O `README.md` do repositório tem o resto: como subir o Supabase local com Docker, como criar
uma migration, e o fluxo de deploy.

---

## 4. As três regras que evitam dor de cabeça

1. **Nunca alterar o banco pelo Table Editor da nuvem.** Sempre por migration versionada
   (`npx supabase migration new`). Editar direto no painel cria uma diferença silenciosa entre
   o banco real e o que está no Git — e aí ninguém mais sabe qual é a verdade.
2. **`npm run typecheck` antes de subir.** O `build` passa mesmo com variável inexistente no
   template (o Vue avalia como `undefined` e não reclama). Já perdemos tempo com isso.
3. **Build passando não é app funcionando.** Exercite o fluxo de verdade no navegador. Os bugs
   que mais nos custaram foram todos invisíveis para o build — eram de RLS, de relacionamento
   no banco, e de cache.

---

## 5. Por onde começar

1. Ler a página de **Arquitetura** aqui no Notion
2. Rodar o app localmente e criar uma conta de teste
3. Dar uma volta pelo módulo de **Filmes & Séries** — é o mais completo, e serve de modelo
   para os próximos
4. Olhar o **Changelog** para ver o que foi feito e as decisões pelo caminho

Qualquer dúvida, me chame. É mais rápido perguntar do que adivinhar. 🙂

---

## Como gerar cada convite

*(Esta seção é um lembrete de configuração — pode apagar antes de compartilhar a página.)*

**Notion** — Abra a página principal do projeto → botão **Share** (canto superior direito) →
digite o e-mail da pessoa e escolha o nível de acesso (*Can edit* para colaborar de verdade) →
**Invite**. Para um link geral: **Copy link**, mas confira em *Share* se ele está aberto a
quem tem o link ou só a convidados.

**GitHub** — `github.com/MatheusBacca/APPingos` → **Settings** → **Collaborators** →
**Add people** → usuário ou e-mail → permissão **Write**. O convite chega por e-mail e expira
em 7 dias.

**Supabase** — [supabase.com/dashboard](https://supabase.com/dashboard) → selecione a
organização (não o projeto) → **Team** → **Invite** → e-mail + papel (*Developer* dá acesso ao
banco sem deixar apagar a organização).

**Vercel** — [vercel.com/dashboard](https://vercel.com/dashboard) → **Settings** do time →
**Members** → **Invite**. Atenção: no plano **Hobby** (o gratuito) não dá para adicionar
membros ao time. Se for o caso, as opções são migrar para o plano Pro ou a outra pessoa
acessar o projeto pelo próprio GitHub, já que o deploy é automático a partir dele — na
prática, ver os logs de deploy é o único acesso que faz falta.

**O que não vai nesta página:** o conteúdo do `.env` (chaves do Supabase e do TMDB). Mesmo com
a página privada, chave em documento compartilhado acaba vazando por print, por link
reencaminhado ou por um export. Passe por um canal privado.
