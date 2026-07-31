# Plano — Lugares do Tour O Que Fazer Curitiba

> Documento de planejamento, para colar no Notion antes de implementar. Depende do módulo de
> Viagens/Lugares existir primeiro (ver `docs/notion-arquitetura.md`, "fora de escopo").

## Por que

Dentro do futuro módulo de "lugares para ir" (parte de Viagens, ou um módulo próprio), vale ter
uma aba que mostra os estabelecimentos do Tour O Que Fazer Curitiba do ano vigente, para vocês
navegarem e marcarem interesse — em vez de abrir o app do Tour à parte e depois lembrar de
anotar em algum lugar.

## Descoberta da pesquisa: não existe API pública, e o site principal não lista nada

Antes de planejar como buscar os dados, chequei se dava para buscar de forma simples — a
premissa do pedido era exatamente essa incerteza. Resultado:

- O site oficial (`touroquefazercuritiba.com.br`) **não lista os estabelecimentos**. A home
  mostra só 10 cards de destaque; o texto do próprio site diz que "a lista completa fica no
  app depois do lançamento" — ou seja, os 220+ parceiros vivem só dentro do aplicativo
  (provavelmente falando com uma API própria, não documentada e não pensada para uso externo)
- O `robots.txt` permite crawling e aponta um sitemap (`tourcuritiba.com.br/sitemap.xml`), mas
  o sitemap só tem 4 páginas institucionais (home, obrigado, privacidade, termos) — nenhuma
  página por estabelecimento
- Só encontrei estabelecimentos listados no **blog** `oquefazercuritiba.com.br` (site
  diferente, aparentemente parceiro de conteúdo). Artigos como *"Lugares imperdíveis para
  conhecer com o Tour"* e *"Descubra o melhor de Curitiba com o Tour 2024"* têm estrutura
  HTML previsível — um `<h2>` por estabelecimento, com descrição, às vezes bairro/endereço, e
  o texto do benefício do Tour

**Conclusão prática:** não é uma lista completa dos 220+ parceiros — são só os destaques que o
blog decidiu publicar naquele ano (algumas dezenas, distribuídas em vários posts). É o
suficiente para "navegar sugestões", não para ser um diretório completo do Tour.

## Caminho descartado: engenharia reversa do app

Interceptar o tráfego do aplicativo do Tour para achar a API interna foi cogitado e
descartado — depende de proxy/root no celular, quebra a qualquer atualização do app sem aviso,
e provavelmente viola os termos de uso do serviço. Não vale o risco para um projeto pessoal.

## Abordagem recomendada: scraper do blog + entrada manual como complemento

1. **Scraper dos posts do blog**, rodado manualmente (não em toda visita do usuário — isso
   seria abusivo com o site de terceiros e lento). Um script identifica os posts do ano
   (busca por "Tour" + o ano no blog, ou uma lista de URLs mantida à mão — o blog não parece
   ter uma categoria/tag dedicada e navegável para filtrar programaticamente, então vale
   revisar manualmente quais posts existem a cada ano antes de rodar)
2. Para cada post, extrai por `<h2>`: nome do estabelecimento, texto de descrição
   (categoria/bairro geralmente aparecem no próprio texto, não em campos separados — normalizar
   com um LLM ou heurística simples é mais realista que regex rígido), texto do benefício
3. Resultado vira um `.json` de "captura do ano", revisado à mão antes de importar (o scraper
   não é confiável o bastante para popular direto sem revisão — nomes de bairro dentro de
   prosa variam demais)
4. Uma migration/seed importa esse `.json` para o banco, já no formato do motor de catálogo

## Reaproveitar o motor de catálogo, não inventar um novo

Isto é exatamente "item + avaliação por usuário" — a mesma primitiva 2 documentada na
arquitetura, só com um `tipo` novo:

```
media_item(tipo = 'lugar', fonte = 'tour-curitiba', fonte_id = slug-do-nome,
           titulo, metadados: { categoria, bairro, beneficio, ano_tour })
entry(space_id, media_item_id, ...)         -- "queremos ir"
rating(status: quero|visto|abandonei, ...)  -- sem nota 0-10 faz sentido aqui;
                                             -- reaproveitar 'quero'/'visto' e ignorar 'nota'
```

Nenhuma tabela nova — só popular `media_item` com `fonte = 'tour-curitiba'` via um script de
importação em vez de via busca ao TMDB. A tela de "Lugares do Tour" é um filtro de
`tipo = 'lugar' AND metadados->>'fonte_tour' = ano-atual` sobre as telas que já existem para
filmes/séries — grid, marcar interesse, "visto".

## Atualização anual

O Tour é ciclíco (edições anuais, com estabelecimentos entrando/saindo). O processo:

1. No início de cada edição nova, revisar à mão quais posts do blog cobrem o ano
2. Rodar o scraper contra esses posts, revisar o `.json`, importar
3. `media_item` antigos de anos passados não são apagados — ficam com `metadados.ano_tour` do
   ano deles, então dá pra filtrar só o ano vigente sem perder histórico ("fomos num lugar do
   Tour 2024, ainda queremos ir num de 2026")

## Plano de implementação em fases

1. Esperar o módulo de Viagens/Lugares existir (a aba "Tour Curitiba" é uma vista dele, não um
   módulo isolado)
2. Escrever o script de scraping (Node + cheerio é suficiente — não precisa de navegador
   headless, os posts são HTML estático de blog) contra uma lista de URLs revisada à mão
3. Normalizar a saída num `.json` revisável, revisar manualmente
4. Script de importação (`.json` → `media_item` via a mesma RPC/lógica de upsert do catálogo,
   adaptada para `fonte = 'tour-curitiba'`)
5. Aba/filtro na tela de Lugares mostrando só o ano vigente

## Riscos e limites, para não superprometer

- **Não é a lista completa** do Tour (só os destaques do blog) — vale deixar isso explícito na
  própria tela ("estes são alguns lugares do Tour {ano}", não "todos os lugares do Tour")
- O scraper quebra se o blog mudar de estrutura ou parar de publicar esses posts — é manual e
  revisado por vocês, não automático, então isso é inconveniente, não crítico
- Reavaliar todo ano se o site oficial passou a expor os dados de outra forma (uma API, um
  diretório navegável) — se acontecer, é bem mais simples que manter o scraper do blog

## Fora de escopo por enquanto

- Engenharia reversa do app oficial do Tour
- Rodar o scraper automaticamente/periodicamente sem revisão humana
- Qualquer dado além do que o blog já publica como conteúdo (não vale tentar geocodificar
  endereço, validar CNPJ, etc. — é só uma lista para navegar)
