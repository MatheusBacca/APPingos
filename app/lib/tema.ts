/**
 * A aparência do APPingos — o modo (claro/escuro/automático) e a cor de acento.
 *
 * COMO O ACENTO FUNCIONA, e por que ele é só um par de números.
 *
 * Um acento poderia ser uma lista de doze variáveis por cor: `--primary`,
 * `--ring`, `--sidebar-primary`, o realce suave, o brilho, e as versões escuras
 * de cada uma. Oito acentos assim seriam quase cem valores escritos à mão — e
 * cada um deles uma chance de o rosa ficar mais claro que o azul no escuro, sem
 * ninguém notar até a tela estar montada.
 *
 * Em OKLCH dá para separar as três perguntas. QUE COR é matiz (`--matiz`), o
 * quanto ela SATURA é croma (`--croma`), e o quanto ela BRILHA é luminosidade —
 * e é só a luminosidade que muda entre o claro e o escuro. Então o acento
 * carrega matiz e croma, o `tailwind.css` calcula a luminosidade uma vez para
 * cada modo, e as duas coisas se combinam sozinhas.
 *
 * O resultado prático: acrescentar uma cor aqui é uma linha nesta lista e uma no
 * CSS. E nenhum acento pode "sair do tom" do resto, porque nenhum deles escolhe
 * a própria luminosidade.
 *
 * O croma varia por matiz de propósito. O olho recebe muito mais croma no roxo e
 * no rosa do que no verde antes de a cor parecer neon, então um croma único
 * deixaria uns acentos lavados e outros gritando. Os valores abaixo foram
 * escolhidos para todos terem o mesmo peso na tela.
 */

export interface Acento {
  /** O que vai no `data-acento` do `<html>` e no localStorage. */
  valor: string
  /** O nome que a pessoa lê no seletor. */
  rotulo: string
  /** Matiz OKLCH, 0–360. */
  matiz: number
  /** Croma OKLCH — quanto a cor satura. */
  croma: number
}

/**
 * A ordem é a do seletor, e ela é intencional: começa no teal, que é a
 * identidade do app (pingos d'água) e o que todo mundo já tem hoje.
 */
export const ACENTOS: Acento[] = [
  { valor: 'pingo', rotulo: 'Pingo', matiz: 205, croma: 0.108 },
  { valor: 'rosa', rotulo: 'Rosa', matiz: 350, croma: 0.13 },
  { valor: 'violeta', rotulo: 'Violeta', matiz: 305, croma: 0.15 },
  { valor: 'indigo', rotulo: 'Índigo', matiz: 275, croma: 0.15 },
  { valor: 'azul', rotulo: 'Azul', matiz: 245, croma: 0.14 },
  { valor: 'menta', rotulo: 'Menta', matiz: 165, croma: 0.11 },
  { valor: 'ambar', rotulo: 'Âmbar', matiz: 75, croma: 0.13 },
  { valor: 'coral', rotulo: 'Coral', matiz: 30, croma: 0.14 },
]

/** O que vale quando ninguém escolheu nada — a identidade do app. */
export const ACENTO_PADRAO = 'pingo'

export type ModoDeCor = 'light' | 'dark' | 'auto'

export const MODOS: { valor: ModoDeCor, rotulo: string }[] = [
  { valor: 'light', rotulo: 'Claro' },
  { valor: 'dark', rotulo: 'Escuro' },
  { valor: 'auto', rotulo: 'Automático' },
]

export function acentoPorValor(valor: string | null | undefined): Acento {
  return ACENTOS.find(a => a.valor === valor) ?? ACENTOS[0]!
}

/**
 * Guarda contra o que já estiver salvo no aparelho de alguém.
 *
 * O valor vem do localStorage, que sobrevive a deploys: quem tinha um acento que
 * foi renomeado ou removido abriria o app com `data-acento` apontando para um
 * bloco de CSS que não existe mais — e aí `--matiz` fica sem definição e a
 * interface inteira perde a cor. Cair no padrão é o único desfecho seguro.
 */
export function acentoValido(valor: string | null | undefined): string {
  return ACENTOS.some(a => a.valor === valor) ? valor! : ACENTO_PADRAO
}

/**
 * A cor de amostra do seletor, montada em OKLCH no mesmo desenho do CSS.
 *
 * A luminosidade é fixa aqui porque a bolinha é sempre lida sobre o fundo do
 * painel, e não sobre a tela do modo ativo: uma amostra que mudasse de tom junto
 * com o tema faria o rosa parecer duas cores diferentes dependendo da hora do
 * dia, que é o oposto do que uma amostra serve para dizer.
 */
export function corDaAmostra(acento: Acento): string {
  return `oklch(0.68 ${acento.croma} ${acento.matiz})`
}
