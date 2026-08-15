/**
 * "Tem foto esperando você" — a única linha que o painel de Fotos precisa dar.
 *
 * A escolha que carrega o arquivo é o recorte: das três situações, só duas
 * aparecem, e nunca "quantas fotos existem". Uma galeria cresce para sempre, e um
 * painel que dissesse "142 fotos" estaria certo e seria inútil no segundo mês.
 *
 * A ordem também não é arbitrária. O que espera o MEU coração vem primeiro porque
 * é a única linha do painel inteiro que é uma tarefa minha; "pode postar" vem
 * depois porque é resultado, não pedido. Se as duas existirem, é essa a leitura:
 * primeiro o que devo, depois o que ganhei.
 */
import type { Foto } from '~/types/foto'
import { contarPorSituacao, esperandoPorMim } from '~/types/foto'
import type { LinhaResumo, UsarResumo } from '~/types/resumo'
import { useFotos } from '~/composables/useFotos'
import { useMembros } from '~/composables/useMembros'
import { useUsuarioId } from '~/composables/useUsuarioId'

/** Pura e exportada para ser testável sem subir o Nuxt, como os outros resumos. */
export function linhasDeFotos(
  fotos: Foto[],
  userId: string | null,
  totalDeMembros: number,
): LinhaResumo[] {
  if (!fotos.length) return []

  const linhas: LinhaResumo[] = []
  const minhas = esperandoPorMim(fotos, userId, totalDeMembros)

  if (minhas.length) {
    linhas.push({
      chave: 'fotos-esperando-por-mim',
      rotulo: minhas.length === 1 ? '1 foto' : `${minhas.length} fotos`,
      nota: 'esperando o seu coração',
      // Destaque porque a linha pede resposta, como o convite de filme: é o único
      // critério que o painel usa, e ele é sobre esperar alguém, não sobre ser
      // urgente.
      destaque: true,
      tom: 'neutro',
    })
  }

  const { liberada } = contarPorSituacao(fotos, totalDeMembros)

  if (liberada) {
    linhas.push({
      chave: 'fotos-liberadas',
      rotulo: liberada === 1 ? '1 aprovada' : `${liberada} aprovadas`,
      nota: 'pode postar',
      tom: 'favor',
    })
  }

  return linhas
}

export const useResumoFotos: UsarResumo = () => {
  const { data: fotos } = useFotos()
  const { data: membros } = useMembros()
  const euId = useUsuarioId()

  return computed<LinhaResumo[]>(() =>
    linhasDeFotos(fotos.value ?? [], euId.value, membros.value?.length ?? 0),
  )
}
