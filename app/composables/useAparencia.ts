/**
 * O modo de cor e o acento — a aparência escolhida, e onde ela é aplicada.
 *
 * O MODO reusa `useColorMode` do VueUse na mesma chave de sempre
 * (`appingos:tema`), então quem já tinha escolhido claro ou escuro não perde a
 * preferência. Ele cuida sozinho da classe `.dark` e do `auto` que segue o
 * sistema.
 *
 * O ACENTO é escrito como `data-acento` no `<html>`, e não como classe, porque
 * classe é lista e atributo é valor único: com `data-acento` trocar de cor é
 * substituir, e é impossível o elemento acabar com dois acentos ao mesmo tempo
 * depois de uma troca malfeita.
 *
 * SOBRE `useLocalStorage` E `null`. Não existe "sem acento" aqui, e é de
 * propósito: em `useStorage` do VueUse, escrever `null` não guarda nulo — apaga
 * a chave —, e ler chave ausente devolve o valor inicial. Um estado nulo
 * legítimo voltaria sozinho para o padrão no mesmo instante, sem erro nenhum.
 * Foi o que aconteceu com o filtro de Fotos. Aqui o padrão é um acento de
 * verdade ('pingo'), então o problema não tem por onde entrar.
 */
import { useColorMode, useLocalStorage } from '@vueuse/core'
import { ACENTO_PADRAO, acentoValido } from '~/lib/tema'
import type { ModoDeCor } from '~/lib/tema'

export function useAparencia() {
  const modo = useColorMode({ storageKey: 'appingos:tema' })

  const acentoSalvo = useLocalStorage<string>('appingos:acento', ACENTO_PADRAO)

  /*
   * A leitura passa por `acentoValido` toda vez, e não só na hora de gravar.
   *
   * O que está no localStorage veio de uma versão anterior do app e sobrevive a
   * qualquer deploy. Se um acento for renomeado ou sair da lista, o valor velho
   * continua lá — e `data-acento` apontaria para um bloco de CSS que não existe
   * mais, deixando `--matiz` sem definição e a interface inteira sem cor.
   */
  const acento = computed<string>({
    get: () => acentoValido(acentoSalvo.value),
    set: (valor) => { acentoSalvo.value = acentoValido(valor) },
  })

  /*
   * `useHead` em vez de mexer no DOM à mão: o Nuxt põe o atributo já no HTML
   * servido, então a página nasce com a cor certa. Escrever no `documentElement`
   * depois da montagem faria a primeira pintura sair no acento padrão e trocar
   * na frente da pessoa — o mesmo flash que o `.dark` sofre quando mal
   * configurado.
   */
  useHead({ htmlAttrs: { 'data-acento': acento } })

  function definirModo(valor: ModoDeCor) {
    modo.value = valor
  }

  return { modo, acento, definirModo }
}
