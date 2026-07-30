import { defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'
import type { EspacoComPapel } from '~/types/database.types'

/**
 * Espaço ativo — o "de quem são estes dados" de todo o app.
 *
 * Só guarda a escolha (e a persiste). Quem carrega a lista é `useEspacos()`,
 * para o cache ficar no vue-query em vez de duplicado aqui.
 */
export const useSpaceStore = defineStore('space', () => {
  const espacoAtivoId = useLocalStorage<string | null>('appingos:espaco-ativo', null)
  const espacos = ref<EspacoComPapel[]>([])

  const espacoAtivo = computed(
    () => espacos.value.find(e => e.id === espacoAtivoId.value) ?? null,
  )

  const pronto = computed(() => espacoAtivo.value !== null)

  function definirEspacos(lista: EspacoComPapel[]) {
    espacos.value = lista

    // Se o espaço guardado não existe mais (convite revogado, outro login),
    // cai para o pessoal em vez de deixar o app num limbo sem espaço.
    const aindaValido = lista.some(e => e.id === espacoAtivoId.value)
    if (!aindaValido) {
      espacoAtivoId.value = (lista.find(e => e.tipo === 'pessoal') ?? lista[0])?.id ?? null
    }
  }

  function selecionar(id: string) {
    if (espacos.value.some(e => e.id === id)) {
      espacoAtivoId.value = id
    }
  }

  function limpar() {
    espacos.value = []
    espacoAtivoId.value = null
  }

  return { espacoAtivoId, espacos, espacoAtivo, pronto, definirEspacos, selecionar, limpar }
})
