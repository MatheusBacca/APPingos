/**
 * "Quantos Pins cada um tem, e há quantos dias você não falha."
 *
 * As duas perguntas que a pessoa faz olhando o painel. O saldo do OUTRO entra
 * junto de propósito: o extrato compartilhado é a razão de a feature existir, e
 * um resumo que só mostrasse o próprio número transformaria os Pins num
 * contador solitário.
 *
 * A sequência só aparece quando existe. "0 dias seguidos" é uma cobrança, não
 * uma informação, e ocuparia uma das três linhas do painel para dizer que não há
 * nada a dizer.
 */
import { hojeIso } from '@/lib/datas'
import type { Membro } from '~/composables/useMembros'
import { useMembros } from '~/composables/useMembros'
import { usePins, useSaldoDePins } from '~/composables/usePins'
import { useUsuarioId } from '~/composables/useUsuarioId'
import type { LinhaResumo, UsarResumo } from '~/types/resumo'
import { MAX_LINHAS } from '~/types/resumo'
import type { Pin, SaldoDePins } from '~/types/pin'
import { pinsEmTexto, sequenciaDeDias } from '~/types/pin'

/**
 * As linhas, dado o saldo de cada um e o extrato.
 *
 * Pura e exportada para ser testável sem subir o Nuxt — ver test/resumo-pins.test.ts.
 *
 * `saldos` chega ordenado por pontos (é como `useSaldoDePins` devolve), mas a
 * SUA linha vem primeiro de qualquer jeito: o painel é seu, e ler o próprio
 * número em segundo lugar porque você está perdendo seria uma escolha
 * desnecessariamente cruel para um app de casal.
 */
export function linhasDePins(
  saldos: SaldoDePins[],
  membros: Membro[],
  usuarioId: string | null,
  meusPins: Pick<Pin, 'created_at'>[],
  hoje: string,
): LinhaResumo[] {
  if (!saldos.length) return []

  const nomes = new Map(membros.map(m => [m.user_id, m.exibicao]))

  const meu = saldos.find(s => s.user_id === usuarioId)
  const outros = saldos.filter(s => s.user_id !== usuarioId)

  const linhas: LinhaResumo[] = []

  if (meu) {
    linhas.push({
      chave: 'pins-meus',
      rotulo: 'Seus Pins',
      valor: String(meu.pontos),
      valorDescrito: pinsEmTexto(meu.pontos),
      nota: meu.conquistas === 1 ? '1 conquista' : `${meu.conquistas} conquistas`,
    })
  }

  const sequencia = sequenciaDeDias(meusPins, hoje)
  if (sequencia > 0) {
    linhas.push({
      chave: 'pins-sequencia',
      rotulo: 'Sequência',
      valor: String(sequencia),
      valorDescrito: sequencia === 1 ? '1 dia' : `${sequencia} dias`,
      nota: sequencia === 1 ? 'dia seguido' : 'dias seguidos',
    })
  }

  for (const outro of outros) {
    linhas.push({
      chave: `pins-${outro.user_id}`,
      rotulo: nomes.get(outro.user_id) ?? 'Alguém',
      valor: String(outro.pontos),
      valorDescrito: pinsEmTexto(outro.pontos),
    })
  }

  return linhas.slice(0, MAX_LINHAS)
}

export const useResumoPins: UsarResumo = () => {
  const { data: saldos } = useSaldoDePins()
  const { data: membros } = useMembros()
  const { data: pins } = usePins()
  const usuarioId = useUsuarioId()

  return computed<LinhaResumo[]>(() => {
    const meus = (pins.value ?? []).filter(p => p.user_id === usuarioId.value)

    return linhasDePins(
      saldos.value ?? [],
      membros.value ?? [],
      usuarioId.value ?? null,
      meus,
      hojeIso(),
    )
  })
}
