# Extensão do Chrome — APPingos

Captura o produto da página aberta (nome, preço, preço no Pix, parcelamento, imagem, link) e
registra como **interesse** em Objetivos › Interesses, no espaço que você escolher.

Funciona igual no **Windows, Mac, Linux e ChromeOS** — é o mesmo pacote, sem build por
plataforma. Só desktop: o Chrome no Android não suporta extensões.

## Não é um executável

Extensão do Chrome não é `.exe` nem `.dmg`. É esta pasta: um `manifest.json` mais HTML, CSS e
JS. O Chrome carrega a pasta direto, ou instala a mesma coisa empacotada num `.zip` pela Web
Store.

## Instalar

### Da Release (a segunda máquina)

Todo push na `main` que mude esta pasta **com `version` nova** publica um `.zip` em
[Releases](https://github.com/MatheusBacca/APPingos/releases), pelo workflow
[`.github/workflows/extensao.yml`](../.github/workflows/extensao.yml). Baixe, descompacte, e no
Chrome: `chrome://extensions` → **Modo do desenvolvedor** → **Carregar sem compactação** →
aponte para a pasta descompactada.

O zip já sai com as credenciais embutidas, então funciona ao instalar. Isso exige
`SUPABASE_URL` e `SUPABASE_KEY` cadastrados em **Settings → Secrets and variables → Actions**;
sem eles o workflow falha em vez de publicar um pacote que não conecta.

### Do repositório (a máquina onde você desenvolve)

Melhor caminho para quem tem o repo clonado: um `git pull` já atualiza a extensão, sem baixar zip
nenhum.

```bash
npm run extensao
```

Isso escreve `lib/config.gerado.js` com a URL e a anon key lidas do `.env` da raiz (as mesmas
que o app usa) e gera o `.zip` em `dist/`.

Depois, no Chrome:

1. `chrome://extensions`
2. Ligue **Modo do desenvolvedor** (canto superior direito)
3. **Carregar sem compactação** → aponte para a pasta **`extensao/`** (não para o zip)

Fixe o ícone na barra pelo botão de peça de quebra-cabeça. Um `git pull` já atualiza a extensão
— só recarregue pelo botão de reload no `chrome://extensions` se ela já estava aberta.

> O `.zip` de `dist/` é para levar de uma máquina à outra: lá, descompacte e use o mesmo
> "Carregar sem compactação" apontando para a pasta descompactada.

## Atualizar os preços do que já está salvo

O botão **Atualizar preços**, no topo do popup, reabre cada produto salvo numa aba
escondida, relê o preço e grava o que conseguiu ler.

Roda no seu navegador de propósito, e não num servidor: o HTML cru não traz preço Pix nem
parcelamento (são montados por JS), e loja grande bloqueia IP de datacenter. Aqui a requisição sai
com o seu IP residencial e o seu Chrome — o tráfego que a loja não tem motivo para barrar.

Na primeira vez o Chrome pede permissão para abrir páginas de lojas. Ela é **opcional** e pedida
no clique: quem nunca usar o botão nunca concede nada, e a instalação segue sem o aviso de "ler
seus dados em todos os sites".

O que não conseguir ler **não sobrescreve** o que já estava guardado — vale por campo, então
reler uma página onde o parcelamento não carregou não apaga o parcelamento salvo. O app mostra
"preço verificado há X" em cada produto, e avisa quando uma loja para de deixar ler.

Fechar o popup interrompe a rodada. Não é problema: cada produto é gravado assim que é lido, e a
lista vem ordenada do mais desatualizado — a rodada seguinte pega de onde parou.

## Usar

1. Abra a página do produto
2. Clique no ícone do APPingos
3. Na primeira vez, entre com **o mesmo e-mail e senha do app**
4. Confira os campos — a raspagem erra, e o popup diz de onde tirou cada coisa
5. Escolha o espaço e, se quiser, um interesse que já existe ("Adicionar a: Trocar o sofá")
6. **Salvar interesse**

Nada é gravado sem esse clique.

## O que ela lê, e o que não

A raspagem tenta quatro fontes, em ordem de confiabilidade:

| Fonte | O que traz | Onde funciona |
| --- | --- | --- |
| JSON-LD (`schema.org/Product`) | nome, imagem, preço | Mercado Livre, Amazon BR, Magalu, Kabum, Pichau |
| Open Graph / `meta` | nome, imagem, preço | quase toda loja |
| Microdata (`itemprop`) | nome, preço | lojas mais antigas |
| Texto visível | **preço no Pix e parcelamento** | é o único lugar onde esses dois existem |

Preço no Pix e "12x de R$ 219,90" não existem em dado estruturado nenhum — vêm de heurística
sobre o texto, e são os campos com mais chance de vir errados. Por isso o formulário é editável.

**Nada roda antes do clique.** A extensão não declara `content_scripts`: ela usa `activeTab` +
`scripting`, então o Chrome só lhe dá acesso à aba no instante em que você aciona o ícone. É por
isso que a instalação não pede "ler e alterar seus dados em todos os sites".

## Sobre as credenciais

`lib/config.gerado.js` é gerado e **não vai para o git** — ele carrega a anon key e o ref do
projeto. A anon key é pública por desenho (ela já vai no bundle do app web); quem autoriza
qualquer leitura ou escrita é o JWT do seu login, e quem protege os dados é a RLS do Postgres.
Nenhuma `service_role` chega perto daqui.

A extensão **não** reaproveita a sessão do app: aquela vive em cookies do domínio do Vercel,
ilegíveis daqui. Ela faz o próprio login, contra o mesmo projeto, e guarda a sessão em
`chrome.storage.local`, renovando o token sozinha.

## Publicar na Chrome Web Store (opcional)

Vale quando cansar de "Modo do desenvolvedor": instalação em um clique e atualização automática
nas duas máquinas.

1. [Painel do desenvolvedor](https://chrome.google.com/webstore/devconsole) — taxa única de
   **US$ 5** por conta
2. **Novo item** → subir `dist/appingos-extensao-<versão>.zip`
3. Em **Visibilidade**, escolher **Não listada**: só quem tem o link instala, não aparece em
   busca
4. Preencher descrição, um ícone 128×128 e pelo menos uma captura de tela 1280×800
5. Enviar para revisão (costuma levar de horas a alguns dias)

Cada atualização é subir um zip novo com a `version` do `manifest.json` incrementada — o Chrome
não aceita reenviar a mesma versão. É a mesma `version` que governa a Release automática, então há
um lugar só a mexer para as duas coisas.

## Publicar uma versão nova

Incremente `version` no `manifest.json` e mande para a `main`. É só isso.

O workflow roda os testes, empacota, confere que o zip tem os doze arquivos que precisa (um
`CONTEUDO` desatualizado no empacotador passaria em verde e só quebraria na instalação — esta é a
rede), confere que a versão dentro do pacote é a mesma da tag, e cria a Release `extensao-v<versão>`.

Se você esquecer de incrementar, nada de ruim acontece: o job de publicar é **pulado** com um
aviso no resumo da execução, em vez de criar release duplicada ou falhar em vermelho.

## Arquivos

```
manifest.json          MV3: action, permissões, ícones
popup.html/.css/.js    as cinco telas (carregando, login, captura, recheck, pronto)
lib/api.js             Auth + PostgREST sobre fetch, com renovação de token
lib/raspagem.js        raspar() — uma função autocontida, injetada na aba
lib/recheck.js         reabre os produtos salvos em abas escondidas e relê o preço
lib/precos.js          puros: dinheiroBr, acharPrecoPix, acharParcelado
lib/config.gerado.js   GERADO por npm run extensao; fora do git
icones/                16/32/48/128, gerados por npm run icones
dist/                  a cópia empacotada e o .zip; fora do git
```

Testes em `test/extensao-*.test.ts`, rodados por `npm test` junto com o resto do projeto:
os preços, a raspagem contra DOM de mentira, a renovação de token com `fetch` dublado, e o
cruzamento entre os ids de `popup.js` e `popup.html`.
