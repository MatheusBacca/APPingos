# Plano — Agenda com integração ao Google Calendar

> Documento de planejamento, para colar no Notion antes de implementar. Ainda não existe
> nenhum código deste módulo — este é o "por que" e o "como" antes de começar.

## Por que

Hoje três módulos futuros pedem noção de tempo: **Viagens** (roteiro com datas), **Objetivos**
(prazo) e **Treinos** (sessão agendada) — e "convidar para sair"/agendar coisas do dia a dia do
casal não tem lugar nenhum. Em vez de cada módulo reinventar "quando isso acontece", vale a
pena um motor de agenda único, com o Google Calendar como um espelho opcional — porque é onde
vocês dois provavelmente já vivem os compromissos do dia a dia.

Isso é a mesma lógica das outras três primitivas já documentadas em
`docs/notion-arquitetura.md`: em vez de "agenda de viagem", "prazo de objetivo" e "sessão de
treino" serem três coisas diferentes, viram a mesma tabela — um **evento** com data, dono e
espaço — e cada módulo só decide como ele aparece.

## O que já existe que ajuda

- O padrão de **rota de servidor como proxy** (`server/api/tmdb/*`) já resolve "guardar um
  segredo de API e nunca deixá-lo chegar ao browser" — o mesmo padrão serve para o client
  secret do Google.
- O padrão de **RLS por espaço** (`is_space_member`) já resolve "só quem compartilha o espaço
  vê o evento".
- O padrão de **módulo registrado em `app/modules.ts`** já resolve onde a tela entra na
  navegação.

## Decisão central: conectar o Google é por pessoa, não por espaço

Cada um de vocês tem a própria conta Google. "Conectar o Google Calendar" é uma ação de
**usuário**, guardada por `user_id` — não por espaço. Um evento no espaço de casal pode estar
sincronizado com o Google de nenhum, um, ou dos dois ao mesmo tempo.

```
integracao_google(user_id pk, escopo, conectado_em)          -- só o "status", exposto ao client
-- os tokens de verdade ficam numa tabela que a policy de RLS não expõe a `authenticated"
```

O **refresh token nunca deve ser lido pelo client**. Ele só existe para o servidor trocar por
um access token na hora de chamar a API do Google. Duas formas de garantir isso, para decidir
na hora de implementar:

1. Tabela separada sem nenhuma policy de `select` para `authenticated` — só o backend
   (via `service_role`, numa rota de servidor) lê
2. [Supabase Vault](https://supabase.com/docs/guides/database/vault) — guarda o segredo
   criptografado, com uma função seguindo o mesmo padrão `SECURITY DEFINER` já usado em
   `criar_convite`/`resgatar_convite`

## Fluxo de conexão (OAuth)

Não reaproveitar o login do Supabase com Google — login é sobre identidade; isto é sobre
**autorização de acesso à agenda**, um escopo bem mais sensível, e vocês podem querer logar com
e-mail/senha mas ainda assim conectar o Google Calendar depois. Fluxo separado:

1. Botão "Conectar Google Calendar" em Espaços (ou numa futura tela de Configurações da conta)
2. `server/api/google/auth/iniciar.get.ts` monta a URL de autorização do Google e redireciona
3. Usuário autoriza no Google, escopo `https://www.googleapis.com/auth/calendar.events`
   (não pedir o escopo `calendar` inteiro — só eventos, é o suficiente e é menos sensível)
4. `server/api/google/auth/callback.get.ts` troca o `code` por `access_token` +
   `refresh_token`, guarda o refresh token, redireciona de volta pro app
5. Rotina de refresh: toda chamada à API do Google passa por uma função de servidor que troca
   o refresh token por um access token novo se o guardado expirou (~1h de validade)

## Pegadinha do Google a resolver antes de começar: verificação de app

O escopo de Calendar é **sensível** — apps públicos que pedem esse escopo passam por um
processo de verificação do Google (branding, vídeo de demonstração, revisão manual). Para uso
de duas pessoas isso não vale a pena. **O app deve ficar em modo "Testing" no Google Cloud
Console**, com as duas contas Google (a sua e a da sua parceira) cadastradas como *test users*
— nesse modo o token nunca expira por falta de verificação e o fluxo funciona normalmente,
sem passar pela revisão do Google. Isso é uma configuração no Google Cloud Console, não código.

## Modelo de dados proposto

```
evento(
  id, space_id, criado_por,
  titulo, descricao, local,
  inicio timestamptz, fim timestamptz, dia_inteiro bool,
  modulo text,              -- 'livre' | 'viagem' | 'objetivo' | 'treino' (de onde veio)
  modulo_ref_id uuid,       -- entry/objetivo/treino relacionado, se houver
  google_event_id text,     -- preenchido só se sincronizado
  google_calendar_id text
)
```

- `evento` sem `google_event_id` = evento só do APPingos, nunca sincronizado (padrão)
- Ao marcar "sincronizar com o Google", uma rota de servidor cria o evento via API e grava o id
  retornado — dali em diante, editar no APPingos atualiza também no Google (`PATCH`)
- **V1 é push, não pull**: o APPingos manda para o Google; não tenta ler a agenda pessoal do
  Google inteira para misturar na tela (isso é sincronização de duas vias com resolução de
  conflito — complexo demais para o primeiro corte, ver "fora de escopo")

## Tela

Um novo módulo **Agenda**, com vista de mês (grid simples, sem lib pesada — dá para montar só
com Tailwind + um composable de datas) e vista de lista. Cada evento mostra quem criou e um
badge se está sincronizado com o Google de alguém. Viagens/Objetivos/Treinos ganham um botão
"agendar" que cria um `evento` já vinculado (`modulo_ref_id`).

## Plano de implementação em fases

1. **Google Cloud**: criar projeto, ativar Calendar API, configurar tela de consentimento OAuth
   em modo Testing, criar client OAuth (Web), registrar as duas redirect URIs (local e prod)
2. **Schema**: migration com `evento` + a tabela/mecanismo de armazenar o refresh token com
   segurança, RLS por espaço em `evento`
3. **Conexão**: rotas de servidor de início/callback do OAuth, tela de "conectar Google" em
   Espaços, refresh automático do access token
4. **CRUD de evento local**: criar/editar/apagar evento sem Google, tela de Agenda (mês/lista)
5. **Sync com Google**: botão de sincronizar por evento, criando/atualizando via API
6. **Ganchos nos módulos**: botão "agendar" em Viagens/Objetivos/Treinos

## Fora de escopo por enquanto

- Sincronização de duas vias (ler mudanças feitas direto no Google e refletir no APPingos) —
  exigiria webhooks (Google *push notifications* para Calendar) ou polling constante, e
  resolução de conflito quando os dois lados mudam a mesma coisa
- Outlook/iCloud Calendar — Google primeiro, os outros só se realmente fizer falta
- Convites por e-mail via Google Calendar (a API permite, mas é escopo adicional depois)

## Referências

- [Google Calendar API — escolha de escopos](https://developers.google.com/workspace/calendar/api/auth)
- [Verificação de escopos sensíveis](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [Supabase Vault](https://supabase.com/docs/guides/database/vault)
