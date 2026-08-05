import { useLocalStorage } from '@vueuse/core'
import type { RemovableRef } from '@vueuse/core'

/**
 * A sidebar do desktop aberta ou recolhida, lembrado entre sessões.
 *
 * Um ref só para o app inteiro, e não um por componente: a sidebar decide a
 * própria largura, mas quem recua o conteúdo é o shell — os dois precisam ler o
 * mesmo estado no mesmo instante. Um módulo pode guardar isso porque o app é
 * SPA (`ssr: false` no nuxt.config); num servidor, este estado vazaria de uma
 * requisição para a outra.
 *
 * Recolhida ela vira uma faixa de ícones, e não some: sumir de vez deixaria o
 * desktop sem navegação nenhuma — a bottom bar é só do mobile.
 */
let estado: RemovableRef<boolean> | null = null

export function useSidebar() {
  const aberta = (estado ??= useLocalStorage('appingos:sidebar-aberta', true))

  return {
    aberta,
    alternar: () => { aberta.value = !aberta.value },
  }
}
