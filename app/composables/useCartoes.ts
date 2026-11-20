import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { hojeIso, somarDias } from '@/lib/datas'
import { cicloAtual, distribuicao, fechamentoPelasFaturas, limiteDoCartao, totalDoCiclo, usoDoLimite } from '~/lib/cartoes'
import type { Ciclo, DadosDoCartao, LancamentoDoCartao, UsoDoLimite } from '~/lib/cartoes'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { nomeDoBanco } from '~/lib/instituicoes'
import { rotuloDaConta } from '~/lib/caixa-lista'
import type { ContaParaRotulo } from '~/lib/caixa-lista'

/**
 * Os cartões de quem está logado, com a fatura aberta de cada um.
 *
 * Tudo é da PESSOA (RLS `user_id = auth.uid()` em conta, transação e fatura): a
 * outra pessoa do espaço não vê o limite nem a fatura de ninguém — vê as compras
 * que forem mandadas para o casal.
 */

export interface CartaoDaPessoa extends DadosDoCartao {
  id: string
  nome: string
  numero: string | null
  banco: string
  /** `account.balance`: no Nubank, o limite tomado (parcelas futuras incluídas), não a fatura aberta. */
  saldo: number | null
  saldo_atualizado_em: string | null
  bandeira: string | null
  nivel: string | null
  situacao_cartao: string | null
  apelido: string | null
}

export interface FaturaFechada {
  id: string
  conta_id: string
  pluggy_bill_id: string
  vencimento: string
  fechamento: string | null
  total: number
  minimo: number | null
  /** Juros, multa e IOF cobrados nesta fatura. */
  encargos: Array<{ tipo: string, valor: number, info: string | null }>
  total_encargos: number
  permite_parcelar: boolean | null
}

/** Um pagamento que entrou no cartão, com a conta que pagou quando o par foi achado. */
export interface PagamentoDaFatura {
  id: string
  data: string
  valor: number
  /** "👤 C6 •••• 8160" — a conta corrente que pagou; `null` sem par (conta de banco não conectado). */
  pagoPor: string | null
}

export interface ResumoDoCartao {
  cartao: CartaoDaPessoa
  ciclo: Ciclo
  faturaAberta: number
  uso: UsoDoLimite | null
  /** A última fatura fechada, se o banco mandou. */
  ultimaFechada: FaturaFechada | null
  faturas: FaturaFechada[]
  /** Os pagamentos recebidos nos últimos 120 dias, o mais novo primeiro. */
  pagamentos: PagamentoDaFatura[]
}

const CHAVE = 'cartoes'

interface LinhaDePagamento {
  id: string
  conta_id: string
  valor: number
  data: string
  par: { destino: string | null, conta: ContaParaRotulo | null } | null
}

export function useCartoes() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: [CHAVE, usuarioId],
    enabled: computed(() => !!usuarioId.value),
    queryFn: async () => {
      const hoje = hojeIso()
      /*
        Um ciclo tem até 31 dias. 120 cobre o aberto e as três últimas faturas
        fechadas — o bastante para estimar o fechamento pelas datas
        (`fechamentoPelasFaturas`) quando o banco não o informa.
      */
      const desde = somarDias(hoje, -120)

      const [contas, lancamentos, faturas, pagamentos] = await Promise.all([
        supabase
          .from('conta_bancaria')
          .select(`
            id, nome, numero, limite, limite_disponivel, fecha_em, vence_em, pagamento_minimo,
            limite_manual, dia_fechamento_manual, dia_vencimento_manual,
            saldo, saldo_atualizado_em, bandeira, nivel, situacao_cartao, apelido,
            conexao:conexao_bancaria(banco, instituicao)
          `)
          .eq('tipo', 'cartao')
          .order('nome'),
        supabase
          .from('transacao_bancaria')
          .select('conta_id, valor, sentido, data, motivo_exclusao, fatura_id, parcelas_total')
          .gte('data', desde),
        supabase
          .from('fatura_cartao')
          .select('id, conta_id, pluggy_bill_id, vencimento, fechamento, total, minimo, encargos, total_encargos, permite_parcelar')
          .order('vencimento', { ascending: false }),
        /*
          O pagamento que entrou no cartão e a saída da conta que o pagou
          (`par_id`, ligado por `parear_pagamentos_de_fatura`).
        */
        supabase
          .from('transacao_bancaria')
          .select(`
            id, conta_id, valor, data,
            par:par_id(
              destino,
              conta:conta_bancaria(nome, tipo, numero, apelido, destino, space_id, conexao:conexao_bancaria(banco, instituicao))
            )
          `)
          .eq('motivo_exclusao', 'pagamento_fatura')
          .eq('sentido', 'entrada')
          .eq('pendente', false)
          .gte('data', desde)
          .order('data', { ascending: false }),
      ])

      if (contas.error) throw contas.error
      if (lancamentos.error) throw lancamentos.error
      if (faturas.error) throw faturas.error
      if (pagamentos.error) throw pagamentos.error

      const linhas = (lancamentos.data ?? []) as Array<LancamentoDoCartao & { parcelas_total: number | null }>
      const todasFaturas = (faturas.data ?? []) as unknown as FaturaFechada[]

      const resumos: ResumoDoCartao[] = (contas.data ?? []).map((c) => {
        const doCartao = todasFaturas.filter(f => f.conta_id === c.id)
        const cartao: CartaoDaPessoa = {
          ...c,
          banco: nomeDoBanco(c.conexao as { banco: string, instituicao: string | null } | null, c.nome),
          fechamento_das_faturas: fechamentoPelasFaturas(doCartao, linhas.filter(l => l.conta_id === c.id)),
        }
        const ciclo = cicloAtual(cartao, hoje)
        const faturaAberta = totalDoCiclo(linhas, cartao.id, ciclo)
        return {
          cartao,
          ciclo,
          faturaAberta,
          uso: usoDoLimite(cartao, faturaAberta),
          ultimaFechada: doCartao[0] ?? null,
          faturas: doCartao,
          pagamentos: ((pagamentos.data ?? []) as unknown as LinhaDePagamento[])
            .filter(p => p.conta_id === c.id)
            .map(p => ({
              id: p.id,
              data: p.data,
              valor: Number(p.valor),
              // A saída devolvida à caixa deixou de ser o pagamento desta fatura.
              pagoPor: p.par?.conta && p.par.destino === 'ignorada' ? rotuloDaConta(p.par.conta) : null,
            })),
        }
      })

      // O cartão que mais pesa primeiro: é o que a pessoa veio olhar.
      resumos.sort((a, b) => b.faturaAberta - a.faturaAberta)

      return {
        resumos,
        total: resumos.reduce((s, r) => s + r.faturaAberta, 0),
        limiteTotal: resumos.reduce((s, r) => s + (limiteDoCartao(r.cartao) ?? 0), 0),
        fatias: distribuicao(resumos.map(r => ({ id: r.cartao.id, valor: r.faturaAberta }))),
      }
    },
  })
}

/** Quantas transações estão esperando destino — o número do botão principal. */
export function useQuantasNaCaixa() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useQuery({
    queryKey: ['caixa-de-entrada-contagem', usuarioId],
    enabled: computed(() => !!usuarioId.value),
    queryFn: async () => {
      const { count, error } = await supabase
        .from('transacao_bancaria')
        .select('id', { count: 'exact', head: true })
        .is('destino', null)
        .eq('pendente', false)
      if (error) throw error
      return count ?? 0
    },
  })
}

export interface AjusteDoCartao {
  id: string
  limite_manual: number | null
  dia_fechamento_manual: number | null
  dia_vencimento_manual: number | null
}

/** O limite e os dias digitados pela pessoa — o caso do banco que não informa. */
export function useAjustarCartao() {
  const supabase = useSupabaseClient()
  const cliente = useQueryClient()

  return useMutation({
    mutationFn: async (a: AjusteDoCartao) => {
      const { error } = await supabase
        .from('conta_bancaria')
        .update({
          limite_manual: a.limite_manual,
          dia_fechamento_manual: a.dia_fechamento_manual,
          dia_vencimento_manual: a.dia_vencimento_manual,
        })
        .eq('id', a.id)
      if (error) throw error
    },
    onSuccess: () => cliente.invalidateQueries({ queryKey: [CHAVE] }),
  })
}
