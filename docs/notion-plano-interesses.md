# Plano — Módulo de Interesses

> Documento de planejamento, para colar no Notion antes de implementar. Depende do
> [componente de Notas](./notion-plano-notas.md), que é a ferramenta de escrita que este
> módulo usa.

## Por que

Toda ideia começa vaga: "queria trocar o sofá", "e se a gente fosse pro Chile em setembro",
"acho que dá pra economizar no mercado". Hoje isso não tem lugar nenhum no APPingos — os
módulos existentes esperam que a ideia já esteja madura (um objetivo tem meta e prazo, uma
viagem tem roteiro).

Interesses é o **antes disso**: o lugar de registrar a ideia crua, escrever o que se quer e
por quê, e deixar marcado a que módulo ela pertence. Quando amadurecer, vira um objetivo, um
registro de orçamento, um planejamento de viagem — sem perder o texto que explicava a
intenção original.

## O que um Interesse é

- Um **título** ("Trocar o sofá")
- Um **destino**: para qual módulo isso aponta — Projeto, Compra, Viagem, Orçamento, Objetivo
- Uma **nota** (o componente de Notas): a descrição livre — o que é, por que interessa, o que
  já foi pesquisado, links, o que falta decidir
- Um **estado**: rascunho → amadurecendo → convertido → arquivado

O estado importa porque a maioria das ideias não vira nada, e tudo bem. "Arquivado" precisa ser
um destino de primeira classe, não um fracasso escondido.

## Modelo de dados proposto

```
interesse(
  id, space_id, criado_por,
  titulo text,
  destino text,          -- 'projeto' | 'compra' | 'viagem' | 'orcamento' | 'objetivo'
  estado text,           -- 'rascunho' | 'amadurecendo' | 'convertido' | 'arquivado'
  nota_id uuid,          -- referencia nota(id); o texto livre mora lá
  convertido_em timestamptz,
  convertido_tipo text,  -- qual módulo recebeu
  convertido_ref_id uuid,
  created_at
)
```

Duas decisões dentro disso:

- **O texto não fica aqui.** `nota_id` aponta para a tabela `nota`; o editor não sabe que
  Interesses existe, e o próximo módulo que precisar escrever texto reusa o mesmo componente
  sem tocar nesta tabela.
- **`destino` é texto com CHECK, não enum.** É o mesmo padrão de `status`/`papel` já usados no
  projeto: acrescentar um destino novo é alterar a constraint, não fazer migração de tipo.

RLS: `is_space_member(space_id)`, como todo o resto.

## A conversão, que é o ponto do módulo

Converter um Interesse **não apaga nada**. Cria o registro no módulo de destino, grava
`convertido_ref_id` de volta no interesse, e marca `estado = 'convertido'`. O interesse
continua existindo, agora como o "de onde isso veio" — e a nota original fica anexada ao que
nasceu dela.

Como os módulos de destino ainda não existem (Objetivos, Orçamento e Viagens estão como "em
breve" hoje), a conversão entra por último. **Enquanto isso, o módulo já vale sozinho**: uma
lista de ideias com texto, agrupada por destino, é útil antes de qualquer conversão existir.
Isso é de propósito — evita que o módulo fique bloqueado esperando três outros.

## Tela

- **Lista**, agrupada por destino (ou filtrável por estado), com título e as primeiras linhas
  da nota
- **Detalhe**: título editável, seletor de destino, seletor de estado, e a nota ocupando a
  maior parte da tela — é onde a pessoa passa o tempo
- Botão **"Converter em…"**, desabilitado com explicação enquanto o módulo de destino não
  existir

Entra no registro de módulos (`app/modules.ts`), como os outros.

## Fases de implementação

1. Esperar (ou fazer junto) a fase 1 do componente de Notas — sem editor não há módulo
2. Schema `interesse` + RLS
3. Lista e detalhe, com destino e estado, e a nota embutida
4. Filtros e agrupamento por destino
5. Conversão — um destino de cada vez, conforme os módulos forem existindo

## Fora de escopo por enquanto

- Converter para módulos que ainda não existem (é a fase 5, não a 1)
- Lembretes ou prazos no interesse — prazo é característica de objetivo; se a ideia já tem
  prazo, ela já amadureceu e deveria ter sido convertida
- Compartilhar um interesse fora do espaço
- Votação/priorização entre os dois ("qual ideia atacamos primeiro") — tentador, mas é outro
  módulo; vale registrar como ideia futura em vez de embutir aqui
