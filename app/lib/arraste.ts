/**
 * A parte do arrastar que o navegador erra por desenho.
 *
 * `dragleave` não quer dizer "o ponteiro saiu desta zona". Ele dispara também quando
 * o ponteiro atravessa de um FILHO para outro dentro da mesma zona — e uma zona de
 * soltura útil é cheia de filhos. Tratar todo `dragleave` como saída faz o realce
 * piscar exatamente onde ele precisa ficar aceso.
 *
 * Medido no Chromium 1194, arrastando um produto para dentro de um conjunto: entre
 * dois `dragover` aparece um `dragleave` cujo `relatedTarget` está DENTRO da própria
 * zona. Com o handler ingênuo o realce apagava nesse instante.
 */

/**
 * O ponteiro está de fato saindo da zona?
 *
 * `indo` é o `relatedTarget` do evento — para onde o ponteiro vai. Nulo é sair da
 * janela (ou um navegador que esconde o alvo por privacidade), e as duas coisas
 * contam como fora: manter o realce aceso depois de o arraste ir para outro lugar é
 * pior que apagá-lo cedo.
 *
 * Tipado por estrutura, e não como `HTMLElement`, para ser testável sem DOM: o que
 * esta regra precisa saber é só se a zona contém o destino.
 */
export function saiuDaZona(zona: { contains: (no: Node) => boolean }, indo: Node | null): boolean {
  if (!indo) return true
  return !zona.contains(indo)
}
