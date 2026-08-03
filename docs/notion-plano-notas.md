# Plano — Componente de Notas (o editor de documentos do app)

> Documento de planejamento, para colar no Notion antes de implementar. É a base
> do [plano de Interesses](./notion-plano-interesses.md) — este documento é a
> ferramenta, aquele é o primeiro uso dela.

## Por que separar isto do módulo de Interesses

Escrever livremente vai aparecer em vários lugares: o Interesse ("o que eu quero e por quê"),
a resenha longa de um livro, o roteiro de uma viagem, o registro de um objetivo. Se o editor
nascer dentro de Interesses, o segundo lugar que precisar dele vai copiar e colar o código —
e a partir daí as duas cópias divergem.

Então: **um componente de Notas**, genérico, e Interesses é só o primeiro a usá-lo. É o mesmo
raciocínio das três primitivas já documentadas em `notion-arquitetura.md` (espaço, catálogo,
série temporal): resolver a forma uma vez e vestir por cima.

## A referência é o Notion, mas o alvo não é clonar o Notion

O que dá para ter, e vale a pena:

- Escrever direto na página, sem "modo de edição" e botão de salvar — o texto salva sozinho
- Blocos: título, parágrafo, lista, checklist, citação, código, divisória
- Atalhos de Markdown enquanto digita (`# ` vira título, `- ` vira lista, `[] ` vira checkbox)
- Menu de barra (`/`) para inserir um bloco sem tirar as mãos do teclado

O que **não** vale a pena tentar copiar do Notion (e é bom deixar isso escrito antes de
começar, porque a tentação vem no meio do caminho): banco de dados dentro da página, blocos
arrastáveis, colunas, páginas dentro de páginas, edição simultânea com o cursor da outra
pessoa aparecendo. Cada um desses é um projeto inteiro por si só.

## Decisão de formato: Markdown como fonte da verdade

O documento é guardado como **texto Markdown**, não como uma árvore de blocos em JSON.

- É legível fora do app — dá para copiar para o Notion, colar num e-mail, versionar
- Se um dia trocarmos o editor, o conteúdo continua válido; com JSON proprietário, não
- É o formato que este projeto já usa para tudo que é documentação

O custo honesto: recursos que Markdown não representa (largura de coluna, cor de bloco) ficam
fora. Aceitável — nenhum deles está no escopo acima.

## Escolha do editor: usar biblioteca, não escrever do zero

Um editor rich text feito à mão parece simples até o primeiro `contenteditable` com seleção
entre blocos, colar do Word, e desfazer/refazer. Isso é anos de casos de borda.

**Tiptap** (baseado em ProseMirror) é o candidato: tem pacote oficial para Vue 3, tem os
atalhos de Markdown prontos, e serializa para Markdown. A avaliar na hora de implementar:
peso no bundle (importa para um PWA que roda no celular) e se o modo somente-leitura é leve o
bastante para a visualização.

Alternativa mais barata, se o peso incomodar: um `<textarea>` de Markdown com pré-visualização
lado a lado. Perde o "escrever direto na página", mas entrega 80% do valor por 10% do esforço
— e vale considerar como primeira versão.

## Modelo de dados proposto

```
nota(
  id, space_id, criado_por,
  titulo text,
  conteudo text,              -- Markdown
  icone text,                 -- emoji, como no Notion
  atualizado_em timestamptz,
  atualizado_por uuid,
  created_at
)
```

RLS igual ao resto: `is_space_member(space_id)` para ler e escrever. No espaço pessoal a nota
é sua; no de casal, dos dois.

O vínculo com outros módulos (um Interesse tem uma nota, uma viagem tem uma nota) fica no
**outro lado** — `interesse.nota_id` aponta para cá, e não `nota.interesse_id`. Assim `nota`
não precisa saber quem a usa, e cada módulo novo não pede uma coluna nova aqui.

## Salvamento automático: o ponto que decide se a experiência é boa

Salvar a cada tecla é abuso de rede e de cota. Salvar só ao sair da página perde texto.
O caminho é **debounce** (uns 800 ms parado = salva), mais um salvamento ao trocar de página,
e um indicador discreto de "salvando… / salvo" para a pessoa nunca ficar na dúvida.

**Conflito entre as duas pessoas:** se os dois abrirem a mesma nota, o último a salvar
sobrescreve o outro — sem aviso. Para um casal isso é raro, mas é uma perda de dados
silenciosa, que é o pior tipo. Mitigação barata para a primeira versão: guardar
`atualizado_em` e, se o valor no banco for mais novo que o que o cliente carregou, recusar o
salvamento e avisar ("a outra pessoa editou esta nota; recarregue"). Edição simultânea de
verdade (CRDT) está fora de escopo.

## Fases de implementação

1. Schema `nota` + RLS, e um CRUD simples com `<textarea>` — prova o fluxo de ponta a ponta
2. Trocar o textarea pelo editor de blocos, mantendo Markdown como o que vai para o banco
3. Salvamento automático com debounce, indicador de estado e a checagem de `atualizado_em`
4. Menu `/` e atalhos de Markdown
5. Modo somente-leitura, para embutir uma nota dentro de outra tela

## Fora de escopo por enquanto

- Edição simultânea com cursores (CRDT, Yjs e afins)
- Anexar imagens dentro da nota — depende do Storage, que o
  [plano de Stories](./notion-plano-stories-timeline.md) resolve primeiro
- Histórico de versões da nota
- Busca full-text no conteúdo das notas (vale quando houver muitas)
