/**
 * O connect token para abrir o widget da Pluggy.
 *
 * `clientUserId` = o id de quem pediu: ele fica gravado no item que o widget
 * criar, e é por ele que o cadastro e a sincronização reconhecem o dono.
 *
 * Com `itemId` no corpo, o token abre o widget em modo de atualização daquele
 * item (credencial ou consentimento vencido). Só para um item que é da pessoa —
 * conferido pela RLS de `conexao_bancaria`, com o JWT dela.
 */
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'
import { criarConnectToken } from '~~/supabase/functions/_shared/pluggy-api'
import { apiKeyPluggy, erroPluggy, traduzirErroPluggy, usuarioDaPluggy } from '~~/server/utils/pluggy'

export default defineEventHandler(async (event) => {
  const userId = await usuarioDaPluggy(event)
  const corpo = await readBody<{ itemId?: unknown } | null>(event)
  const itemId = typeof corpo?.itemId === 'string' && corpo.itemId.trim() ? corpo.itemId.trim() : undefined

  if (itemId) {
    const supabase = await serverSupabaseClient<Database>(event)
    const { data, error } = await supabase
      .from('conexao_bancaria')
      .select('id')
      .eq('item_id', itemId)
      .maybeSingle()

    if (error) throw erroPluggy(500, error.message)
    if (!data) throw erroPluggy(404, 'Esta conexão não é sua.')
  }

  const apiKey = await apiKeyPluggy(event)
  try {
    return { accessToken: await criarConnectToken(apiKey, userId, itemId) }
  }
  catch (e) {
    throw traduzirErroPluggy(e)
  }
})
