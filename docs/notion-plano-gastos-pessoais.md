# Plano — Gastos pessoais em Orçamentos

> Documento de planejamento, para colar no Notion. **Implementado em 07/08/2026** — as seis
> fases do fim do documento estão no código. O texto continua no tempo do plano de propósito:
> é o registro do que foi decidido e por quê, não a documentação do que existe.

## Por que

Hoje o módulo de Orçamentos responde bem a uma pergunta: **quanto o casal gastou e quem deve
a quem**. Ele não responde à outra pergunta que a pessoa faz no mesmo minuto: **quanto eu
gastei**. Um lanche no meio da tarde, uma assinatura, um presente para a outra pessoa — nada
disso é rateável, e lançar no espaço de casal ou distorce o acerto do mês, ou estraga a
surpresa.

O espaço pessoal de cada um já existe desde a fundação e já aceita compras. O que falta é
poder **ver as duas coisas na mesma tela** — o compartilhado e o meu — e poder **lançar um
gasto pessoal sem trocar de espaço**, porque na hora de digitar você está no espaço do casal,
e trocar de espaço só para lançar é o atrito que faz a pessoa desistir e lançar errado.

## Decisão central: gasto pessoal é uma compra no espaço pessoal

Não é uma flag em `compra` dentro do espaço compartilhado.

O caminho da flag (`compra.pessoal boolean`, invisível para a outra pessoa) parece mais
simples de ler — uma consulta só — e é onde o desenho costuma dar errado. Ele exigiria uma RLS
com visibilidade por linha dentro de um espaço que hoje é "todos os membros veem tudo", e todo
agregado do módulo (o total do mês, o `SaldoDoMes`, o `acerto_mes`, o painel de resumos, o
gráfico) passaria a precisar lembrar de excluir aquelas linhas. Um esquecimento em qualquer um
deles não dá erro: **vaza o valor do presente para quem vai recebê-lo**, em silêncio.

Com a compra no espaço pessoal, a privacidade não depende de ninguém lembrar de filtrar. O
espaço pessoal tem um membro só, e `is_space_member(space_id)` — a policy que já existe — é o
que impede a outra pessoa de ver a linha. Não há caminho de código que vaze, porque não há
linha para vazar.

**Consequência: nenhuma migration.** Todo o schema, RLS, triggers e RPCs de
`20260804180000_orcamento_compras.sql` servem como estão:

- `registrar_compra(p_space, ...)` já recebe o espaço como parâmetro — lançar no pessoal é
  passar o id do espaço pessoal em vez do ativo.
- O trigger `validar_compra` exige que `pago_por` seja membro do espaço: você é membro do seu
  pessoal, então passa.
- `atualizar_compra` deriva o espaço da própria linha (`select c.space_id ... where c.id =
  p_compra`) — editar um gasto pessoal estando em outro espaço funciona sem tocar em SQL.
- `obter_ou_criar_categoria` é por espaço, então o pessoal tem a sua própria lista de
  categorias. É o comportamento certo: "Presentes" no seu pessoal não precisa aparecer no
  autocomplete do casal.

As fases 1 a 4 abaixo são, portanto, **só de frontend**.

## O que precisa mudar na camada de dados do app

O único obstáculo real é arquitetural, não de banco: hoje `useSpaceQuery` amarra toda consulta
ao **espaço ativo** do store, de propósito ("nenhum módulo precisa saber que multi-tenancy
existe"). Ver duas coisas em paralelo quebra esse pressuposto pela primeira vez no app.

Proposta: inverter a dependência em vez de furá-la.

```
useEspacoQuery(spaceId, chave, fn)     // espaço explícito — a primitiva
useSpaceQuery(chave, fn)               // wrapper: passa o espaço ativo do store
```

`useSpaceQuery` continua sendo a única coisa que 99% do app usa, e continua sem saber de
multi-tenancy. Quem precisa de um segundo espaço na mesma tela — só Orçamentos, por enquanto —
pede explicitamente. O mesmo par para `useSpaceMutation`/`useEspacoMutation`, porque lançar um
gasto pessoal de dentro do espaço do casal precisa invalidar o cache **do espaço pessoal**, e
não o do ativo. Errar isso tem sintoma claro: a compra é gravada e não aparece na lista.

O id do espaço pessoal não custa consulta nova: `useSpaceStore().espacos` já traz todos os
espaços com `tipo`, então é `espacos.find(e => e.tipo === 'pessoal')`.

## Tela

**O botão.** "Gastos pessoais" no cabeçalho da aba Chico Moedas, ao lado da navegação de mês —
um alternador de estado (não um link), com a escolha persistida em `localStorage`
(`appingos:orcamentos:gastos-pessoais`), no mesmo espírito do espaço ativo. Quando o espaço
ativo **é** o pessoal, o botão não aparece: você já está vendo só os seus gastos, e um
alternador que não altera nada é pior que a ausência dele.

**Dois totais, nunca um só.** É o ponto mais fácil de errar. Com o botão ligado, a tela passa a
mostrar duas leituras que não se somam:

- **Gasto do espaço** — o que existe hoje. Rateável, entra no `SaldoDoMes` e no acerto do mês.
- **Meu bolso** — a minha parte do compartilhado *mais* os meus gastos pessoais. É a resposta
  a "quanto eu gastei em agosto", e não é um número que a outra pessoa vê.

Somar tudo num "total do mês" só produziria um número que não significa nada: metade dele é
dívida dividida, metade é gasto individual.

**A lista.** Uma lista só, em ordem de data — dois blocos separados obrigariam a pessoa a
juntar as datas de cabeça. Cada compra pessoal leva um selo "Pessoal" e a borda pontilhada,
para o pertencimento ser lido de relance. Ao lado do selo, na primeira vez, a frase que
elimina a dúvida óbvia: *só você vê*.

**O que os gastos pessoais NÃO tocam:** `SaldoDoMes` e `acerto_mes`. Nem quando o botão está
ligado. A outra pessoa não deve nada de um gasto pessoal, e "marcar o mês como acertado" é um
fato sobre a dívida do casal. Deixar o pessoal entrar ali seria mudar o significado do módulo.

**Os gráficos** ficam para depois (fase 5), e por um motivo: "Por mês" compara competências
entre si, e mudar o que a barra mede no meio da comparação inutiliza a comparação. Quando
entrar, entra como **segmento empilhado** na mesma barra — mesma unidade, mesmo eixo, o que
respeita a regra que o módulo já segue ("dois gráficos, duas perguntas; nunca dois eixos no
mesmo plot").

## O diálogo de lançamento

Um alternador no topo do `CompraDialogo`, com dois valores:

| Espaço ativo | Default | Pode trocar? |
| --- | --- | --- |
| Casal (compartilhado) | **Compra compartilhada** | Sim → Compra pessoal |
| Pessoal | Compra pessoal (fixo) | Não — não há com quem dividir |

O default no espaço compartilhado é *compartilhado*, como pedido: é o caso comum de quem está
com o espaço do casal aberto, e o caso em que errar é barato (o rateio aparece na tela dos
dois e alguém corrige). O contrário — pessoal por default — esconderia lançamentos que a outra
pessoa está esperando ver.

Ao escolher **Compra pessoal**, três coisas mudam de uma vez:

1. O destino da gravação passa a ser o espaço pessoal (`p_space`), não o ativo.
2. A seção de rateio **desaparece** — não colapsa vazia: `pago_por` é você e o rateio é
   `[{ você, peso 1 }]`. Um seletor de participantes com uma única opção é ruído.
3. O autocomplete de categoria passa a ler as categorias do espaço pessoal.

**A armadilha, e como sair dela.** Lançar uma compra pessoal com o botão "Gastos pessoais"
desligado grava uma linha que **não aparece em lugar nenhum da tela** — o clássico "salvei e
sumiu", que faz a pessoa lançar de novo. Solução: ao salvar uma compra pessoal, ligar o botão
automaticamente. O toast confirma em que gaveta caiu: *"Lançada nos seus gastos pessoais."*

Editar e remover seguem funcionando de dentro de qualquer espaço, com um cuidado: o
`podeEditar` de hoje mistura "sou o autor" com "sou admin do espaço ativo". Para uma linha
pessoal, ser admin do espaço do casal não significa nada — a permissão é simplesmente *é sua*.

## Invariantes que a implementação tem que preservar

Cada uma delas é uma forma de errar em silêncio, e vale um teste:

1. Nenhuma compra do espaço pessoal entra em `SaldoDoMes`, em `acerto_mes`, nem em qualquer
   número que a outra pessoa veja.
2. "Gasto do espaço" nunca inclui pessoal; "meu bolso" nunca inclui a parte da outra pessoa.
3. Com o botão desligado, a tela é byte a byte o que é hoje — o recurso é aditivo.
4. Lançar um gasto pessoal de dentro do espaço do casal invalida o cache do espaço **pessoal**.
5. Sem espaço pessoal na lista (caso que não deveria acontecer, mas que o store trata), o botão
   não aparece em vez de estourar.

## Fases

1. ✅ `useEspacoQuery`/`useEspacoMutation` com espaço explícito,
   `useSpaceQuery`/`useSpaceMutation` reescritos como wrappers. Refactor sem nenhuma mudança
   visível — o passo que sustenta todos os outros
2. ✅ Botão "Gastos pessoais": lista unificada com selo e os dois totais. Só leitura
3. ✅ `CompraDialogo` com "compra compartilhada / compra pessoal", gravando no espaço pessoal
4. ✅ Editar e remover uma compra pessoal de dentro de outro espaço
5. ✅ Gráficos com o segmento pessoal empilhado, e a leitura em texto separando os dois
6. ✅ Linha "Pessoais" no painel de resumos (só o mês corrente: o painel cabe em três linhas,
   e um mês pessoal fechado não cobra nada de ninguém)

Fases 1–2 já entregam a pergunta "quanto eu gastei"; 3–4 entregam o atrito zero de lançar.

**Uma decisão tomada na implementação, que o plano não previa:** `useRemoverCompra` passou a
receber a compra inteira em vez do id. A linha carrega o `space_id`, e é ele que diz qual cache
limpar — assumir o espaço ativo faria uma compra pessoal removida de dentro do espaço do casal
continuar na tela até um F5.

## Fora de escopo por enquanto

- **Mover uma compra de pessoal para compartilhado** (ou o contrário). Trocar `space_id`
  esbarra no trigger de participante (o rateio antigo aponta para membros de outro espaço) — se
  virar pedido, é uma RPC que apaga e recria, não um `update`
- Ver o gasto pessoal de outro membro. Isto nunca entra: é o ponto do recurso
- Categorias compartilhadas entre o pessoal e o do casal — cada espaço com a sua lista
- Receitas, renda e metas de gasto. São outra função do módulo, outra aba, outro plano
- Gastos pessoais como aba própria em vez de alternador. Foi considerado e descartado: o pedido
  é ver **em paralelo**, e uma aba é justamente o oposto de paralelo
