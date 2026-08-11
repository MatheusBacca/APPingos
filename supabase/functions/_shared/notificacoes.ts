/**
 * O texto das notificações — para a tela E para o e-mail.
 *
 * POR QUE ESTE ARQUIVO MORA AQUI, e não em `app/lib/`: ele é a única coisa do
 * repo lida por dois runtimes. O app o importa via `app/lib/notificacoes.ts`
 * (Vite/Vitest resolvem o caminho relativo sem cerimônia); a Edge Function o
 * importa por `../_shared/notificacoes.ts`, e o bundler do Deno só enxerga o que
 * está dentro de `supabase/functions/`. Duas cópias seria o desenho óbvio e
 * errado: a frase do e-mail e a frase do sino divergiriam na primeira vez que
 * alguém ajustasse uma delas.
 *
 * Daí a regra que sustenta o arquivo: ZERO IMPORTS. Nada de Vue, nada de
 * Supabase, nada de `~/lib/dinheiro` — um import relativo sem extensão quebraria
 * no Deno, e um import com extensão é ruído no app. O que precisa de formatação
 * é formatado aqui, com `Intl`, que existe nos dois lados.
 *
 * O banco guarda `tipo` + `dados` e nunca o texto pronto (ver
 * 20260811230436_notificacoes_motor.sql): mudar uma frase é mexer neste arquivo,
 * sem migration.
 */

// ---------------------------------------------------------------------------
// Os tipos de evento
// ---------------------------------------------------------------------------

export type TipoNotificacao =
  | 'gasto_novo'
  | 'gasto_editado'
  | 'gasto_removido'
  | 'mes_fechado'
  | 'roteiro_novo'
  | 'roteiro_liberado'
  | 'roteiro_editado'
  | 'viagem_perto'
  | 'interesse_novo'
  | 'marcado_assistiu'
  | 'lembrete_filmes'

export interface Notificacao {
  id: string
  space_id: string | null
  tipo: string
  dados: Record<string, unknown>
  ator_id?: string | null
  entidade?: string | null
  entidade_id?: string | null
  rota: string | null
  created_at: string
  lida_em: string | null
}

export interface TextoNotificacao {
  titulo: string
  corpo: string
  rota: string
  /** Nome do componente do @lucide/vue — o mesmo vocabulário de `modules.ts`. */
  icone: string
}

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatarValor(valor: unknown): string {
  const n = typeof valor === 'number' ? valor : Number(valor)
  return Number.isFinite(n) ? MOEDA.format(n) : ''
}

/**
 * "12 de agosto" a partir de `YYYY-MM-DD`.
 *
 * Sem passar por `new Date(iso)`: num fuso a oeste isso interpreta em UTC e
 * devolve o dia anterior. Mesma lição de `app/lib/datas.ts`, repetida aqui
 * porque este arquivo não pode importar de lá.
 */
export function formatarDataIso(iso: unknown): string {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return ''
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number)
  return new Date(ano!, mes! - 1, dia!).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
  })
}

function texto(dados: Record<string, unknown>, chave: string, padrao = ''): string {
  const v = dados[chave]
  return typeof v === 'string' && v.trim() !== '' ? v : padrao
}

/** Quantas vezes o evento agrupado se repetiu. Sem `vezes` gravado, é uma. */
export function vezesDe(n: Notificacao): number {
  const v = Number(n.dados?.vezes)
  return Number.isFinite(v) && v > 1 ? Math.trunc(v) : 1
}

// ---------------------------------------------------------------------------
// A frase
// ---------------------------------------------------------------------------

/**
 * Título, corpo, destino e ícone de uma notificação.
 *
 * O título carrega QUEM e O QUÊ, porque é a única linha que aparece no push do
 * celular e no assunto do e-mail. O corpo é o detalhe que confirma — valor,
 * data, quantas vezes — e pode ser vazio.
 *
 * Um tipo desconhecido não quebra a tela: ele cai no genérico. Isso importa
 * porque o banco pode gravar um tipo novo antes de o app instalado no celular
 * ser atualizado.
 */
export function textoDaNotificacao(n: Notificacao): TextoNotificacao {
  const d = n.dados ?? {}
  const quem = texto(d, 'ator_nome', 'Alguém')
  const vezes = vezesDe(n)

  switch (n.tipo) {
    case 'gasto_novo':
      return {
        titulo: `${quem} lançou ${texto(d, 'descricao', 'um gasto')}`,
        corpo: [formatarValor(d.valor), parcelasEmTexto(d.parcelas)].filter(Boolean).join(' · '),
        rota: n.rota ?? '/orcamentos',
        icone: 'WalletIcon',
      }

    case 'gasto_editado':
      return {
        titulo: vezes > 1
          ? `${vezes} alterações em ${texto(d, 'descricao', 'um gasto')}`
          : `${quem} editou ${texto(d, 'descricao', 'um gasto')}`,
        corpo: mudancaDeValor(d),
        rota: n.rota ?? '/orcamentos',
        icone: 'PencilIcon',
      }

    case 'gasto_removido':
      return {
        titulo: `${quem} apagou ${texto(d, 'descricao', 'um gasto')}`,
        corpo: formatarValor(d.valor),
        rota: n.rota ?? '/orcamentos',
        icone: 'Trash2Icon',
      }

    case 'mes_fechado':
      return {
        titulo: `${quem} acertou ${mesPorExtenso(d.competencia)}`,
        corpo: d.total != null ? `Total do mês: ${formatarValor(d.total)}` : '',
        rota: n.rota ?? '/orcamentos',
        icone: 'CircleCheckIcon',
      }

    case 'roteiro_novo':
      return {
        titulo: `${quem} criou o roteiro ${texto(d, 'nome', 'novo')}`,
        corpo: dataDaViagem(d),
        rota: n.rota ?? '/viagens',
        icone: 'PlaneIcon',
      }

    /*
      A revelação da surpresa. É o único texto do app que celebra em vez de
      informar — até este instante o outro só sabia que existia "alguma coisa",
      e nada além disso jamais foi gravado sobre o roteiro.
    */
    case 'roteiro_liberado':
      return {
        titulo: `${quem} revelou a surpresa: ${texto(d, 'nome', 'um roteiro')}`,
        corpo: dataDaViagem(d) || 'O roteiro secreto agora é seu também.',
        rota: n.rota ?? '/viagens',
        icone: 'SparklesIcon',
      }

    case 'roteiro_editado':
      return {
        titulo: vezes > 1
          ? `${vezes} alterações em ${texto(d, 'nome', 'um roteiro')}`
          : `${quem} mexeu no roteiro ${texto(d, 'nome', '')}`.trim(),
        corpo: '',
        rota: n.rota ?? '/viagens',
        icone: 'PencilIcon',
      }

    case 'viagem_perto': {
      const dias = Number(d.dias)
      return {
        titulo: dias === 1
          ? `${texto(d, 'nome', 'A sua viagem')} é amanhã`
          : `${texto(d, 'nome', 'A sua viagem')} é em ${dias} dias`,
        corpo: dataDaViagem(d),
        rota: n.rota ?? '/viagens',
        icone: 'PlaneIcon',
      }
    }

    case 'interesse_novo':
      return {
        titulo: `${quem} quer ver ${texto(d, 'titulo', 'algo novo')}`,
        corpo: texto(d, 'tipo_midia') === 'serie' ? 'Série adicionada à lista' : 'Adicionado à lista',
        rota: n.rota ?? '/filmes',
        icone: 'ClapperboardIcon',
      }

    case 'marcado_assistiu':
      return {
        titulo: `${quem} marcou que você assistiu ${texto(d, 'titulo', 'um título')}`,
        corpo: d.visto_em ? `Em ${formatarDataIso(d.visto_em)}` : 'Dê a sua nota quando quiser.',
        rota: n.rota ?? '/filmes',
        icone: 'EyeIcon',
      }

    case 'lembrete_filmes':
      return {
        titulo: 'Viu algo essa semana?',
        corpo: 'Joga no APPingos — nota, resenha e a data de quando vocês viram.',
        rota: n.rota ?? '/filmes',
        icone: 'ClapperboardIcon',
      }

    default:
      return {
        titulo: 'Novidade no APPingos',
        corpo: '',
        rota: n.rota ?? '/',
        icone: 'BellIcon',
      }
  }
}

function parcelasEmTexto(parcelas: unknown): string {
  const n = Number(parcelas)
  return Number.isFinite(n) && n > 1 ? `em ${n}x` : ''
}

function mudancaDeValor(d: Record<string, unknown>): string {
  const novo = formatarValor(d.valor)
  const antigo = formatarValor(d.valor_antigo)
  if (!novo) return ''
  if (!antigo || antigo === novo) return novo
  return `${antigo} → ${novo}`
}

function mesPorExtenso(competencia: unknown): string {
  if (typeof competencia !== 'string') return 'o mês'
  const [ano, mes] = competencia.slice(0, 7).split('-').map(Number)
  if (!ano || !mes) return 'o mês'
  const nome = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}`
}

function dataDaViagem(d: Record<string, unknown>): string {
  const inicio = formatarDataIso(d.data_inicio)
  return inicio ? `Começa em ${inicio}` : ''
}

// ---------------------------------------------------------------------------
// A caixa
// ---------------------------------------------------------------------------

/** `9+` acima de nove: o contador do sino é um sinal, não um número exato. */
export function textoDoBadge(naoLidas: number): string {
  if (naoLidas <= 0) return ''
  return naoLidas > 9 ? '9+' : String(naoLidas)
}

export interface DiaDeNotificacoes {
  /** "Hoje", "Ontem" ou "12 de agosto". */
  rotulo: string
  /** `YYYY-MM-DD` local — a chave estável do grupo, para o `v-for`. */
  dia: string
  itens: Notificacao[]
}

/** `YYYY-MM-DD` do timestamptz no fuso de quem está olhando. */
function diaLocal(ts: string): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

function diaAnterior(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const d = new Date(ano!, mes! - 1, dia! - 1)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

/**
 * A caixa fatiada por dia, na ordem em que chegou (mais recente primeiro).
 *
 * `hoje` é parâmetro e não `new Date()` porque a tela pode ficar aberta a noite
 * inteira num app instalado — e porque um teste que depende do relógio da
 * máquina é um teste que quebra sozinho às 21h de 31 de dezembro.
 */
export function agruparPorDia(lista: Notificacao[], hoje: string): DiaDeNotificacoes[] {
  const ontem = diaAnterior(hoje)
  const grupos: DiaDeNotificacoes[] = []

  for (const n of [...lista].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const dia = diaLocal(n.created_at)
    const ultimo = grupos[grupos.length - 1]

    if (ultimo && ultimo.dia === dia) {
      ultimo.itens.push(n)
      continue
    }

    grupos.push({
      dia,
      rotulo: dia === hoje ? 'Hoje' : dia === ontem ? 'Ontem' : formatarDataIso(dia),
      itens: [n],
    })
  }

  return grupos
}

const RELATIVO = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

/**
 * "agora", "há 5 min", "há 3 h", "ontem".
 *
 * Só até uma semana: além disso o número perde utilidade ("há 23 dias" não
 * situa ninguém) e a lista já está agrupada por data, que situa.
 */
export function tempoRelativo(iso: string, agora: number = Date.now()): string {
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return ''

  const segundos = Math.round((ts - agora) / 1000)
  const passados = Math.abs(segundos)

  if (passados < 60) return 'agora'
  if (passados < 3600) return RELATIVO.format(Math.round(segundos / 60), 'minute')
  if (passados < 86400) return RELATIVO.format(Math.round(segundos / 3600), 'hour')
  if (passados < 604800) return RELATIVO.format(Math.round(segundos / 86400), 'day')

  return formatarDataIso(iso.slice(0, 10))
}

// ---------------------------------------------------------------------------
// Preferências
// ---------------------------------------------------------------------------

export type CategoriaNotificacao = 'orcamentos' | 'viagens' | 'filmes' | 'edicoes' | 'lembretes'

/**
 * Onze tipos em cinco interruptores.
 *
 * A tabela do banco é por TIPO, e a tela é por CATEGORIA: uma caixa com onze
 * chaves é uma caixa que ninguém configura. O agrupamento vive aqui, e não numa
 * coluna, para poder mudar sem migration no dia em que "Edições" precisar ser
 * partida ao meio.
 */
export const TIPOS_DA_CATEGORIA: Record<CategoriaNotificacao, TipoNotificacao[]> = {
  orcamentos: ['gasto_novo', 'mes_fechado'],
  viagens: ['roteiro_novo', 'roteiro_liberado'],
  filmes: ['interesse_novo', 'marcado_assistiu'],
  edicoes: ['gasto_editado', 'gasto_removido', 'roteiro_editado'],
  lembretes: ['lembrete_filmes', 'viagem_perto'],
}

export const CATEGORIAS = Object.keys(TIPOS_DA_CATEGORIA) as CategoriaNotificacao[]

export const CATEGORIA_ROTULO: Record<CategoriaNotificacao, string> = {
  orcamentos: 'Orçamentos',
  viagens: 'Viagens',
  filmes: 'Filmes & Séries',
  edicoes: 'Edições e remoções',
  lembretes: 'Lembretes',
}

export const CATEGORIA_DESCRICAO: Record<CategoriaNotificacao, string> = {
  orcamentos: 'Gastos novos e o mês acertado.',
  viagens: 'Roteiro novo e surpresa revelada.',
  filmes: 'Interesse novo e quando marcam que você assistiu.',
  edicoes: 'Quando o outro mexe ou apaga algo que já existia.',
  lembretes: 'Domingo de filmes e a viagem que se aproxima.',
}

export interface Preferencia {
  tipo: string
  ativo: boolean
  email: boolean
}

export type EstadoDoInterruptor = 'ligado' | 'desligado' | 'parcial'

export interface CategoriaComEstado {
  categoria: CategoriaNotificacao
  rotulo: string
  descricao: string
  tipos: TipoNotificacao[]
  app: EstadoDoInterruptor
  email: EstadoDoInterruptor
}

/**
 * O estado dos cinco interruptores a partir das linhas gravadas.
 *
 * Ausência de linha é LIGADO — é o que faz um usuário novo nascer recebendo tudo
 * sem trigger de seed. `parcial` existe porque a tabela é por tipo: se um dia
 * alguém desligar um tipo por SQL, a tela precisa mostrar isso em vez de mentir
 * "ligado" e reativar o resto no primeiro clique.
 */
export function categoriasDePreferencia(prefs: Preferencia[]): CategoriaComEstado[] {
  const porTipo = new Map(prefs.map(p => [p.tipo, p]))

  return CATEGORIAS.map((categoria) => {
    const tipos = TIPOS_DA_CATEGORIA[categoria]
    const estado = (campo: 'ativo' | 'email'): EstadoDoInterruptor => {
      const ligados = tipos.filter(t => porTipo.get(t)?.[campo] ?? true).length
      if (ligados === tipos.length) return 'ligado'
      if (ligados === 0) return 'desligado'
      return 'parcial'
    }

    return {
      categoria,
      rotulo: CATEGORIA_ROTULO[categoria],
      descricao: CATEGORIA_DESCRICAO[categoria],
      tipos,
      app: estado('ativo'),
      email: estado('email'),
    }
  })
}

// ---------------------------------------------------------------------------
// O e-mail
// ---------------------------------------------------------------------------

export interface OpcoesDeEmail {
  /** Raiz do app, sem barra no fim: `https://appingos.vercel.app`. */
  appUrl: string
  /** Link de descadastro com o token da pessoa. */
  urlDescadastro: string
}

export interface EmailRenderizado {
  assunto: string
  html: string
  texto: string
}

function escapar(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * A notificação como e-mail.
 *
 * Três restrições moldam o HTML abaixo, e nenhuma delas é estética:
 *
 *   1. CSS inline e tabela. Gmail e Outlook descartam `<style>` e não conhecem
 *      flexbox; o que sobrevive nos dois é o que está no atributo `style` de um
 *      elemento de tabela.
 *   2. Sem imagem remota. Cliente de e-mail bloqueia imagem por padrão, então um
 *      layout que depende de logo ou de pôster chega quebrado — o pôster do
 *      filme fica como link, não como `<img>` que vira retângulo vazio.
 *   3. Descadastro no rodapé de TODO e-mail. Não é enfeite de conformidade: sem
 *      saída visível, a saída que a pessoa acha é o botão de spam, e aí o
 *      domínio inteiro para de entregar.
 *
 * O `texto` acompanha porque um e-mail só-HTML pontua pior em filtro de spam, e
 * porque alguém ainda lê e-mail em terminal.
 */
export function emailDaNotificacao(n: Notificacao, opcoes: OpcoesDeEmail): EmailRenderizado {
  const { titulo, corpo, rota } = textoDaNotificacao(n)
  const link = `${opcoes.appUrl.replace(/\/$/, '')}${rota.startsWith('/') ? rota : `/${rota}`}`
  const espaco = texto(n.dados ?? {}, 'space_nome')

  const assunto = espaco ? `${titulo} · ${espaco}` : titulo

  const texto_ = [
    titulo,
    corpo,
    '',
    `Abrir no APPingos: ${link}`,
    '',
    `Para não receber mais estes e-mails: ${opcoes.urlDescadastro}`,
  ].filter(l => l !== undefined).join('\n')

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px 12px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;">
    <tr>
      <td style="padding:24px 24px 8px 24px;">
        <p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#71717a;">
          APPingos${espaco ? ` · ${escapar(espaco)}` : ''}
        </p>
        <h1 style="margin:8px 0 0 0;font-size:20px;line-height:1.35;color:#18181b;font-weight:600;">
          ${escapar(titulo)}
        </h1>
        ${corpo ? `<p style="margin:8px 0 0 0;font-size:15px;line-height:1.5;color:#52525b;">${escapar(corpo)}</p>` : ''}
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px 24px 24px;">
        <a href="${escapar(link)}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
          Abrir no APPingos
        </a>
      </td>
    </tr>
    <tr>
      <td style="padding:0 24px 20px 24px;border-top:1px solid #f4f4f5;">
        <p style="margin:16px 0 0 0;font-size:12px;line-height:1.5;color:#a1a1aa;">
          Você recebe este e-mail porque ligou os avisos do APPingos.
          <a href="${escapar(opcoes.urlDescadastro)}" style="color:#71717a;">Parar de receber</a>
          — ou escolher só alguns tipos em Notificações › Preferências.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { assunto, html, texto: texto_ }
}
