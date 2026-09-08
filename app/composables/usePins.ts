/**
 * Pins — o extrato, o saldo e as regras.
 *
 * Só leitura. Não há mutation nenhuma aqui, e isso não é um esquecimento: os
 * Pins nascem em trigger no banco (`conceder_pins()`, como owner) e `pin` não
 * tem policy de insert. Um `usePins().conceder()` seria uma porta que a RLS
 * fecha do outro lado — e, numa feature de pontos, é a única fraude que
 * importa.
 */
import { useQuery } from '@tanstack/vue-query'
import type { MaybeRefOrGetter } from 'vue'
import type { Pin, PinHotspot, PinRegra, SaldoDePins } from '~/types/pin'
import { useSpaceQuery } from '~/composables/useSpaceQuery'

const CAMPOS = `
  id, user_id, space_id, regra, base, multiplicador, pontos,
  hotspots, dados, entidade, entidade_id, created_at
`

/**
 * Quanto do extrato vem de uma vez.
 *
 * O livro-razão só cresce — nunca há faxina, ao contrário das notificações —, e
 * uma tela sem teto acabaria buscando anos de histórico para mostrar as três
 * primeiras linhas. Duzentos cobre com folga o que se rola de fato numa sessão.
 */
const LIMITE = 200

/**
 * O extrato do espaço ativo — de todo mundo, não só seu.
 *
 * É a decisão da feature inteira: o jogo é compartilhado, e ver o esforço do
 * outro sem precisar perguntar é o motivo de os Pins existirem. A policy de
 * `pin` já devolve o espaço todo; filtrar por pessoa é escolha da tela.
 */
export function usePins(limite: MaybeRefOrGetter<number> = LIMITE) {
  const supabase = useSupabaseClient()

  return useSpaceQuery(
    computed(() => ['pins', toValue(limite)]),
    async (spaceId): Promise<Pin[]> => {
      const { data, error } = await supabase
        .from('pin')
        .select(CAMPOS)
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false })
        .limit(toValue(limite))

      if (error) throw error
      return (data ?? []) as unknown as Pin[]
    },
  )
}

/**
 * O saldo por pessoa, do espaço ativo.
 *
 * Vem da view `pin_saldo` e não de uma soma no client de propósito: o extrato é
 * paginado (`LIMITE` acima), e somar o que veio daria "o saldo das últimas 200
 * conquistas" com cara de saldo total — o pior tipo de número errado, o que
 * parece certo.
 */
export function useSaldoDePins() {
  const supabase = useSupabaseClient()

  return useSpaceQuery(['pins', 'saldo'], async (spaceId): Promise<SaldoDePins[]> => {
    const { data, error } = await supabase
      .from('pin_saldo')
      .select('user_id, pontos, conquistas, ultimo')
      .eq('space_id', spaceId)

    if (error) throw error

    return (data ?? [])
      .filter(l => l.user_id)
      .map(l => ({
        user_id: l.user_id!,
        pontos: l.pontos ?? 0,
        conquistas: l.conquistas ?? 0,
        ultimo: l.ultimo,
      }))
      .sort((a, b) => b.pontos - a.pontos)
  })
}

/**
 * O multiplicador que está valendo AGORA, para quem está olhando.
 *
 * O extrato responde "por que aquele Pin rendeu 5"; isto responde a pergunta que
 * se faz antes de agir — "vale a pena registrar isso agora?". Quem calcula é o
 * banco, pela mesma função que concede (ver
 * 20260908130000_pins_multiplicador_agora.sql): somar os hotspots aqui no
 * TypeScript seria a segunda fonte de verdade da economia, exatamente o que
 * `useRegrasDePins()` recusou ser.
 *
 * `staleTime` de cinco minutos, e não uma hora como o das regras: as regras
 * mudam por migration, este número muda com o RELÓGIO — às 22h nasce o corujão,
 * na virada do sábado nasce o fim de semana, e a sequência muda a cada Pin novo.
 * Cinco minutos é curto o bastante para a tela não mentir por muito tempo e
 * longo o bastante para não virar uma consulta por navegação.
 */
export function useMultiplicadorAgora() {
  const supabase = useSupabaseClient()

  return useSpaceQuery(
    ['pins', 'multiplicador'],
    async (spaceId): Promise<{ multiplicador: number, hotspots: string[] }> => {
      const { data, error } = await supabase.rpc('meu_multiplicador_de_pins', {
        p_space: spaceId,
      })
      if (error) throw error

      /*
       * A RPC é `returns table`, então o PostgREST entrega um ARRAY de uma linha
       * — e é por isso que o `[0]` não é defensivo, é o formato.
       *
       * Sem linha (ou com o campo nulo) o neutro é 1, nunca zero: zero apagaria
       * os Pins da conta em vez de simplesmente não multiplicar nada. O `Number`
       * existe porque `numeric` do Postgres chega como string quando passa da
       * precisão de um double — não é o caso de um multiplicador de duas casas,
       * mas o dia em que for, o selo mostraria "NaN×" no lugar do fogo.
       */
      const linha = data?.[0]

      return {
        multiplicador: Number(linha?.multiplicador ?? 1) || 1,
        hotspots: linha?.hotspots ?? [],
      }
    },
    { staleTime: 1000 * 60 * 5 },
  )
}

/**
 * O que rende Pins, lido do banco.
 *
 * Não é uma constante em TypeScript porque a economia mora em `pin_regra` /
 * `pin_hotspot` — e uma cópia aqui seria a segunda fonte de verdade que
 * divergiria no primeiro ajuste de balanceamento, com a tela ensinando uma regra
 * e o banco aplicando outra.
 *
 * Fora do escopo de espaço (a economia é a mesma para todos) e com `staleTime`
 * generoso: é configuração, muda por migration, não durante a sessão.
 */
export function useRegrasDePins() {
  const supabase = useSupabaseClient()

  return useQuery({
    queryKey: ['pins', 'regras'],
    staleTime: 1000 * 60 * 60,
    queryFn: async (): Promise<{ regras: PinRegra[], hotspots: PinHotspot[] }> => {
      /*
       * As DESLIGADAS vêm junto, e o filtro é da tela.
       *
       * Não é desperdício: `pin_regra` é também o dicionário que dá nome a cada
       * linha do extrato, e uma regra desligada depois de já ter concedido Pins
       * continua tendo linhas no livro-razão. Buscar só as ativas faria essas
       * linhas aparecerem com a chave crua ("memoria_fresca") no lugar do rótulo.
       */
      const [regras, hotspots] = await Promise.all([
        supabase
          .from('pin_regra')
          .select('chave, rotulo, descricao, modulo, base, teto_dia, lazer, noturna, ativa, ordem')
          .order('ordem'),
        supabase
          .from('pin_hotspot')
          .select('chave, rotulo, descricao, fator, por_dia, teto, ativo, ordem')
          .order('ordem'),
      ])

      if (regras.error) throw regras.error
      if (hotspots.error) throw hotspots.error

      return {
        regras: (regras.data ?? []) as PinRegra[],
        hotspots: (hotspots.data ?? []) as PinHotspot[],
      }
    },
  })
}
