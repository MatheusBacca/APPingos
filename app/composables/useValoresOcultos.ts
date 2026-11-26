/**
 * O olho do painel de Orçamentos: mostrar ou esconder os valores em dinheiro.
 *
 * É do dispositivo, e não da conta (`localStorage`): quem abre o app no metrô
 * esconde no celular sem esconder no computador de casa. Estado global
 * (`createGlobalState`) para o botão e todos os cartões lerem o mesmo ref.
 *
 * Não mora em `~/lib/dinheiro`, de propósito: aquele arquivo é puro e também
 * roda numa Edge Function (Deno), onde não há Vue. Quem quer o valor escondido
 * chama `dinheiro()` daqui; quem não quer (um formulário, um toast) continua com
 * `formatarDinheiro`.
 */
import { createGlobalState, useLocalStorage } from '@vueuse/core'
import { formatarDinheiro } from '@/lib/dinheiro'

/** O que aparece no lugar do valor: o tamanho não diz se é R$ 9 ou R$ 9.000. */
export const VALOR_OCULTO = 'R$ ••••'

const useEstado = createGlobalState(() => useLocalStorage('appingos:valores-ocultos', false))

export function useValoresOcultos() {
  const ocultos = useEstado()

  return {
    ocultos,
    alternar: () => { ocultos.value = !ocultos.value },
    /** `formatarDinheiro`, ou a máscara quando os valores estão escondidos. */
    dinheiro: (valor: number) => (ocultos.value ? VALOR_OCULTO : formatarDinheiro(valor)),
    /** Um valor já formatado ("+R$ 366,15"), mascarado sem perder o sinal — ele diz quem deve. */
    texto: (formatado: string) => (ocultos.value ? mascararMantendoSinal(formatado) : formatado),
  }
}

/** "+R$ 366,15" → "+R$ ••••" ("− R$ 10" → "− R$ ••••", com o espaço); sem sinal, só a máscara. */
export function mascararMantendoSinal(formatado: string): string {
  const sinal = /^[+−-]\s?/.exec(formatado.trim())?.[0] ?? ''
  return `${sinal}${VALOR_OCULTO}`
}
