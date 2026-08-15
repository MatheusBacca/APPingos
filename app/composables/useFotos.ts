/**
 * Fotos — a lista, o envio para o Storage e o coração.
 *
 * Duas coisas separam este módulo dos outros:
 *
 * 1. O DADO MORA EM DOIS LUGARES. A linha está no Postgres e o arquivo está num
 *    bucket privado, e nenhuma escrita é atômica entre os dois. A ordem escolhida
 *    (arquivo primeiro no envio, linha primeiro na remoção) é sempre a que deixa
 *    o resto como arquivo órfão — invisível e barato — em vez de linha órfã, que
 *    é um card quebrado na tela de alguém.
 *
 * 2. NENHUMA URL É PERMANENTE. O bucket é privado, então a tela não guarda `src`:
 *    ela pede URLs assinadas em lote e as renova antes de expirarem. Por isso as
 *    URLs são uma query própria, e não um campo da foto — elas têm um ciclo de
 *    vida que a linha do banco não tem.
 */
import { useQuery } from '@tanstack/vue-query'
import type { MaybeRefOrGetter } from 'vue'
import type { Foto, TipoMidia } from '~/types/foto'
import { extensaoDoMime, nomeParaBaixar, tipoDoMime } from '~/types/foto'
import { useSpaceMutation, useSpaceQuery } from '~/composables/useSpaceQuery'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'

const BUCKET = 'fotos'

/**
 * Uma hora de validade, renovada aos 50 minutos.
 *
 * A folga de dez minutos é o ponto: uma aba deixada aberta com URLs vencidas
 * mostra um grid de imagens quebradas, e o sintoma não sugere em nada que a causa
 * foi o tempo. Renovar antes é mais barato que ensinar a tela a se recuperar disso.
 */
const VALIDADE_URL = 60 * 60
const RENOVAR_URL = 50 * 60 * 1000

const CAMPOS = `
  id, space_id, enviada_por, caminho, lote_id, tipo, mime, tamanho,
  nome_original, legenda, aprovada_em, postada_em, created_at, updated_at,
  curtidas:foto_curtida(foto_id, user_id, created_at)
`

/**
 * As fotos do espaço ativo, com as curtidas embutidas.
 *
 * As curtidas vêm juntas, e não sob demanda, porque é delas que sai a situação de
 * cada card — sem elas a galeria renderizaria inteira sem saber o que já pode ser
 * postado, que é a única informação que a tela existe para dar.
 */
export function useFotos() {
  const supabase = useSupabaseClient()

  return useSpaceQuery(['fotos'], async (spaceId): Promise<Foto[]> => {
    const { data, error } = await supabase
      .from('foto')
      .select(CAMPOS)
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []) as unknown as Foto[]
  })
}

/**
 * `caminho` → URL assinada, para o `src` do grid.
 *
 * Em lote (`createSignedUrls`) e não uma por card: uma galeria de trinta fotos
 * faria trinta chamadas, e o Storage as serializaria o bastante para as últimas
 * aparecerem segundos depois das primeiras.
 *
 * A chave da query são os caminhos, ordenados: assim curtir uma foto (que muda a
 * lista, não os arquivos) não refaz as assinaturas, e mandar uma foto nova refaz.
 */
export function useUrlsDasFotos(fotos: MaybeRefOrGetter<Foto[]>) {
  const supabase = useSupabaseClient()
  const store = useSpaceStore()

  const caminhos = computed(() => toValue(fotos).map(f => f.caminho).sort())

  return useQuery({
    queryKey: computed(() => ['space', store.espacoAtivoId, 'fotos', 'urls', caminhos.value.join('|')]),
    enabled: computed(() => caminhos.value.length > 0),
    staleTime: RENOVAR_URL,
    refetchInterval: RENOVAR_URL,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase
        .storage
        .from(BUCKET)
        .createSignedUrls(caminhos.value, VALIDADE_URL)

      if (error) throw error

      // Uma assinatura que falha sozinha (arquivo apagado por fora) não derruba as
      // outras: o card sem url cai no seu próprio estado de "prévia indisponível".
      const pares = (data ?? []).flatMap(item =>
        item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [],
      )

      return new Map(pares)
    },
  })
}

export interface ArquivoParaEnviar {
  arquivo: File
  legenda?: string | null
}

export interface ResultadoDoEnvio {
  enviadas: number
  /** Uma frase por arquivo que não subiu — a tela as mostra sem esconder o resto. */
  falhas: string[]
}

/**
 * Sobe os arquivos e grava as linhas.
 *
 * Os uploads vão em paralelo e o insert é UM só, no fim, com o que subiu. É a
 * ordem que sobrevive a uma rede ruim no meio de dez fotos: as sete que subiram
 * viram sete linhas, e as três que falharam viram três frases na tela — em vez de
 * o lote inteiro ser perdido porque a quarta falhou.
 *
 * O nome do arquivo no bucket é um uuid novo, nunca o nome que veio do aparelho.
 * Dois "IMG_0001.jpg" de duas pessoas colidiriam, e um nome vindo de fora dentro
 * de um caminho montado por template é entrada não confiável em posição perigosa.
 */
export function useEnviarFotos() {
  const supabase = useSupabaseClient()
  const usuarioId = useUsuarioId()

  return useSpaceMutation<ArquivoParaEnviar[], ResultadoDoEnvio>(
    async (spaceId, itens) => {
      if (!usuarioId.value) throw new Error('Sessão expirada — entre de novo.')

      const falhas: string[] = []

      /*
        Um id para o envio inteiro, gerado ANTES do primeiro upload.

        É o que amarra as doze do sábado como um lote na galeria. Gerado aqui, e
        não no banco, porque as fotos entram num insert que já as traz prontas —
        um default do Postgres daria um lote diferente para cada linha, que é
        exatamente o oposto do que a coluna quer dizer.
      */
      const lote = crypto.randomUUID()

      const subidas = await Promise.all(itens.map(async ({ arquivo, legenda }) => {
        const caminho = `${spaceId}/${crypto.randomUUID()}.${extensaoDoMime(arquivo.type)}`

        const { error } = await supabase
          .storage
          .from(BUCKET)
          .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false })

        if (error) {
          falhas.push(`${arquivo.name}: ${error.message}`)
          return null
        }

        return {
          space_id: spaceId,
          // A policy exige `enviada_por = auth.uid()`; a coluna não tem default de
          // propósito, para nunca haver um caminho em que ela seja preenchida por
          // outra coisa que não a pessoa logada.
          enviada_por: usuarioId.value!,
          caminho,
          lote_id: lote,
          tipo: tipoDoMime(arquivo.type) as TipoMidia,
          mime: arquivo.type,
          tamanho: arquivo.size,
          // Guardado só para o download ter um nome utilizável. Nunca entra no
          // caminho do bucket — ver `extensaoDoMime` em ~/types/foto.
          nome_original: arquivo.name,
          legenda: legenda?.trim() || null,
        }
      }))

      const linhas = subidas.filter(l => l !== null)
      if (!linhas.length) return { enviadas: 0, falhas }

      const { error } = await supabase.from('foto').insert(linhas)

      if (error) {
        // As linhas não entraram, mas os arquivos estão no bucket. Órfãos, e é o
        // lado certo de falhar: ninguém vê, e o próximo envio não é afetado.
        return { enviadas: 0, falhas: [...falhas, error.message] }
      }

      return { enviadas: linhas.length, falhas }
    },
    [['fotos']],
  )
}

/**
 * Baixa o arquivo ORIGINAL — o mesmo byte a byte que subiu.
 *
 * Não há versão reduzida a evitar: o módulo nunca transforma nada, o bucket guarda
 * o que veio do aparelho, e a prévia do grid é o próprio arquivo desenhado pequeno
 * pelo CSS. "Boa qualidade" aqui é simplesmente o arquivo.
 *
 * O que faz o download acontecer é o `download` na URL assinada: ele põe um
 * `Content-Disposition: attachment` na resposta do Storage. Sem isso o navegador
 * ABRE a foto numa aba em vez de salvá-la — e o atributo `download` de um <a> não
 * resolve, porque ele é ignorado quando o href aponta para outra origem, que é
 * sempre o caso aqui.
 *
 * Uma assinatura por arquivo (e não `createSignedUrls` em lote) porque cada uma
 * carrega um nome diferente, e a versão em lote só aceita um nome para todas.
 */
export function useBaixarFotos() {
  const supabase = useSupabaseClient()
  const baixando = ref(false)

  async function baixar(fotos: Foto[]): Promise<{ baixadas: number, falhas: number }> {
    if (!fotos.length || baixando.value) return { baixadas: 0, falhas: 0 }

    baixando.value = true
    let baixadas = 0
    let falhas = 0

    try {
      for (const [i, foto] of fotos.entries()) {
        const { data, error } = await supabase
          .storage
          .from(BUCKET)
          .createSignedUrl(foto.caminho, VALIDADE_URL, { download: nomeParaBaixar(foto, i) })

        if (error || !data?.signedUrl) {
          falhas += 1
          continue
        }

        const link = document.createElement('a')
        link.href = data.signedUrl
        link.style.display = 'none'
        document.body.appendChild(link)
        link.click()
        link.remove()

        baixadas += 1

        /*
          Um respiro entre um arquivo e o outro.

          Downloads disparados em rajada por script fazem o navegador engolir os
          últimos em silêncio — o Chrome trata a sequência como popup e derruba o
          que vier depois dos primeiros. O intervalo não é elegante, e é o que faz
          um lote de doze chegar inteiro.
        */
        if (i < fotos.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 400))
        }
      }
    }
    finally {
      baixando.value = false
    }

    return { baixadas, falhas }
  }

  return { baixar, baixando }
}

/** Curte ou descurte. Devolve como ficou, para o card responder na hora. */
export function useAlternarCurtida() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<string, boolean>(
    async (_spaceId, fotoId) => {
      const { data, error } = await supabase.rpc('alternar_curtida', { p_foto: fotoId })
      if (error) throw error
      return data as unknown as boolean
    },
    [['fotos']],
  )
}

/** Legenda e "já postei". O banco recusa marcar como postada o que não foi aprovado. */
export function useAtualizarFoto() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<{ id: string, legenda?: string | null, postada_em?: string | null }, void>(
    async (_spaceId, { id, ...campos }) => {
      const { error } = await supabase.from('foto').update(campos).eq('id', id)
      if (error) throw error
    },
    [['fotos']],
  )
}

/**
 * Apaga a linha e, depois, o arquivo.
 *
 * Nesta ordem porque é a linha que a RLS protege: se a remoção não for permitida,
 * ela para aqui e o arquivo continua onde estava. Na ordem inversa, uma remoção
 * recusada pelo banco deixaria uma foto listada cujo arquivo já não existe.
 *
 * O erro do Storage é engolido de propósito. A foto já saiu da galeria; insistir
 * numa mensagem sobre um arquivo que ninguém mais alcança só transformaria uma
 * remoção bem-sucedida em erro na tela.
 */
export function useApagarFoto() {
  const supabase = useSupabaseClient()

  return useSpaceMutation<Foto, void>(
    async (_spaceId, foto) => {
      const { error } = await supabase.from('foto').delete().eq('id', foto.id)
      if (error) throw error

      await supabase.storage.from(BUCKET).remove([foto.caminho])
    },
    [['fotos']],
  )
}
