/**
 * O `dragleave` que mente.
 *
 * Este teste existe porque o bug já aconteceu e foi medido: arrastando um produto
 * para dentro de um conjunto no Chromium, entre dois `dragover` aparece um
 * `dragleave` cujo `relatedTarget` está DENTRO da própria zona — o ponteiro só
 * atravessou de um filho para outro. Com o handler ingênuo (`@dragleave` apagando
 * sempre), o realce da zona piscava exatamente enquanto se arrasta por cima dela.
 *
 * O sintoma é visual e nenhuma outra verificação do projeto o alcança, então a regra
 * mora numa função pura e é conferida aqui.
 */
import { describe, expect, it } from 'vitest'
import { saiuDaZona } from '@/lib/arraste'

/** Uma zona de mentira: só precisa responder se contém o nó. */
function zonaQueContem(...dentro: object[]) {
  return { contains: (no: Node) => dentro.includes(no as unknown as object) }
}

describe('saiuDaZona', () => {
  /*
   * O caso que era o bug. O ponteiro vai de um filho para outro filho, sem sair da
   * zona — e o realce tem de continuar aceso.
   */
  it('atravessar entre filhos NÃO é sair', () => {
    const filho = {}
    const outroFilho = {}
    const zona = zonaQueContem(filho, outroFilho)

    expect(saiuDaZona(zona, outroFilho as unknown as Node)).toBe(false)
  })

  it('ir para um nó de fora é sair', () => {
    const zona = zonaQueContem({})
    expect(saiuDaZona(zona, {} as unknown as Node)).toBe(true)
  })

  /*
   * `relatedTarget` nulo é sair da janela — e um navegador que esconde o alvo por
   * privacidade cai no mesmo caminho. As duas coisas contam como fora: um realce
   * aceso depois de o arraste ir embora é pior que apagar cedo.
   */
  it('destino desconhecido conta como sair', () => {
    expect(saiuDaZona(zonaQueContem({}), null)).toBe(true)
  })
})
