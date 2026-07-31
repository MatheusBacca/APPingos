# Plano — Stories e timeline do espaço

> Documento de planejamento, para colar no Notion antes de implementar. Ainda não existe
> nenhum código deste módulo.

## Por que

Todos os módulos de hoje registram **o que o casal consome**: o filme que viram, o livro que
querem ler, quanto gastaram. Nenhum registra **o que eles viveram**. Uma timeline de fotos e
vídeos por espaço é a peça que falta — o álbum compartilhado, dentro do mesmo app onde já
está o resto da vida a dois.

É também o primeiro módulo em que o conteúdo é criado pelos dois, e não importado de uma API
externa. Isso muda o tipo de problema: em vez de "como buscar dados de fora", é "como guardar
arquivos grandes de forma barata e privada".

## Decisão de escopo: as publicações são permanentes

O nome "Stories" descreve o **jeito de capturar** — câmera rápida, tela cheia, um toque para
publicar no espaço — e não a efemeridade.

**Alternativa descartada:** sumir em 24h, como no Instagram. Ela vai contra o resto do app,
que existe justamente para ser memória de longo prazo ("a gente viu esse filme em 2024, você
deu 9"). Uma foto da viagem que se apaga sozinha no dia seguinte é o oposto disso. Além do
custo técnico de uma rotina de expiração que precisa apagar tanto a linha no banco quanto o
arquivo no Storage — e que, se falhar em silêncio, deixa lixo pago acumulando.

Também descartado, por ora, o meio-termo "efêmero com opção de guardar": é o dobro de estados
para modelar e para explicar, sem benefício claro para duas pessoas.

## Storage: bucket privado, isolado por espaço

Supabase Storage, com um bucket **privado** e os arquivos organizados por
`{space_id}/{post_id}/{arquivo}`. As policies do bucket usam a mesma função
`is_space_member(space_id)` que já protege as tabelas — o padrão de isolamento por espaço
vale igual para arquivos, com o `space_id` saindo do primeiro segmento do caminho.

Bucket privado, não público: a entrega é por **URL assinada** (link temporário gerado na hora
de exibir). Bucket público significaria que qualquer pessoa com o link vê a foto para sempre,
inclusive depois de sair do espaço — inaceitável para foto de casal.

## Modelo de dados proposto

Um post pode ter várias mídias (o carrossel), então são duas tabelas:

```
post(
  id, space_id, autor_id,
  legenda text,
  acontecido_em timestamptz,   -- quando a foto foi tirada, não quando subiu
  created_at
)

post_midia(
  id, post_id, ordem int,
  caminho text,                -- caminho no bucket, não URL (a URL é assinada na hora)
  tipo text,                   -- 'foto' | 'video'
  largura int, altura int,     -- para reservar o espaço no layout e evitar o "pulo"
  duracao_seg int              -- só vídeo
)
```

RLS igual à do catálogo: `is_space_member(space_id)` para ler e inserir; apagar, só o autor.
`acontecido_em` separado de `created_at` porque a foto boa da viagem costuma ser publicada
semanas depois — a timeline ordena pelo primeiro.

## Tela

Um módulo novo no `app/modules.ts`, com duas vistas:

- **Timeline:** lista vertical por data decrescente, agrupada por mês, mostrando quem publicou
- **Captura:** botão flutuante que abre a câmera direto (`<input type="file" capture>` no
  celular, que é o que o PWA permite sem app nativo), legenda opcional, publicar

## Pontos a resolver antes de começar

Estes são os que podem inviabilizar ou encarecer a feature, e por isso vêm antes do código:

- **Limite do plano gratuito do Supabase: 1 GB de Storage.** Some rápido com vídeo. Precisa de
  uma decisão consciente: aceitar o teto e mostrar quanto já foi usado, ou orçar o plano pago.
- **Compressão no cliente antes do upload.** Foto de celular moderno tem dezenas de MB; subir
  o arquivo original queima a cota e a franquia de dados à toa. Redimensionar para ~2000px de
  lado maior no navegador (via `canvas`) antes de enviar resolve quase tudo.
- **Vídeo é caro** em armazenamento e em banda de saída. Vale um limite de duração (uns 30s) ou
  deixar vídeo para uma segunda etapa, começando só com foto.
- **Faxina no Storage quando o espaço é excluído.** Esta é a conexão direta com a exclusão de
  espaço que já existe: o `on delete cascade` limpa as **linhas** de `post` e `post_midia`, mas
  **não** os arquivos no bucket — eles ficariam órfãos, ocupando cota para sempre. Vai precisar
  de um passo explícito (uma rota de servidor, ou um trigger que enfileira a remoção) dentro da
  RPC `deletar_espaco`.
- **Ordem de upload e falha no meio.** Publicar 5 fotos e a terceira falhar não pode deixar um
  post pela metade — subir os arquivos primeiro e só criar o `post` no fim é o caminho simples.

## Fases de implementação

1. Bucket privado + policies por espaço, testadas com duas contas
2. Schema (`post`, `post_midia`) com RLS
3. Upload de **foto** apenas: compressão no cliente, upload, criação do post
4. Timeline: listagem com URLs assinadas e placeholder de proporção correta
5. Vídeo, se e quando a cota permitir
6. Faxina do Storage acoplada à exclusão de espaço

## Fora de escopo por enquanto

- Reações e comentários nos posts
- Filtros e edição de imagem
- Marcar pessoas ou lugares num post (o gancho natural aqui é o módulo de Lugares —
  ver `notion-plano-lugares-tour-curitiba.md`)
- Backup ou exportação do álbum
