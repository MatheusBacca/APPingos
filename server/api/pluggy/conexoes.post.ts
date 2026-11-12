/**
 * Registra no APPingos a conexão que o widget da Pluggy acabou de criar.
 *
 * O widget devolve o item no navegador, mas o navegador não é fonte de verdade:
 * o servidor busca o item na Pluggy pelo id, confere o dono (`clientUserId`) e só
 * então grava — conexão e contas — com o JWT da própria pessoa. A RLS continua
 * valendo e nenhuma `service_role` passa por aqui.
 *
 * Serve também para colar um `itemId` copiado do dashboard (pegadinha 1 do
 * plano) e para reconectar: rodar de novo atualiza status e contas sem mexer no
 * destino que a pessoa escolheu para cada cartão.
 */
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'
import { buscarItem, listarContas } from '~~/supabase/functions/_shared/pluggy-api'
import { camposDaConexao, camposDaConta } from '~~/supabase/functions/_shared/importacao-bancaria'
import {
  apiKeyPluggy,
  erroPluggy,
  itemPodeSerDe,
  traduzirErroPluggy,
  usuarioDaPluggy,
} from '~~/server/utils/pluggy'

export default defineEventHandler(async (event) => {
  const userId = await usuarioDaPluggy(event)
  const corpo = await readBody<{ itemId?: unknown } | null>(event)
  const itemId = typeof corpo?.itemId === 'string' ? corpo.itemId.trim() : ''
  if (!itemId) throw erroPluggy(400, 'Informe o id da conexão (itemId).')

  const apiKey = await apiKeyPluggy(event)

  let item, contas
  try {
    item = await buscarItem(apiKey, itemId)
    contas = await listarContas(apiKey, itemId)
  }
  catch (e) {
    throw traduzirErroPluggy(e)
  }

  if (!itemPodeSerDe(item, userId)) {
    throw erroPluggy(403, 'Esta conexão foi criada por outra pessoa.')
  }

  const supabase = await serverSupabaseClient<Database>(event)

  /*
   * Se o item já tem dono (outra pessoa), a RLS esconde a linha dela e o upsert
   * vira um insert que bate no `unique (item_id)` — o 23505 abaixo.
   */
  const { data: conexao, error } = await supabase
    .from('conexao_bancaria')
    .upsert(
      { ...camposDaConexao(item), user_id: userId, atualizado_em: new Date().toISOString() },
      { onConflict: 'item_id' },
    )
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505' || error.code === '42501') {
      throw erroPluggy(409, 'Esta conexão já está cadastrada por outra pessoa.')
    }
    throw erroPluggy(500, error.message)
  }

  if (contas.length) {
    const { error: erroContas } = await supabase
      .from('conta_bancaria')
      .upsert(
        contas.map(c => ({ ...camposDaConta(c), conexao_id: conexao.id, user_id: userId })),
        { onConflict: 'pluggy_account_id' },
      )

    if (erroContas) throw erroPluggy(500, erroContas.message)
  }

  return { id: conexao.id, contas: contas.length }
})
