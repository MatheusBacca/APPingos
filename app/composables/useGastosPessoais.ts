/**
 * O alternador "Gastos pessoais" de Orçamentos.
 *
 * Um gasto pessoal é uma compra no SEU ESPAÇO PESSOAL — não uma linha marcada
 * como privada dentro do espaço do casal. A diferença é o que torna a
 * privacidade estrutural: o espaço pessoal tem um membro só, e a policy
 * `is_space_member(space_id)` que já existe é o que impede a outra pessoa de
 * ver a linha. Não há filtro para alguém esquecer de aplicar, porque não há
 * linha para vazar.
 *
 * Isto aqui é só a preferência de exibição e o id da gaveta; quem consulta são
 * as composables de `useOrcamento`, que recebem o espaço por parâmetro.
 */
import { useLocalStorage } from '@vueuse/core'
import { useSpaceStore } from '~/stores/space'

export function useGastosPessoais() {
  const store = useSpaceStore()

  const espacoPessoalId = computed(() =>
    store.espacos.find(e => e.tipo === 'pessoal')?.id ?? null,
  )

  /**
   * Dentro do próprio espaço pessoal não há o que sobrepor — a lista já é
   * exatamente essa. Um alternador que não altera nada é pior do que nenhum.
   */
  const disponivel = computed(() =>
    !!espacoPessoalId.value && espacoPessoalId.value !== store.espacoAtivoId,
  )

  const preferencia = useLocalStorage('appingos:orcamentos:gastos-pessoais', false)

  const ligado = computed({
    get: () => disponivel.value && preferencia.value,
    set: (valor: boolean) => { preferencia.value = valor },
  })

  /**
   * O espaço a consultar em paralelo: `null` quando o alternador está desligado,
   * o que desliga as queries em vez de buscar dado que ninguém vai ver.
   */
  const espacoVisivel = computed(() => (ligado.value ? espacoPessoalId.value : null))

  /** A compra veio da gaveta pessoal? É o que decide o selo e o que fica fora do acerto. */
  function ehPessoal(compra: { space_id: string }): boolean {
    return !!espacoPessoalId.value && compra.space_id === espacoPessoalId.value
  }

  return { espacoPessoalId, disponivel, ligado, espacoVisivel, ehPessoal }
}
