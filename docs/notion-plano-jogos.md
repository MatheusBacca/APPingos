# Plano — Módulo de Jogos

> Documento de planejamento, para colar no Notion antes de implementar. Ainda não existe
> nenhum código deste módulo.

## Por que

Todo módulo do APPingos hoje é sobre **registrar** algo — o que viram, o que gastaram, para
onde vão. Jogos é diferente: é sobre **um momento juntos**, sem produzir histórico nenhum no
fim. É a peça mais "de casal" e menos "de gestão" do app, e o pedido veio com um diferencial
claro: em vez de só oferecer perguntas prontas, o casal **escreve as próprias**.

Dois jogos para começar — **Verdade ou Desafio** e **Eu Nunca** — mas o módulo nasce pensado
para receber um terceiro, um quarto, sem reescrever nada: a mesma "carta" serve para qualquer
jogo de perguntas/afirmações.

## O que já existe que ajuda

- O padrão de **catálogo global + conteúdo do espaço** (`media_item` sem `space_id` +
  `entry` com `space_id`, ver `notion-arquitetura.md`) é quase exatamente o que este módulo
  precisa: um baralho padrão que todo mundo vê, mais cartas próprias que só o espaço vê. Aqui
  não precisa nem de uma segunda tabela — um `space_id` **anulável** na própria carta resolve:
  `null` é baralho padrão, preenchido é carta do casal.
- RLS por `is_space_member(space_id)`, o mesmo de sempre.
- Módulo registrado em `app/modules.ts`, como os outros.

## Decisão central: sem sessão no banco

Um jogo de Verdade ou Desafio é jogado **num aparelho só, passando de mão em mão** — não é um
estado que precisa sincronizar entre o celular dela e o dele em tempo real, como aconteceria
num app pensado para jogar cada um no seu dispositivo. Por isso a "partida" (baralho
embaralhado, carta atual, o que já saiu) **vive só no estado do componente**, não no banco.

Isso significa: nenhuma tabela de "sessão" ou "rodada", nenhuma sincronização, nenhuma
complexidade de realtime. O único dado que persiste é o **conteúdo das cartas** — que é
justamente o que o casal quer poder editar e manter entre uma partida e outra.

**Se um dia dois dispositivos precisarem jogar sincronizados** (cada um vê a própria vez na
tela), isso é uma sessão de verdade, com Supabase Realtime — fica registrado como evolução
possível, não como parte deste plano (ver "fora de escopo").

## Modelo de dados proposto

```
carta(
  id, space_id,       -- NULL = baralho padrão (todo espaço vê); preenchido = carta do casal
  jogo text,          -- 'verdade_ou_desafio' | 'eu_nunca'
  tipo text,          -- 'verdade' | 'desafio' — só usado quando jogo = 'verdade_ou_desafio'
  texto text,
  criado_por uuid,    -- null no baralho padrão
  ativa boolean,       -- desativar sem apagar, para uma carta que "não colou"
  created_at
)
```

- `jogo` decide para qual tela a carta aparece. Um terceiro jogo no futuro (ex.: "Qual é mais
  provável") é a mesma tabela com um valor novo em `jogo` — nenhuma migration de schema.
- `tipo` só existe para Verdade ou Desafio; em Eu Nunca fica `null` (toda carta ali é a mesma
  forma, uma afirmação).
- RLS: `select` quando `space_id is null or is_space_member(space_id)`. `insert`/`update`/
  `delete` só quando `is_space_member(space_id)` **e** `space_id` não é nulo — ninguém edita o
  baralho padrão pelo cliente; ele é seed, mantido por migration.

## Tela

Uma tela por jogo, com duas partes:

- **Jogar**: baralho embaralhado (padrão + cartas do espaço, misturados), botão "Próxima
  carta". O estado de "o que já saiu nesta partida" vive só na tela — fechar e reabrir começa
  um baralho novo. Em Verdade ou Desafio, a pessoa escolhe Verdade ou Desafio *antes* de puxar
  a carta, e só as cartas daquele tipo entram no sorteio.
- **Minhas cartas**: lista das cartas que o espaço escreveu para aquele jogo, com criar/editar/
  desativar. É aqui que o "vocês escreverem as próprias verdades e desafios" acontece.

Uma tela de seleção de jogo (`/jogos`) lista os jogos disponíveis — o lugar onde um jogo novo
aparece no futuro.

## Fases de implementação

1. Schema `carta` + RLS + seed de um baralho padrão pequeno para os dois jogos (o suficiente
   para jogar sem ter escrito nada ainda — o valor imediato antes do valor de personalizar)
2. Tela de Verdade ou Desafio: jogar com o baralho padrão
3. Tela de Eu Nunca: jogar com o baralho padrão
4. "Minhas cartas" nos dois jogos: criar, editar, desativar
5. Tela `/jogos` de seleção, registrada em `app/modules.ts`

## Fora de escopo por enquanto

- Sessão sincronizada entre dois dispositivos (Realtime) — o pressuposto é um aparelho só,
  passado de mão em mão
- Placar, pontuação ou "quem já jogou mais rodadas"
- Categorias/filtros de intensidade nas cartas (picante, leve, etc.) — se pedirem, é um campo
  a mais em `carta`, não uma mudança de modelo
- Compartilhar um baralho fora do espaço, ou baralhos públicos de outros usuários
- Novos jogos além dos dois pedidos — a tabela já está pronta para eles, mas as telas entram
  uma de cada vez, sob demanda
