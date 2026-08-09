import { useMediaQuery } from '@vueuse/core'
import { MAX_PONTOS_LINK_DESKTOP, MAX_PONTOS_LINK_MOBILE } from '~/types/viagem'

/**
 * Quantas paradas cabem num link do Google Maps, neste aparelho.
 *
 * A doc da Maps URLs API é explícita: 3 waypoints no navegador do celular, 9
 * fora dele — 5 e 11 pontos, contando origem e destino. A largura é um proxy
 * imperfeito para "navegador de celular", e erra para o lado seguro: uma janela
 * estreita no desktop gera links menores que o necessário, o que funciona. O
 * contrário perderia paradas em silêncio.
 *
 * Vive num composable porque agora dois lugares perguntam isso — a barra de
 * abertura e o atalho de cada dia na lista. Duplicar a media query seria criar
 * um segundo lugar para o limite ficar desatualizado no dia em que o Google
 * mudar a regra.
 */
export function usePontosPorLink() {
  const noDesktop = useMediaQuery('(min-width: 768px)')

  return computed(() => noDesktop.value ? MAX_PONTOS_LINK_DESKTOP : MAX_PONTOS_LINK_MOBILE)
}
