/**
 * Quais produtos reler, e como a tela de seleção os apresenta.
 *
 * Módulo separado do popup por um motivo prático: `popup.js` importa
 * `config.gerado.js`, que o build escreve e não existe num clone novo — importá-lo
 * num teste faria o teste depender de alguém ter rodado `npm run extensao` antes.
 * Aqui não há nada disso, então estas funções são testadas de verdade, com o mesmo
 * código que roda no Chrome.
 *
 * Puras de propósito: a marcação é a regra que o pedido descreveu ("uma opção de ler
 * só os favoritos de cada interesse"), e regra em função pura é regra que se prova.
 */

/**
 * Os ids que devem começar marcados.
 *
 * Com `soFavoritos`, só os produtos do agrupamento favorito de cada interesse. Um
 * interesse sem favorito nenhum (nada escolhido ainda) fica de fora inteiro, e é o
 * certo: a pessoa pediu os favoritos, e ali não há um. Sem `soFavoritos`, todos —
 * porque "atualizar preços" sem mais nada quer dizer todos.
 */
export function idsParaMarcar(produtos, soFavoritos) {
  return new Set(
    produtos.filter(p => !soFavoritos || p.favorito === true).map(p => p.id),
  )
}

/**
 * Os produtos em blocos, um por interesse, na ordem em que aparecem.
 *
 * A ordem da lista é a do banco (do preço mais esquecido para o mais recente), e não
 * é reordenada aqui: ela é o que faz uma rodada interrompida atacar primeiro o mais
 * desatualizado. O agrupamento respeita essa ordem — o bloco de um interesse começa
 * onde o primeiro produto dele apareceu.
 *
 * Produtos do mesmo interesse separados na lista original caem no MESMO bloco, e não
 * em dois com o mesmo título: dois cabeçalhos "Monitor novo" na tela pareceriam dois
 * interesses homônimos.
 */
export function blocosPorInteresse(produtos) {
  const blocos = []
  const porId = new Map()

  for (const produto of produtos) {
    let bloco = porId.get(produto.interesse_id)

    if (!bloco) {
      bloco = {
        interesse_id: produto.interesse_id,
        titulo: produto.interesse_titulo ?? 'Sem título',
        produtos: [],
      }
      porId.set(produto.interesse_id, bloco)
      blocos.push(bloco)
    }

    bloco.produtos.push(produto)
  }

  return blocos
}

/**
 * O texto do botão, que diz quantos vão ser lidos.
 *
 * "Reler todos os preços" quando é tudo, e a contagem quando é um recorte: sem o
 * número, escolher três de quinze e clicar num botão genérico deixa a dúvida de se a
 * seleção pegou.
 */
export function rotuloDeRodar(quantos, total) {
  if (quantos === 0) return 'Nada marcado'
  if (quantos === total) return 'Reler todos os preços'
  return quantos === 1 ? 'Reler 1 preço' : `Reler ${quantos} preços`
}
