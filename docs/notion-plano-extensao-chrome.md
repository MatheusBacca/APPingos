# Plano — Extensão do Chrome

> **Implementado** em 12/08/2026. A metade que recebe os dados é o submódulo de
> [Interesses](./notion-plano-interesses.md).
>
> Instruções de instalação e de publicação: [`extensao/README.md`](../extensao/README.md).

## Por que

Produto visto na internet some. Fica numa aba aberta que vai ser fechada, num print que ninguém
acha depois, num link mandado para si mesmo. Quando chega a hora de decidir, não se lembra se o
sofá era R$ 2.399 ou R$ 2.899, nem qual das três lojas era a mais barata.

O caminho manual — abrir o app, criar o interesse, copiar o nome, copiar o link, digitar três
preços — tem passos demais para o impulso de dez segundos que é "ó, achei um". Se registrar custa
mais que fechar a aba, a aba ganha.

## Não é um executável

Vale registrar porque foi a primeira suposição do pedido: extensão do Chrome não é `.exe` nem
`.dmg`. É uma pasta com `manifest.json` + HTML/CSS/JS, que o Chrome carrega direto ou instala
empacotada num `.zip` pela Web Store. O mesmo pacote roda igual no Windows, Mac, Linux e
ChromeOS — não existe build por plataforma. Em troca, é só desktop: o Chrome no Android não
suporta extensões.

## Decisões

### REST cru, sem supabase-js

A extensão fala com o Supabase por `fetch`: `/auth/v1/token` para entrar e renovar,
`/rest/v1/rpc/...` para gravar. Zero dependências.

O ganho é que **a pasta é o pacote**: nada de bundler, nada de `package.json` aninhado dentro do
projeto Nuxt, nada de build a rodar antes de "Carregar sem compactação". O custo são ~40 linhas
de renovação de token escritas à mão, que o supabase-js daria de graça — e é justamente por serem
à mão que `test/extensao-api.test.ts` existe, com `fetch` dublado, cobrindo os três bugs que essa
camada pode ter (segundos × milissegundos no `expires_at`, não renovar num 401, e renovar em laço
quando o refresh token já morreu).

### A extensão faz o próprio login

A sessão do app vive em cookies do domínio do Vercel, e a extensão não consegue ler isso — nem
deveria. Ela autentica com o **mesmo e-mail e senha**, contra o mesmo projeto, e recebe um JWT
igual ao do app. Guarda em `chrome.storage.local` e renova sozinha.

**Nenhum backend novo.** A RLS e as RPCs `SECURITY INVOKER` que já existiam autorizam tudo. O
único acréscimo no banco foi a migration de Interesses, que a tela do app usa igual.

Sobre a anon key ir dentro do `.zip`: é a mesma exposição do app web, onde ela já vai no bundle.
Ela é pública por desenho e sozinha não abre nada — quem autoriza é o JWT do usuário, e quem
protege os dados é `is_space_member`. `lib/config.gerado.js` é gerado do `.env` e fica fora do
git, para o ref do projeto não virar texto versionado.

### A extensão escolhe o espaço

Dado pertence a um `space`, nunca a um usuário. A escolha do app vive em
`localStorage['appingos:espaco-ativo']` na origem do Vercel, ilegível daqui — então a extensão
pergunta (com o mesmo select de `useEspacos`), e lembra da resposta. Pessoal vem primeiro, como
no app.

### `activeTab`, não content script

Nada roda em página nenhuma antes do clique no ícone. A raspagem é injetada sob demanda com
`chrome.scripting.executeScript`, e `activeTab` só concede acesso à aba a partir do acionamento.
Duas consequências boas: a instalação não pede "ler e alterar seus dados em todos os sites", e
não há código nosso executando em toda navegação.

Isso é o que força `raspar()` a ser **uma função autocontida**: `executeScript({ func })`
serializa a função com `toString()` e injeta o texto, então o que ela fechar sobre — um import,
uma constante do módulo — não existe do outro lado. O efeito colateral é ótimo: a mesma função
roda no Vitest contra o DOM do happy-dom, sem mock nenhum da API do Chrome.

O preço da restrição é uma duplicação consciente: `dinheiroBr` existe em `lib/precos.js` e de
novo dentro de `raspar()`. Os dois são cobertos pelos mesmos casos de teste, e os comentários nos
dois arquivos apontam um para o outro.

### A raspagem é um rascunho, não uma verdade

Cascata de quatro níveis, do mais confiável ao mais chutado, cada um preenchendo só o que o
anterior deixou vazio:

1. **JSON-LD** (`schema.org/Product`) — dado declarado pela loja. Mercado Livre, Amazon BR,
   Magalu, Kabum e Pichau publicam.
2. **Open Graph / `meta`** — `og:title`, `product:price:amount`.
3. **Microdata** — `[itemprop]` dentro de `[itemtype*=Product]`.
4. **Heurística sobre o texto visível** — o único lugar onde existem **preço no Pix** e
   **parcelamento**, que são os dois números que de fato decidem uma compra no Brasil e que
   nenhum dado estruturado carrega.

E então **o popup mostra tudo num formulário editável, e quem confirma é a pessoa.** É a decisão
central do desenho: quando a heurística errar — e ela vai errar, porque cada loja escreve o preço
do seu jeito —, o custo é corrigir um campo antes de clicar, não um registro torto no banco que
alguém descobre semanas depois. O popup diz de onde tirou cada coisa, para calibrar quanta
desconfiança a leitura merece.

Nada de adaptadores por loja. Seletor CSS por hostname quebra a cada redesign, e a manutenção
recai sobre duas pessoas que queriam só anotar um sofá.

## Um bug que o teste pegou, e que teria passado batido

A detecção de "à vista" usava `\b` na regex. Em JavaScript `\b` é ASCII, então **`à` conta como
caractere não-de-palavra e `\bà` nunca casa** — a regra passava batida em toda loja que escreve
"à vista" em vez de "Pix", e em silêncio, porque o campo só ficava vazio. A correção é lookaround
com `\p{L}` e a flag `u`.

Vale registrar por dois motivos: é o tipo de erro que só aparece em português, e ele existia nas
duas cópias da função — o que confirma que a duplicação consciente precisava mesmo dos testes
apontando para os mesmos casos.

## Empacotamento

`npm run extensao` (`scripts/empacotar-extensao.mjs`):

1. Escreve `extensao/lib/config.gerado.js` a partir do `.env` — as mesmas `SUPABASE_URL` /
   `SUPABASE_KEY` do app, sem prefixo `NUXT_` (são do `@nuxtjs/supabase`). Recusa uma URL fora do
   padrão `https://*.supabase.co`, que é o que o `manifest.json` declara em `host_permissions` —
   sem essa checagem o erro apareceria só no primeiro `fetch`, como CORS, que não explica nada.
2. Copia para `extensao/dist/appingos-extensao/`
3. Zipa. Usa o `zip` do sistema quando existe e cai numa implementação interna quando não —
   `zip` não vem no Windows nem em toda imagem de CI, e o Node não traz compressão de arquivo na
   biblioteca padrão. São ~50 linhas de formato ZIP contra uma dependência de build; o Chrome só
   pede "stored", que é a metade fácil do formato.

Para o dia a dia, carrega-se a pasta `extensao/` sem compactação — o passo 1 põe o config lá,
então um `git pull` já atualiza a extensão. O `.zip` serve para levar de uma máquina à outra e,
depois, para a Web Store (não listada, US$ 5 uma vez, atualização automática).

## Verificação

- `npm run verificar` — 312 testes, incluindo `extensao-precos`, `extensao-raspagem`,
  `extensao-api`, `extensao-selecao` e `extensao-popup`
- A extensão não passa por `nuxt typecheck` (é JS puro fora de `app/`), então
  `extensao-popup.test.ts` cruza os ids de `popup.js` com os de `popup.html` e valida o manifest.
  Um `el('campo-prec')` seria `null.value` em runtime, silencioso até a hora do uso — e clicar no
  ícone no Chrome é o passo mais caro de repetir do projeto
- O que teste nenhum pega, e por isso foi exercitado à mão contra o banco real: login, escolha de
  espaço, captura numa loja de verdade, e o registro aparecendo em `/objetivos/interesses`

## Fora de escopo

- **Firefox e Safari** — o MV3 é quase portável, mas cada loja tem seu próprio processo
- **Mobile** — o Chrome no Android não tem extensões; no celular o caminho é o app
- **Capturar mais de um produto de uma vez** (uma página de busca inteira) — o gesto é "achei
  este", não "importe a vitrine"
- **Rechecagem automática, sem clique** — precisaria de credencial de bot rodando num servidor, e
  é justamente o IP de datacenter que as lojas barram. O botão resolve com o navegador de quem já
  está logado
- **Editar o interesse pela extensão** — o popup captura e relê preço; corrigir e comparar é a tela
  do app, que tem espaço para isso

## O que a 0.3.0 acrescentou

**Escolher quais preços reler.** A tela de "Atualizar preços" passou a listar os produtos com uma
caixinha cada, agrupados pelo interesse a que pertencem, com uma estrela no favorito. Cada produto
relido é uma aba aberta e alguns segundos de espera; quem tem quinze salvos e só quer saber do sofá
não deve esperar pelos outros catorze.

**"Só os favoritos de cada interesse" é um atalho de MARCAÇÃO, não um filtro de exibição.** Ele marca
os favoritos e desmarca o resto, e as caixinhas seguem editáveis por cima. Um filtro esconderia
produtos e faria "reler 3 de 15" parecer bug. A preferência fica no `chrome.storage` — quem quer só
os favoritos quer isso toda vez, e o popup é descartado a cada fechamento. Marcar algo à mão desliga
o atalho: ele descreve uma marcação, e aceso sobre outra seleção seria mentira na tela.

Interesse que ainda não tem favorito escolhido fica de fora inteiro quando o atalho está ligado. É o
certo: a pessoa pediu os favoritos, e ali não há um. Marcar tudo "para não deixar de fora" abriria as
abas que ela acabou de dizer que não queria.

**`lib/selecao.js`, novo e puro.** `popup.js` não é importável em teste: ele puxa
`lib/config.gerado.js`, que o build escreve e não existe num clone novo — um teste que o importasse
passaria a depender de alguém ter rodado `npm run extensao` antes. Então a regra da marcação saiu para
um módulo sem dependência nenhuma, e `extensao-selecao.test.ts` a exercita com o mesmo código que
roda no Chrome.

**"Para quem" virou lista de membros**, com "Outra pessoa…" no fim abrindo o campo de texto livre. Só
um dos dois é enviado: `p_para_quem_user_id` quando é alguém do espaço (o nome acompanha quem trocar
de apelido) ou `p_para_quem` em texto. Trocar de espaço recarrega a lista — oferecer alguém do espaço
anterior seria oferecer um `user_id` que não participa deste.

**Um teste que nasceu de um buraco encontrado agora:** a lista de arquivos que o workflow confere
dentro do `.zip` é escrita à mão e envelhece calada — `lib/recheck.js` estava de fora desde a 0.2.0.
Um módulo em `lib/` é copiado pelo build (a pasta vai inteira) e simplesmente não era conferido. O dia
em que a cópia falhasse, o pacote sairia sem o arquivo, seria publicado como release, e o sintoma
seria a extensão instalada quebrando num import — sem nada vermelho no CI. Agora o teste segue os
imports em cadeia a partir de `popup.js` e exige que cada módulo apareça na lista do workflow.
