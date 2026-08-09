# Plano — Módulo de Viagens (roteiros de carro com Google Maps)

> Documento de planejamento, para colar no Notion antes de implementar. O módulo existe hoje
> só como casca: entrada em `app/modules.ts` com `ativo: false`, `app/pages/viagens.vue`
> renderizando `<ModuloEmBreve slug="viagens" />` e `PlaneIcon` já mapeado em
> `app/components/ModuleIcon.vue`. Nada de schema, composable ou tela.

## Por que

O pedido: criar N **roteiros** de viagem, cada um com uma sequência **ordenada** de lugares do
Google Maps; uma **barra de busca** que sugere lugares enquanto se digita e transforma o
escolhido em parada; um **mapa** com a rota desenhada; um botão **"abrir no Google Maps"** com
todas as paradas; e a possibilidade de o criador marcar o roteiro como **secreto**, escondendo-o
dos outros membros do Espaço até liberar — com **aviso** aos demais quando liberar.

Este é o **primeiro módulo do repo com integração externa de verdade** (o TMDB é só um proxy de
leitura, sem conta, sem cota, sem ToS que restrinja cache) e o **primeiro com chave exposta ao
navegador**. Duas convenções novas nascem aqui, e é por isso que este plano gasta mais linhas
com o Google do que com o Postgres.

## Decisões tomadas antes de começar

- **Conta de faturamento no Google Cloud.** A cota gratuita cobre o uso de duas pessoas com
  folga; o custo esperado é R$ 0. O faturamento existe porque o Google exige, não porque vai
  cobrar.
- **Escopo v1:** o essencial **+ datas**, todas opcionais — `data_inicio`/`data_fim` no roteiro,
  `dia` opcional por parada.
- **Aviso de liberação:** uma linha em destaque no painel de resumos. Sem push, sem e-mail.
- **Segredo é escolha na criação.** O diálogo de "novo roteiro" traz um alternador *"Tornar
  secreto"*; desligado (o padrão) o roteiro já nasce compartilhado.
- **Parada de texto livre é de primeira classe.** "Casa da vó" não está no Maps e precisa caber
  no roteiro do mesmo jeito.
- **O seletor de transporte aparece na v1**, com os modos que o Google sabe rotear.

## O que é possível fazer direto, e o que precisa de contorno

### ✅ Possível, sem atrito

| Requisito | Como |
| --- | --- |
| Busca/sugestão de lugares | **Places API (New) — Autocomplete**, atrás de uma rota Nitro (padrão `server/api/tmdb/*`). SKU *Essentials*, **10.000 requisições/mês grátis**. Com debounce de 300 ms e mínimo de 3 caracteres, o uso de duas pessoas fica em centenas/mês. |
| Guardar o lugar | O `place_id` é **explicitamente isento** da restrição de cache do ToS (§3.2.3(b)) e pode ser armazenado indefinidamente. |
| Mapa com a rota desenhada | **Maps Embed API**, modo `directions`, num `<iframe>`. **Gratuito e ilimitado**, aceita `place_id:` e suporta **até 20 waypoints**. Sem SDK JS, sem `Directions API` (que seria paga). |
| Abrir no Google Maps | **Maps URLs** (`/maps/dir/?api=1&...`). **Não exige chave nenhuma**, abre o app nativo no celular. |
| Reordenar, esconder, liberar | Tudo Postgres + RLS, sobre os helpers `is_space_member` / `is_space_admin` que já existem. |

### ⚠️ Precisa de contorno

**1. O botão "abrir no Google Maps" tem limite de waypoints — e ele é baixo no celular.**
A doc é explícita: *"up to three waypoints supported on mobile browsers, and a maximum of nine
waypoints supported otherwise"*. Ou seja, no celular cabem **5 pontos por link** (origem + 3
waypoints + destino), no desktop **11**. Um roteiro de 12 paradas simplesmente perde paradas
silenciosamente.

> **Contorno:** quebrar o roteiro em **trechos encadeados** (o último ponto de um trecho é o
> primeiro do seguinte) e renderizar um botão por trecho: *"Abrir no Maps — trecho 1 de 3"*.
> O tamanho do trecho é escolhido em runtime pelo `useMediaQuery` já usado na sidebar (5 pontos
> no mobile, 11 no desktop). Quando cabe tudo num link só, é um botão só e o usuário nem percebe
> a mecânica. Lógica pura em `app/types/viagem.ts`, testada nos dois limites.

**2. O mapa embutido aguenta 20 waypoints — mas não é o mesmo limite do botão.**
Os dois limites são diferentes e ninguém espera isso. O mapa mostra a rota inteira até 22 pontos;
acima disso, passa a mostrar só o primeiro trecho, com um aviso na tela. Fora de escopo tratar
roteiros de 20+ paradas de forma elegante.

**3. Cache de nome/endereço do lugar viola a letra do ToS.**
`place_id` é isento, mas o nome e o endereço são "Places content", cuja permissão de cache é de
**30 dias**. Precisamos do nome guardado porque a Maps URLs API exige o texto do lugar junto do
`waypoint_place_ids` — não dá para montar o link só com IDs.

> **Contorno assumido:** guardar `nome`/`endereco` com um campo `atualizado_em`, tratando-os como
> cache e não como dado nosso. Para um app privado de duas pessoas o risco é nulo, e fica
> registrado aqui como desvio consciente. Se um dia incomodar, existe o *ID Refresh* (Place
> Details pedindo só o campo `id`), que é **gratuito**, e um job de revalidação.

**4. Não dá para trocar o Google por Leaflet/OpenStreetMap depois sem jogar fora os dados.**
O ToS proíbe exibir conteúdo do Google sobre um mapa que não seja do Google. Isso fecha a porta
de "usa Google só para buscar e desenha em mapa livre". Vale saber antes de escolher, não depois.

**5. A chave do Embed API fica visível no navegador.**
Não tem jeito: o `src` do iframe carrega a chave. Ela é inerentemente pública.

> **Contorno:** **duas chaves separadas** no mesmo projeto do Google Cloud — uma restrita por
> *HTTP referrer* (domínio do Vercel + `localhost`) e limitada à *Maps Embed API*; outra sem
> restrição de origem, limitada à *Places API (New)*, que **nunca sai do servidor**. Mais cota
> máxima configurada nas duas, como rede de segurança contra abuso. Isso introduz o primeiro
> `runtimeConfig.public` do repo — hoje ele nem existe.

**6. Reordenar paradas por drag-and-drop não funciona no toque.**
O repo já bateu nisso: `CartazDoEspaco.vue` usa HTML5 DnD nativo, e o commit `c97e481` teve que
adicionar um menu "mover para..." como alternativa no celular. Não há biblioteca de DnD no
`package.json`, e o app é mobile-first (PWA).

> **Contorno:** setas **↑ / ↓** em cada parada como mecanismo principal (funciona em tudo,
> acessível por teclado), com HTML5 DnD como bônus no desktop, seguindo o padrão existente.
> Não introduzir dependência nova de DnD.

**7. "Segredo" contraria a doutrina de privacidade do repo.**
`useGastosPessoais.ts` afirma a regra da casa: *"não há filtro para alguém esquecer de aplicar,
porque não há linha para vazar"* — privacidade é **estrutural** (espaço pessoal vs. espaço do
casal), nunca uma flag na linha.

> **Por que Viagens é a exceção legítima:** o roteiro secreto **precisa** nascer no espaço do
> casal, porque o ponto todo é o momento de revelação dentro dele. Mover para o espaço pessoal e
> depois migrar significaria reescrever `space_id` e perder o histórico.
> **Consequência inegociável:** a regra vive na **policy de RLS**, jamais num filtro do client.
> Com a anon key na mão, um `select` cru precisa voltar vazio.

**8. Avião não é um modo de rota.**
O seletor foi pedido com "Carro, ônibus, avião...". O Embed API e a Maps URLs API roteiam
`driving`, `walking`, `bicycling` e `transit` — e nada mais. Um roteiro aéreo não é "outro modo
de transporte", é outro produto (trechos com data, aeroporto de origem e destino, sem rota
desenhável), e já está na lista de fora de escopo do módulo.

> **Contorno:** o seletor expõe os quatro modos que desenham rota — **Carro**, **Transporte
> público**, **A pé**, **Bicicleta**. A coluna é `text` com CHECK, então acrescentar um quinto
> valor no futuro é uma migration de uma linha.

## Modelo de dados

`supabase/migrations/<ts>_viagens.sql`

```sql
roteiro(
  id, space_id,                 -- regra fundacional: dono é o espaço, não o usuário
  nome, descricao,
  modo_transporte text default 'driving'
    check (in 'driving','walking','bicycling','transit'),
  data_inicio date, data_fim date,   -- ambas opcionais; check (data_fim >= data_inicio)
  visibilidade text default 'compartilhado'
    check (in 'segredo','compartilhado'),
  liberado_em timestamptz,      -- carimbo do momento da revelação; alimenta o aviso
  criado_por uuid, created_at, updated_at
)

parada(
  id, roteiro_id,
  ordem int,                    -- unique (roteiro_id, ordem) deferrable initially deferred
  google_place_id text,         -- null quando a parada é texto livre
  nome text, endereco text,     -- cache do Places; ver contorno 3
  atualizado_em timestamptz,
  dia int,                      -- Dia 1, Dia 2… null = sem dia
  anotacao text,
  created_at
)

roteiro_visto(roteiro_id, user_id, visto_em, primary key (roteiro_id, user_id))
```

**Por que `visibilidade` tem dois valores e não três.** A versão anterior deste plano previa
`rascunho` além de `segredo`, com `rascunho` como default. Os dois escondem exatamente a mesma
coisa das mesmas pessoas — a diferença era só de intenção ("estou montando" vs. "é surpresa") — e
o default fazia todo roteiro comum nascer invisível, exigindo um passo extra de "compartilhar"
que ninguém pediu. Ficaram dois valores, e a escolha acontece uma vez, na criação.

**RLS** — a peça crítica é o `select` do roteiro:

```sql
create policy roteiro_select on public.roteiro
  for select to authenticated using (
    public.is_space_member(space_id)
    and (visibilidade = 'compartilhado' or criado_por = auth.uid())
  );
```

- `insert`: `is_space_member(space_id) and criado_por = auth.uid()`
- `update`: mesmo predicado do `select` (os dois editam um roteiro já compartilhado)
- `delete`: `criado_por = auth.uid() or is_space_admin(space_id)`
- `parada` e `roteiro_visto`: via `exists (select 1 from public.roteiro where id = ...)` — a RLS
  do `roteiro` já se aplica ao subselect, então o segredo se propaga sozinho. Para o predicado de
  escrita, um helper `public.pode_editar_roteiro(p_roteiro uuid)` `security definer stable` com
  `set search_path = ''`, no mesmo molde dos `is_space_*` existentes.

**Trigger `validar_roteiro`** (padrão de `validar_compra`, para o que um CHECK não alcança): só
`criado_por` pode voltar a visibilidade para `segredo`; `liberado_em` é preenchido automaticamente
na transição para `compartilhado` e nunca é escrito pelo client.

**RPCs** (escrita multi-tabela numa transação só, padrão `registrar_compra`):

- `salvar_paradas(p_roteiro uuid, p_paradas jsonb)` — substitui a lista inteira e reescreve
  `ordem`. Para ≤20 paradas, substituir tudo é mais simples e mais seguro que diffar.
- `liberar_roteiro(p_roteiro uuid)` — só o criador.
- `marcar_roteiro_visto(p_roteiro uuid)` — upsert em `roteiro_visto`.

## Camada de servidor e configuração

**`server/api/lugares/busca.get.ts`** + **`server/utils/places.ts`** — cópia estrutural de
`server/api/tmdb/busca.get.ts` / `server/utils/tmdb.ts`: rota fina que valida, util gordo que
chama o upstream e **normaliza o shape** antes de devolver (`{ placeId, nome, endereco }[]`), sem
vazar o formato do Google. Mesmas convenções de erro: 503 com mensagem amigável se a chave não
está no `.env`, 502 quando o upstream falha (um 401 do Google nunca pode parecer erro de auth do
usuário).

Chamada: `POST https://places.googleapis.com/v1/places:autocomplete`, header
`X-Goog-FieldMask: suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat`
(field mask enxuto = SKU *Essentials*), body `{ input, languageCode: 'pt-BR', regionCode: 'BR' }`.
**Sem nenhuma chamada a Place Details** — o `structuredFormat` do autocomplete já traz nome e
endereço, e `place_id:` basta para o mapa e para o link. Zero chamadas pagas de Details.

`nuxt.config.ts`:

```typescript
runtimeConfig: {
  tmdbApiKey: '',
  googlePlacesApiKey: '',            // NUXT_GOOGLE_PLACES_API_KEY — só servidor
  public: {
    googleMapsEmbedKey: '',          // NUXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY — vai pro navegador
  },
}
```

`.env.example` e o README (seção do Vercel) ganham as duas variáveis, em Production e Preview.

## Camada do app

| Arquivo | Papel |
| --- | --- |
| `app/types/viagem.ts` | Tipos + **funções puras**: `paradasOrdenadas`, `agruparPorDia`, `dataDoDia`, `urlDoEmbed`, `trechosDoMaps(paradas, maxPontos)`, `urlDoTrecho`, `roteirosNovos`, `MODOS_TRANSPORTE` |
| `app/composables/useRoteiros.ts` | Lista e mutações via `useSpaceQuery` / `useSpaceMutation` (chaves `['roteiros']`, `['roteiro', id]`) |
| `app/composables/useBuscaDeLugares.ts` | `useQuery` sobre o termo debounced (300 ms, mín. 3 chars) batendo em `/api/lugares/busca`. **Não** usa `useSpaceQuery` — não é dado de espaço |
| `app/composables/useResumoViagens.ts` | Contrato `UsarResumo`: linha `destaque` para roteiro liberado e não visto, mais próxima viagem por `data_inicio` |
| `app/pages/viagens/index.vue` | Grade de cards; selos *Segredo* / *Novo*; "+ Novo roteiro" |
| `app/pages/viagens/[id].vue` | Mapa embutido, paradas agrupadas por dia, botão(ões) "abrir no Google Maps", "Liberar"; dispara `marcar_roteiro_visto` |
| `app/components/BuscaDeLugar.vue` | Input + lista de sugestões → vira parada; "adicionar como texto" para o que não está no Maps |
| `app/components/ListaDeParadas.vue` | Setas ↑/↓, remover, `dia`, anotação; DnD HTML5 no desktop |
| `app/components/MapaDoRoteiro.vue` | `<iframe>` do Embed API; fallback `/embed/v1/place` com 1 parada, estado vazio com 0 |
| `app/components/RoteiroCard.vue` | Card da grade |
| `app/components/RoteiroDialogo.vue` | Criar/editar: nome, descrição, datas, modo de transporte e o alternador "Tornar secreto" |

**Sobre as paradas de texto livre:** elas entram na lista, no agrupamento por dia e na contagem,
mas **não entram na rota** — nem no `<iframe>` do Embed, nem nos links do Maps. Não há como pedir
uma rota até um lugar que o Google não conhece. Na tela isso aparece como um ícone diferente e a
nota "não entra na rota", e é a razão de `trechosDoMaps` receber a lista já filtrada em vez de
filtrar por dentro: a decisão de o que é rota fica visível em um lugar só.

**Sobre o selo "Novo":** ele aparece para **todo mundo**, inclusive para quem liberou — abrir o
roteiro é o que marca como visto e faz o selo (e a linha do painel) sumirem. `roteiro_visto`
guarda isso por usuário, então cada um some com o seu no seu tempo.

**Sobre o "dia" e as datas:** `dia` é um inteiro (Dia 1, Dia 2), independente de haver datas. Se
o roteiro tem `data_inicio`, `dataDoDia(dia, data_inicio)` deriva a data real e a tela mostra
"Dia 2 · dom, 16 de ago"; sem data, mostra só "Dia 2". A data nunca é gravada na parada — ela é
derivada, para que mudar o início da viagem reescreva o roteiro inteiro sozinho.

**Registro:** em `app/modules.ts`, virar `ativo: true`, `naBarra: true` (hoje só 3 dos 5 slots da
bottom bar estão usados) e `resumo: useResumoViagens`. `PlaneIcon` já está em `ModuleIcon.vue`.
Apagar `app/pages/viagens.vue` em favor do diretório.

**Testes:** `test/viagens.test.ts` (fatiamento em trechos nos dois limites, texto livre fora da
rota, ordenação, agrupamento por dia, `dataDoDia`, montagem das URLs) e `test/resumo-viagens.test.ts`.

## Fases

1. **Doc + Google Cloud.** Este documento. Projeto no Google Cloud, faturamento, Places API (New)
   + Maps Embed API habilitadas, as duas chaves com suas restrições e cotas máximas.
2. **Schema.** Migration com as 3 tabelas, RLS, trigger, helper e RPCs. `db reset` → `db push` →
   `npm run db:types`. **Teste manual de vazamento:** logar como o outro membro e confirmar que um
   `select * from roteiro` cru não devolve o segredo.
3. **Busca.** `server/utils/places.ts` + rota, `useBuscaDeLugares`, `BuscaDeLugar.vue`.
4. **CRUD do roteiro.** Tipos puros + `useRoteiros` + tela de lista e de detalhe, com paradas
   ordenáveis e texto livre. Sem mapa ainda — a lista já tem valor.
5. **Mapa e links.** `MapaDoRoteiro.vue` + `trechosDoMaps` + botão(ões) "abrir no Google Maps".
6. **Segredo e liberação.** Alternador na criação, `liberar_roteiro`, `roteiro_visto`, selo "Novo"
   e `useResumoViagens`. Registrar em `app/modules.ts`.

## Verificação

- `npm run verificar` (imports + typecheck + vitest) verde.
- **Vazamento (o teste que mais importa):** com dois usuários no mesmo espaço, criar um roteiro
  `segredo` num e conferir no outro que ele não aparece na lista, que a URL direta `/viagens/<id>`
  dá vazio, e que um `select` via anon key não retorna a linha nem as `parada`s dela. Depois
  liberar e conferir que aparece com selo "Novo" **e** a linha em destaque no painel de resumos —
  e que some ao abrir.
- **Roteiro longo:** montar 12 paradas e conferir que o desktop gera 2 trechos e o celular 3~4,
  que cada link abre o Google Maps com exatamente as paradas do trecho, e que o mapa embutido
  desenha a rota inteira.
- **Texto livre:** uma parada sem `place_id` no meio do roteiro não pode quebrar o mapa nem
  deslocar as paradas dos links.
- **Chave ausente:** rodar sem `NUXT_GOOGLE_PLACES_API_KEY` e confirmar 503 com mensagem legível
  em vez de erro cru.
- **Custo:** após uma sessão de uso, olhar o painel do Google Cloud e confirmar que só o SKU
  *Autocomplete (Essentials)* registrou eventos, na casa das dezenas — e que o Embed não aparece
  como cobrança.

## Fora de escopo

- Roteiros de avião/multimodal, voos, hospedagem, reservas
- Custos por parada e ligação com o módulo de Orçamentos (o `dia` já deixa o gancho pronto)
- Checklist de bagagem, fotos, diário da viagem
- Mapa interativo de verdade (Maps JavaScript API — SKU *Dynamic Maps*, pago acima de 10k
  carregamentos) e pins arrastáveis
- Otimização automática da ordem das paradas (exigiria Routes API, paga)
- Revalidação periódica do cache de nome/endereço via *ID Refresh*
- Roteiros públicos, fora do espaço
