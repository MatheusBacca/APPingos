import { useQuery } from '@tanstack/vue-query'
import type { Ref } from 'vue'
import { toast } from 'vue-sonner'
import { formatarMes } from '~/lib/datas'
import { mensagemDeErro } from '~/lib/utils'
import { acertoDoPix, mesesCandidatos } from '~/lib/conciliacao-pix'
import type { Parceiro } from '~/lib/conciliacao-pix'
import { saldoDoMes } from '~/types/orcamento'
import type { SaldoMembro } from '~/types/orcamento'
import type { LinhaDaCaixa } from '~/composables/useCaixaDeEntrada'
import { buscarComprasDoMes } from '~/composables/useOrcamento'
import { useClassificar } from '~/composables/useCaixaDeEntrada'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'

interface Conciliacao {
  transacao: string
  space: string
  nomeDoEspaco: string
  competencia: string
}

/**
 * O Pix do acerto marca o mês como pago sozinho (fase 6 do plano, passo 3).
 *
 * Roda quando a caixa de entrada abre: para cada Pix/TED da caixa, confere os
 * espaços de casal com EXATAMENTE duas pessoas (é onde existe "Fulano deve X a
 * Beltrano") contra o `saldoDoMes` dos meses candidatos — o mesmo cálculo da
 * tela, então o valor que a pessoa copiou no "Pagar com Pix" casa ao centavo.
 * Achou, marca: `conciliar_acerto` grava o `acerto_mes` e tira o Pix da caixa.
 *
 * Desfazer é o "Desfazer" de sempre, no botão do acerto em Chico Moedas, e o
 * "Devolver à caixa" das classificadas.
 */
export function useConciliacaoPix(transacoes: Ref<LinhaDaCaixa[] | undefined>) {
  const supabase = useSupabaseClient()
  const store = useSpaceStore()
  const usuarioId = useUsuarioId()
  const classificar = useClassificar()

  const pix = computed(() => (transacoes.value ?? []).filter(t =>
    !t.pendente && !!t.metodo && ['PIX', 'TED', 'TEF', 'DOC'].includes(t.metodo.toUpperCase())))

  const casais = computed(() => store.espacos.filter(e => e.tipo === 'casal'))

  const { data: conciliacoes } = useQuery({
    queryKey: computed(() => ['caixa-de-entrada', 'conciliacao', pix.value.map(t => t.id), casais.value.map(e => e.id)]),
    enabled: computed(() => !!usuarioId.value && pix.value.length > 0 && casais.value.length > 0),
    queryFn: async (): Promise<Conciliacao[]> => {
      const eu = usuarioId.value!
      const achadas: Conciliacao[] = []
      const jaUsadas = new Set<string>()

      for (const espaco of casais.value) {
        const { data: membros, error } = await supabase
          .from('membership')
          .select('user_id, profile:profile(nome, chave_pix, chave_pix_tipo)')
          .eq('space_id', espaco.id)
        if (error) throw error
        if (membros?.length !== 2) continue

        const outro = (membros as unknown as Array<{ user_id: string, profile: Omit<Parceiro, 'user_id'> | null }>)
          .find(m => m.user_id !== eu)
        if (!outro?.profile) continue
        const parceiro: Parceiro = { user_id: outro.user_id, ...outro.profile }

        const { data: acertos, error: erroAcertos } = await supabase
          .from('acerto_mes')
          .select('competencia')
          .eq('space_id', espaco.id)
        if (erroAcertos) throw erroAcertos
        const acertados = (acertos ?? []).map(a => a.competencia)

        const meses = [...new Set(pix.value.flatMap(t => mesesCandidatos(t.data)))]
        const saldos: Record<string, SaldoMembro[]> = {}
        for (const mes of meses) {
          if (acertados.includes(mes)) continue
          saldos[mes] = saldoDoMes(await buscarComprasDoMes(supabase, espaco.id, mes), membros.map(m => m.user_id))
        }

        for (const t of pix.value) {
          if (jaUsadas.has(t.id)) continue
          const competencia = acertoDoPix({ ...t, valor: Number(t.valor) }, eu, parceiro, saldos, acertados)
          if (!competencia) continue
          jaUsadas.add(t.id)
          // Um mês é acertado uma vez: o segundo Pix do mesmo valor fica na caixa.
          acertados.push(competencia)
          achadas.push({ transacao: t.id, space: espaco.id, nomeDoEspaco: espaco.nome, competencia })
        }
      }

      return achadas
    },
  })

  /* Cada transação é tentada uma vez por sessão — um erro não vira laço. */
  const tentadas = new Set<string>()

  watch(conciliacoes, async (lista) => {
    for (const c of lista ?? []) {
      if (tentadas.has(c.transacao)) continue
      tentadas.add(c.transacao)
      try {
        await classificar.mutateAsync({
          tipo: 'acerto',
          transacao: c.transacao,
          space: c.space,
          competencia: c.competencia,
        })
        toast.success(`O Pix do acerto de ${formatarMes(c.competencia)} chegou no extrato — ${c.nomeDoEspaco} marcado como pago.`)
      }
      catch (e) {
        toast.error(mensagemDeErro(e, 'Achei o Pix do acerto, mas não deu para marcar o mês.'))
      }
    }
  })
}
