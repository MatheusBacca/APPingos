<script setup lang="ts">
/**
 * O documento — e o único componente do app que existe para ser IMPRESSO.
 *
 * Cada `<section class="folha">` é uma folha A4 de verdade: 210 × 297 mm, com
 * `break-after: page` na impressão. O que o diálogo de impressão mostra é o que
 * está na tela, sem intermediário: o botão "Baixar PDF" chama `window.print()` e
 * nada mais. Não há html2canvas nem jsPDF, e isso não é economia de dependência
 * — é o que preserva texto selecionável, imagens na resolução original e, o
 * decisivo, as capas do Spotify: `i.scdn.co` não manda cabeçalho de CORS, e um
 * canvas contaminado devolveria retângulos vazios.
 *
 * TUDO AQUI USA COR LITERAL, e não os tokens do tema. Papel é papel: o documento
 * tem que sair igual para quem está no modo escuro, e uma folha que herdasse
 * `--background` sairia preta na impressão de metade das pessoas.
 *
 * A distribuição das seções em folhas chega pronta em `folhas`, calculada por
 * `paginar` em `app/lib/memoria.ts`. Este componente não decide nada sobre
 * paginação — ele desenha o que a conta mandou, e deixa o navegador quebrar por
 * dentro do bloco que não coube em folha nenhuma.
 */
import { useElementSize } from '@vueuse/core'
import { MusicIcon, ImageOffIcon, StarIcon } from '@lucide/vue'
import { formatarDiaCurto } from '@/lib/datas'
import { urlSpotifySegura } from '@/lib/musica'
import { rotuloDaSecao } from '~/lib/memoria'
import type { FolhaDaMemoria, ItemDaMemoria } from '~/lib/memoria'

const props = defineProps<{
  folhas: FolhaDaMemoria[]
  titulo: string
  descricao?: string | null
  dataInicio?: string | null
  dataFim?: string | null
  nota?: number | null
  /** `caminho` no bucket → URL assinada. Ver `useUrlsDosCaminhos`. */
  urls?: Map<string, string>
}>()

/**
 * A folha tem 210 mm de largura e não negocia — mas a tela do celular tem 390 px.
 *
 * Em vez de fazer o papel encolher (o que mudaria a quebra de página e faria a
 * prévia mentir sobre o PDF), a folha continua em tamanho real e é ESCALADA por
 * transform. O que se vê é a mesma folha, menor. Na impressão o transform é
 * anulado por `@media print` lá embaixo.
 *
 * 210 mm a 96 dpi são 793,7 px — o número que o navegador usa quando converte
 * `mm` para pixels de tela.
 */
const LARGURA_PX = 793.7

const moldura = useTemplateRef<HTMLElement>('moldura')
const pilha = useTemplateRef<HTMLElement>('pilha')
const { width: larguraDisponivel } = useElementSize(moldura)
const { height: alturaReal } = useElementSize(pilha)

const escala = computed(() => {
  if (!larguraDisponivel.value) return 1
  return Math.min(1, larguraDisponivel.value / LARGURA_PX)
})

/*
 * O transform não muda o espaço que o elemento ocupa no fluxo — a moldura
 * continuaria com a altura da folha inteira, deixando um vão em branco embaixo
 * proporcional ao quanto encolheu. Daí a altura calculada.
 */
const estiloDaMoldura = computed(() => ({
  height: alturaReal.value ? `${alturaReal.value * escala.value}px` : undefined,
}))

const estiloDaPilha = computed(() => ({
  transform: escala.value < 1 ? `scale(${escala.value})` : undefined,
}))

const periodo = computed(() => {
  if (!props.dataInicio) return null
  return props.dataFim
    ? `${formatarDiaCurto(props.dataInicio)} — ${formatarDiaCurto(props.dataFim)}`
    : formatarDiaCurto(props.dataInicio)
})

function urlDaFoto(item: ItemDaMemoria): string | null {
  return (item.caminho && props.urls?.get(item.caminho)) || null
}

/**
 * Uma inclinação estável por item, entre −2,4° e +2,4°.
 *
 * A foto colada torta é o que faz a página parecer um álbum e não uma tabela. O
 * ângulo sai do `id` (soma dos códigos dos caracteres) e não de `Math.random()`:
 * aleatório de verdade mudaria a cada render, e a foto dançaria entre a prévia e
 * o PDF — ou entre duas impressões do mesmo documento.
 */
function inclinacao(id: string): string {
  let soma = 0
  for (let i = 0; i < id.length; i++) soma += id.charCodeAt(i)
  return `rotate(${((soma % 49) - 24) / 10}deg)`
}
</script>

<template>
  <div ref="moldura" class="papel-moldura" :style="estiloDaMoldura">
    <div ref="pilha" class="papel-pilha" :style="estiloDaPilha">
      <section
        v-for="folha in folhas"
        :key="folha.numero"
        class="folha"
      >
        <!-- Os furos de fichário. Decoração, e por isso invisíveis à leitura. -->
        <div class="furos" aria-hidden="true">
          <span v-for="n in 3" :key="n" class="furo" />
        </div>

        <div class="conteudo">
          <header v-if="folha.numero === 1" class="cabecalho">
            <p class="etiqueta">Memória da viagem</p>
            <h1 class="font-manuscrita titulo">{{ titulo }}</h1>
            <p v-if="periodo" class="periodo">{{ periodo }}</p>
            <p v-if="descricao" class="font-manuscrita subtitulo">{{ descricao }}</p>

            <p v-if="nota" class="estrelas" :aria-label="`Nota ${nota} de 5`">
              <StarIcon
                v-for="n in 5"
                :key="n"
                class="estrela"
                :class="n <= nota ? 'cheia' : 'vazia'"
              />
            </p>
          </header>

          <article
            v-for="(bloco, i) in folha.blocos"
            :key="bloco.secao?.id ?? `soltos-${i}`"
            class="bloco"
            :class="{ 'bloco-longo': bloco.secao && (bloco.secao.texto?.length ?? 0) > 1200 }"
          >
            <h2 v-if="bloco.secao" class="font-manuscrita rotulo">
              {{ rotuloDaSecao(bloco.secao) }}
            </h2>
            <h2 v-else class="font-manuscrita rotulo">A trilha da viagem</h2>

            <p v-if="bloco.secao?.texto" class="font-manuscrita texto">{{ bloco.secao.texto }}</p>

            <!-- Fotos: coladas com fita, tortas, como num álbum. -->
            <div v-if="bloco.itens.some(it => it.tipo === 'foto')" class="fotos">
              <figure
                v-for="item in bloco.itens.filter(it => it.tipo === 'foto')"
                :key="item.id"
                class="foto"
                :style="{ transform: inclinacao(item.id) }"
              >
                <span class="fita" aria-hidden="true" />
                <img
                  v-if="urlDaFoto(item)"
                  :src="urlDaFoto(item)!"
                  :alt="item.legenda ?? ''"
                  class="imagem"
                >
                <span v-else class="imagem sem-previa">
                  <ImageOffIcon class="size-5" />
                </span>
                <figcaption v-if="item.legenda" class="font-manuscrita legenda">
                  {{ item.legenda }}
                </figcaption>
              </figure>
            </div>

            <!-- Músicas e playlists: a capa quadrada, o título e quem toca. -->
            <ul v-if="bloco.itens.some(it => it.tipo !== 'foto')" class="musicas">
              <li
                v-for="item in bloco.itens.filter(it => it.tipo !== 'foto')"
                :key="item.id"
                class="musica"
              >
                <img
                  v-if="item.capa_url"
                  :src="item.capa_url"
                  alt=""
                  class="capa"
                >
                <span v-else class="capa sem-capa"><MusicIcon class="size-4" /></span>

                <span class="musica-texto">
                  <span class="font-manuscrita musica-titulo">{{ item.titulo }}</span>
                  <span v-if="item.subtitulo" class="musica-subtitulo">{{ item.subtitulo }}</span>
                </span>

                <!--
                  O link vira texto no papel: um href impresso é tinta que não
                  leva a lugar nenhum. Na tela ele continua clicável.
                -->
                <a
                  v-if="urlSpotifySegura(item.url_spotify)"
                  :href="urlSpotifySegura(item.url_spotify)!"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="musica-link"
                >Spotify</a>
              </li>
            </ul>
          </article>
        </div>

        <footer class="rodape">
          <span>{{ titulo }}</span>
          <span>{{ folha.numero }} de {{ folhas.length }}</span>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.papel-moldura {
  overflow: hidden;
}

.papel-pilha {
  width: 210mm;
  transform-origin: top left;
  display: flex;
  flex-direction: column;
  gap: 8mm;
}

/*
  A folha. Todas as medidas em mm de propósito: é a única unidade em que "cabe
  na página" quer dizer alguma coisa, e é a mesma unidade das dimensões que
  `app/lib/memoria.ts` usa para estimar a paginação.
*/
.folha {
  position: relative;
  box-sizing: border-box;
  width: 210mm;
  min-height: 297mm;
  padding: 22mm 16mm 16mm 34mm;
  color: #24405e;
  background-color: #fffdf6;
  /*
    Duas camadas: a margem vermelha do fichário e as linhas do caderno. O
    `background-position` alinha a primeira linha com o topo do conteúdo — sem
    isso o texto fica sempre meio milímetro fora do pautado, que é o tipo de
    coisa que ninguém sabe nomear mas todo mundo vê.
  */
  background-image:
    linear-gradient(to right, transparent 27mm, #e8b4b8 27mm, #e8b4b8 27.4mm, transparent 27.4mm),
    repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent 7.1mm,
      #d2e4ef 7.1mm,
      #d2e4ef 7.35mm
    );
  background-position: 0 0, 0 22mm;
  background-repeat: no-repeat, repeat-y;
  box-shadow: 0 1px 3px rgb(15 23 42 / 18%), 0 8px 24px rgb(15 23 42 / 10%);
}

.furos {
  position: absolute;
  inset: 0 auto 0 0;
  width: 22mm;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  align-items: center;
  padding: 40mm 0;
}

.furo {
  width: 6mm;
  height: 6mm;
  border-radius: 50%;
  background: #f1f5f9;
  box-shadow: inset 0 1px 2px rgb(15 23 42 / 25%);
}

.conteudo {
  min-height: 235mm;
}

.cabecalho {
  margin-bottom: 8mm;
  padding-bottom: 4mm;
  border-bottom: 0.4mm solid #cbd5e1;
}

.etiqueta {
  font-size: 8pt;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #7c8ea3;
}

.titulo {
  margin-top: 1mm;
  font-size: 30pt;
  line-height: 1.05;
  font-weight: 700;
  color: #1b3350;
}

.periodo {
  margin-top: 1mm;
  font-size: 10pt;
  color: #62748c;
}

.subtitulo {
  margin-top: 2mm;
  font-size: 15pt;
  line-height: 1.25;
  color: #3d5b7c;
}

.estrelas {
  margin-top: 3mm;
  display: flex;
  gap: 1mm;
}

.estrela {
  width: 5mm;
  height: 5mm;
}

.estrela.cheia {
  color: #d98324;
  fill: #f0b429;
}

.estrela.vazia {
  color: #cbd5e1;
  fill: none;
}

/*
  `break-inside: avoid` é o padrão: uma seção partida ao meio pelo navegador
  desmancha a paginação que a conta montou. A exceção é a seção grande demais
  para caber em folha nenhuma — `paginar` já a deixou sozinha na dela, e aí a
  quebra do navegador é a única saída possível.
*/
.bloco {
  margin-bottom: 6mm;
  break-inside: avoid;
}

.bloco-longo {
  break-inside: auto;
}

.rotulo {
  font-size: 17pt;
  font-weight: 700;
  line-height: 1.2;
  color: #1b3350;
}

.texto {
  margin-top: 1mm;
  font-size: 15pt;
  line-height: 7.35mm;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.fotos {
  display: flex;
  flex-wrap: wrap;
  gap: 6mm 5mm;
  margin-top: 5mm;
}

/*
  A foto colada: fundo branco com sobra embaixo, como uma Polaroid, e uma fita
  translúcida atravessando o topo. É o `print-color-adjust: exact` do
  tailwind.css que faz tudo isto sobreviver à impressão.
*/
.foto {
  position: relative;
  width: 46mm;
  padding: 2mm 2mm 3mm;
  background: #ffffff;
  box-shadow: 0 1px 2px rgb(15 23 42 / 22%);
}

.fita {
  position: absolute;
  top: -3mm;
  left: 50%;
  width: 22mm;
  height: 6mm;
  transform: translateX(-50%) rotate(-1.5deg);
  background: rgb(250 240 190 / 72%);
  border-left: 0.3mm dashed rgb(180 165 110 / 45%);
  border-right: 0.3mm dashed rgb(180 165 110 / 45%);
}

.imagem {
  display: block;
  width: 100%;
  height: 34mm;
  object-fit: cover;
  background: #eef2f6;
}

.sem-previa {
  display: grid;
  place-items: center;
  color: #94a3b8;
}

.legenda {
  margin-top: 1.5mm;
  font-size: 11pt;
  line-height: 1.15;
  text-align: center;
  color: #46617f;
}

.musicas {
  margin-top: 4mm;
  display: flex;
  flex-direction: column;
  gap: 2.5mm;
}

.musica {
  display: flex;
  align-items: center;
  gap: 3mm;
  padding: 2mm 3mm;
  background: rgb(255 255 255 / 72%);
  border: 0.3mm solid #dbe6ef;
  border-radius: 2mm;
}

.capa {
  width: 12mm;
  height: 12mm;
  flex: none;
  object-fit: cover;
  border-radius: 1mm;
  background: #eef2f6;
}

.sem-capa {
  display: grid;
  place-items: center;
  color: #94a3b8;
}

.musica-texto {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.musica-titulo {
  font-size: 14pt;
  line-height: 1.15;
  color: #1b3350;
}

.musica-subtitulo {
  font-size: 9pt;
  color: #62748c;
}

.musica-link {
  font-size: 8pt;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7c8ea3;
  text-decoration: none;
}

.rodape {
  position: absolute;
  inset: auto 16mm 8mm 34mm;
  display: flex;
  justify-content: space-between;
  font-size: 8pt;
  color: #93a5b8;
}

@media print {
  /*
    Na impressão a escala não existe: a folha JÁ tem o tamanho do papel, e um
    transform aqui só encolheria o documento dentro da página.
  */
  .papel-moldura {
    height: auto !important;
    overflow: visible;
  }

  .papel-pilha {
    transform: none !important;
    gap: 0;
  }

  .folha {
    box-shadow: none;
    /*
      `break-after: page` em TODAS as folhas menos a última. Na última ele
      geraria uma página em branco no fim do PDF — o defeito mais comum de
      documento impresso por navegador.
    */
    break-after: page;
  }

  .folha:last-child {
    break-after: auto;
  }
}
</style>
