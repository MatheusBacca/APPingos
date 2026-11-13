/**
 * As regras da importação bancária — do formato da Pluggy para o do APPingos.
 *
 * Fase 1 de docs/notion-plano-open-finance.md: tudo aqui é função pura, testada
 * no vitest contra fixtures montadas a partir da documentação (test/fixtures/
 * pluggy.ts), e por isso não gasta o trial da Pluggy. Mora em `_shared/` porque
 * quem aplica as regras é a Edge Function `sincronizar-pluggy` (Deno), e quem as
 * testa e mostra o resultado é o app — uma cópia em cada lado divergiria.
 *
 * As pegadinhas que este arquivo resolve, na numeração do plano:
 *   2. parcelado chega como N transações  → `chaveDaCompra`, `planoDaCompra`
 *   3. contar duas vezes                  → `motivoDeExclusao`
 *   4. id que muda                        → `provider_id` e `deduplicar`
 *   5. sinal do valor                     → `normalizarValor`
 *   6. fuso horário                       → `dataLocal`
 *   7. competência pela fatura            → `competenciaDaTransacao`
 *
 * Só `import type` (apagado na compilação) — a regra de zero imports de runtime
 * de `_shared/` continua valendo.
 */
import type { ContaPluggy, ItemPluggy, ParteDoPagamento, TransacaoPluggy } from './pluggy-api.ts'

export const FUSO = 'America/Sao_Paulo'

export type TipoConta = 'conta' | 'cartao'
export type Sentido = 'saida' | 'entrada'

/**
 * Por que uma transação sai da caixa de entrada sozinha.
 *
 * Só o que é contagem dupla CERTA entra aqui. Aplicação e resgate de
 * investimento ficam de fora de propósito: pelas decisões de 12/11/2026, uma
 * transferência para a caixinha pode virar aporte em meta, então ela precisa
 * aparecer. Estorno também fica: ele é dinheiro voltando, e quem decide o que
 * fazer com ele é a pessoa.
 */
export type MotivoExclusao = 'pagamento_fatura' | 'transferencia_propria' | 'valor_zero'

/** O que cada transação vira antes de ir para `transacao_bancaria`. */
export interface TransacaoNormalizada {
  pluggy_id: string
  /** Chave de deduplicação: `providerId`, ou o `id` com prefixo quando ele falta. */
  provider_id: string
  conta_pluggy_id: string
  descricao: string
  /** Sempre positivo. Quem diz a direção é `sentido`. */
  valor: number
  sentido: Sentido
  /** `YYYY-MM-DD` no fuso de Brasília. */
  data: string
  /** Dia 1 do mês em que a transação pesa — o da fatura, se ela for conhecida. */
  competencia: string
  pendente: boolean
  parcela_numero: number | null
  parcelas_total: number | null
  valor_total_compra: number | null
  data_compra: string | null
  fatura_id: string | null
  contraparte_nome: string | null
  contraparte_documento: string | null
  metodo: string | null
  categoria_pluggy: string | null
  /** Junta as parcelas de uma mesma compra. `null` em compra à vista. */
  chave_compra: string | null
  motivo_exclusao: MotivoExclusao | null
}

/** O que a importação sabe da pessoa — para reconhecer o que é dela mesma. */
export interface ContextoImportacao {
  /** CPFs/CNPJs dos titulares das contas da pessoa, só dígitos. */
  documentosProprios: string[]
  /** Nomes dos titulares, já passados por `normalizarNome`. */
  nomesProprios: string[]
  /** `billId` → vencimento (`YYYY-MM-DD`), quando a Pluggy entrega faturas. */
  vencimentoDasFaturas?: Record<string, string>
}

const centavos = (v: number) => Math.round(v * 100) / 100

// ---------------------------------------------------------------------------
// Datas (pegadinhas 6 e 7)
// ---------------------------------------------------------------------------

const formatoLocal = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * A data de calendário em Brasília.
 *
 * A Pluggy manda `date` em ISO 8601 UTC, e uma compra às 22h de 31/08 aqui é
 * 01h de 01/09 lá — truncar o texto poria a compra no mês errado. Daí converter
 * para `America/Sao_Paulo` antes de cortar.
 *
 * A EXCEÇÃO é meia-noite UTC exata. Banco que só informa o dia (sem hora) chega
 * como `T00:00:00.000Z`, e converter isso daria o dia ANTERIOR em Brasília — o
 * mesmo erro, no sentido oposto. Meia-noite exata no milissegundo é o carimbo de
 * "só a data", e aí o dia escrito é o dia certo. O custo é uma compra feita às
 * 21h00min00s000 de Brasília cair no dia seguinte, e ele é aceito.
 */
export function dataLocal(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  if (/T00:00(:00(\.0+)?)?(Z|[+-]00:?00)$/.test(iso)) return iso.slice(0, 10)

  const instante = new Date(iso)
  if (Number.isNaN(instante.getTime())) throw new Error(`data inválida vinda da Pluggy: ${iso}`)

  return formatoLocal.format(instante)
}

/** Dia 1 do mês da data. */
export function competenciaDe(data: string): string {
  return `${data.slice(0, 7)}-01`
}

/** Anda `n` meses numa competência (dia 1), sem passar por `Date`. */
export function somarMesesCompetencia(competencia: string, n: number): string {
  const ano = Number(competencia.slice(0, 4))
  const mes = Number(competencia.slice(5, 7))
  const total = ano * 12 + (mes - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
}

/**
 * Em que mês a transação pesa.
 *
 * Com o vencimento da fatura, é o mês dele — a compra de 28/07 que cai na fatura
 * que vence em 10/08 é gasto de agosto, que é como o casal já lança à mão. Sem
 * fatura (conta corrente, ou conexão que não a entrega), é o mês da data.
 */
export function competenciaDaTransacao(data: string, vencimentoFatura?: string | null): string {
  return competenciaDe(vencimentoFatura ? dataLocal(vencimentoFatura) : data)
}

// ---------------------------------------------------------------------------
// Valor (pegadinha 5)
// ---------------------------------------------------------------------------

export function tipoDaConta(conta: Pick<ContaPluggy, 'type'>): TipoConta {
  return conta.type === 'CREDIT' ? 'cartao' : 'conta'
}

/**
 * Valor sempre positivo e a direção à parte, para o resto do app não precisar
 * saber de convenção de sinal.
 *
 * No cartão, o sinal manda: positivo é gasto, negativo é pagamento ou estorno.
 * Na conta, quem manda é `type` (`DEBIT` sai, `CREDIT` entra); sem ele, o sinal
 * (negativo sai). Convenção da documentação — confirmar com a amostra real.
 */
export function normalizarValor(
  amount: number,
  type: TransacaoPluggy['type'],
  tipoConta: TipoConta,
): { valor: number, sentido: Sentido } {
  const valor = centavos(Math.abs(amount))

  if (tipoConta === 'cartao') return { valor, sentido: amount < 0 ? 'entrada' : 'saida' }
  if (type === 'DEBIT') return { valor, sentido: 'saida' }
  if (type === 'CREDIT') return { valor, sentido: 'entrada' }
  return { valor, sentido: amount < 0 ? 'saida' : 'entrada' }
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Para comparar nomes de titular e contraparte: sem acento, caixa nem pontuação. */
export function normalizarNome(nome: string | null | undefined): string {
  return semAcento(nome ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Só os dígitos de um CPF/CNPJ. Mascarado (`***.456.789-**`) fica incompleto e não casa. */
export function soDigitos(doc: string | null | undefined): string {
  return (doc ?? '').replace(/\D/g, '')
}

/**
 * A descrição sem o que muda de uma parcela para outra.
 *
 * "LOJA X PARC 02/10" e "LOJA X PARC 03/10" são a mesma compra. Tira o marcador
 * de parcela ("02/10", "2 de 10", "parc 2/10"), acento, caixa e pontuação.
 */
export function normalizarDescricao(descricao: string): string {
  return normalizarNome(
    semAcento(descricao)
      .toLowerCase()
      .replace(/\b(parc(ela)?\.?\s*)?\d{1,3}\s*(\/|de)\s*\d{1,3}\b/g, ' ')
      .replace(/\bparc(ela)?\b/g, ' '),
  ).replace(/\s+/g, ' ')
}

const MARCADOR_DE_PARCELA = /[\s\-–]*\b(parc(ela)?\.?\s*)?\d{1,3}\s*(\/|de)\s*\d{1,3}\s*$/i

/**
 * A descrição que a compra recebe: a do banco sem o "PARC 03/10" do fim, que
 * na compra (uma linha para as N parcelas) seria mentira a partir do mês seguinte.
 */
export function descricaoDaCompra(descricao: string): string {
  return descricao.replace(MARCADOR_DE_PARCELA, '').trim() || descricao.trim()
}

// ---------------------------------------------------------------------------
// Contagem dupla (pegadinha 3)
// ---------------------------------------------------------------------------

const CATEGORIA_PAGAMENTO_FATURA = /credit card payment/i
const CATEGORIA_TRANSFERENCIA_PROPRIA = /same person transfer|same ownership/i
const DESCRICAO_PAGAMENTO_FATURA
  = /\b(pag(amento|to)?|pgto)\s*(de\s*)?(fatura|cartao( de credito)?|cart credito)\b/
const DESCRICAO_PAGAMENTO_NO_CARTAO = /\b(pag(amento|to)?|pgto)\b/
const DESCRICAO_TRANSFERENCIA_PROPRIA = /mesma titularidade|entre contas proprias|transf(erencia)? propria/

function contraparteDe(t: TransacaoPluggy, sentido: Sentido): ParteDoPagamento | null {
  const p = t.paymentData
  if (!p) return null
  return (sentido === 'saida' ? p.receiver : p.payer) ?? null
}

/**
 * Se a transação é contagem dupla e por isso não pode virar compra.
 *
 * - **Pagamento de fatura.** O gasto já entrou pelas transações do cartão; o
 *   débito na conta que paga a fatura é o mesmo dinheiro, e o crédito na conta
 *   do cartão também.
 * - **Transferência entre contas próprias.** Contraparte com o documento (ou o
 *   nome) de um titular das contas da própria pessoa.
 *
 * A categoria da Pluggy é usada enquanto vier (é recurso do trial); depois dela
 * sobram descrição e contraparte, que é por isso que as duas existem.
 */
export function motivoDeExclusao(
  t: TransacaoPluggy,
  tipoConta: TipoConta,
  sentido: Sentido,
  valor: number,
  contexto: ContextoImportacao,
): MotivoExclusao | null {
  if (valor === 0) return 'valor_zero'

  const categoria = t.category ?? ''
  const descricao = normalizarNome(t.description)

  if (CATEGORIA_PAGAMENTO_FATURA.test(categoria)) return 'pagamento_fatura'
  if (tipoConta === 'conta' && sentido === 'saida' && DESCRICAO_PAGAMENTO_FATURA.test(descricao)) {
    return 'pagamento_fatura'
  }
  // Na conta do cartão, uma entrada que se diz pagamento é a fatura sendo paga.
  // Estorno também é entrada no cartão, mas não fala em "pagamento" e fica.
  if (tipoConta === 'cartao' && sentido === 'entrada' && DESCRICAO_PAGAMENTO_NO_CARTAO.test(descricao)) {
    return 'pagamento_fatura'
  }

  if (CATEGORIA_TRANSFERENCIA_PROPRIA.test(categoria)) return 'transferencia_propria'
  if (DESCRICAO_TRANSFERENCIA_PROPRIA.test(descricao)) return 'transferencia_propria'

  const contraparte = contraparteDe(t, sentido)
  const documento = soDigitos(contraparte?.documentNumber?.value)
  if (documento.length >= 11 && contexto.documentosProprios.includes(documento)) {
    return 'transferencia_propria'
  }
  const nome = normalizarNome(contraparte?.name)
  if (nome && contexto.nomesProprios.includes(nome)) return 'transferencia_propria'

  return null
}

// ---------------------------------------------------------------------------
// Parcelas (pegadinha 2)
// ---------------------------------------------------------------------------

/**
 * O que junta as N parcelas de uma compra numa só.
 *
 * Heurística do plano: cartão + data da compra + valor total + número de
 * parcelas + descrição normalizada. Sem `purchaseDate`, o mês da compra é
 * deduzido recuando a competência da parcela; sem `totalAmount`, o valor sai da
 * chave (sobra mês, parcelas e descrição, que ainda separa bem). É sugestão —
 * a caixa de entrada mostra e a pessoa confirma.
 */
export function chaveDaCompra(t: Pick<
  TransacaoNormalizada,
  'conta_pluggy_id' | 'parcela_numero' | 'parcelas_total' | 'valor_total_compra'
  | 'data_compra' | 'descricao' | 'competencia'
>): string | null {
  if (!t.parcelas_total || t.parcelas_total < 2) return null

  const quando = t.data_compra
    ?? somarMesesCompetencia(t.competencia, -((t.parcela_numero ?? 1) - 1)).slice(0, 7)
  const valor = t.valor_total_compra != null ? t.valor_total_compra.toFixed(2) : '?'

  return [t.conta_pluggy_id, quando, valor, t.parcelas_total, normalizarDescricao(t.descricao)].join('|')
}

/** A compra que a primeira parcela vista cria — os argumentos de `registrar_compra`. */
export interface PlanoDaCompra {
  descricao: string
  valor_total: number
  parcelas: number
  data_compra: string
  competencia_inicial: string
  /**
   * Quantos meses a competência recuou: a primeira vista era a parcela k, então
   * as k − 1 anteriores caem em meses que já passaram — e talvez já acertados.
   */
  recuo_meses: number
}

/**
 * A compra que uma parcela representa.
 *
 * Se a primeira vista é a parcela k de N (compra anterior à conexão), a
 * `competencia_inicial` recua k − 1 meses: a parcela 3 de 10 que cai em
 * novembro é de uma compra cuja primeira parcela caiu em setembro. Assim a
 * `parcela_mensal` põe cada parcela no mês em que o banco a cobrou.
 */
export function planoDaCompra(t: TransacaoNormalizada): PlanoDaCompra {
  const parcelas = t.parcelas_total && t.parcelas_total > 1 ? t.parcelas_total : 1
  const numero = parcelas > 1 ? Math.min(Math.max(t.parcela_numero ?? 1, 1), parcelas) : 1
  const recuo = numero - 1

  return {
    descricao: parcelas > 1 ? descricaoDaCompra(t.descricao) : t.descricao,
    valor_total: parcelas > 1
      ? (t.valor_total_compra ?? centavos(t.valor * parcelas))
      : t.valor,
    parcelas,
    data_compra: t.data_compra ?? t.data,
    competencia_inicial: somarMesesCompetencia(t.competencia, -recuo),
    recuo_meses: recuo,
  }
}

// ---------------------------------------------------------------------------
// Normalização de uma transação
// ---------------------------------------------------------------------------

export interface ContaDaTransacao {
  pluggyId: string
  tipo: TipoConta
}

/** Uma transação da Pluggy no formato de `transacao_bancaria`. */
export function normalizarTransacao(
  t: TransacaoPluggy,
  conta: ContaDaTransacao,
  contexto: ContextoImportacao,
): TransacaoNormalizada {
  const { valor, sentido } = normalizarValor(t.amount, t.type, conta.tipo)
  const data = dataLocal(t.date)
  const cartao = t.creditCardMetadata ?? null
  const faturaId = cartao?.billId ?? null
  const vencimento = faturaId ? contexto.vencimentoDasFaturas?.[faturaId] : null
  const contraparte = contraparteDe(t, sentido)
  const total = cartao?.totalInstallments ?? null
  const parcelado = total != null && total > 1

  const base = {
    pluggy_id: t.id,
    provider_id: t.providerId?.trim() || `pluggy:${t.id}`,
    conta_pluggy_id: conta.pluggyId,
    descricao: (t.description || t.descriptionRaw || 'Sem descrição').trim(),
    valor,
    sentido,
    data,
    competencia: competenciaDaTransacao(data, vencimento),
    pendente: t.status === 'PENDING',
    parcela_numero: parcelado ? (cartao?.installmentNumber ?? null) : null,
    parcelas_total: parcelado ? total : null,
    valor_total_compra: parcelado && cartao?.totalAmount != null ? centavos(Math.abs(cartao.totalAmount)) : null,
    data_compra: cartao?.purchaseDate ? dataLocal(cartao.purchaseDate) : null,
    fatura_id: faturaId,
    contraparte_nome: contraparte?.name?.trim() || null,
    contraparte_documento: contraparte?.documentNumber?.value?.trim() || null,
    metodo: t.paymentData?.paymentMethod ?? t.operationType ?? null,
    categoria_pluggy: t.category ?? null,
    motivo_exclusao: motivoDeExclusao(t, conta.tipo, sentido, valor, contexto),
  }

  return {
    ...base,
    // Só gasto se parcela: parcela de estorno não monta compra.
    chave_compra: base.sentido === 'saida' ? chaveDaCompra(base) : null,
  }
}

// ---------------------------------------------------------------------------
// O lote (pegadinha 4)
// ---------------------------------------------------------------------------

/**
 * Uma transação por `provider_id`, a mais recente vencendo.
 *
 * A mesma transação aparece duas vezes num lote quando a página muda durante a
 * leitura, ou quando o banco a reemite ao trocar `PENDING` por `POSTED`. A
 * lançada (não pendente) vence sempre; entre duas iguais, vence a que veio
 * depois. O banco garante o mesmo entre execuções, pelo índice único.
 */
export function deduplicar(transacoes: TransacaoNormalizada[]): TransacaoNormalizada[] {
  const porChave = new Map<string, TransacaoNormalizada>()

  for (const t of transacoes) {
    const anterior = porChave.get(t.provider_id)
    if (anterior && !anterior.pendente && t.pendente) continue
    porChave.set(t.provider_id, t)
  }

  return [...porChave.values()]
}

/** Uma compra importada: o plano dela e as parcelas que a formam. */
export interface CompraImportada {
  chave: string
  plano: PlanoDaCompra
  transacoes: TransacaoNormalizada[]
}

/**
 * As parcelas de uma mesma compra juntas — compra parcelada é UMA linha
 * (decisão nº 1 de Orçamentos), e não N.
 *
 * O plano sai da parcela de menor número vista: é dela que o recuo da
 * competência é calculado. O que não é parcela segue avulso.
 */
export function agruparParcelas(transacoes: TransacaoNormalizada[]): {
  compras: CompraImportada[]
  avulsas: TransacaoNormalizada[]
} {
  const grupos = new Map<string, TransacaoNormalizada[]>()
  const avulsas: TransacaoNormalizada[] = []

  for (const t of transacoes) {
    if (!t.chave_compra) {
      avulsas.push(t)
      continue
    }
    const grupo = grupos.get(t.chave_compra) ?? []
    grupo.push(t)
    grupos.set(t.chave_compra, grupo)
  }

  const compras = [...grupos.entries()].map(([chave, grupo]) => {
    const ordenado = [...grupo].sort((a, b) => (a.parcela_numero ?? 0) - (b.parcela_numero ?? 0))
    return { chave, plano: planoDaCompra(ordenado[0]!), transacoes: ordenado }
  })

  return { compras, avulsas }
}

/** Uma compra pronta para `lancar_compras_do_cartao` (o cartão designado). */
export interface CompraParaLancar {
  provider_ids: string[]
  descricao: string
  valor_total: number
  parcelas: number
  data_compra: string
  competencia_inicial: string
}

/**
 * As compras que o cartão designado ("do casal" ou "pessoal") lança sozinho.
 *
 * Só gasto lançado (não pendente) e que não é contagem dupla. As parcelas de uma
 * mesma compra viram UMA, com o plano da menor parcela vista (recuo incluído).
 * O banco ainda filtra o que já foi classificado e o que é de antes da
 * designação — aqui é só o plano.
 */
export function comprasParaLancar(linhas: TransacaoNormalizada[]): CompraParaLancar[] {
  const elegiveis = linhas.filter(t => t.sentido === 'saida' && !t.pendente && !t.motivo_exclusao && t.valor > 0)
  const { compras, avulsas } = agruparParcelas(elegiveis)

  const plano = (p: PlanoDaCompra, transacoes: TransacaoNormalizada[]): CompraParaLancar => ({
    provider_ids: transacoes.map(t => t.provider_id),
    descricao: p.descricao,
    valor_total: p.valor_total,
    parcelas: p.parcelas,
    data_compra: p.data_compra,
    competencia_inicial: p.competencia_inicial,
  })

  return [
    ...compras.map(c => plano(c.plano, c.transacoes)),
    ...avulsas.map(t => plano(planoDaCompra(t), [t])),
  ]
}

// ---------------------------------------------------------------------------
// A janela de cada sincronização
// ---------------------------------------------------------------------------

/** Na primeira vez, quanto do passado buscar. */
export const JANELA_INICIAL_DIAS = 90

/**
 * Quanto voltar antes da última sincronização. O banco corrige transações dias
 * depois (pendente → lançada, valor ajustado, descrição trocada) e o upsert por
 * `provider_id` torna a releitura inócua — então sobra sobrepor.
 */
export const SOBREPOSICAO_DIAS = 10

function somarDiasIso(data: string, n: number): string {
  const d = new Date(Date.UTC(Number(data.slice(0, 4)), Number(data.slice(5, 7)) - 1, Number(data.slice(8, 10)) + n))
  return d.toISOString().slice(0, 10)
}

/** De quando a quando pedir as transações, em datas de Brasília. */
export function janelaDeSincronizacao(sincronizadoEm: string | null, hoje: string): { de: string, ate: string } {
  const de = sincronizadoEm
    ? somarDiasIso(dataLocal(sincronizadoEm), -SOBREPOSICAO_DIAS)
    : somarDiasIso(hoje, -JANELA_INICIAL_DIAS)
  return { de, ate: hoje }
}

/** `billId` → vencimento, para a competência sair da fatura (pegadinha 7). */
export function vencimentosDasFaturas(faturas: Array<{ id: string, dueDate: string }>): Record<string, string> {
  return Object.fromEntries(faturas.map(f => [f.id, f.dueDate]))
}

/** O lote de uma conta pronto para `ingerir_transacoes`: normalizado e sem repetição. */
export function linhasDaConta(
  transacoes: TransacaoPluggy[],
  conta: ContaDaTransacao,
  contexto: ContextoImportacao,
): TransacaoNormalizada[] {
  return deduplicar(transacoes.map(t => normalizarTransacao(t, conta, contexto)))
}

// ---------------------------------------------------------------------------
// Conexão e contas — o mesmo mapeamento no cadastro (Nuxt) e na sincronização
// ---------------------------------------------------------------------------

/** As colunas de `conexao_bancaria` que vêm do item (sem `user_id`). */
export function camposDaConexao(item: ItemPluggy) {
  return {
    item_id: item.id,
    banco: item.connector?.name ?? '',
    banco_logo_url: item.connector?.imageUrl ?? null,
    status: item.status,
    consentimento_expira_em: item.consentExpiresAt ?? null,
  }
}

/**
 * As colunas de `conta_bancaria` que vêm da Pluggy.
 *
 * `destino` e `space_id` NÃO estão aqui de propósito: são escolha da pessoa, e
 * o upsert da sincronização reescreve só o que está no objeto. Pôr o destino
 * aqui faria cada sincronização devolver o cartão do casal para "perguntar".
 */
export function camposDaConta(conta: ContaPluggy) {
  const tipo = tipoDaConta(conta)
  const numero = conta.number?.trim() || null
  return {
    pluggy_account_id: conta.id,
    tipo,
    nome: (conta.marketingName || conta.name || (tipo === 'cartao' ? 'Cartão' : 'Conta')).trim(),
    // De cartão, só o fim: é o que a fatura e o app do banco mostram.
    numero: tipo === 'cartao' && numero ? numero.replace(/\D/g, '').slice(-4) || numero : numero,
    titular_nome: conta.owner?.trim() || null,
    titular_documento: conta.taxNumber?.trim() || null,
  }
}

/**
 * Se o item pode ser registrado por esta pessoa.
 *
 * O item criado pelo widget volta com o `clientUserId` que a rota do connect
 * token definiu — o id de quem conectou. Outro id ali é o item de outra pessoa.
 * Item sem `clientUserId` (copiado do demo do dashboard, como a pegadinha 1 do
 * plano permite) é aceito: num app de duas pessoas, quem cadastra é quem tem o
 * id na mão, e o `item_id` único impede que o mesmo item tenha dois donos.
 */
export function itemPodeSerDe(item: { clientUserId?: string | null }, userId: string): boolean {
  return !item.clientUserId || item.clientUserId === userId
}

/** O que a pessoa sabe dela mesma a partir das próprias contas. */
export function contextoDasContas(
  contas: Array<Pick<ContaPluggy, 'owner' | 'taxNumber'>>,
  vencimentoDasFaturas: Record<string, string> = {},
): ContextoImportacao {
  const documentos = new Set<string>()
  const nomes = new Set<string>()

  for (const c of contas) {
    const doc = soDigitos(c.taxNumber)
    if (doc.length >= 11) documentos.add(doc)
    const nome = normalizarNome(c.owner)
    if (nome) nomes.add(nome)
  }

  return { documentosProprios: [...documentos], nomesProprios: [...nomes], vencimentoDasFaturas }
}
