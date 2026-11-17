/**
 * As chaves secretas do projeto, nos dois formatos que o Supabase usa hoje.
 *
 * A `service_role` LEGADA (um JWT, `eyJ…`) chega em `SUPABASE_SERVICE_ROLE_KEY`
 * e deixa de funcionar no fim de 2026. As chaves NOVAS (`sb_secret_…`) chegam
 * em `SUPABASE_SECRET_KEYS`, um JSON `{ nome: chave }`, e não são JWT: o
 * Supabase pede que elas viajem no header `apikey`, não em
 * `Authorization: Bearer` (docs: "Migrating to publishable and secret API keys").
 *
 * Antes, `sincronizar-pluggy` comparava só `Authorization` com a legada — e num
 * projeto criado com as chaves novas recusava qualquer chamada, inclusive a do
 * próprio cron. Isto aceita as duas, de qualquer um dos dois headers.
 */

type LerAmbiente = (nome: string) => string | undefined

/** Todas as chaves que provam "é o banco/o servidor deste projeto chamando". */
export function chavesDeServico(ler: LerAmbiente): string[] {
  const chaves: string[] = []
  const legada = ler('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (legada) chaves.push(legada)

  const novas = ler('SUPABASE_SECRET_KEYS')
  if (novas) {
    try {
      const mapa = JSON.parse(novas) as Record<string, unknown>
      for (const valor of Object.values(mapa)) {
        if (typeof valor === 'string' && valor.trim()) chaves.push(valor.trim())
      }
    }
    catch {
      // JSON inválido: fica só com a legada, se houver.
    }
  }
  return chaves
}

/** A chave que veio na requisição: `apikey`, ou o `Bearer` de `Authorization`. */
export function chaveRecebida(headers: Headers): string | null {
  const apikey = headers.get('apikey')?.trim()
  if (apikey) return apikey
  const auth = headers.get('Authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim())
  return m ? m[1]!.trim() : null
}

/**
 * O token do `Authorization: Bearer`, ignorando o `apikey`.
 *
 * É por onde chega o JWT de quem está logado quando o app chama a função com
 * `supabase.functions.invoke`: o cliente manda a chave pública em `apikey` e a
 * sessão no Bearer — `chaveRecebida` leria a pública e pararia ali.
 */
export function tokenBearer(headers: Headers): string | null {
  const auth = headers.get('Authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim())
  return m ? m[1]!.trim() : null
}

export function chamadaDeServico(headers: Headers, ler: LerAmbiente): boolean {
  const recebida = chaveRecebida(headers)
  return !!recebida && chavesDeServico(ler).includes(recebida)
}

/**
 * A chave com que a própria função fala com o banco: a nova `default`, se
 * houver; senão a legada. Ambas ignoram a RLS — é o papel desta função.
 */
export function chaveParaOBanco(ler: LerAmbiente): string | null {
  const novas = ler('SUPABASE_SECRET_KEYS')
  if (novas) {
    try {
      const mapa = JSON.parse(novas) as Record<string, unknown>
      const padrao = mapa['default']
      if (typeof padrao === 'string' && padrao.trim()) return padrao.trim()
    }
    catch {
      // segue para a legada
    }
  }
  return ler('SUPABASE_SERVICE_ROLE_KEY')?.trim() || null
}
