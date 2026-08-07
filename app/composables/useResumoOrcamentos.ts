/**
 * "Quanto eu devo neste mês" — a pergunta que motivou o painel.
 *
 * Três decisões carregam este arquivo:
 *
 * 1. O saldo vem de `saldoDoMes`, nunca de uma conta refeita aqui. A função
 *    arredonda a parte de cada pessoa primeiro, joga o resto na maior e só
 *    então deriva o saldo — é isso que faz os saldos somarem zero. Um resumo
 *    que refizesse a conta "do jeito óbvio" mostraria um centavo diferente da
 *    tela de Orçamentos, e não haveria como saber qual das duas está certa.
 *
 * 2. Quais dois meses aparecem depende do acerto, não da data. Enquanto o mês
 *    que fechou não é marcado como pago, ele é o número que importa — é a
 *    dívida real, e some da vista assim que alguém confirma o pagamento:
 *
 *      pendente:  Pendente · <mês-1>   Aberto · <mês>
 *      pago:      Aberto   · <mês>     Próximo · <mês+1>
 *
 *    "Próximo" não é previsão: é o que as parcelas em andamento já
 *    comprometeram no mês que vem.
 *
 * 3. O sinal acompanha a cor. Vermelho e verde sozinhos falham para daltonismo
 *    e em impressão; como o rótulo aqui é o estado do mês ("Pendente"), e não
 *    mais a direção ("Você deve"), quem carrega a direção no visual é o `+`/`−`
 *    — e, para leitor de tela, a palavra inteira em `sr-only`.
 */
import { hojeIso, nomeDoMes, primeiroDoMes, somarMeses } from '@/lib/datas'
import { formatarDinheiro } from '@/lib/dinheiro'
import { saldoDoMes, totalDoMes } from '~/types/orcamento'
import type { CompraDoMes } from '~/types/orcamento'
import type { LinhaResumo, UsarResumo } from '~/types/resumo'
import { useGastosPessoais } from '~/composables/useGastosPessoais'
import { useMembros } from '~/composables/useMembros'
import { useComprasDoMes, useAcertos } from '~/composables/useOrcamento'
import { useUsuarioId } from '~/composables/useUsuarioId'

/** Abaixo de um centavo é resíduo de arredondamento, não dívida. */
const QUITADO = 0.01

export interface MesDoPainel {
  competencia: string
  /** O estado do mês, que é o rótulo da linha. */
  estado: 'Pendente' | 'Aberto' | 'Próximo'
}

/**
 * Os dois meses que o painel mostra, dado se o mês fechado já foi acertado.
 *
 * Pura e exportada para ser testável sem subir o Nuxt — é a regra que decide o
 * que a pessoa lê de relance, e a que mais tem chance de mudar.
 */
export function mesesDoPainel(hoje: string, anteriorPago: boolean): [MesDoPainel, MesDoPainel] {
  const corrente = primeiroDoMes(hoje)

  return anteriorPago
    ? [
        { competencia: corrente, estado: 'Aberto' },
        { competencia: somarMeses(corrente, 1), estado: 'Próximo' },
      ]
    : [
        { competencia: somarMeses(corrente, -1), estado: 'Pendente' },
        { competencia: corrente, estado: 'Aberto' },
      ]
}

export function linhaDoMes(
  mes: MesDoPainel,
  compras: CompraDoMes[],
  membrosIds: string[],
  eu: string | null,
): LinhaResumo | null {
  if (!eu || !compras.length || !membrosIds.length) return null

  const saldo = saldoDoMes(compras, membrosIds).find(s => s.user_id === eu)?.saldo ?? 0
  if (Math.abs(saldo) < QUITADO) return null

  // Saldo negativo = você desembolsou menos que a sua parte, logo deve.
  const devendo = saldo < 0

  return {
    chave: `orcamento-${mes.competencia}`,
    rotulo: mes.estado,
    nota: nomeDoMes(mes.competencia),
    valor: `${devendo ? '−' : '+'}${formatarDinheiro(Math.abs(saldo))}`,
    valorDescrito: devendo ? 'você deve' : 'a receber',
    tom: devendo ? 'contra' : 'favor',
  }
}

/**
 * O que saiu do seu bolso e não é de ninguém mais, no mês corrente.
 *
 * Sem tom: gasto pessoal não é dívida a favor nem contra — não há a quem dever.
 * Vermelho aqui daria a entender uma cobrança que não existe.
 */
export function linhaPessoais(competencia: string, pessoais: CompraDoMes[]): LinhaResumo | null {
  const total = totalDoMes(pessoais)
  if (total < QUITADO) return null

  return {
    chave: `orcamento-pessoais-${competencia}`,
    rotulo: 'Pessoais',
    nota: nomeDoMes(competencia),
    valor: formatarDinheiro(total),
    valorDescrito: 'gastos só seus',
    tom: 'neutro',
  }
}

export const useResumoOrcamentos: UsarResumo = () => {
  const usuarioId = useUsuarioId()
  const { data: membros } = useMembros()
  const { data: acertos } = useAcertos()

  /*
   * O painel acompanha a escolha feita na tela de Orçamentos: quem desligou o
   * alternador lá não quer os pessoais somando aqui. `espacoVisivel` é `null`
   * nesse caso, e a consulta não dispara.
   */
  const { espacoVisivel } = useGastosPessoais()

  /*
   * O mês é fixado na montagem em vez de recalculado a cada leitura: o painel
   * pode ficar aberto por horas num app instalado, mas a virada de mês com a
   * tela ligada é rara o bastante para não valer um timer.
   */
  const hoje = hojeIso()
  const anterior = somarMeses(primeiroDoMes(hoje), -1)

  const meses = computed<[MesDoPainel, MesDoPainel]>(() =>
    mesesDoPainel(hoje, (acertos.value ?? []).some(a => a.competencia === anterior)),
  )

  /*
   * Duas consultas com a competência reativa, e não três fixas: quando o acerto
   * chega, a chave muda e o TanStack Query serve o mês novo do cache se ele já
   * tiver passado por aqui. A chave é a mesma da tela de Orçamentos
   * (`['orcamento','mes',competência]`), então entrar no módulo aproveita o que
   * o painel já buscou, e vice-versa.
   */
  const { data: comprasA } = useComprasDoMes(computed(() => meses.value[0].competencia))
  const { data: comprasB } = useComprasDoMes(computed(() => meses.value[1].competencia))

  /*
   * Só o mês corrente, e não os dois: o painel cabe em três linhas, e "quanto
   * eu já gastei este mês" é a pergunta que o pessoal responde. O mês fechado
   * pessoal não cobra nada de ninguém — não há acerto pendente a lembrar.
   */
  const corrente = primeiroDoMes(hoje)
  const { data: comprasPessoais } = useComprasDoMes(corrente, espacoVisivel)

  return computed<LinhaResumo[]>(() => {
    const ids = (membros.value ?? []).map(m => m.user_id)
    const eu = usuarioId.value

    return [
      linhaDoMes(meses.value[0], comprasA.value ?? [], ids, eu),
      linhaDoMes(meses.value[1], comprasB.value ?? [], ids, eu),
      linhaPessoais(corrente, comprasPessoais.value ?? []),
    ].filter((linha): linha is LinhaResumo => linha !== null)
  })
}
