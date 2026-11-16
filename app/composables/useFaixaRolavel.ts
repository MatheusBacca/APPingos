/**
 * Uma faixa que rola de lado (as abas no celular) e diz para que lado ainda há
 * conteúdo escondido — é o que decide em que borda aparece o esmaecido. Sem
 * isso, uma faixa cortada exatamente entre duas abas parece completa, e as abas
 * de fora da tela simplesmente somem para quem não sabe que dá para rolar.
 *
 * Ao montar, traz o item ativo (`[aria-current="page"]`) para o meio da vista.
 */
import type { Ref } from 'vue'

export function useFaixaRolavel(faixa: Ref<HTMLElement | null>) {
  const temAntes = ref(false)
  const temDepois = ref(false)

  function medir() {
    const el = faixa.value
    if (!el) return
    temAntes.value = el.scrollLeft > 2
    temDepois.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
  }

  let observador: ResizeObserver | null = null

  onMounted(() => {
    const el = faixa.value
    if (!el) return
    const ativo = el.querySelector<HTMLElement>('[aria-current="page"]')
    if (ativo) el.scrollLeft = ativo.offsetLeft - (el.clientWidth - ativo.offsetWidth) / 2
    medir()
    el.addEventListener('scroll', medir, { passive: true })
    observador = new ResizeObserver(medir)
    observador.observe(el)
  })

  onBeforeUnmount(() => {
    faixa.value?.removeEventListener('scroll', medir)
    observador?.disconnect()
  })

  /** A máscara do esmaecido: só nas bordas que escondem algo. */
  const mascara = computed(() => {
    const inicio = temAntes.value ? 'transparent, black 1.5rem' : 'black, black'
    const fim = temDepois.value ? 'black calc(100% - 1.5rem), transparent' : 'black, black'
    const valor = `linear-gradient(to right, ${inicio}, ${fim})`
    return { maskImage: valor, WebkitMaskImage: valor }
  })

  return { mascara }
}
