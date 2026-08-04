# Plano — Módulo de Elogios

> Documento de planejamento, para colar no Notion antes de implementar. Ainda não existe
> nenhum código deste módulo.

## Por que

Todo módulo do app hoje registra **consumo** (o filme que viram) ou **intenção** (o que
querem fazer). Nenhum registra o que o casal já viveu de bom um pelo outro — um elogio dito de
passagem, uma boa ação, uma lembrança boa que merece ficar escrita em algum lugar antes de se
perder. É o módulo mais "de relação" e menos "de gestão" do app, no mesmo espírito do módulo
de [Jogos](./notion-plano-jogos.md): o valor está no momento registrado, não numa métrica.

## O que é um Elogio

- Um **autor** — quem escreve
- Um **destinatário**, opcional — sobre qual integrante do espaço é. Vazio significa "sobre
  nós dois"/"sobre o espaço", para memórias que não são de uma pessoa só
- Um **tipo** — elogio, boa ação ou memória, para dar cor e filtro ao feed sem virar
  categorização rígida
- Um **texto** — geralmente curto, um parágrafo
- Uma **data do fato**, opcional — quando aconteceu, se for diferente de quando foi
  registrado; "não lembro" é um estado válido, do mesmo jeito que já existe em Filmes

## Modelo de dados proposto

```
elogio(
  id, space_id, autor_id,
  sobre_user_id uuid null,   -- null = sobre o espaço/os dois; preenchido = sobre esse membro
  tipo text,                 -- 'elogio' | 'boa_acao' | 'memoria'
  texto text,
  aconteceu_em date null,    -- quando aconteceu, se souber
  created_at
)
```

RLS igual ao resto: `is_space_member(space_id)` para ler e escrever. `tipo` é texto com CHECK,
não enum — o mesmo padrão de `status`/`papel`/`destino` já usado no projeto, para um quarto
tipo no futuro ser uma constraint nova, não uma migração de tipo.

**Por que o texto é uma coluna própria, e não um vínculo à tabela `nota`** (como Interesses
faz): lá o texto tende a ser longo e estruturado — o "porquê" de uma ideia. Aqui tende a ser
curto, uma ou duas frases. Se no futuro aparecer o caso de um elogio longo (uma carta), vale
reconsiderar o vínculo — mas começar simples evita arrastar o editor de blocos para um módulo
que não precisa dele ainda.

## Tela

- **Feed**, mais recente primeiro, com filtro por pessoa e por tipo. Cada card mostra autor,
  destinatário (ou "sobre nós"), o ícone do tipo, o texto e a data do fato quando houver
- **Novo elogio**: formulário simples — destinatário, tipo, texto, data opcional. Um
  `<textarea>`, sem editor rico; o caso de uso não pede formatação

Entra no registro de módulos (`app/modules.ts`), como os outros. Conecta bem com a ideia do
[painel lateral](#) discutida antes: um widget "elogio mais recente" ali é praticamente de
graça, já que o feed inteiro já vive no cache do TanStack Query por espaço.

## Fases de implementação

1. Schema `elogio` + RLS
2. Feed cronológico + formulário de criação
3. Filtro por pessoa e por tipo
4. Widget do elogio mais recente no painel lateral (opcional, depende do painel existir)

## Fora de escopo por enquanto

- Reações/curtidas no elogio de alguém
- Notificação push ao receber um elogio — depende de push web funcionar de forma confiável,
  que `notion-arquitetura.md` já registra como limitado no iOS
- Anexar foto ao elogio — depende de onde o app guarda mídia, que é exatamente a decisão do
  [plano de Google Drive](./notion-plano-google-drive.md)/[plano de Stories](./notion-plano-stories-timeline.md)
