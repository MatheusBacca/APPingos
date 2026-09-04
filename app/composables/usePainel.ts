/**
 * O layout do painel, guardado no aparelho de quem ajustou.
 *
 * `localStorage` e não banco, e a razão é o que o ajuste é: uma preferência de
 * TELA. A altura que cabe bem no notebook de 13" é a errada no monitor de 27", e
 * a ordem que faz sentido no celular (onde tudo é uma coluna só) não é a mesma do
 * desktop. Sincronizar isso entre aparelhos entregaria, em nome da consistência,
 * um painel que ninguém arrumou para o aparelho em que está.
 *
 * O preço é conhecido e aceito: limpar os dados do navegador devolve o painel de
 * fábrica. Nada aqui é conteúdo — o conteúdo continua todo no Postgres.
 *
 * As regras moram em `~/lib/painel`, puras e testadas; aqui fica só a ponte entre
 * elas e o armazenamento.
 */
import { useLocalStorage } from '@vueuse/core'
import { MODULOS_ORDENADOS } from '~/modules'
import type { AppModule } from '~/modules'
import type { LarguraDoCard, LayoutDoPainel } from '~/lib/painel'
import {
  ajusteDe,
  alternarEscondido,
  definirAltura,
  definirLargura,
  foiAjustado,
  layoutPadrao,
  moverCard,
  mostrarCard,
  normalizarLayout,
  soltarCard,
} from '~/lib/painel'

const CHAVE = 'appingos:painel:layout'

/** Um módulo com o ajuste que a pessoa deu a ele. */
export interface CardDoPainel {
  modulo: AppModule
  largura: LarguraDoCard
  altura: number | null
  escondido: boolean
}

export function usePainel() {
  const slugs = MODULOS_ORDENADOS.map(m => m.slug)

  // O valor de fábrica, e não uma fábrica: `useStorage` guarda o que recebe.
  const guardado = useLocalStorage<LayoutDoPainel>(CHAVE, layoutPadrao(slugs))

  /*
   * Normalizar na LEITURA, e não uma vez na montagem: o que está no disco pode
   * ter sido escrito por uma versão do app com outros módulos, ou por outra aba.
   * Assim a tela nunca vê um layout torto, e a gravação continua sendo o que a
   * pessoa fez — sem uma migração escondida a cada boot.
   */
  const layout = computed(() => normalizarLayout(guardado.value, slugs))

  const cards = computed<CardDoPainel[]>(() =>
    layout.value.ordem.flatMap((slug) => {
      const modulo = MODULOS_ORDENADOS.find(m => m.slug === slug)
      if (!modulo) return []

      const ajuste = ajusteDe(layout.value, slug)
      return [{ modulo, ...ajuste }]
    }),
  )

  const visiveis = computed(() => cards.value.filter(c => !c.escondido))
  const escondidos = computed(() => cards.value.filter(c => c.escondido))
  const ajustado = computed(() => foiAjustado(layout.value, slugs))

  return {
    layout,
    /** Todos, na ordem — é o que a engrenagem lista. */
    cards,
    visiveis,
    escondidos,
    ajustado,

    mover: (slug: string, direcao: -1 | 1) => {
      guardado.value = moverCard(layout.value, slug, direcao)
    },
    soltar: (arrastado: string, alvo: string) => {
      guardado.value = soltarCard(layout.value, arrastado, alvo)
    },
    largura: (slug: string, largura: LarguraDoCard) => {
      guardado.value = definirLargura(layout.value, slug, largura)
    },
    altura: (slug: string, altura: number | null) => {
      guardado.value = definirAltura(layout.value, slug, altura)
    },
    alternar: (slug: string) => {
      guardado.value = alternarEscondido(layout.value, slug)
    },
    mostrar: (slug: string, visivel: boolean) => {
      guardado.value = mostrarCard(layout.value, slug, visivel)
    },
    restaurar: () => {
      guardado.value = layoutPadrao(slugs)
    },
  }
}
